"""Centralized attendance report generation service supporting all reporting modes."""

import logging
from collections import defaultdict
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.schemas.attendance import AttendanceStatus
from app.schemas.policy import ComplianceStatus, WeeklyComplianceResult
from app.schemas.report import (
    AttendanceReportResponse,
    CompanyReportSummary,
    DailyAttendanceItem,
    EmployeeReportItem,
    ReportMetadata,
    ReportPeriod,
)
from app.services.policy_service import PolicyService
from app.utils.time_utils import (
    get_date_range_for_period,
    get_overlapping_policy_weeks,
    parse_date,
)

logger = logging.getLogger(__name__)


class ReportService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.employees = db.employees
        self.attendance = db.attendance
        self.policy_service = PolicyService(db)
        self.settings = get_settings()

    async def generate_report(
        self,
        period: ReportPeriod,
        target_date: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        employee_id_filter: str | None = None,
    ) -> AttendanceReportResponse:
        """
        Generate centralized attendance report for daily, weekly, monthly, yearly, or custom periods.
        Guarantees that ALL active employees are included even if zero attendance records exist.
        """
        # 1. Parse and validate dates
        parsed_target = parse_date(target_date) if target_date else None
        parsed_start = parse_date(start_date) if start_date else None
        parsed_end = parse_date(end_date) if end_date else None

        try:
            range_start, range_end = get_date_range_for_period(
                period=period.value,
                target_date=parsed_target,
                start_date=parsed_start,
                end_date=parsed_end,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        start_str = range_start.isoformat()
        end_str = range_end.isoformat()

        # 2. Fetch active employees (or filtered employee)
        emp_query = {"is_active": True}
        if employee_id_filter:
            emp_query["employee_id"] = employee_id_filter

        employee_cursor = self.employees.find(emp_query).sort("employee_id", 1)
        employees_list = await employee_cursor.to_list(length=None)

        if not employees_list and employee_id_filter:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee '{employee_id_filter}' not found or inactive",
            )

        # 3. Determine overlapping policy weeks for this date range
        overlapping_weeks = get_overlapping_policy_weeks(range_start, range_end)

        # 4. Fetch all attendance records covering from min(overlapping_weeks.start) to max(overlapping_weeks.end)
        # This ensures full weekly compliance evaluation even if report range only covers part of a week
        earliest_date = overlapping_weeks[0][0].isoformat()
        latest_date = overlapping_weeks[-1][1].isoformat()

        attendance_query = {
            "work_date": {"$gte": earliest_date, "$lte": latest_date},
        }
        if employee_id_filter:
            attendance_query["employee_id"] = employee_id_filter

        attendance_cursor = self.attendance.find(attendance_query)
        raw_attendance = await attendance_cursor.to_list(length=None)

        # Organize attendance records by employee_id -> work_date -> record
        attendance_by_emp: dict[str, dict[str, dict]] = defaultdict(dict)
        for doc in raw_attendance:
            emp_id = doc["employee_id"]
            w_date = doc["work_date"]
            attendance_by_emp[emp_id][w_date] = doc

        # 5. Build Employee Report Items
        employee_items: list[EmployeeReportItem] = []
        total_company_days = 0
        total_company_seconds = 0
        compliant_weeks_count = 0
        non_compliant_weeks_count = 0
        pending_weeks_count = 0

        for emp in employees_list:
            eid = emp["employee_id"]
            emp_records = attendance_by_emp.get(eid, {})

            # Calculate daily attendance items strictly within [range_start, range_end]
            daily_items: list[DailyAttendanceItem] = []
            curr_date = range_start
            emp_range_attended_days = 0
            emp_range_duration_seconds = 0

            while curr_date <= range_end:
                d_str = curr_date.isoformat()
                record = emp_records.get(d_str)

                if record:
                    status_val = AttendanceStatus(record.get("attendance_status", AttendanceStatus.NOT_ATTENDED.value))
                    duration_sec = record.get("duration_seconds", 0) if status_val == AttendanceStatus.COMPLETED else 0
                    duration_hr = round(duration_sec / 3600.0, 2)

                    if status_val == AttendanceStatus.COMPLETED:
                        emp_range_attended_days += 1
                        emp_range_duration_seconds += duration_sec

                    daily_items.append(
                        DailyAttendanceItem(
                            work_date=d_str,
                            entry_time=record.get("entry_time"),
                            exit_time=record.get("exit_time"),
                            duration_seconds=duration_sec,
                            duration_hours=duration_hr,
                            status=status_val,
                        )
                    )
                else:
                    daily_items.append(
                        DailyAttendanceItem(
                            work_date=d_str,
                            entry_time=None,
                            exit_time=None,
                            duration_seconds=0,
                            duration_hours=0.0,
                            status=AttendanceStatus.NOT_ATTENDED,
                        )
                    )

                curr_date += timedelta(days=1)

            # Evaluate weekly compliance for all overlapping policy weeks
            weekly_results: list[WeeklyComplianceResult] = []
            for w_start, w_end in overlapping_weeks:
                # Gather all records for this employee within [w_start, w_end]
                week_records = []
                w_curr = w_start
                while w_curr <= w_end:
                    w_curr_str = w_curr.isoformat()
                    if w_curr_str in emp_records:
                        week_records.append(emp_records[w_curr_str])
                    w_curr += timedelta(days=1)

                w_result = self.policy_service.evaluate_weekly_compliance(
                    employee_id=eid,
                    week_start=w_start,
                    week_end=w_end,
                    completed_records_in_week=week_records,
                )
                weekly_results.append(w_result)

                if w_result.compliance_status == ComplianceStatus.COMPLIANT:
                    compliant_weeks_count += 1
                elif w_result.compliance_status == ComplianceStatus.NON_COMPLIANT:
                    non_compliant_weeks_count += 1
                else:
                    pending_weeks_count += 1

            # Determine overall compliance:
            # For a weekly report, it's the week's status. For multi-week, it reflects whether all completed weeks are compliant.
            overall_status: ComplianceStatus | None = None
            if period == ReportPeriod.WEEKLY and len(weekly_results) == 1:
                overall_status = weekly_results[0].compliance_status
            elif weekly_results:
                completed_weeks = [w for w in weekly_results if w.is_week_completed]
                if any(w.compliance_status == ComplianceStatus.NON_COMPLIANT for w in completed_weeks):
                    overall_status = ComplianceStatus.NON_COMPLIANT
                elif all(w.compliance_status == ComplianceStatus.COMPLIANT for w in weekly_results):
                    overall_status = ComplianceStatus.COMPLIANT
                else:
                    overall_status = ComplianceStatus.PENDING

            emp_total_hours = round(emp_range_duration_seconds / 3600.0, 2)
            total_company_days += emp_range_attended_days
            total_company_seconds += emp_range_duration_seconds

            employee_items.append(
                EmployeeReportItem(
                    employee_id=eid,
                    full_name=emp.get("full_name", ""),
                    email=emp.get("email", ""),
                    department=emp.get("department", ""),
                    is_active=emp.get("is_active", True),
                    total_attended_days=emp_range_attended_days,
                    total_office_hours=emp_total_hours,
                    total_duration_seconds=emp_range_duration_seconds,
                    daily_records=daily_items,
                    weekly_compliance=weekly_results,
                    overall_compliance=overall_status,
                )
            )

        total_emp_count = len(employees_list)
        total_company_hours = round(total_company_seconds / 3600.0, 2)
        avg_hours = round(total_company_hours / total_emp_count, 2) if total_emp_count > 0 else 0.0

        metadata = ReportMetadata(
            period=period,
            start_date=start_str,
            end_date=end_str,
            company_timezone=self.settings.COMPANY_TIMEZONE,
            generated_at=datetime.now(UTC),
            total_employees=total_emp_count,
            covered_policy_weeks_count=len(overlapping_weeks),
        )

        summary = CompanyReportSummary(
            total_active_employees=total_emp_count,
            total_office_days_accumulated=total_company_days,
            total_office_hours_accumulated=total_company_hours,
            average_hours_per_employee=avg_hours,
            compliant_weeks_count=compliant_weeks_count,
            non_compliant_weeks_count=non_compliant_weeks_count,
            pending_weeks_count=pending_weeks_count,
        )

        return AttendanceReportResponse(
            metadata=metadata,
            summary=summary,
            employees=employee_items,
        )

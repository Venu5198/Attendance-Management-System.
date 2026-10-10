"""Attendance policy evaluation service implementing WFH compliance rules."""

import logging
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.schemas.attendance import AttendanceStatus
from app.schemas.policy import (
    ComplianceHealthScore,
    ComplianceStatus,
    WeeklyComplianceResult,
    WeeklyScoreRecord,
)
from app.utils.time_utils import (
    get_company_tz,
    get_week_label,
    is_week_completed,
)

logger = logging.getLogger(__name__)


def compute_pre_hire_workdays(hire_date_val: date | str | datetime | None, week_start: date, week_end: date) -> int:
    if not hire_date_val:
        return 0
    if isinstance(hire_date_val, str):
        from app.utils.time_utils import parse_date

        h_date = parse_date(hire_date_val)
    elif isinstance(hire_date_val, datetime):
        h_date = hire_date_val.date()
    else:
        h_date = hire_date_val

    if h_date <= week_start:
        return 0
    if h_date > week_end:
        return 5

    curr = week_start
    pre_hire = 0
    while curr < h_date:
        if curr.weekday() < 5:
            pre_hire += 1
        curr += timedelta(days=1)
    return pre_hire


class PolicyService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.attendance = db.attendance
        self.employees = db.employees
        self.violations = db.policy_violations
        self.settings = get_settings()

    def evaluate_weekly_compliance(
        self,
        employee_id: str,
        week_start: date,
        week_end: date,
        completed_records_in_week: list[dict],
        is_completed_week: bool | None = None,
        approved_leave_days: int = 0,
        holidays_count: int = 0,
        pre_hire_workdays: int = 0,
    ) -> WeeklyComplianceResult:
        """
        Pure compliance evaluation for an employee over a specific Monday-to-Sunday week.
        Dynamic Target Scaling Rules:
        - Approved leave, company holidays, and mid-week onboarding pre-hire days proportionally scale down required targets.
        - If total exempt/non-working days cover the requirement (or req_days == 0), status is EXEMPT (or COMPLIANT if attended).
        - office_days >= adjusted req_days AND total_office_hours >= adjusted req_hours -> COMPLIANT
        """
        if is_completed_week is None:
            is_completed_week = is_week_completed(week_end)

        distinct_attended_days = set()
        total_seconds = 0

        for rec in completed_records_in_week:
            if rec.get("attendance_status") == AttendanceStatus.COMPLETED.value:
                work_date = rec.get("work_date")
                if work_date:
                    distinct_attended_days.add(work_date)
                duration_sec = rec.get("duration_seconds", 0)
                if duration_sec > 0:
                    total_seconds += duration_sec

        office_days = len(distinct_attended_days)
        total_hours = round(total_seconds / 3600.0, 2)
        base_req_days = self.settings.POLICY_REQUIRED_DAYS
        base_req_hours = self.settings.POLICY_REQUIRED_HOURS

        total_exempt_days = approved_leave_days + holidays_count + pre_hire_workdays
        req_days = max(0, base_req_days - total_exempt_days)
        daily_hours_target = base_req_hours / max(1, base_req_days)
        req_hours = max(0.0, round(req_days * daily_hours_target, 2))

        if total_exempt_days >= base_req_days or req_days == 0:
            if office_days == 0 and total_hours == 0:
                status = ComplianceStatus.EXEMPT
                violation_reasons = []
            else:
                status = ComplianceStatus.COMPLIANT
                violation_reasons = []
        else:
            days_met = office_days >= req_days
            hours_met = total_hours >= req_hours

            violation_reasons: list[str] = []
            if not days_met:
                adjustments = []
                if approved_leave_days > 0:
                    adjustments.append(f"leave: {approved_leave_days}d")
                if holidays_count > 0:
                    adjustments.append(f"holidays: {holidays_count}d")
                if pre_hire_workdays > 0:
                    adjustments.append(f"pre-hire: {pre_hire_workdays}d")
                adj_str = f" ({', '.join(adjustments)})" if adjustments else ""
                violation_reasons.append(
                    f"Office attendance was {office_days} day(s), below adjusted required {req_days} days{adj_str}."
                )
            if not hours_met:
                violation_reasons.append(
                    f"Accumulated office hours were {total_hours} hr(s), below adjusted required {req_hours} hours."
                )

            if days_met and hours_met:
                status = ComplianceStatus.COMPLIANT
                violation_reasons = []
            elif not is_completed_week:
                status = ComplianceStatus.PENDING
            else:
                status = ComplianceStatus.NON_COMPLIANT

        week_label = get_week_label(week_start, week_end)
        return WeeklyComplianceResult(
            employee_id=employee_id,
            week_start=week_start,
            week_end=week_end,
            week_label=week_label,
            office_days=office_days,
            total_office_hours=total_hours,
            total_duration_seconds=total_seconds,
            required_days=req_days,
            required_hours=req_hours,
            approved_leave_days=approved_leave_days,
            holidays_count=holidays_count,
            pre_hire_workdays=pre_hire_workdays,
            is_week_completed=is_completed_week,
            compliance_status=status,
            violation_reasons=violation_reasons,
        )

    async def evaluate_and_record_completed_week(
        self,
        week_start: date,
        week_end: date,
        employee_id: str | None = None,
    ) -> list[WeeklyComplianceResult]:
        """
        Evaluate policy for a completed week across all active employees (or a single employee).
        Stores non-compliant results in `policy_violations` idempotently.
        """
        if not is_week_completed(week_end):
            logger.info("Week ending %s is not yet completed; skipping violation persistence.", week_end)

        emp_filter = {"is_active": True}
        if employee_id:
            emp_filter["employee_id"] = employee_id

        employees = await self.employees.find(emp_filter).to_list(length=None)

        results: list[WeeklyComplianceResult] = []
        now = datetime.now(UTC)

        from app.services.holiday_service import HolidayService
        from app.services.leave_service import LeaveService

        leave_service = LeaveService(self.db)
        holiday_service = HolidayService(self.db)
        holidays_count = await holiday_service.get_holiday_days_in_range(week_start, week_end)

        for emp in employees:
            eid = emp["employee_id"]
            approved_leave_days = await leave_service.get_approved_leave_days_in_range(eid, week_start, week_end)
            pre_hire_workdays = compute_pre_hire_workdays(emp.get("hire_date"), week_start, week_end)

            # Fetch all attendance records for employee in week [week_start, week_end]
            records = await self.attendance.find(
                {
                    "employee_id": eid,
                    "work_date": {
                        "$gte": week_start.isoformat(),
                        "$lte": week_end.isoformat(),
                    },
                }
            ).to_list(length=None)

            compliance = self.evaluate_weekly_compliance(
                employee_id=eid,
                week_start=week_start,
                week_end=week_end,
                completed_records_in_week=records,
                approved_leave_days=approved_leave_days,
                holidays_count=holidays_count,
                pre_hire_workdays=pre_hire_workdays,
            )
            results.append(compliance)

            # If week is completed and status is NON_COMPLIANT, persist to policy_violations idempotently
            if compliance.is_week_completed and compliance.compliance_status == ComplianceStatus.NON_COMPLIANT:
                week_start_str = week_start.isoformat()
                week_end_str = week_end.isoformat()

                violation_doc = {
                    "employee_id": eid,
                    "employee_name": emp.get("full_name"),
                    "employee_email": emp.get("email"),
                    "week_start": week_start_str,
                    "week_end": week_end_str,
                    "week_label": compliance.week_label,
                    "office_days": compliance.office_days,
                    "total_office_hours": compliance.total_office_hours,
                    "required_days": compliance.required_days,
                    "required_hours": compliance.required_hours,
                    "approved_leave_days": compliance.approved_leave_days,
                    "holidays_count": compliance.holidays_count,
                    "pre_hire_workdays": compliance.pre_hire_workdays,
                    "compliance_status": compliance.compliance_status.value,
                    "violation_reasons": compliance.violation_reasons,
                    "evaluated_at": now,
                }

                # Upsert to avoid duplicates
                await self.violations.update_one(
                    {
                        "employee_id": eid,
                        "week_start": week_start_str,
                        "week_end": week_end_str,
                    },
                    {
                        "$set": violation_doc,
                        "$setOnInsert": {
                            "violation_id": str(uuid4()),
                            "notification_sent": False,
                        },
                    },
                    upsert=True,
                )

        return results

    async def get_violations(
        self,
        week_label: str | None = None,
        employee_id: str | None = None,
    ) -> list[dict]:
        """Query recorded policy violations."""
        query = {}
        if week_label:
            query["week_label"] = week_label
        if employee_id:
            query["employee_id"] = employee_id

        return await self.violations.find(query).sort("evaluated_at", -1).to_list(length=None)

    async def get_rolling_health_scores(
        self,
        employee_id_filter: str | None = None,
    ) -> list[ComplianceHealthScore]:
        """
        Compute rolling 4-week compliance history percentage per employee.
        Evaluates the past 4 completed weeks (Mon-Sun) preceding the current week.
        """
        tz = get_company_tz()
        today = datetime.now(tz).date()

        # Find Monday of current active week
        days_since_monday = today.weekday()
        current_monday = today - timedelta(days=days_since_monday)

        # 4 completed past weeks
        past_weeks: list[tuple[date, date]] = []
        for i in range(1, 5):
            week_end = current_monday - timedelta(days=1 + 7 * (i - 1))
            week_start = week_end - timedelta(days=6)
            past_weeks.append((week_start, week_end))
        past_weeks.reverse()  # chronological: W-4, W-3, W-2, W-1

        emp_query = {"is_active": True}
        if employee_id_filter:
            emp_query["employee_id"] = employee_id_filter

        employees = await self.employees.find(emp_query).sort("employee_id", 1).to_list(length=None)
        results: list[ComplianceHealthScore] = []

        from app.services.holiday_service import HolidayService
        from app.services.leave_service import LeaveService

        leave_service = LeaveService(self.db)
        holiday_service = HolidayService(self.db)

        # Pre-cache holiday days count for all past weeks
        holiday_cache: dict[tuple[date, date], int] = {}
        for w_start, w_end in past_weeks:
            holiday_cache[(w_start, w_end)] = await holiday_service.get_holiday_days_in_range(w_start, w_end)

        for emp in employees:
            eid = emp["employee_id"]
            name = emp.get("full_name", eid)
            dept = emp.get("department", "General")
            hire_date = emp.get("hire_date")

            weekly_records: list[WeeklyScoreRecord] = []
            compliant_count = 0

            for w_start, w_end in past_weeks:
                approved_leave_days = await leave_service.get_approved_leave_days_in_range(eid, w_start, w_end)
                holidays_count = holiday_cache.get((w_start, w_end), 0)
                pre_hire_workdays = compute_pre_hire_workdays(hire_date, w_start, w_end)
                records = await self.attendance.find(
                    {
                        "employee_id": eid,
                        "work_date": {
                            "$gte": w_start.isoformat(),
                            "$lte": w_end.isoformat(),
                        },
                    }
                ).to_list(length=None)

                res = self.evaluate_weekly_compliance(
                    employee_id=eid,
                    week_start=w_start,
                    week_end=w_end,
                    completed_records_in_week=records,
                    is_completed_week=True,
                    approved_leave_days=approved_leave_days,
                    holidays_count=holidays_count,
                    pre_hire_workdays=pre_hire_workdays,
                )
                st = res.compliance_status
                if st in (ComplianceStatus.COMPLIANT, ComplianceStatus.EXEMPT):
                    compliant_count += 1

                weekly_records.append(
                    WeeklyScoreRecord(
                        week_start=w_start,
                        week_end=w_end,
                        week_label=res.week_label,
                        office_days=res.office_days,
                        total_office_hours=res.total_office_hours,
                        required_days=res.required_days,
                        required_hours=res.required_hours,
                        status=st,
                        violation_reasons=res.violation_reasons,
                    )
                )

            total_weeks = len(past_weeks)
            health_score = round((compliant_count / total_weeks) * 100.0, 1) if total_weeks > 0 else 100.0

            if health_score >= 90.0:
                rating = "EXCELLENT"
            elif health_score >= 75.0:
                rating = "GOOD"
            elif health_score >= 50.0:
                rating = "AT_RISK"
            else:
                rating = "CRITICAL"

            results.append(
                ComplianceHealthScore(
                    employee_id=eid,
                    employee_name=name,
                    department=dept,
                    health_score=health_score,
                    health_rating=rating,
                    compliant_weeks=compliant_count,
                    total_evaluated_weeks=total_weeks,
                    chronic_issue=(health_score < 75.0),
                    weekly_history=weekly_records,
                )
            )

        return results

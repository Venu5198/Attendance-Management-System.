"""Attendance policy evaluation service implementing WFH compliance rules."""

import logging
from datetime import UTC, date, datetime
from uuid import uuid4

from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.schemas.attendance import AttendanceStatus
from app.schemas.policy import ComplianceStatus, WeeklyComplianceResult
from app.utils.time_utils import (
    get_week_label,
    is_week_completed,
)

logger = logging.getLogger(__name__)


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
    ) -> WeeklyComplianceResult:
        """
        Pure compliance evaluation for an employee over a specific Monday-to-Sunday week.
        Rules:
        - If approved leave days exist, required days and hours are proportionally adjusted.
        - If approved leave covers the weekly requirement, status is EXEMPT (or COMPLIANT if attended).
        - office_days >= adjusted req_days AND total_office_hours >= adjusted req_hours -> COMPLIANT
        - If week is NOT completed:
            - If already met -> COMPLIANT
            - Else -> PENDING
        - If week IS completed:
            - If conditions met -> COMPLIANT
            - Else -> NON_COMPLIANT with specific reasons
        """
        if is_completed_week is None:
            is_completed_week = is_week_completed(week_end)

        # Count distinct attended office days where attendance was COMPLETED
        # (Exclude IN_PROGRESS or NOT_ATTENDED)
        distinct_attended_days = set()
        total_seconds = 0

        for rec in completed_records_in_week:
            # Only count completed sessions with valid duration
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

        req_days = max(0, base_req_days - approved_leave_days)
        daily_hours_target = base_req_hours / max(1, base_req_days)
        req_hours = max(0.0, round(req_days * daily_hours_target, 2))

        if approved_leave_days >= base_req_days or req_days == 0:
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
                violation_reasons.append(
                    f"Office attendance was {office_days} day(s), below the adjusted required {req_days} days (approved leave: {approved_leave_days} day(s))."
                )
            if not hours_met:
                violation_reasons.append(
                    f"Accumulated office hours were {total_hours} hr(s), below the adjusted required {req_hours} hours."
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

        from app.services.leave_service import LeaveService

        leave_service = LeaveService(self.db)

        for emp in employees:
            eid = emp["employee_id"]
            approved_leave_days = await leave_service.get_approved_leave_days_in_range(eid, week_start, week_end)

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

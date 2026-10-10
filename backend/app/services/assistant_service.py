"""Natural Language Assistant service for parsing queries and answering compliance/attendance questions."""

import re
from datetime import UTC, date, datetime, timedelta

from fastapi import HTTPException
from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.schemas.assistant import AssistantQueryResponse
from app.schemas.leave import LeaveRequestCreate, LeaveType
from app.schemas.regularization import RegularizationRequestCreate
from app.services.leave_service import LeaveService
from app.services.regularization_service import RegularizationService
from app.utils.time_utils import get_company_tz, get_week_boundaries, get_work_date, now_utc


class AssistantService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.attendance = db.attendance
        self.employees = db.employees
        self.leaves = db.leaves
        self.holidays = db.holidays
        self.violations = db.policy_violations
        self.settings = get_settings()

    async def process_query(self, query: str, current_user: dict) -> AssistantQueryResponse:
        """Parse natural language query and route to intent resolver."""
        q = query.strip().lower()
        role = current_user.get("role", "EMPLOYEE")
        emp_id = current_user.get("employee_id") or ""

        # 1. Action: Apply / Request Leave or WFH Exemption
        if any(
            phrase in q
            for phrase in [
                "apply leave",
                "request leave",
                "take leave",
                "apply for leave",
                "apply wfh",
                "request wfh",
                "request remote",
                "apply sick",
                "submit leave",
            ]
        ):
            return await self._handle_create_leave(query, role, emp_id)

        # 2. Action: Regularization / Missed punch correction
        if any(
            phrase in q
            for phrase in [
                "regularize",
                "regularization",
                "missed punch",
                "adjust attendance",
                "correct attendance",
                "fix attendance",
            ]
        ):
            return await self._handle_create_regularization(query, role, emp_id)

        # 3. Inquiry: Holidays
        if any(w in q for w in ["holiday", "holidays", "day off", "days off", "festival", "vacation calendar"]):
            return await self._handle_holidays(q)

        # 4. Inquiry: Non-compliant / Policy Violations
        if any(
            w in q
            for w in [
                "non-compliant",
                "non compliant",
                "violat",
                "missed hour",
                "missed day",
                "breach",
                "penalty",
                "warning",
            ]
        ):
            return await self._handle_violations(q, role, emp_id)

        # 5. Inquiry: Leaves / Time Off Status
        if any(w in q for w in ["leave", "leaves", "time off", "vacation request", "sick leave", "remote exception"]):
            return await self._handle_leaves(q, role, emp_id)

        # 6. Inquiry: Who is checked in / In office today
        if any(
            w in q
            for w in [
                "who is in",
                "who is working",
                "checked in",
                "in office today",
                "office today",
                "present today",
                "who is here",
            ]
        ):
            return await self._handle_today_presence(q, role)

        # 7. Inquiry: Personal Hours / Compliance Progress
        if any(
            w in q
            for w in [
                "my hour",
                "my attendance",
                "how many hour",
                "hours worked",
                "am i compliant",
                "my target",
                "my progress",
                "how many day",
            ]
        ):
            return await self._handle_my_hours(emp_id)

        # 8. Fallback intent
        return self._handle_fallback(q, role)

    async def _handle_create_leave(self, query: str, role: str, emp_id: str) -> AssistantQueryResponse:
        if not emp_id:
            return AssistantQueryResponse(
                query=query,
                intent="ACTION_ERROR",
                headline="Employee Profile Required",
                answer="Cannot submit a leave request without an active employee profile.",
                action_url="/employees",
            )

        q = query.lower()
        today = datetime.now(UTC).date()

        # Extract dates
        dates = re.findall(r"\b(\d{4}-\d{2}-\d{2})\b", query)
        if dates:
            start_date = dates[0]
            end_date = dates[1] if len(dates) > 1 else dates[0]
        elif "tomorrow" in q:
            start_date = end_date = (today + timedelta(days=1)).isoformat()
        elif "today" in q:
            start_date = end_date = today.isoformat()
        else:
            return AssistantQueryResponse(
                query=query,
                intent="LEAVE_ACTION_INCOMPLETE",
                headline="Dates Required for Leave",
                answer="Please provide target date(s) in YYYY-MM-DD format (e.g. 'Request leave for 2026-10-15').",
                action_url="/leaves",
                suggestions=["Apply leave for 2026-10-20 to 2026-10-21 reason vacation", "Upcoming holidays"],
            )

        # Extract leave type
        if "sick" in q:
            leave_type = LeaveType.SICK
        elif "casual" in q:
            leave_type = LeaveType.CASUAL
        elif "remote" in q or "wfh" in q or "exception" in q:
            leave_type = LeaveType.REMOTE_EXCEPTION
        else:
            leave_type = LeaveType.VACATION

        # Extract reason
        reason_match = re.search(r"(?:because|reason|due to|for)\s+(.+)", query, re.IGNORECASE)
        reason = reason_match.group(1).strip() if reason_match else "Leave requested via AI Assistant"

        leave_service = LeaveService(self.db)
        try:
            req_in = LeaveRequestCreate(
                start_date=start_date,
                end_date=end_date,
                leave_type=leave_type,
                reason=reason[:500],
            )
            created = await leave_service.create_leave_request(emp_id, req_in)
            answer = (
                f"Successfully submitted {leave_type.value} leave request for {start_date} "
                f"to {end_date} (Status: {created.status.value}). Reason: '{reason}'."
            )
            return AssistantQueryResponse(
                query=query,
                intent="LEAVE_CREATED",
                headline=f"{leave_type.value} Leave Submitted",
                answer=answer,
                action_url="/leaves",
                data={
                    "leave_id": created.leave_id,
                    "start_date": created.start_date,
                    "end_date": created.end_date,
                    "leave_type": created.leave_type.value,
                    "status": created.status.value,
                },
                suggestions=["Show my leave requests", "My hours this week"],
            )
        except HTTPException as exc:
            return AssistantQueryResponse(
                query=query,
                intent="ACTION_REJECTED",
                headline="Leave Request Intercepted",
                answer=f"Could not submit leave: {exc.detail}",
                action_url="/leaves",
                suggestions=["Show my leave requests", "Upcoming company holidays"],
            )

    async def _handle_create_regularization(self, query: str, role: str, emp_id: str) -> AssistantQueryResponse:
        if not emp_id:
            return AssistantQueryResponse(
                query=query,
                intent="ACTION_ERROR",
                headline="Employee Profile Required",
                answer="Cannot regularize attendance without an active employee profile.",
                action_url="/employees",
            )

        q = query.lower()
        today = datetime.now(UTC).date()

        # Extract target work_date
        dates = re.findall(r"\b(\d{4}-\d{2}-\d{2})\b", query)
        if dates:
            target_date_str = dates[0]
            target_date = date.fromisoformat(target_date_str)
        elif "yesterday" in q:
            target_date = today - timedelta(days=1)
            target_date_str = target_date.isoformat()
        elif "today" in q:
            target_date = today
            target_date_str = target_date.isoformat()
        else:
            return AssistantQueryResponse(
                query=query,
                intent="REGULARIZATION_ACTION_INCOMPLETE",
                headline="Work Date Required",
                answer="Please specify the date to regularize (e.g. 'Regularize 2026-10-05 missed punch').",
                action_url="/attendance",
                suggestions=["Regularize 2026-10-06 missed punch", "How many hours have I worked?"],
            )

        # Extract entry/exit times if specified, else default to standard 09:30 to 18:30
        times = re.findall(r"\b(\d{1,2}:\d{2})\b", query)
        if len(times) >= 2:
            entry_hour, entry_min = map(int, times[0].split(":"))
            exit_hour, exit_min = map(int, times[1].split(":"))
        else:
            entry_hour, entry_min = 9, 30
            exit_hour, exit_min = 18, 30

        tz = get_company_tz()
        entry_time = datetime(target_date.year, target_date.month, target_date.day, entry_hour, entry_min, tzinfo=tz)
        exit_time = datetime(target_date.year, target_date.month, target_date.day, exit_hour, exit_min, tzinfo=tz)

        reason_match = re.search(r"(?:because|reason|due to|for)\s+(.+)", query, re.IGNORECASE)
        reason = reason_match.group(1).strip() if reason_match else "Missed clock-in/out regularized via AI Assistant"

        reg_service = RegularizationService(self.db)
        try:
            req_in = RegularizationRequestCreate(
                work_date=target_date_str,
                entry_time=entry_time,
                exit_time=exit_time,
                reason=reason[:500],
            )
            created = await reg_service.create_request(emp_id, req_in)
            answer = (
                f"Successfully submitted regularization request for {target_date_str} "
                f"({entry_hour:02d}:{entry_min:02d} - {exit_hour:02d}:{exit_min:02d}). "
                f"Status: {created.status.value}. Reason: '{reason}'."
            )
            return AssistantQueryResponse(
                query=query,
                intent="REGULARIZATION_CREATED",
                headline="Regularization Request Submitted",
                answer=answer,
                action_url="/attendance",
                data={
                    "request_id": created.request_id,
                    "work_date": created.work_date,
                    "duration_hours": created.duration_hours,
                    "status": created.status.value,
                },
                suggestions=["Show my attendance history", "My hours this week"],
            )
        except HTTPException as exc:
            return AssistantQueryResponse(
                query=query,
                intent="ACTION_REJECTED",
                headline="Regularization Guardrail",
                answer=f"Could not submit regularization: {exc.detail}",
                action_url="/attendance",
                suggestions=["How many hours have I worked this week?", "Upcoming company holidays"],
            )

    async def _handle_holidays(self, query: str) -> AssistantQueryResponse:
        today = get_work_date(now_utc())
        cursor = self.holidays.find({"holiday_date": {"$gte": today}}).sort("holiday_date", 1).limit(5)
        upcoming = [doc async for doc in cursor]

        if not upcoming:
            return AssistantQueryResponse(
                query=query,
                intent="UPCOMING_HOLIDAYS",
                headline="No Upcoming Holidays",
                answer="There are no upcoming company holidays scheduled in the system.",
                action_url="/leaves",
                data=[],
                suggestions=["Check my attendance hours this week", "Who is in office today?"],
            )

        items_text = ", ".join([f"{h['name']} ({h['holiday_date']})" for h in upcoming])
        first_h = upcoming[0]
        answer = f"The next upcoming holiday is {first_h['name']} on {first_h['holiday_date']}. Upcoming holidays: {items_text}."

        clean_data = [
            {"name": h.get("name"), "date": h.get("holiday_date"), "description": h.get("description")}
            for h in upcoming
        ]

        return AssistantQueryResponse(
            query=query,
            intent="UPCOMING_HOLIDAYS",
            headline=f"{len(upcoming)} Upcoming Holiday{'s' if len(upcoming) > 1 else ''}",
            answer=answer,
            action_url="/leaves",
            data=clean_data,
            suggestions=["Am I compliant this week?", "Show my leave requests"],
        )

    async def _handle_violations(self, query: str, role: str, emp_id: str) -> AssistantQueryResponse:
        if role == "ADMIN":
            cursor = self.violations.find({}).sort("week_label", -1).limit(10)
            all_violations = [v async for v in cursor]

            if not all_violations:
                return AssistantQueryResponse(
                    query=query,
                    intent="VIOLATIONS_CHECK",
                    headline="Zero Compliance Violations",
                    answer="Great news! There are currently no recorded attendance policy violations in the system.",
                    action_url="/violations",
                    data=[],
                    suggestions=["Who is in the office today?", "Show upcoming holidays"],
                )

            latest_week = all_violations[0].get("week_label")
            week_v_count = sum(1 for v in all_violations if v.get("week_label") == latest_week)
            emp_names = [
                v.get("employee_name") or v.get("employee_id")
                for v in all_violations
                if v.get("week_label") == latest_week
            ][:4]
            names_str = ", ".join(emp_names)

            answer = (
                f"For week {latest_week}, there are {week_v_count} policy violation(s). "
                f"Flagged team members include: {names_str}."
            )

            clean_data = [
                {
                    "employee_name": v.get("employee_name"),
                    "employee_id": v.get("employee_id"),
                    "week_label": v.get("week_label"),
                    "reasons": v.get("violation_reasons", []),
                }
                for v in all_violations
            ]

            return AssistantQueryResponse(
                query=query,
                intent="VIOLATIONS_CHECK",
                headline=f"{week_v_count} Violation(s) in {latest_week}",
                answer=answer,
                action_url="/violations",
                data=clean_data,
                suggestions=["Who is in office today?", "Check company holidays"],
            )
        else:
            # Employee role: check own violations
            cursor = self.violations.find({"employee_id": emp_id}).sort("week_label", -1)
            my_v = [v async for v in cursor]
            if not my_v:
                return AssistantQueryResponse(
                    query=query,
                    intent="VIOLATIONS_CHECK",
                    headline="Fully Compliant",
                    answer="You have zero recorded policy violations! You are in full compliance with the WFH policy.",
                    action_url="/dashboard",
                    data=[],
                    suggestions=["How many hours have I worked this week?", "Show my leave balance"],
                )
            latest = my_v[0]
            answer = (
                f"You have {len(my_v)} violation record(s). Your latest violation was for {latest.get('week_label')}."
            )
            return AssistantQueryResponse(
                query=query,
                intent="VIOLATIONS_CHECK",
                headline=f"{len(my_v)} Recorded Violation(s)",
                answer=answer,
                action_url="/dashboard",
                data=[{"week_label": v.get("week_label"), "reasons": v.get("violation_reasons", [])} for v in my_v],
                suggestions=["How many hours have I worked this week?", "Upcoming company holidays"],
            )

    async def _handle_leaves(self, query: str, role: str, emp_id: str) -> AssistantQueryResponse:
        filter_query = {} if role == "ADMIN" and "my" not in query else {"employee_id": emp_id}
        cursor = self.leaves.find(filter_query).sort("submitted_at", -1).limit(6)
        recent_leaves = [doc async for doc in cursor]

        pending_count = sum(1 for req in recent_leaves if req.get("status") == "PENDING")
        approved_count = sum(1 for req in recent_leaves if req.get("status") == "APPROVED")

        answer = (
            f"You have {pending_count} pending and {approved_count} approved leave/exception request(s). "
            f"Navigate to the Leaves hub to view details or submit a new request."
        )

        clean_data = [
            {
                "leave_id": req.get("leave_id"),
                "leave_type": req.get("leave_type"),
                "status": req.get("status"),
                "start_date": req.get("start_date"),
                "end_date": req.get("end_date"),
            }
            for req in recent_leaves
        ]

        return AssistantQueryResponse(
            query=query,
            intent="LEAVE_STATUS",
            headline=f"{len(recent_leaves)} Recent Leave Requests",
            answer=answer,
            action_url="/leaves",
            data=clean_data,
            suggestions=["Upcoming company holidays", "My hours this week"],
        )

    async def _handle_today_presence(self, query: str, role: str) -> AssistantQueryResponse:
        today = get_work_date(now_utc())
        cursor = self.attendance.find({"work_date": today})
        today_records = [doc async for doc in cursor]

        active_in_office = sum(1 for r in today_records if r.get("attendance_status") == "IN_PROGRESS")
        completed_today = sum(1 for r in today_records if r.get("attendance_status") == "COMPLETED")

        answer = (
            f"Today ({today}), {active_in_office} employee(s) are currently clocked in at the office, "
            f"and {completed_today} have completed their day."
        )

        return AssistantQueryResponse(
            query=query,
            intent="TODAY_PRESENCE",
            headline=f"{active_in_office} Active in Office",
            answer=answer,
            action_url="/attendance",
            data={"active_now": active_in_office, "completed_today": completed_today, "date": today},
            suggestions=["Upcoming holidays", "Who is non-compliant this week?"],
        )

    async def _handle_my_hours(self, emp_id: str) -> AssistantQueryResponse:
        if not emp_id:
            return AssistantQueryResponse(
                query="my hours",
                intent="MY_HOURS",
                headline="Employee Account Required",
                answer="You are logged in as an administrator without an assigned employee profile.",
                action_url="/employees",
                suggestions=["Who is in the office today?", "Who is non-compliant?"],
            )

        now = now_utc()
        current_date = now.date()
        mon, sun = get_week_boundaries(current_date)
        mon_str, sun_str = mon.isoformat(), sun.isoformat()

        cursor = self.attendance.find(
            {
                "employee_id": emp_id,
                "work_date": {"$gte": mon_str, "$lte": sun_str},
                "attendance_status": {"$in": ["COMPLETED", "IN_PROGRESS"]},
            }
        )
        records = [doc async for doc in cursor]

        days_logged = len(records)
        total_seconds = sum(r.get("duration_seconds", 0) for r in records)
        total_hours = round(total_seconds / 3600.0, 1)

        req_days = self.settings.POLICY_REQUIRED_DAYS
        req_hours = self.settings.POLICY_REQUIRED_HOURS

        remaining_days = max(0, req_days - days_logged)
        remaining_hours = max(0.0, round(req_hours - total_hours, 1))

        if remaining_days == 0 and remaining_hours == 0:
            status_summary = "Congratulations! You have satisfied all weekly policy requirements (3 days / 15 hours)."
        else:
            status_summary = (
                f"You need {remaining_days} more office day{'s' if remaining_days != 1 else ''} and "
                f"{remaining_hours} more hour{'s' if remaining_hours != 1 else ''} to reach compliance."
            )

        answer = (
            f"This week ({mon_str} to {sun_str}), you have completed {days_logged} office day(s) "
            f"and {total_hours} hour(s). {status_summary}"
        )

        return AssistantQueryResponse(
            query="my hours",
            intent="MY_HOURS",
            headline=f"{total_hours}h / {days_logged} Days Completed",
            answer=answer,
            action_url="/dashboard",
            data={
                "days_logged": days_logged,
                "total_hours": total_hours,
                "required_days": req_days,
                "required_hours": req_hours,
                "remaining_days": remaining_days,
                "remaining_hours": remaining_hours,
            },
            suggestions=["Upcoming holidays", "Show my leave balance"],
        )

    def _handle_fallback(self, query: str, role: str) -> AssistantQueryResponse:
        headline = "Attendance Assistant"
        answer = (
            "I can help you monitor office hours, team compliance, holidays, and leave requests. "
            "Try asking one of the suggested prompts below."
        )
        suggestions = [
            "How many hours have I worked this week?",
            "Show upcoming company holidays",
            "Who is in the office today?",
            "What is my leave status?",
        ]
        if role == "ADMIN":
            suggestions.append("Who is non-compliant this week?")

        return AssistantQueryResponse(
            query=query,
            intent="GENERAL_HELP",
            headline=headline,
            answer=answer,
            action_url="/dashboard",
            data=None,
            suggestions=suggestions[:4],
        )

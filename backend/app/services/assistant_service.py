"""Natural Language Assistant service for parsing queries and answering compliance/attendance questions."""

from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.schemas.assistant import AssistantQueryResponse
from app.utils.time_utils import get_week_boundaries, get_work_date, now_utc


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

        # 1. Intent: Holidays
        if any(w in q for w in ["holiday", "holidays", "day off", "days off", "festival", "vacation calendar"]):
            return await self._handle_holidays(q)

        # 2. Intent: Non-compliant / Policy Violations
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

        # 3. Intent: Leaves / Time Off
        if any(w in q for w in ["leave", "leaves", "time off", "vacation request", "sick leave", "remote exception"]):
            return await self._handle_leaves(q, role, emp_id)

        # 4. Intent: Who is checked in / In office today
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

        # 5. Intent: Personal Hours / Compliance Progress
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

        # 6. Fallback intent
        return self._handle_fallback(q, role)

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

"""Leave and exemption management service."""

import logging
from datetime import UTC, date, datetime
from uuid import uuid4

from fastapi import HTTPException, status
from pymongo.asynchronous.database import AsyncDatabase

from app.schemas.leave import (
    LeaveRequestCreate,
    LeaveResponse,
    LeaveReviewRequest,
    LeaveStatus,
    LeaveType,
)
from app.utils.time_utils import parse_date

logger = logging.getLogger(__name__)


class LeaveService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.leaves = db.leaves
        self.employees = db.employees

    async def _verify_employee_exists_and_active(self, employee_id: str):
        emp = await self.employees.find_one({"employee_id": employee_id})
        if not emp:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee '{employee_id}' not found",
            )
        if not emp.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Employee '{employee_id}' is deactivated",
            )
        return emp

    async def create_leave_request(
        self,
        employee_id: str,
        request_in: LeaveRequestCreate,
    ) -> LeaveResponse:
        """Submit a new leave or remote exemption request."""
        await self._verify_employee_exists_and_active(employee_id)

        try:
            start_d = parse_date(request_in.start_date)
            end_d = parse_date(request_in.end_date)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid date format (must be YYYY-MM-DD): {exc}",
            ) from exc

        if end_d < start_d:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="End date cannot precede start date",
            )

        now = datetime.now(UTC)
        leave_id = str(uuid4())
        doc = {
            "leave_id": leave_id,
            "employee_id": employee_id,
            "start_date": request_in.start_date,
            "end_date": request_in.end_date,
            "leave_type": request_in.leave_type.value,
            "status": LeaveStatus.PENDING.value,
            "reason": request_in.reason,
            "submitted_at": now,
            "reviewed_by": None,
            "reviewed_at": None,
            "admin_notes": None,
        }

        await self.leaves.insert_one(doc)
        return self._format_doc(doc)

    async def list_leaves(
        self,
        employee_id: str | None = None,
        status_filter: str | None = None,
    ) -> list[LeaveResponse]:
        """Query leave requests filtered by employee or status."""
        query = {}
        if employee_id:
            query["employee_id"] = employee_id
        if status_filter:
            query["status"] = status_filter

        docs = await self.leaves.find(query).sort("submitted_at", -1).to_list(length=None)
        return [self._format_doc(d) for d in docs]

    async def review_leave(
        self,
        leave_id: str,
        reviewer_id: str,
        review_in: LeaveReviewRequest,
    ) -> LeaveResponse:
        """Approve or reject a leave request."""
        leave_doc = await self.leaves.find_one({"leave_id": leave_id})
        if not leave_doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Leave request '{leave_id}' not found",
            )

        if leave_doc.get("status") != LeaveStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Leave request is already reviewed (status: {leave_doc.get('status')})",
            )

        now = datetime.now(UTC)
        update_fields = {
            "status": review_in.action.value,
            "reviewed_by": reviewer_id,
            "reviewed_at": now,
            "admin_notes": review_in.admin_notes,
        }

        await self.leaves.update_one(
            {"leave_id": leave_id},
            {"$set": update_fields},
        )

        leave_doc.update(update_fields)
        return self._format_doc(leave_doc)

    async def get_approved_leave_days_in_range(
        self,
        employee_id: str,
        range_start: date,
        range_end: date,
    ) -> int:
        """
        Count distinct business days (Mon-Fri) on approved leave within the date range [range_start, range_end].
        """
        query = {
            "employee_id": employee_id,
            "status": LeaveStatus.APPROVED.value,
            "start_date": {"$lte": range_end.isoformat()},
            "end_date": {"$gte": range_start.isoformat()},
        }

        cursor = self.leaves.find(query)
        approved_dates: set[date] = set()

        async for doc in cursor:
            s_d = max(parse_date(doc["start_date"]), range_start)
            e_d = min(parse_date(doc["end_date"]), range_end)
            from datetime import timedelta

            curr = s_d
            while curr <= e_d:
                # Count Mon-Fri (weekday < 5)
                if curr.weekday() < 5:
                    approved_dates.add(curr)
                curr += timedelta(days=1)

        return len(approved_dates)

    def _format_doc(self, doc: dict) -> LeaveResponse:
        return LeaveResponse(
            leave_id=doc["leave_id"],
            employee_id=doc["employee_id"],
            start_date=doc["start_date"],
            end_date=doc["end_date"],
            leave_type=LeaveType(doc["leave_type"]),
            status=LeaveStatus(doc["status"]),
            reason=doc["reason"],
            submitted_at=doc["submitted_at"],
            reviewed_by=doc.get("reviewed_by"),
            reviewed_at=doc.get("reviewed_at"),
            admin_notes=doc.get("admin_notes"),
        )

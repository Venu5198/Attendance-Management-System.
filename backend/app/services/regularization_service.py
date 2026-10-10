"""Attendance regularization service for handling manual time corrections and reviews."""

import logging
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from fastapi import HTTPException, status
from pymongo.asynchronous.database import AsyncDatabase

from app.schemas.attendance import AttendanceStatus
from app.schemas.regularization import (
    BulkRegularizationReviewRequest,
    BulkRegularizationReviewResponse,
    RegularizationRequestCreate,
    RegularizationResponse,
    RegularizationReviewRequest,
    RegularizationStatus,
)
from app.utils.time_utils import get_company_tz, parse_date, to_utc

logger = logging.getLogger(__name__)


class RegularizationService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.regularizations = db.attendance_regularizations
        self.attendance = db.attendance
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

    async def create_request(
        self,
        employee_id: str,
        request_in: RegularizationRequestCreate,
    ) -> RegularizationResponse:
        """Create a new attendance regularization request."""
        await self._verify_employee_exists_and_active(employee_id)

        entry_utc = to_utc(request_in.entry_time)
        exit_utc = to_utc(request_in.exit_time)

        if exit_utc <= entry_utc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exit time must be strictly after entry time",
            )

        tz = get_company_tz()
        today = datetime.now(tz).date()
        try:
            req_date = parse_date(request_in.work_date)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid work_date format: {exc}",
            ) from exc

        if req_date > today:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot regularize attendance for future dates",
            )

        earliest_allowed = today - timedelta(days=14)
        if req_date < earliest_allowed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Attendance regularization must be submitted within 14 days of the work date (earliest allowable: {earliest_allowed.isoformat()})",
            )

        duration_seconds = int((exit_utc - entry_utc).total_seconds())
        now = datetime.now(UTC)

        # Check for existing pending request for this employee and date
        existing = await self.regularizations.find_one(
            {
                "employee_id": employee_id,
                "work_date": request_in.work_date,
                "status": RegularizationStatus.PENDING.value,
            }
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"A pending regularization request already exists for employee '{employee_id}' on {request_in.work_date}",
            )

        request_id = str(uuid4())
        doc = {
            "request_id": request_id,
            "employee_id": employee_id,
            "work_date": request_in.work_date,
            "entry_time": entry_utc,
            "exit_time": exit_utc,
            "duration_seconds": duration_seconds,
            "reason": request_in.reason,
            "status": RegularizationStatus.PENDING.value,
            "submitted_at": now,
            "reviewed_by": None,
            "reviewed_at": None,
            "admin_notes": None,
        }

        await self.regularizations.insert_one(doc)
        return self._format_doc(doc)

    async def list_requests(
        self,
        employee_id: str | None = None,
        status_filter: str | None = None,
    ) -> list[RegularizationResponse]:
        """List regularization requests filtered by employee or status."""
        query = {}
        if employee_id:
            query["employee_id"] = employee_id
        if status_filter:
            query["status"] = status_filter

        docs = await self.regularizations.find(query).sort("submitted_at", -1).to_list(length=None)
        return [self._format_doc(d) for d in docs]

    async def review_request(
        self,
        request_id: str,
        reviewer_id: str,
        review_in: RegularizationReviewRequest,
    ) -> RegularizationResponse:
        """Approve or reject a regularization request."""
        req = await self.regularizations.find_one({"request_id": request_id})
        if not req:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Regularization request '{request_id}' not found",
            )

        if req.get("status") != RegularizationStatus.PENDING.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Request is already reviewed (status: {req.get('status')})",
            )

        now = datetime.now(UTC)
        update_fields = {
            "status": review_in.action.value,
            "reviewed_by": reviewer_id,
            "reviewed_at": now,
            "admin_notes": review_in.admin_notes,
        }

        if review_in.action == RegularizationStatus.APPROVED:
            # Upsert into attendance collection
            emp_id = req["employee_id"]
            work_date = req["work_date"]
            entry_time = req["entry_time"]
            exit_time = req["exit_time"]
            duration_sec = req["duration_seconds"]

            existing_att = await self.attendance.find_one(
                {
                    "employee_id": emp_id,
                    "work_date": work_date,
                }
            )

            att_id = existing_att["attendance_id"] if existing_att else str(uuid4())
            await self.attendance.update_one(
                {
                    "employee_id": emp_id,
                    "work_date": work_date,
                },
                {
                    "$set": {
                        "attendance_id": att_id,
                        "employee_id": emp_id,
                        "work_date": work_date,
                        "entry_time": entry_time,
                        "exit_time": exit_time,
                        "duration_seconds": duration_sec,
                        "attendance_status": AttendanceStatus.COMPLETED.value,
                        "is_regularized": True,
                        "regularization_request_id": request_id,
                        "updated_at": now,
                    },
                    "$setOnInsert": {
                        "created_at": now,
                    },
                },
                upsert=True,
            )

        await self.regularizations.update_one(
            {"request_id": request_id},
            {"$set": update_fields},
        )

        req.update(update_fields)
        return self._format_doc(req)

    async def bulk_review_requests(
        self,
        reviewer_id: str,
        bulk_in: BulkRegularizationReviewRequest,
    ) -> BulkRegularizationReviewResponse:
        """Bulk approve or reject multiple regularization requests (up to 50)."""
        success_count = 0
        failed_count = 0
        updated_ids: list[str] = []
        errors: list[str] = []

        review_model = RegularizationReviewRequest(
            action=bulk_in.action,
            admin_notes=bulk_in.admin_notes,
        )

        for rid in bulk_in.request_ids:
            try:
                await self.review_request(rid, reviewer_id, review_model)
                success_count += 1
                updated_ids.append(rid)
            except Exception as exc:
                failed_count += 1
                errors.append(f"Request '{rid}': {str(exc)}")

        return BulkRegularizationReviewResponse(
            total_requested=len(bulk_in.request_ids),
            success_count=success_count,
            failed_count=failed_count,
            updated_ids=updated_ids,
            errors=errors,
        )

    def _format_doc(self, doc: dict) -> RegularizationResponse:
        duration_sec = doc.get("duration_seconds", 0)
        return RegularizationResponse(
            request_id=doc["request_id"],
            employee_id=doc["employee_id"],
            work_date=doc["work_date"],
            entry_time=doc["entry_time"],
            exit_time=doc["exit_time"],
            duration_seconds=duration_sec,
            duration_hours=round(duration_sec / 3600.0, 2),
            reason=doc["reason"],
            status=RegularizationStatus(doc["status"]),
            submitted_at=doc["submitted_at"],
            reviewed_by=doc.get("reviewed_by"),
            reviewed_at=doc.get("reviewed_at"),
            admin_notes=doc.get("admin_notes"),
        )

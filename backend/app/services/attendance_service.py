"""Attendance recording, check-in, check-out, and validation service."""

import logging
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, status
from pymongo.asynchronous.database import AsyncDatabase

from app.schemas.attendance import (
    AttendanceRecordResponse,
    AttendanceStatus,
    CheckInResponse,
    CheckOutResponse,
)
from app.utils.time_utils import get_work_date, now_utc, to_utc

logger = logging.getLogger(__name__)


class AttendanceService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
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

    async def check_in(self, employee_id: str) -> CheckInResponse:
        """
        Record employee office check-in.
        Uses server-controlled UTC entry timestamp to prevent client manipulation.
        """
        await self._verify_employee_exists_and_active(employee_id)

        now = now_utc()
        work_date = get_work_date(now)

        # Check if record already exists for today
        existing = await self.attendance.find_one(
            {
                "employee_id": employee_id,
                "work_date": work_date,
            }
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee '{employee_id}' already has a check-in record for workday {work_date}",
            )

        doc = {
            "attendance_id": str(uuid4()),
            "employee_id": employee_id,
            "work_date": work_date,
            "entry_time": now,
            "exit_time": None,
            "duration_seconds": 0,
            "attendance_status": AttendanceStatus.IN_PROGRESS.value,
            "created_at": now,
            "updated_at": now,
        }

        try:
            await self.attendance.insert_one(doc)
        except Exception as exc:
            # Catch potential unique compound index violation
            logger.warning("Duplicate check-in race condition caught: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee '{employee_id}' already has a check-in record for workday {work_date}",
            ) from exc

        return CheckInResponse(
            message="Check-in recorded successfully",
            attendance=self._format_attendance_doc(doc),
        )

    async def check_out(self, employee_id: str) -> CheckOutResponse:
        """
        Record employee office check-out.
        Calculates duration strictly from entry_time to exit_time.
        """
        await self._verify_employee_exists_and_active(employee_id)

        now = now_utc()
        work_date = get_work_date(now)

        # Find active check-in for this workday (or latest in-progress session)
        record = await self.attendance.find_one(
            {
                "employee_id": employee_id,
                "work_date": work_date,
            }
        )

        if not record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot check out: No check-in record found for employee '{employee_id}' on workday {work_date}",
            )

        if record.get("attendance_status") == AttendanceStatus.COMPLETED.value and record.get("exit_time") is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Employee '{employee_id}' has already checked out for workday {work_date}",
            )

        entry_time: datetime = to_utc(record["entry_time"])
        # Ensure exit time does not precede entry time
        if now < entry_time:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Exit time cannot precede entry time",
            )

        duration_seconds = int((now - entry_time).total_seconds())

        update_fields = {
            "exit_time": now,
            "duration_seconds": duration_seconds,
            "attendance_status": AttendanceStatus.COMPLETED.value,
            "updated_at": now,
        }

        await self.attendance.update_one(
            {"attendance_id": record["attendance_id"]},
            {"$set": update_fields},
        )

        record.update(update_fields)
        return CheckOutResponse(
            message="Check-out recorded successfully",
            attendance=self._format_attendance_doc(record),
        )

    async def get_today_status(self, employee_id: str) -> AttendanceRecordResponse:
        """Get today's attendance record for employee."""
        await self._verify_employee_exists_and_active(employee_id)
        now = now_utc()
        work_date = get_work_date(now)

        record = await self.attendance.find_one(
            {
                "employee_id": employee_id,
                "work_date": work_date,
            }
        )
        if not record:
            return AttendanceRecordResponse(
                attendance_id="",
                employee_id=employee_id,
                work_date=work_date,
                entry_time=None,
                exit_time=None,
                duration_seconds=0,
                duration_hours=0.0,
                attendance_status=AttendanceStatus.NOT_ATTENDED,
            )

        return self._format_attendance_doc(record)

    async def get_employee_history(
        self,
        employee_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[AttendanceRecordResponse]:
        """Get attendance records for employee within date range."""
        await self._verify_employee_exists_and_active(employee_id)

        query = {"employee_id": employee_id}
        if start_date or end_date:
            date_query = {}
            if start_date:
                date_query["$gte"] = start_date
            if end_date:
                date_query["$lte"] = end_date
            query["work_date"] = date_query

        cursor = self.attendance.find(query).sort("work_date", 1)
        results = []
        async for doc in cursor:
            results.append(self._format_attendance_doc(doc))
        return results

    def _format_attendance_doc(self, doc: dict) -> AttendanceRecordResponse:
        duration_sec = doc.get("duration_seconds", 0)
        duration_hrs = round(duration_sec / 3600.0, 2)
        return AttendanceRecordResponse(
            attendance_id=doc.get("attendance_id", ""),
            employee_id=doc.get("employee_id", ""),
            work_date=doc.get("work_date", ""),
            entry_time=doc.get("entry_time"),
            exit_time=doc.get("exit_time"),
            duration_seconds=duration_sec,
            duration_hours=duration_hrs,
            attendance_status=AttendanceStatus(doc.get("attendance_status", AttendanceStatus.NOT_ATTENDED.value)),
            created_at=doc.get("created_at"),
            updated_at=doc.get("updated_at"),
        )

"""Attendance recording, check-in, check-out, and validation service."""

import logging
import math
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException, status
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.core.redis_client import cache_delete, redis_distributed_lock
from app.schemas.attendance import (
    AttendanceRecordResponse,
    AttendanceStatus,
    AttendanceTodayResponse,
    CheckInResponse,
    CheckOutResponse,
)
from app.schemas.leave import LeaveStatus, LeaveType
from app.utils.time_utils import get_work_date, now_utc, to_utc

logger = logging.getLogger(__name__)


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in meters using the Haversine formula."""
    r = 6371000.0  # Earth's radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = math.sin(delta_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c


class AttendanceService:
    def __init__(self, db: AsyncDatabase, tenant_id: str = "default"):
        self.db = db
        self.attendance = db.attendance
        self.employees = db.employees
        self.leaves = db.leaves
        self.tenant_id = tenant_id

    async def _verify_employee_exists_and_active(self, employee_id: str):
        emp = await self.employees.find_one(
            {
                "$or": [
                    {"tenant_id": self.tenant_id, "employee_id": employee_id},
                    {"tenant_id": {"$exists": False}, "employee_id": employee_id},
                ]
            }
        )
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

    async def check_in(
        self,
        employee_id: str,
        client_ip: str | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        timestamp: datetime | None = None,
    ) -> CheckInResponse:
        """
        Record employee office check-in.
        Uses server-controlled UTC entry timestamp to prevent client manipulation (or explicit timestamp if supplied).
        Enforces IP binding and geo-fence validation if an approved REMOTE_EXCEPTION is active.
        Rejects check-in if an active uncompleted session already exists.
        """
        async with redis_distributed_lock(f"tenant:{self.tenant_id}:attendance:{employee_id}"):
            emp = await self._verify_employee_exists_and_active(employee_id)

            now = to_utc(timestamp) if timestamp else now_utc()
            work_date = get_work_date(now)

            # Check for approved remote exception on today's workday
            remote_exception = await self.leaves.find_one(
                {
                    "$or": [
                        {"tenant_id": self.tenant_id, "employee_id": employee_id},
                        {"tenant_id": {"$exists": False}, "employee_id": employee_id},
                    ],
                    "status": LeaveStatus.APPROVED.value,
                    "leave_type": LeaveType.REMOTE_EXCEPTION.value,
                    "start_date": {"$lte": work_date},
                    "end_date": {"$gte": work_date},
                }
            )

            if remote_exception:
                # 1. IP Binding Validation
                allowed_ip = emp.get("allowed_remote_ip")
                if allowed_ip and (not client_ip or client_ip.strip() != allowed_ip.strip()):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Remote clock-in rejected: Client IP '{client_ip}' does not match pre-approved remote IP.",
                    )

                # 2. Geo-Fence Boundary Validation
                allowed_lat = emp.get("allowed_lat")
                allowed_lng = emp.get("allowed_lng")
                if allowed_lat is not None and allowed_lng is not None:
                    if latitude is None or longitude is None:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                            detail="Geolocation coordinates required for remote clock-in.",
                        )
                    radius = emp.get("geo_fence_radius_meters") or 500.0
                    dist = haversine_distance_meters(allowed_lat, allowed_lng, latitude, longitude)
                    if dist > radius:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Remote clock-in rejected: Outside approved boundary ({round(dist, 1)}m > {radius}m).",
                        )

            # Check if an active unfinished session already exists for this employee
            active_session = await self.attendance.find_one(
                {
                    "$or": [
                        {"tenant_id": self.tenant_id, "employee_id": employee_id, "attendance_status": AttendanceStatus.IN_PROGRESS.value},
                        {"tenant_id": {"$exists": False}, "employee_id": employee_id, "attendance_status": AttendanceStatus.IN_PROGRESS.value},
                    ]
                }
            )
            if active_session:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Employee '{employee_id}' already has a check-in record in progress for workday {active_session.get('work_date')}. Please check out first.",
                )

            doc = {
                "attendance_id": str(uuid4()),
                "tenant_id": self.tenant_id,
                "employee_id": employee_id,
                "work_date": work_date,
                "entry_time": now,
                "exit_time": None,
                "check_in_time": now,
                "check_out_time": None,
                "duration_seconds": 0,
                "duration_minutes": 0.0,
                "duration_hours": 0.0,
                "attendance_status": AttendanceStatus.IN_PROGRESS.value,
                "client_ip": client_ip,
                "latitude": latitude,
                "longitude": longitude,
                "created_at": now_utc(),
                "updated_at": now_utc(),
            }

            try:
                await self.attendance.insert_one(doc)
            except Exception as exc:
                # Catch unique partial index violation (idx_tenant_attendance_active_unique) under concurrency
                logger.warning("Duplicate check-in race condition caught: %s", exc)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Employee '{employee_id}' already has a check-in record in progress.",
                ) from exc

            await cache_delete(f"tenant:{self.tenant_id}:today_status:{employee_id}")

            return CheckInResponse(
                message="Check-in recorded successfully",
                attendance=self._format_attendance_doc(doc),
            )

    async def check_out(
        self,
        employee_id: str,
        timestamp: datetime | None = None,
    ) -> CheckOutResponse:
        """
        Record employee office check-out.
        Calculates duration strictly from entry_time to exit_time.
        Requires an active IN_PROGRESS session.
        """
        async with redis_distributed_lock(f"tenant:{self.tenant_id}:attendance:{employee_id}"):
            await self._verify_employee_exists_and_active(employee_id)

            now = to_utc(timestamp) if timestamp else now_utc()
            work_date = get_work_date(now)

            # Find active in-progress check-in for this employee
            record = await self.attendance.find_one(
                {
                    "$or": [
                        {"tenant_id": self.tenant_id, "employee_id": employee_id, "attendance_status": AttendanceStatus.IN_PROGRESS.value},
                        {"tenant_id": {"$exists": False}, "employee_id": employee_id, "attendance_status": AttendanceStatus.IN_PROGRESS.value},
                    ]
                }
            )

            if not record:
                # Distinguish between having already checked out today vs never checked in
                completed_today = await self.attendance.find_one(
                    {
                        "$or": [
                            {"tenant_id": self.tenant_id, "employee_id": employee_id, "work_date": work_date, "attendance_status": AttendanceStatus.COMPLETED.value},
                            {"tenant_id": {"$exists": False}, "employee_id": employee_id, "work_date": work_date, "attendance_status": AttendanceStatus.COMPLETED.value},
                        ]
                    }
                )
                if completed_today:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Employee '{employee_id}' has already checked out for workday {work_date}. No active check-in session.",
                    )
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Cannot check out: No check-in record found for employee '{employee_id}' on workday {work_date}",
                )

            entry_time: datetime = to_utc(record["entry_time"])
            # Ensure exit time does not precede entry time
            if now <= entry_time:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Exit time cannot precede entry time. Check-out timestamp must be later than check-in timestamp.",
                )

            duration_seconds = int((now - entry_time).total_seconds())
            duration_minutes = round(duration_seconds / 60.0, 2)
            duration_hours = round(duration_seconds / 3600.0, 2)

            update_fields = {
                "exit_time": now,
                "check_out_time": now,
                "duration_seconds": duration_seconds,
                "duration_minutes": duration_minutes,
                "duration_hours": duration_hours,
                "attendance_status": AttendanceStatus.COMPLETED.value,
                "updated_at": now_utc(),
            }

            updated_record = await self.attendance.find_one_and_update(
                {
                    "_id": record["_id"],
                    "attendance_status": AttendanceStatus.IN_PROGRESS.value,
                },
                {"$set": update_fields},
                return_document=ReturnDocument.AFTER,
            )

            if not updated_record:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Employee '{employee_id}' has already checked out. No active check-in session.",
                )

            await cache_delete(f"tenant:{self.tenant_id}:today_status:{employee_id}")

            return CheckOutResponse(
                message="Check-out recorded successfully",
                attendance=self._format_attendance_doc(updated_record),
            )

    async def get_today_status(self, employee_id: str) -> AttendanceTodayResponse:
        """Get today's multi-session attendance record and summary for employee within tenant."""
        await self._verify_employee_exists_and_active(employee_id)
        now = now_utc()
        work_date = get_work_date(now)

        cursor = self.attendance.find(
            {
                "$or": [
                    {"tenant_id": self.tenant_id, "employee_id": employee_id, "work_date": work_date},
                    {"tenant_id": {"$exists": False}, "employee_id": employee_id, "work_date": work_date},
                ]
            }
        ).sort("entry_time", 1)

        raw_sessions = await cursor.to_list(length=None)

        if not raw_sessions:
            return AttendanceTodayResponse(
                attendance_id="",
                employee_id=employee_id,
                work_date=work_date,
                entry_time=None,
                exit_time=None,
                check_in_time=None,
                check_out_time=None,
                duration_seconds=0,
                duration_minutes=0.0,
                duration_hours=0.0,
                attendance_status=AttendanceStatus.NOT_ATTENDED,
                total_sessions=0,
                completed_sessions=0,
                active_session=None,
                sessions=[],
            )

        formatted_sessions = [self._format_attendance_doc(s) for s in raw_sessions]
        active_sess = next((s for s in formatted_sessions if s.attendance_status == AttendanceStatus.IN_PROGRESS), None)
        completed_sessions = [s for s in formatted_sessions if s.attendance_status == AttendanceStatus.COMPLETED]

        total_sec = sum(s.duration_seconds for s in completed_sessions)
        total_min = round(total_sec / 60.0, 2)
        total_hrs = round(total_sec / 3600.0, 2)

        if active_sess:
            status_val = AttendanceStatus.IN_PROGRESS
            att_id = active_sess.attendance_id
            entry_t = active_sess.entry_time
            exit_t = None
        else:
            status_val = AttendanceStatus.COMPLETED
            att_id = completed_sessions[-1].attendance_id if completed_sessions else ""
            entry_t = formatted_sessions[0].entry_time
            exit_t = completed_sessions[-1].exit_time if completed_sessions else None

        return AttendanceTodayResponse(
            attendance_id=att_id,
            employee_id=employee_id,
            work_date=work_date,
            entry_time=entry_t,
            exit_time=exit_t,
            check_in_time=entry_t,
            check_out_time=exit_t,
            duration_seconds=total_sec,
            duration_minutes=total_min,
            duration_hours=total_hrs,
            attendance_status=status_val,
            total_sessions=len(formatted_sessions),
            completed_sessions=len(completed_sessions),
            active_session=active_sess,
            sessions=formatted_sessions,
            created_at=formatted_sessions[0].created_at,
            updated_at=formatted_sessions[-1].updated_at,
        )

    async def get_employee_history(
        self,
        employee_id: str,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[AttendanceRecordResponse]:
        """Get attendance records for employee within tenant and date range."""
        await self._verify_employee_exists_and_active(employee_id)

        query: dict = {
            "$or": [
                {"tenant_id": self.tenant_id, "employee_id": employee_id},
                {"tenant_id": {"$exists": False}, "employee_id": employee_id},
            ]
        }

        if start_date or end_date:
            date_query = {}
            if start_date:
                date_query["$gte"] = start_date
            if end_date:
                date_query["$lte"] = end_date
            query["work_date"] = date_query

        cursor = self.attendance.find(query).sort([("work_date", 1), ("entry_time", 1)])
        results = []
        async for doc in cursor:
            results.append(self._format_attendance_doc(doc))
        return results

    def _format_attendance_doc(self, doc: dict) -> AttendanceRecordResponse:
        duration_sec = doc.get("duration_seconds", 0)
        duration_min = doc.get("duration_minutes", round(duration_sec / 60.0, 2))
        duration_hrs = doc.get("duration_hours", round(duration_sec / 3600.0, 2))
        entry_t = doc.get("entry_time") or doc.get("check_in_time")
        exit_t = doc.get("exit_time") or doc.get("check_out_time")
        return AttendanceRecordResponse(
            attendance_id=doc.get("attendance_id", ""),
            employee_id=doc.get("employee_id", ""),
            work_date=doc.get("work_date", ""),
            entry_time=entry_t,
            exit_time=exit_t,
            check_in_time=entry_t,
            check_out_time=exit_t,
            duration_seconds=duration_sec,
            duration_minutes=duration_min,
            duration_hours=duration_hrs,
            attendance_status=AttendanceStatus(doc.get("attendance_status", AttendanceStatus.NOT_ATTENDED.value)),
            client_ip=doc.get("client_ip"),
            latitude=doc.get("latitude"),
            longitude=doc.get("longitude"),
            created_at=doc.get("created_at"),
            updated_at=doc.get("updated_at"),
        )

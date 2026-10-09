"""Pydantic schemas for Attendance recording and responses."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel


class AttendanceStatus(StrEnum):
    COMPLETED = "COMPLETED"
    IN_PROGRESS = "IN_PROGRESS"
    NOT_ATTENDED = "NOT_ATTENDED"


class AttendanceRecordResponse(BaseModel):
    attendance_id: str
    employee_id: str
    work_date: str
    entry_time: datetime | None = None
    exit_time: datetime | None = None
    duration_seconds: int = 0
    duration_hours: float = 0.0
    attendance_status: AttendanceStatus
    created_at: datetime | None = None
    updated_at: datetime | None = None


class CheckInResponse(BaseModel):
    message: str = "Check-in recorded successfully"
    attendance: AttendanceRecordResponse


class CheckOutResponse(BaseModel):
    message: str = "Check-out recorded successfully"
    attendance: AttendanceRecordResponse

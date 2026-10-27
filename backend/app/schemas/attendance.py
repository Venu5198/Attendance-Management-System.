"""Pydantic schemas for Attendance recording and responses."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


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
    check_in_time: datetime | None = None
    check_out_time: datetime | None = None
    duration_seconds: int = 0
    duration_minutes: float = 0.0
    duration_hours: float = 0.0
    attendance_status: AttendanceStatus
    client_ip: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class AttendanceTodayResponse(AttendanceRecordResponse):
    total_sessions: int = 0
    completed_sessions: int = 0
    active_session: AttendanceRecordResponse | None = None
    sessions: list[AttendanceRecordResponse] = Field(default_factory=list)


class CheckInResponse(BaseModel):
    message: str = "Check-in recorded successfully"
    attendance: AttendanceRecordResponse


class CheckOutResponse(BaseModel):
    message: str = "Check-out recorded successfully"
    attendance: AttendanceRecordResponse

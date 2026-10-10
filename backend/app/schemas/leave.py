"""Pydantic schemas for leave and remote exemption management."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class LeaveType(StrEnum):
    VACATION = "VACATION"
    SICK = "SICK"
    CASUAL = "CASUAL"
    REMOTE_EXCEPTION = "REMOTE_EXCEPTION"


class LeaveStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class LeaveRequestCreate(BaseModel):
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")
    leave_type: LeaveType = Field(default=LeaveType.VACATION, description="Category of leave/exception")
    reason: str = Field(..., min_length=3, max_length=500, description="Reason for leave")
    employee_id: str | None = Field(None, description="Employee ID (Admin only)")


class LeaveReviewRequest(BaseModel):
    action: LeaveStatus = Field(..., description="APPROVED or REJECTED")
    admin_notes: str | None = Field(None, max_length=500, description="Admin review notes")


class LeaveResponse(BaseModel):
    leave_id: str
    employee_id: str
    start_date: str
    end_date: str
    leave_type: LeaveType
    status: LeaveStatus
    reason: str
    submitted_at: datetime
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    admin_notes: str | None = None


class BulkLeaveReviewRequest(BaseModel):
    leave_ids: list[str] = Field(..., min_length=1, max_length=50, description="List of leave IDs to review")
    action: LeaveStatus = Field(..., description="APPROVED or REJECTED")
    admin_notes: str | None = Field(None, max_length=500, description="Admin review notes")


class BulkReviewResponse(BaseModel):
    total_requested: int
    success_count: int
    failed_count: int
    updated_ids: list[str]
    errors: list[str] = []

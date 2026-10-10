"""Pydantic schemas for attendance regularization requests and review."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class RegularizationStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class RegularizationRequestCreate(BaseModel):
    work_date: str = Field(..., description="Target workday (YYYY-MM-DD)")
    entry_time: datetime = Field(..., description="Corrected entry time (UTC/ISO)")
    exit_time: datetime = Field(..., description="Corrected exit time (UTC/ISO)")
    reason: str = Field(..., min_length=3, max_length=500, description="Reason for regularization")
    employee_id: str | None = Field(None, description="Employee ID (Admin only)")


class RegularizationReviewRequest(BaseModel):
    action: RegularizationStatus = Field(..., description="APPROVED or REJECTED")
    admin_notes: str | None = Field(None, max_length=500, description="Admin review remarks")


class RegularizationResponse(BaseModel):
    request_id: str
    employee_id: str
    work_date: str
    entry_time: datetime
    exit_time: datetime
    duration_seconds: int
    duration_hours: float
    reason: str
    status: RegularizationStatus
    submitted_at: datetime
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    admin_notes: str | None = None


class BulkRegularizationReviewRequest(BaseModel):
    request_ids: list[str] = Field(..., min_length=1, max_length=50, description="List of request IDs to review")
    action: RegularizationStatus = Field(..., description="APPROVED or REJECTED")
    admin_notes: str | None = Field(None, max_length=500, description="Admin review remarks")


class BulkRegularizationReviewResponse(BaseModel):
    total_requested: int
    success_count: int
    failed_count: int
    updated_ids: list[str]
    errors: list[str] = []

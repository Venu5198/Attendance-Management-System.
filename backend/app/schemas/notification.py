"""Pydantic schemas for Notification Logs and Email triggers."""

from datetime import datetime
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, EmailStr


class DeliveryStatus(StrEnum):
    SENT = "SENT"
    FAILED = "FAILED"
    SKIPPED = "SKIPPED"


class NotificationLogResponse(BaseModel):
    log_id: str
    employee_id: str
    recipient: EmailStr
    policy_week: str
    notification_type: str
    delivery_status: DeliveryStatus
    attempted_at: datetime
    retry_count: int = 0
    error_details: str | None = None
    provider_response: dict[str, Any] | None = None


class NotificationLogListResponse(BaseModel):
    total: int
    logs: list[NotificationLogResponse]

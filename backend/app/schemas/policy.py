"""Pydantic schemas for Policy Evaluation and Violations."""

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ComplianceStatus(StrEnum):
    COMPLIANT = "COMPLIANT"
    NON_COMPLIANT = "NON_COMPLIANT"
    PENDING = "PENDING"


class WeeklyComplianceResult(BaseModel):
    employee_id: str
    week_start: date
    week_end: date
    week_label: str
    office_days: int
    total_office_hours: float
    total_duration_seconds: int
    required_days: int = 3
    required_hours: float = 15.0
    is_week_completed: bool
    compliance_status: ComplianceStatus
    violation_reasons: list[str] = Field(default_factory=list)


class PolicyViolationRecord(BaseModel):
    violation_id: str
    employee_id: str
    employee_name: str | None = None
    employee_email: str | None = None
    week_start: date
    week_end: date
    week_label: str
    office_days: int
    total_office_hours: float
    required_days: int
    required_hours: float
    compliance_status: ComplianceStatus
    violation_reasons: list[str]
    evaluated_at: datetime
    notification_sent: bool = False


class ViolationListResponse(BaseModel):
    total: int
    violations: list[PolicyViolationRecord]

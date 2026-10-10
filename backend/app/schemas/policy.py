"""Pydantic schemas for Policy Evaluation and Violations."""

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ComplianceStatus(StrEnum):
    COMPLIANT = "COMPLIANT"
    NON_COMPLIANT = "NON_COMPLIANT"
    PENDING = "PENDING"
    EXEMPT = "EXEMPT"


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
    approved_leave_days: int = 0
    holidays_count: int = 0
    pre_hire_workdays: int = 0
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
    approved_leave_days: int = 0
    holidays_count: int = 0
    pre_hire_workdays: int = 0
    compliance_status: ComplianceStatus
    violation_reasons: list[str]
    evaluated_at: datetime
    notification_sent: bool = False


class ViolationListResponse(BaseModel):
    total: int
    violations: list[PolicyViolationRecord]


class WeeklyScoreRecord(BaseModel):
    week_start: date
    week_end: date
    week_label: str
    office_days: int
    total_office_hours: float
    required_days: int
    required_hours: float
    status: ComplianceStatus
    violation_reasons: list[str] = Field(default_factory=list)


class ComplianceHealthScore(BaseModel):
    employee_id: str
    employee_name: str
    department: str
    health_score: float  # 0.0 to 100.0 %
    health_rating: str  # EXCELLENT, GOOD, AT_RISK, CRITICAL
    compliant_weeks: int
    total_evaluated_weeks: int
    chronic_issue: bool  # True if score < 75.0
    weekly_history: list[WeeklyScoreRecord]

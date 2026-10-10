"""Pydantic schemas for the Centralized Reporting API."""

from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from app.schemas.attendance import AttendanceStatus
from app.schemas.policy import ComplianceStatus, WeeklyComplianceResult


class ReportPeriod(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"
    CUSTOM = "custom"


class DailyAttendanceItem(BaseModel):
    work_date: str
    entry_time: datetime | None = None
    exit_time: datetime | None = None
    duration_seconds: int = 0
    duration_hours: float = 0.0
    status: AttendanceStatus


class EmployeeReportItem(BaseModel):
    employee_id: str
    full_name: str
    email: str
    department: str
    is_active: bool
    total_attended_days: int
    total_office_hours: float
    total_duration_seconds: int
    daily_records: list[DailyAttendanceItem] = Field(default_factory=list)
    weekly_compliance: list[WeeklyComplianceResult] = Field(default_factory=list)
    overall_compliance: ComplianceStatus | None = None


class ReportMetadata(BaseModel):
    period: ReportPeriod
    start_date: str
    end_date: str
    company_timezone: str
    generated_at: datetime
    total_employees: int
    covered_policy_weeks_count: int


class CompanyReportSummary(BaseModel):
    total_active_employees: int
    total_office_days_accumulated: int
    total_office_hours_accumulated: float
    average_hours_per_employee: float
    compliant_weeks_count: int = 0
    non_compliant_weeks_count: int = 0
    pending_weeks_count: int = 0


class AttendanceReportResponse(BaseModel):
    metadata: ReportMetadata
    summary: CompanyReportSummary
    employees: list[EmployeeReportItem]


class EmailReportRequest(BaseModel):
    recipient_email: str
    period: ReportPeriod = ReportPeriod.WEEKLY
    target_date: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    employee_id: str | None = None

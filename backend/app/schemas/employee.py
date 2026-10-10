"""Pydantic schemas for Employee management."""

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field


class EmployeeCreate(BaseModel):
    employee_id: str = Field(..., min_length=2, max_length=50, description="Unique employee identifier")
    full_name: str = Field(..., min_length=2, max_length=100, description="Full name of employee")
    email: EmailStr = Field(..., description="Unique corporate email address")
    department: str = Field(..., min_length=2, max_length=50, description="Department name")
    role: str = Field(default="EMPLOYEE", pattern="^(ADMIN|EMPLOYEE)$", description="Role: ADMIN or EMPLOYEE")
    is_active: bool = Field(default=True, description="Account active status")
    hire_date: date | None = Field(default=None, description="Official employment start date (YYYY-MM-DD)")
    allowed_remote_ip: str | None = Field(default=None, description="Pre-approved home/remote IP address for clock-in")
    allowed_lat: float | None = Field(default=None, description="Approved home latitude for geo-fencing")
    allowed_lng: float | None = Field(default=None, description="Approved home longitude for geo-fencing")
    geo_fence_radius_meters: float | None = Field(default=500.0, description="Allowed boundary radius in meters")


class EmployeeUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=2, max_length=100)
    email: EmailStr | None = None
    department: str | None = Field(None, min_length=2, max_length=50)
    role: str | None = Field(None, pattern="^(ADMIN|EMPLOYEE)$")
    is_active: bool | None = None
    hire_date: date | None = None
    allowed_remote_ip: str | None = None
    allowed_lat: float | None = None
    allowed_lng: float | None = None
    geo_fence_radius_meters: float | None = None


class EmployeeResponse(BaseModel):
    employee_id: str
    full_name: str
    email: str
    department: str
    role: str
    is_active: bool
    hire_date: date | None = None
    allowed_remote_ip: str | None = None
    allowed_lat: float | None = None
    allowed_lng: float | None = None
    geo_fence_radius_meters: float | None = None
    created_at: datetime
    updated_at: datetime


class EmployeeListResponse(BaseModel):
    total: int
    employees: list[EmployeeResponse]

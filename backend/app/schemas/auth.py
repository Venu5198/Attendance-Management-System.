"""Pydantic schemas for authentication and user accounts."""

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserLogin(BaseModel):
    username: str = Field(..., description="Username or email")
    password: str = Field(..., min_length=6, description="User password")


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    expires_in_seconds: int
    user_id: str
    username: str
    role: str
    employee_id: str | None = None


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class TokenPayload(BaseModel):
    sub: str  # user_id
    username: str
    role: str
    employee_id: str | None = None
    exp: int | None = None


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: str = Field(default="EMPLOYEE", pattern="^(ADMIN|EMPLOYEE)$")
    employee_id: str | None = None


class UserResponse(BaseModel):
    user_id: str
    username: str
    email: str
    role: str
    employee_id: str | None = None
    is_active: bool
    created_at: datetime

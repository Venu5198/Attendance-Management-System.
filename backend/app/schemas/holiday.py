"""Pydantic schemas for company holiday calendar."""

from datetime import datetime

from pydantic import BaseModel, Field


class HolidayCreate(BaseModel):
    holiday_date: str = Field(..., description="Date of holiday (YYYY-MM-DD)")
    name: str = Field(..., min_length=2, max_length=100, description="Holiday name (e.g. Christmas, Independence Day)")
    description: str | None = Field(None, max_length=250, description="Optional holiday notes")


class HolidayResponse(BaseModel):
    holiday_id: str
    holiday_date: str
    name: str
    description: str | None = None
    created_at: datetime
    created_by: str | None = None

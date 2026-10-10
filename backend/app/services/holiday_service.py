"""Company holiday calendar service."""

import logging
from datetime import UTC, date, datetime
from uuid import uuid4

from fastapi import HTTPException, status
from pymongo.asynchronous.database import AsyncDatabase

from app.schemas.holiday import HolidayCreate, HolidayResponse
from app.utils.time_utils import parse_date

logger = logging.getLogger(__name__)


class HolidayService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.holidays = db.holidays

    async def create_holiday(self, created_by: str, holiday_in: HolidayCreate) -> HolidayResponse:
        """Create a new company/national holiday."""
        try:
            parse_date(holiday_in.holiday_date)
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid holiday_date format (must be YYYY-MM-DD): {exc}",
            ) from exc

        existing = await self.holidays.find_one({"holiday_date": holiday_in.holiday_date})
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Holiday already configured for {holiday_in.holiday_date} ('{existing.get('name')}')",
            )

        now = datetime.now(UTC)
        holiday_id = str(uuid4())
        doc = {
            "holiday_id": holiday_id,
            "holiday_date": holiday_in.holiday_date,
            "name": holiday_in.name,
            "description": holiday_in.description,
            "created_at": now,
            "created_by": created_by,
        }

        await self.holidays.insert_one(doc)
        return HolidayResponse(**doc)

    async def list_holidays(
        self,
        start_date: str | None = None,
        end_date: str | None = None,
    ) -> list[HolidayResponse]:
        """List holidays sorted by date."""
        query = {}
        if start_date and end_date:
            query["holiday_date"] = {"$gte": start_date, "$lte": end_date}
        elif start_date:
            query["holiday_date"] = {"$gte": start_date}
        elif end_date:
            query["holiday_date"] = {"$lte": end_date}

        docs = await self.holidays.find(query).sort("holiday_date", 1).to_list(length=None)
        return [HolidayResponse(**d) for d in docs]

    async def delete_holiday(self, holiday_id: str) -> None:
        """Delete a holiday by ID."""
        result = await self.holidays.delete_one({"holiday_id": holiday_id})
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Holiday '{holiday_id}' not found",
            )

    async def get_holiday_days_in_range(self, range_start: date, range_end: date) -> int:
        """
        Count distinct business days (Mon-Fri) that are official holidays
        within the date range [range_start, range_end].
        """
        query = {
            "holiday_date": {
                "$gte": range_start.isoformat(),
                "$lte": range_end.isoformat(),
            }
        }
        docs = await self.holidays.find(query).to_list(length=None)
        holiday_workdays = 0
        for d in docs:
            dt = parse_date(d["holiday_date"])
            # Only count business days Mon-Fri
            if dt.weekday() < 5:
                holiday_workdays += 1
        return holiday_workdays

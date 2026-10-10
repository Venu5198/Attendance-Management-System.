"""Holiday calendar API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.schemas.holiday import HolidayCreate, HolidayResponse
from app.services.holiday_service import HolidayService

router = APIRouter(prefix="/holidays", tags=["Holidays & Company Calendar"])


@router.post(
    "",
    response_model=HolidayResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Configure a company or national holiday (Admin only)",
)
async def create_holiday(
    body: HolidayCreate,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """
    Configure a paid company holiday.
    Holidays dynamically reduce weekly required in-office attendance targets for all employees.
    """
    creator_id = current_admin.get("user_id", "admin")
    service = HolidayService(db)
    return await service.create_holiday(creator_id, body)


@router.get(
    "",
    response_model=list[HolidayResponse],
    summary="List company holidays",
)
async def list_holidays(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    start_date: str | None = Query(None, description="Filter from start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="Filter up to end date (YYYY-MM-DD)"),
):
    """List scheduled company holidays."""
    service = HolidayService(db)
    return await service.list_holidays(start_date=start_date, end_date=end_date)


@router.delete(
    "/{holiday_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a scheduled holiday (Admin only)",
)
async def delete_holiday(
    holiday_id: str,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Remove a holiday entry from the calendar."""
    service = HolidayService(db)
    await service.delete_holiday(holiday_id)

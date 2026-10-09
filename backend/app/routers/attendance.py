"""Attendance recording and lookup API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import get_current_user, verify_employee_ownership
from app.schemas.attendance import (
    AttendanceRecordResponse,
    CheckInResponse,
    CheckOutResponse,
)
from app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/attendance", tags=["Attendance"])


class AttendanceActionRequest(BaseModel):
    employee_id: str | None = None


def resolve_employee_id(current_user: dict, requested_emp_id: str | None) -> str:
    """Resolve target employee_id ensuring users can only check in/out for themselves unless Admin."""
    role = current_user.get("role", "EMPLOYEE")
    user_emp_id = current_user.get("employee_id")

    if role == "ADMIN":
        if requested_emp_id:
            return requested_emp_id
        if user_emp_id:
            return user_emp_id
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin user must supply 'employee_id' parameter.",
        )

    # EMPLOYEE role: must have assigned employee_id and cannot act for others
    if not user_emp_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have an assigned employee ID.",
        )
    if requested_emp_id and requested_emp_id != user_emp_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot record attendance for another employee.",
        )
    return user_emp_id


@router.post(
    "/check-in",
    response_model=CheckInResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Employee office check-in",
)
async def check_in(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    body: AttendanceActionRequest | None = None,
):
    """
    Record office check-in.
    The entry timestamp is generated on the server using UTC to prevent manipulation.
    """
    req_eid = body.employee_id if body else None
    target_emp_id = resolve_employee_id(current_user, req_eid)
    service = AttendanceService(db)
    return await service.check_in(target_emp_id)


@router.post(
    "/check-out",
    response_model=CheckOutResponse,
    summary="Employee office check-out",
)
async def check_out(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    body: AttendanceActionRequest | None = None,
):
    """
    Record office check-out.
    The exit timestamp is recorded and duration is calculated from entry_time to exit_time.
    """
    req_eid = body.employee_id if body else None
    target_emp_id = resolve_employee_id(current_user, req_eid)
    service = AttendanceService(db)
    return await service.check_out(target_emp_id)


@router.get(
    "/today",
    response_model=AttendanceRecordResponse,
    summary="Get today's attendance status for current employee",
)
async def get_today_status(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    employee_id: str | None = Query(None, description="Employee ID (Admin only)"),
):
    """Fetch today's attendance status. Shows NOT_ATTENDED if not checked in today."""
    target_emp_id = resolve_employee_id(current_user, employee_id)
    service = AttendanceService(db)
    return await service.get_today_status(target_emp_id)


@router.get(
    "/history/{employee_id}",
    response_model=list[AttendanceRecordResponse],
    summary="Get attendance history for an employee",
)
async def get_employee_history(
    employee_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    start_date: str | None = Query(None, description="Start date (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date (YYYY-MM-DD)"),
):
    """Retrieve historical attendance records. Restricted to Admin or the employee."""
    verify_employee_ownership(current_user, employee_id)
    service = AttendanceService(db)
    return await service.get_employee_history(employee_id, start_date=start_date, end_date=end_date)

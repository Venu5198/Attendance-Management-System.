"""Attendance recording and lookup API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin, verify_employee_ownership
from app.schemas.attendance import (
    AttendanceRecordResponse,
    CheckInResponse,
    CheckOutResponse,
)
from app.schemas.regularization import (
    BulkRegularizationReviewRequest,
    BulkRegularizationReviewResponse,
    RegularizationRequestCreate,
    RegularizationResponse,
    RegularizationReviewRequest,
)
from app.services.attendance_service import AttendanceService
from app.services.regularization_service import RegularizationService

router = APIRouter(prefix="/attendance", tags=["Attendance"])


class AttendanceActionRequest(BaseModel):
    employee_id: str | None = None
    client_ip: str | None = None
    latitude: float | None = None
    longitude: float | None = None


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
    request: Request,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    body: AttendanceActionRequest | None = None,
):
    """
    Record office check-in.
    The entry timestamp is generated on the server using UTC to prevent manipulation.
    For remote work exceptions, client IP and geolocation are validated against approved boundaries.
    """
    req_eid = body.employee_id if body else None
    target_emp_id = resolve_employee_id(current_user, req_eid)

    forwarded = request.headers.get("x-forwarded-for")
    remote_ip = (body.client_ip if body and body.client_ip else None) or (
        forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else None)
    )
    lat = body.latitude if body else None
    lng = body.longitude if body else None

    tenant_id = current_user.get("tenant_id", "default")
    service = AttendanceService(db, tenant_id=tenant_id)
    return await service.check_in(target_emp_id, client_ip=remote_ip, latitude=lat, longitude=lng)


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
    tenant_id = current_user.get("tenant_id", "default")
    service = AttendanceService(db, tenant_id=tenant_id)
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
    tenant_id = current_user.get("tenant_id", "default")
    service = AttendanceService(db, tenant_id=tenant_id)
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
    tenant_id = current_user.get("tenant_id", "default")
    service = AttendanceService(db, tenant_id=tenant_id)
    return await service.get_employee_history(employee_id, start_date=start_date, end_date=end_date)


@router.post(
    "/regularize",
    response_model=RegularizationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit an attendance regularization request",
)
async def submit_regularization(
    body: RegularizationRequestCreate,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """
    Employee requests manual time correction for a workday when they forgot to clock in/out.
    """
    target_emp_id = resolve_employee_id(current_user, body.employee_id)
    service = RegularizationService(db)
    return await service.create_request(target_emp_id, body)


@router.get(
    "/regularize",
    response_model=list[RegularizationResponse],
    summary="List attendance regularization requests",
)
async def list_regularizations(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    employee_id: str | None = Query(None, description="Filter by employee ID (Admin only)"),
    status_filter: str | None = Query(
        None, alias="status", description="Filter by status (PENDING, APPROVED, REJECTED)"
    ),
):
    """List regularization requests. Employees only see their own requests; Admins can see all."""
    target_emp_id = None
    if current_user.get("role") == "ADMIN":
        target_emp_id = employee_id
    else:
        target_emp_id = current_user.get("employee_id")

    service = RegularizationService(db)
    return await service.list_requests(employee_id=target_emp_id, status_filter=status_filter)


@router.post(
    "/regularize/bulk-review",
    response_model=BulkRegularizationReviewResponse,
    summary="Batch approve or reject regularization requests (Admin only, up to 50)",
)
async def bulk_review_regularization(
    body: BulkRegularizationReviewRequest,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Admin endpoint to bulk approve or reject up to 50 regularization requests in a single transaction."""
    reviewer_id = current_admin.get("user_id", "admin")
    service = RegularizationService(db)
    return await service.bulk_review_requests(reviewer_id, body)


@router.patch(
    "/regularize/{request_id}",
    response_model=RegularizationResponse,
    summary="Review (Approve or Reject) an attendance regularization request (Admin only)",
)
async def review_regularization(
    request_id: str,
    body: RegularizationReviewRequest,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Admin endpoint to approve or reject a pending time regularization."""
    reviewer_id = current_admin.get("user_id", "admin")
    service = RegularizationService(db)
    return await service.review_request(request_id, reviewer_id, body)

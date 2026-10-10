"""Leave and remote exemption API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.routers.attendance import resolve_employee_id
from app.schemas.leave import (
    BulkLeaveReviewRequest,
    BulkReviewResponse,
    LeaveRequestCreate,
    LeaveResponse,
    LeaveReviewRequest,
)
from app.services.leave_service import LeaveService

router = APIRouter(prefix="/leaves", tags=["Leaves & Exemptions"])


@router.post(
    "/bulk-review",
    response_model=BulkReviewResponse,
    summary="Batch approve or reject leave requests (Admin only, up to 50)",
)
async def bulk_review_leaves(
    body: BulkLeaveReviewRequest,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Admin endpoint to bulk approve or reject up to 50 leave requests in a single transaction."""
    reviewer_id = current_admin.get("user_id", "admin")
    service = LeaveService(db)
    return await service.bulk_review_leaves(reviewer_id, body)


@router.post(
    "/request",
    response_model=LeaveResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit a leave or remote exemption request",
)
async def request_leave(
    body: LeaveRequestCreate,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """
    Submit a leave/exemption request (Vacation, Sick, Casual, Remote Exception).
    Approved leaves exempt employees from the weekly in-office requirement.
    """
    target_emp_id = resolve_employee_id(current_user, body.employee_id)
    service = LeaveService(db)
    return await service.create_leave_request(target_emp_id, body)


@router.get(
    "",
    response_model=list[LeaveResponse],
    summary="List leave and exemption requests",
)
async def list_leaves(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    employee_id: str | None = Query(None, description="Filter by employee ID (Admin only)"),
    status_filter: str | None = Query(
        None, alias="status", description="Filter by status (PENDING, APPROVED, REJECTED)"
    ),
):
    """List leave requests. Employees only see their own requests; Admins can see all."""
    target_emp_id = None
    if current_user.get("role") == "ADMIN":
        target_emp_id = employee_id
    else:
        target_emp_id = current_user.get("employee_id")

    service = LeaveService(db)
    return await service.list_leaves(employee_id=target_emp_id, status_filter=status_filter)


@router.patch(
    "/{leave_id}",
    response_model=LeaveResponse,
    summary="Review (Approve or Reject) a leave request (Admin only)",
)
async def review_leave(
    leave_id: str,
    body: LeaveReviewRequest,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Admin endpoint to approve or reject an employee leave request."""
    reviewer_id = current_admin.get("user_id", "admin")
    service = LeaveService(db)
    return await service.review_leave(leave_id, reviewer_id, body)

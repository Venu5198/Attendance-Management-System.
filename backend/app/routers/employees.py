"""Employee management API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin, verify_employee_ownership
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeListResponse,
    EmployeeResponse,
    EmployeeUpdate,
)
from app.services.employee_service import EmployeeService

router = APIRouter(prefix="/employees", tags=["Employees"])


@router.post(
    "",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new employee (Admin only)",
)
async def create_employee(
    emp_in: EmployeeCreate,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Register a new employee. Unique constraints enforced on employee_id and email."""
    service = EmployeeService(db)
    return await service.create_employee(emp_in)


@router.get(
    "",
    response_model=EmployeeListResponse,
    summary="List all employees (Admin only)",
)
async def list_employees(
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    active_only: bool = Query(False, description="Filter active employees only"),
):
    """Retrieve list of all employees in the organization."""
    service = EmployeeService(db)
    return await service.list_employees(active_only=active_only)


@router.get(
    "/{employee_id}",
    response_model=EmployeeResponse,
    summary="Get employee details by ID",
)
async def get_employee(
    employee_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Retrieve employee by ID. Administrators or the employee themselves may view."""
    verify_employee_ownership(current_user, employee_id)
    service = EmployeeService(db)
    return await service.get_employee_by_id(employee_id)


@router.put(
    "/{employee_id}",
    response_model=EmployeeResponse,
    summary="Update employee details (Admin only)",
)
async def update_employee(
    employee_id: str,
    emp_update: EmployeeUpdate,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Update employee details. Email uniqueness is verified if updated."""
    service = EmployeeService(db)
    return await service.update_employee(employee_id, emp_update)


@router.delete(
    "/{employee_id}",
    response_model=EmployeeResponse,
    summary="Deactivate employee (Admin only)",
)
async def deactivate_employee(
    employee_id: str,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Deactivate employee without deleting attendance history."""
    service = EmployeeService(db)
    return await service.deactivate_employee(employee_id)

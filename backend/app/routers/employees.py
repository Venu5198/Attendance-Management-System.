"""Employee management API routes."""

import base64
from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile, status
from fastapi.responses import JSONResponse
from pymongo.asynchronous.database import AsyncDatabase

from app.core.deduplication import (
    acquire_deduplication,
    complete_deduplication,
    compute_request_fingerprint,
    release_deduplication,
)
from app.database import get_database
from app.dependencies import get_current_user, require_admin, verify_employee_ownership
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeListResponse,
    EmployeeResponse,
    EmployeeUpdate,
)
from app.services.employee_service import EmployeeService
from app.tasks.employee_tasks import process_employee_excel_import

router = APIRouter(prefix="/employees", tags=["Employees"])


@router.post(
    "/bulk-import-async",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Asynchronous bulk import via RabbitMQ & Celery (with Redis Deduplication)",
)
async def bulk_import_employees_async(
    file: UploadFile = File(..., description="Excel (.xlsx) or CSV file with employee records"),
    current_admin: Annotated[dict, Depends(require_admin)] = None,
    x_idempotency_key: Annotated[str | None, Header(alias="X-Idempotency-Key")] = None,
):
    """
    Asynchronously ingest employee records using RabbitMQ message broker and Celery worker.

    Architecture features:
    1. Redis Request Deduplication: identical requests or concurrent uploads within 120s are
       deduplicated. Only one task is pushed to RabbitMQ.
    2. Non-blocking Immediate Response: returns 202 Accepted immediately with task_id.
    3. Status Tracking: monitor real-time worker progress via GET /api/v1/tasks/{task_id}.
    """
    tenant_id = current_admin.get("tenant_id", "default")
    user_id = current_admin.get("username", "admin")

    # Read uploaded file content
    content = await file.read()
    if not content:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # 1. Check Redis Deduplication / Idempotency
    fingerprint = compute_request_fingerprint(
        tenant_id=tenant_id,
        method="POST",
        path="/employees/bulk-import-async",
        user_id=user_id,
        body=content,
        idempotency_key=x_idempotency_key,
    )

    can_process, existing = await acquire_deduplication(fingerprint, ttl_seconds=120)
    if not can_process:
        from app.core.metrics import REQUEST_DEDUPLICATIONS_TOTAL
        REQUEST_DEDUPLICATIONS_TOTAL.labels(tenant_id=tenant_id, endpoint="/employees/bulk-import-async").inc()
        if existing and existing.get("status") == "IN_PROGRESS":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Duplicate request detected. An identical file import is already being processed.",
            )
        elif existing and existing.get("status") == "COMPLETED":
            return JSONResponse(
                status_code=existing.get("status_code", status.HTTP_202_ACCEPTED),
                content=existing.get("data"),
                headers={"X-Cache-Deduplicated": "true"},
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Duplicate request detected. Request previously submitted.",
            )

    # 2. Dispatch task to RabbitMQ for Celery worker
    try:
        b64_content = base64.b64encode(content).decode("ascii")
        task = process_employee_excel_import.delay(
            file_content_b64=b64_content,
            filename=file.filename or "employees.xlsx",
            tenant_id=tenant_id,
            uploaded_by=user_id,
        )

        from app.core.metrics import CELERY_TASKS_DISPATCHED_TOTAL
        CELERY_TASKS_DISPATCHED_TOTAL.labels(task_name="process_employee_excel_import", tenant_id=tenant_id).inc()

        response_payload = {
            "status": "ACCEPTED",
            "task_id": task.id,
            "message": "File accepted and sent to RabbitMQ for background processing by Celery worker.",
            "status_url": f"/api/v1/tasks/{task.id}",
            "filename": file.filename,
            "tenant_id": tenant_id,
        }

        # Cache the completed dispatch in Redis deduplication cache
        await complete_deduplication(
            fingerprint=fingerprint,
            status_code=status.HTTP_202_ACCEPTED,
            response_data=response_payload,
            ttl_seconds=120,
        )

        return JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content=response_payload,
            headers={"X-Deduplication-Fingerprint": fingerprint},
        )
    except Exception as exc:
        await release_deduplication(fingerprint)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to enqueue task to RabbitMQ: {str(exc)}",
        )


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
    """Register a new employee. Unique constraints enforced on employee_id and email within tenant."""
    tenant_id = current_admin.get("tenant_id", "default")
    service = EmployeeService(db, tenant_id=tenant_id)
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
    tenant_id = current_admin.get("tenant_id", "default")
    service = EmployeeService(db, tenant_id=tenant_id)
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
    tenant_id = current_user.get("tenant_id", "default")
    service = EmployeeService(db, tenant_id=tenant_id)
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
    """Update employee details. Email uniqueness is verified if updated within tenant."""
    tenant_id = current_admin.get("tenant_id", "default")
    service = EmployeeService(db, tenant_id=tenant_id)
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
    """Deactivate employee without deleting attendance history within tenant."""
    tenant_id = current_admin.get("tenant_id", "default")
    service = EmployeeService(db, tenant_id=tenant_id)
    return await service.deactivate_employee(employee_id)



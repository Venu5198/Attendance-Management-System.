"""Integration tests for Redis Request Deduplication, RabbitMQ/Celery Async Tasks, and Status Tracking."""

import base64
import io

import openpyxl
import pytest
from httpx import ASGITransport, AsyncClient

from app.celery_app import celery_app
from app.core.deduplication import (
    acquire_deduplication,
    complete_deduplication,
    compute_request_fingerprint,
    release_deduplication,
)
from app.database import get_database
from app.main import app
from app.tasks.employee_tasks import process_employee_excel_import


@pytest.fixture(autouse=True)
def configure_celery_eager():
    """Run Celery tasks synchronously (in-process) during automated testing."""
    prev_eager = celery_app.conf.task_always_eager
    prev_propagate = celery_app.conf.task_eager_propagates
    celery_app.conf.task_always_eager = True
    celery_app.conf.task_eager_propagates = True
    yield
    celery_app.conf.task_always_eager = prev_eager
    celery_app.conf.task_eager_propagates = prev_propagate


def create_sample_excel_bytes() -> bytes:
    """Create in-memory .xlsx file with test employee rows."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Employees"
    # Header row
    ws.append(["employee_id", "full_name", "email", "department", "role", "hire_date"])
    # Data rows
    ws.append(["CELERY_EMP_01", "Celery Alice", "celery_alice@tenantx.com", "DevOps", "EMPLOYEE", "2026-01-15"])
    ws.append(["CELERY_EMP_02", "Celery Bob", "celery_bob@tenantx.com", "QA", "EMPLOYEE", "2026-02-01"])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


@pytest.mark.asyncio
async def test_redis_request_deduplication_core():
    """Test that concurrent or repeated fingerprints are correctly deduplicated."""
    fingerprint = compute_request_fingerprint(
        tenant_id="tenant_dedup_test",
        method="POST",
        path="/test-endpoint",
        user_id="admin_test",
        body=b"sample-payload-content",
    )

    # 1. First attempt acquires exclusive execution rights
    can_process_1, existing_1 = await acquire_deduplication(fingerprint, ttl_seconds=60)
    assert can_process_1 is True
    assert existing_1 is None

    # 2. Second concurrent hit with same fingerprint is rejected as IN_PROGRESS
    can_process_2, existing_2 = await acquire_deduplication(fingerprint, ttl_seconds=60)
    assert can_process_2 is False
    assert existing_2 is not None
    assert existing_2.get("status") == "IN_PROGRESS"

    # 3. First request completes and caches its response
    await complete_deduplication(
        fingerprint=fingerprint,
        status_code=202,
        response_data={"task_id": "test-task-123", "status": "ACCEPTED"},
        ttl_seconds=60,
    )

    # 4. Subsequent hit receives the completed, cached response without re-executing
    can_process_3, existing_3 = await acquire_deduplication(fingerprint, ttl_seconds=60)
    assert can_process_3 is False
    assert existing_3.get("status") == "COMPLETED"
    assert existing_3.get("data", {}).get("task_id") == "test-task-123"

    # Cleanup
    await release_deduplication(fingerprint)


@pytest.mark.asyncio
async def test_celery_employee_excel_task_execution():
    """Test that the Celery task parses Excel records and inserts them into MongoDB with tenant isolation."""
    excel_bytes = create_sample_excel_bytes()
    b64_content = base64.b64encode(excel_bytes).decode("ascii")

    # Execute task
    result = process_employee_excel_import(
        file_content_b64=b64_content,
        filename="test_upload.xlsx",
        tenant_id="tenant_celery_test",
        uploaded_by="admin_celery",
    )

    assert result["status"] == "COMPLETED"
    assert result["tenant_id"] == "tenant_celery_test"
    assert result["total_rows"] == 2
    assert result["inserted_count"] == 2
    assert result["failed_count"] == 0

    # Verify directly in MongoDB
    db = await get_database()
    emp_doc = await db["employees"].find_one(
        {
            "tenant_id": "tenant_celery_test",
            "employee_id": "CELERY_EMP_01",
        }
    )
    assert emp_doc is not None
    assert emp_doc["full_name"] == "Celery Alice"
    assert emp_doc["email"] == "celery_alice@tenantx.com"

    # Verify default user credentials were automatically created
    user_doc = await db["users"].find_one(
        {
            "tenant_id": "tenant_celery_test",
            "username": "CELERY_EMP_01",
        }
    )
    assert user_doc is not None
    assert user_doc["employee_id"] == "CELERY_EMP_01"


@pytest.mark.asyncio
async def test_async_bulk_import_api_and_task_polling(seed_admin_user):
    """Test full HTTP API flow: file upload, immediate 202 Accepted, deduplication on duplicate hit, and task status polling."""
    excel_bytes = create_sample_excel_bytes()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = {
            **seed_admin_user["headers"],
            "X-Tenant-ID": "default",
            "X-Idempotency-Key": "unique-import-batch-001",
        }

        # 2. Upload Excel file to /api/v1/employees/bulk-import-async
        files = {
            "file": ("employees.xlsx", excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }
        res_1 = await client.post(
            "/api/v1/employees/bulk-import-async",
            headers=headers,
            files=files,
        )
        assert res_1.status_code == 202, f"Failed with {res_1.status_code}: {res_1.text}"
        body_1 = res_1.json()
        assert body_1["status"] == "ACCEPTED"
        assert "task_id" in body_1
        task_id = body_1["task_id"]

        # 3. Deduplication Test: Send IDENTICAL request with same X-Idempotency-Key
        files_dup = {
            "file": ("employees.xlsx", excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        }
        res_dup = await client.post(
            "/api/v1/employees/bulk-import-async",
            headers=headers,
            files=files_dup,
        )
        # Should return cached completed result with deduplication header
        assert res_dup.status_code == 202
        assert res_dup.headers.get("X-Cache-Deduplicated") == "true"
        assert res_dup.json()["task_id"] == task_id  # Exactly the same task, not duplicated!

        # 4. Poll Task Status via GET /api/v1/tasks/{task_id}
        task_res = await client.get(
            f"/api/v1/tasks/{task_id}",
            headers=headers,
        )
        assert task_res.status_code == 200
        task_body = task_res.json()
        assert task_body["task_id"] == task_id
        assert task_body["status"] in ["SUCCESS", "PENDING", "PROGRESS"]

"""Integration tests for attendance regularization workflow."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_employee_submit_and_admin_approve_regularization(
    async_client: AsyncClient, test_db, seed_employee_user, seed_admin_user
):
    """Employee submits manual time correction; Admin approves; Attendance record is updated."""
    emp_headers = seed_employee_user["headers"]
    admin_headers = seed_admin_user["headers"]
    employee_id = seed_employee_user["employee"]["employee_id"]

    # 1. Submit regularization request
    payload = {
        "work_date": "2026-10-01",
        "entry_time": "2026-10-01T09:00:00Z",
        "exit_time": "2026-10-01T15:00:00Z",
        "reason": "Forgot badge scan in the morning",
    }
    res = await async_client.post("/api/v1/attendance/regularize", json=payload, headers=emp_headers)
    assert res.status_code == 201
    data = res.json()
    assert data["status"] == "PENDING"
    assert data["employee_id"] == employee_id
    assert data["duration_hours"] == 6.0
    request_id = data["request_id"]

    # 2. List pending requests as Admin
    list_res = await async_client.get("/api/v1/attendance/regularize?status=PENDING", headers=admin_headers)
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1
    assert any(r["request_id"] == request_id for r in list_res.json())

    # 3. Admin approves request
    review_res = await async_client.patch(
        f"/api/v1/attendance/regularize/{request_id}",
        json={"action": "APPROVED", "admin_notes": "Approved by manager"},
        headers=admin_headers,
    )
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "APPROVED"

    # 4. Verify attendance record was created in database
    att_doc = await test_db.attendance.find_one({"employee_id": employee_id, "work_date": "2026-10-01"})
    assert att_doc is not None
    assert att_doc["attendance_status"] == "COMPLETED"
    assert att_doc["duration_seconds"] == 6 * 3600
    assert att_doc.get("is_regularized") is True


@pytest.mark.asyncio
async def test_admin_reject_regularization(async_client: AsyncClient, seed_employee_user, seed_admin_user):
    """Admin rejects an attendance regularization request."""
    emp_headers = seed_employee_user["headers"]
    admin_headers = seed_admin_user["headers"]

    payload = {
        "work_date": "2026-10-02",
        "entry_time": "2026-10-02T10:00:00Z",
        "exit_time": "2026-10-02T16:00:00Z",
        "reason": "System was down",
    }
    res = await async_client.post("/api/v1/attendance/regularize", json=payload, headers=emp_headers)
    assert res.status_code == 201
    request_id = res.json()["request_id"]

    review_res = await async_client.patch(
        f"/api/v1/attendance/regularize/{request_id}",
        json={"action": "REJECTED", "admin_notes": "No proof of attendance"},
        headers=admin_headers,
    )
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "REJECTED"
    assert review_res.json()["admin_notes"] == "No proof of attendance"

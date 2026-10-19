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

    # 1. Submit regularization request (relative to current date within 14-day window)
    from datetime import datetime, timezone, timedelta
    recent_date = (datetime.now(timezone.utc) - timedelta(days=2)).strftime("%Y-%m-%d")
    payload = {
        "work_date": recent_date,
        "entry_time": f"{recent_date}T09:00:00Z",
        "exit_time": f"{recent_date}T15:00:00Z",
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
    att_doc = await test_db.attendance.find_one({"employee_id": employee_id, "work_date": recent_date})
    assert att_doc is not None
    assert att_doc["attendance_status"] == "COMPLETED"
    assert att_doc["duration_seconds"] == 6 * 3600
    assert att_doc.get("is_regularized") is True


@pytest.mark.asyncio
async def test_admin_reject_regularization(async_client: AsyncClient, seed_employee_user, seed_admin_user):
    """Admin rejects an attendance regularization request."""
    emp_headers = seed_employee_user["headers"]
    admin_headers = seed_admin_user["headers"]

    from datetime import datetime, timezone, timedelta
    recent_date_2 = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%d")
    payload = {
        "work_date": recent_date_2,
        "entry_time": f"{recent_date_2}T10:00:00Z",
        "exit_time": f"{recent_date_2}T16:00:00Z",
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


@pytest.mark.asyncio
async def test_regularization_bounds_guardrails(async_client: AsyncClient, seed_employee_user):
    """Rejects future dates and dates older than 14-day policy window with 422."""
    from datetime import datetime, timedelta

    from app.utils.time_utils import get_company_tz

    tz = get_company_tz()
    today = datetime.now(tz).date()
    emp_headers = seed_employee_user["headers"]

    # 1. Future date
    future_date = (today + timedelta(days=2)).isoformat()
    fut_res = await async_client.post(
        "/api/v1/attendance/regularize",
        json={
            "work_date": future_date,
            "entry_time": f"{future_date}T09:00:00Z",
            "exit_time": f"{future_date}T17:00:00Z",
            "reason": "Future clock-in attempt",
        },
        headers=emp_headers,
    )
    assert fut_res.status_code == 422
    assert "future" in fut_res.json()["message"].lower()

    # 2. Stale date > 14 days
    stale_date = (today - timedelta(days=20)).isoformat()
    stale_res = await async_client.post(
        "/api/v1/attendance/regularize",
        json={
            "work_date": stale_date,
            "entry_time": f"{stale_date}T09:00:00Z",
            "exit_time": f"{stale_date}T17:00:00Z",
            "reason": "Very old missed clock-in",
        },
        headers=emp_headers,
    )
    assert stale_res.status_code == 422
    assert "14 days" in stale_res.json()["message"]


@pytest.mark.asyncio
async def test_bulk_regularization_review(async_client: AsyncClient, seed_employee_user, seed_admin_user):
    """Admin batch approves multiple regularization requests."""
    from datetime import datetime, timedelta

    from app.utils.time_utils import get_company_tz

    tz = get_company_tz()
    today = datetime.now(tz).date()
    emp_headers = seed_employee_user["headers"]
    admin_headers = seed_admin_user["headers"]

    d1 = (today - timedelta(days=2)).isoformat()
    d2 = (today - timedelta(days=3)).isoformat()

    r1 = await async_client.post(
        "/api/v1/attendance/regularize",
        json={
            "work_date": d1,
            "entry_time": f"{d1}T09:00:00Z",
            "exit_time": f"{d1}T17:00:00Z",
            "reason": "Badge forgotten day 1",
        },
        headers=emp_headers,
    )
    r2 = await async_client.post(
        "/api/v1/attendance/regularize",
        json={
            "work_date": d2,
            "entry_time": f"{d2}T09:00:00Z",
            "exit_time": f"{d2}T17:00:00Z",
            "reason": "Badge forgotten day 2",
        },
        headers=emp_headers,
    )
    assert r1.status_code == 201
    assert r2.status_code == 201
    req1_id = r1.json()["request_id"]
    req2_id = r2.json()["request_id"]

    bulk_res = await async_client.post(
        "/api/v1/attendance/regularize/bulk-review",
        json={
            "request_ids": [req1_id, req2_id],
            "action": "APPROVED",
            "admin_notes": "Bulk approved by manager",
        },
        headers=admin_headers,
    )
    assert bulk_res.status_code == 200
    data = bulk_res.json()
    assert data["total_requested"] == 2
    assert data["success_count"] == 2
    assert data["failed_count"] == 0
    assert req1_id in data["updated_ids"]
    assert req2_id in data["updated_ids"]

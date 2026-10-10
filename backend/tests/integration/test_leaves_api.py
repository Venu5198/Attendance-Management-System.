"""Integration tests for leave requests and policy exemption workflow."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_leave_request_and_approval_workflow(async_client: AsyncClient, seed_employee_user, seed_admin_user):
    """Employee requests medical leave; Admin approves."""
    emp_headers = seed_employee_user["headers"]
    admin_headers = seed_admin_user["headers"]
    employee_id = seed_employee_user["employee"]["employee_id"]

    payload = {
        "start_date": "2026-09-28",
        "end_date": "2026-10-02",
        "leave_type": "SICK",
        "reason": "Recovering from viral fever",
    }
    res = await async_client.post("/api/v1/leaves/request", json=payload, headers=emp_headers)
    assert res.status_code == 201
    leave_data = res.json()
    assert leave_data["status"] == "PENDING"
    assert leave_data["employee_id"] == employee_id
    leave_id = leave_data["leave_id"]

    # Admin reviews and approves
    review_res = await async_client.patch(
        f"/api/v1/leaves/{leave_id}",
        json={"action": "APPROVED", "admin_notes": "Medical certificate verified"},
        headers=admin_headers,
    )
    assert review_res.status_code == 200
    assert review_res.json()["status"] == "APPROVED"


@pytest.mark.asyncio
async def test_approved_leave_exempts_from_policy_violations(
    async_client: AsyncClient, test_db, seed_employee_user, seed_admin_user
):
    """
    Employee on approved leave for full week has 0 office visits,
    but is marked EXEMPT during policy evaluation and NO violation is recorded.
    """
    emp_headers = seed_employee_user["headers"]
    admin_headers = seed_admin_user["headers"]
    employee_id = seed_employee_user["employee"]["employee_id"]

    # 1. Employee files leave for week Monday-Friday (2026-09-28 to 2026-10-02)
    payload = {
        "start_date": "2026-09-28",
        "end_date": "2026-10-02",
        "leave_type": "VACATION",
        "reason": "Annual family vacation",
    }
    res = await async_client.post("/api/v1/leaves/request", json=payload, headers=emp_headers)
    assert res.status_code == 201
    leave_id = res.json()["leave_id"]

    # 2. Admin approves
    await async_client.patch(
        f"/api/v1/leaves/{leave_id}",
        json={"action": "APPROVED", "admin_notes": "Approved annual leave"},
        headers=admin_headers,
    )

    # 3. Trigger policy evaluation for that completed week (2026-09-28 to 2026-10-04)
    eval_res = await async_client.post(
        "/api/v1/violations/evaluate",
        json={"reference_date": "2026-09-30", "employee_id": employee_id},
        headers=admin_headers,
    )
    assert eval_res.status_code == 200
    results = eval_res.json()
    assert len(results) == 1
    comp = results[0]
    assert comp["compliance_status"] == "EXEMPT"
    assert comp["approved_leave_days"] == 5
    assert comp["required_days"] == 0
    assert comp["required_hours"] == 0.0

    # 4. Verify no violation record was persisted
    violations = await test_db.policy_violations.find({"employee_id": employee_id}).to_list(length=None)
    assert len(violations) == 0


@pytest.mark.asyncio
async def test_overlapping_leave_rejection(async_client: AsyncClient, seed_employee_user):
    """Attempting to submit overlapping leave dates returns 409 Conflict."""
    emp_headers = seed_employee_user["headers"]

    # First leave
    res1 = await async_client.post(
        "/api/v1/leaves/request",
        json={
            "start_date": "2026-11-10",
            "end_date": "2026-11-15",
            "leave_type": "VACATION",
            "reason": "First trip",
        },
        headers=emp_headers,
    )
    assert res1.status_code == 201

    # Overlapping leave (partially intersecting)
    res2 = await async_client.post(
        "/api/v1/leaves/request",
        json={
            "start_date": "2026-11-12",
            "end_date": "2026-11-18",
            "leave_type": "CASUAL",
            "reason": "Overlapping trip",
        },
        headers=emp_headers,
    )
    assert res2.status_code == 409
    assert "conflicts with an existing" in res2.json()["message"]


@pytest.mark.asyncio
async def test_bulk_leave_review(async_client: AsyncClient, seed_employee_user, seed_admin_user):
    """Admin batch approves up to 50 leave requests."""
    emp_headers = seed_employee_user["headers"]
    admin_headers = seed_admin_user["headers"]

    # Submit 2 separate leaves
    r1 = await async_client.post(
        "/api/v1/leaves/request",
        json={"start_date": "2026-12-01", "end_date": "2026-12-02", "leave_type": "CASUAL", "reason": "Doc appt"},
        headers=emp_headers,
    )
    r2 = await async_client.post(
        "/api/v1/leaves/request",
        json={"start_date": "2026-12-05", "end_date": "2026-12-06", "leave_type": "SICK", "reason": "Dentist"},
        headers=emp_headers,
    )
    assert r1.status_code == 201
    assert r2.status_code == 201
    l1_id = r1.json()["leave_id"]
    l2_id = r2.json()["leave_id"]

    # Bulk approve
    bulk_res = await async_client.post(
        "/api/v1/leaves/bulk-review",
        json={
            "leave_ids": [l1_id, l2_id],
            "action": "APPROVED",
            "admin_notes": "Batch approved by HR",
        },
        headers=admin_headers,
    )
    assert bulk_res.status_code == 200
    data = bulk_res.json()
    assert data["total_requested"] == 2
    assert data["success_count"] == 2
    assert data["failed_count"] == 0
    assert l1_id in data["updated_ids"]
    assert l2_id in data["updated_ids"]

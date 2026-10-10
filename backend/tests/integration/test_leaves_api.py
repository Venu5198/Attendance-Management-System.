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

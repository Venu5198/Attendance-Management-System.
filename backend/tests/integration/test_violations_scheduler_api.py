"""Integration tests for Policy Violations evaluation and Notification dispatching."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient


@pytest.fixture
async def setup_completed_week_data(test_db):
    now = datetime.now(UTC)
    # 2 employees: EMP_V1 (non-compliant: 1 day, 5h), EMP_V2 (compliant: 3 days, 15h)
    await test_db.employees.insert_many(
        [
            {
                "employee_id": "EMP_V1",
                "full_name": "Violator Emp",
                "email": "violator@company.com",
                "department": "Marketing",
                "role": "EMPLOYEE",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
            {
                "employee_id": "EMP_V2",
                "full_name": "Compliant Emp",
                "email": "good@company.com",
                "department": "Eng",
                "role": "EMPLOYEE",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            },
        ]
    )

    # Completed past week: 2026-09-28 to 2026-10-04
    await test_db.attendance.insert_many(
        [
            {
                "attendance_id": "v_att1",
                "employee_id": "EMP_V1",
                "work_date": "2026-09-28",
                "entry_time": now,
                "exit_time": now,
                "duration_seconds": 5 * 3600,
                "attendance_status": "COMPLETED",
                "created_at": now,
                "updated_at": now,
            },
            {
                "attendance_id": "v_att2",
                "employee_id": "EMP_V2",
                "work_date": "2026-09-28",
                "entry_time": now,
                "exit_time": now,
                "duration_seconds": 5 * 3600,
                "attendance_status": "COMPLETED",
                "created_at": now,
                "updated_at": now,
            },
            {
                "attendance_id": "v_att3",
                "employee_id": "EMP_V2",
                "work_date": "2026-09-29",
                "entry_time": now,
                "exit_time": now,
                "duration_seconds": 5 * 3600,
                "attendance_status": "COMPLETED",
                "created_at": now,
                "updated_at": now,
            },
            {
                "attendance_id": "v_att4",
                "employee_id": "EMP_V2",
                "work_date": "2026-09-30",
                "entry_time": now,
                "exit_time": now,
                "duration_seconds": 5 * 3600,
                "attendance_status": "COMPLETED",
                "created_at": now,
                "updated_at": now,
            },
        ]
    )


@pytest.mark.asyncio
async def test_evaluate_and_dispatch_notifications(
    async_client: AsyncClient,
    seed_admin_user,
    setup_completed_week_data,
):
    headers = seed_admin_user["headers"]

    # 1. Trigger evaluation for completed week containing 2026-09-30
    eval_resp = await async_client.post(
        "/api/v1/violations/evaluate",
        json={"reference_date": "2026-09-30"},
        headers=headers,
    )
    assert eval_resp.status_code == 200
    results = eval_resp.json()
    assert len(results) == 2

    # 2. Check recorded violations
    viol_resp = await async_client.get(
        "/api/v1/violations?week_label=2026-09-28_to_2026-10-04",
        headers=headers,
    )
    assert viol_resp.status_code == 200
    violations = viol_resp.json()
    assert len(violations) == 1
    assert violations[0]["employee_id"] == "EMP_V1"
    assert violations[0]["compliance_status"] == "NON_COMPLIANT"

    # 3. Dispatch notifications
    dispatch_resp = await async_client.post(
        "/api/v1/violations/dispatch-notifications",
        json={"week_label": "2026-09-28_to_2026-10-04"},
        headers=headers,
    )
    assert dispatch_resp.status_code == 200
    dispatch_data = dispatch_resp.json()
    assert dispatch_data["notifications_sent"] == 1
    assert dispatch_data["notifications_skipped_or_failed"] == 0

    # 4. Attempt duplicate dispatch -> should be skipped (idempotent)
    dup_dispatch = await async_client.post(
        "/api/v1/violations/dispatch-notifications",
        json={"week_label": "2026-09-28_to_2026-10-04", "force_resend": False},
        headers=headers,
    )
    assert dup_dispatch.status_code == 200
    assert dup_dispatch.json()["notifications_sent"] == 0
    assert dup_dispatch.json()["notifications_skipped_or_failed"] == 1

    # 5. Verify notification logs
    logs_resp = await async_client.get(
        "/api/v1/violations/notification-logs?policy_week=2026-09-28_to_2026-10-04",
        headers=headers,
    )
    assert logs_resp.status_code == 200
    logs = logs_resp.json()
    assert len(logs) == 1
    assert logs[0]["recipient"] == "violator@company.com"
    assert logs[0]["delivery_status"] == "SENT"


@pytest.mark.asyncio
async def test_compliance_health_scores_endpoint(
    async_client: AsyncClient,
    seed_admin_user,
    setup_completed_week_data,
):
    """Admin queries rolling 4-week compliance health scores."""
    headers = seed_admin_user["headers"]

    res = await async_client.get("/api/v1/violations/health-scores", headers=headers)
    assert res.status_code == 200
    scores = res.json()
    assert len(scores) >= 2
    # Verify structure
    s1 = scores[0]
    assert "health_score" in s1
    assert "health_rating" in s1
    assert "chronic_issue" in s1
    assert len(s1["weekly_history"]) == 4
    assert s1["total_evaluated_weeks"] == 4

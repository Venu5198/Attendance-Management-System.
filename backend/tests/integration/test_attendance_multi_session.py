"""Comprehensive integration tests for Multi-Session Employee Attendance APIs:
- Successful check-in and check-out
- Multiple sessions in a single day (2h + 3h = 5h)
- Duplicate active check-in rejection
- Check-out without check-in rejection
- Invalid check-out timestamps (exit <= entry)
- Incomplete sessions handling in today and reports
- Cross-midnight session calculation
- Daily and custom range reports
- Authorization: employee ownership vs admin access
- Concurrent check-in race condition handling
"""

import asyncio
from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

from app.utils.time_utils import get_work_date, now_local


@pytest.mark.asyncio
async def test_multi_session_same_day_calculation(async_client: AsyncClient, seed_employee_user):
    """
    Test scenario from requirement:
    - Session 1: Check-in at 6:00 AM, check-out at 8:00 AM = 2 hours (120 min)
    - Session 2: Check-in at 9:00 AM, check-out at 12:00 PM = 3 hours (180 min)
    - Total daily attendance = 5 hours (300 min = 18000 sec).
    """
    headers = seed_employee_user["headers"]
    emp_id = seed_employee_user["employee"]["employee_id"]

    base_date = datetime(2026, 10, 25, tzinfo=UTC)
    s1_in = base_date.replace(hour=6, minute=0, second=0)
    s1_out = base_date.replace(hour=8, minute=0, second=0)
    s2_in = base_date.replace(hour=9, minute=0, second=0)
    s2_out = base_date.replace(hour=12, minute=0, second=0)

    # 1. Session 1: Check-in
    resp1_in = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"timestamp": s1_in.isoformat()},
        headers=headers,
    )
    assert resp1_in.status_code == 201
    d1_in = resp1_in.json()["attendance"]
    assert d1_in["attendance_status"] == "IN_PROGRESS"
    assert d1_in["entry_time"] is not None
    assert d1_in["exit_time"] is None

    # 2. Session 1: Check-out
    resp1_out = await async_client.post(
        "/api/v1/attendance/check-out",
        json={"timestamp": s1_out.isoformat()},
        headers=headers,
    )
    assert resp1_out.status_code == 200
    d1_out = resp1_out.json()["attendance"]
    assert d1_out["attendance_status"] == "COMPLETED"
    assert d1_out["duration_minutes"] == 120.0
    assert d1_out["duration_hours"] == 2.0
    assert d1_out["duration_seconds"] == 7200

    # 3. Session 2: Check-in
    resp2_in = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"timestamp": s2_in.isoformat()},
        headers=headers,
    )
    assert resp2_in.status_code == 201
    d2_in = resp2_in.json()["attendance"]
    assert d2_in["attendance_status"] == "IN_PROGRESS"
    assert d2_in["attendance_id"] != d1_in["attendance_id"]

    # 4. Session 2: Check-out
    resp2_out = await async_client.post(
        "/api/v1/attendance/check-out",
        json={"timestamp": s2_out.isoformat()},
        headers=headers,
    )
    assert resp2_out.status_code == 200
    d2_out = resp2_out.json()["attendance"]
    assert d2_out["attendance_status"] == "COMPLETED"
    assert d2_out["duration_minutes"] == 180.0
    assert d2_out["duration_hours"] == 3.0
    assert d2_out["duration_seconds"] == 10800

    # 5. Verify history returns both independent session documents
    resp_hist = await async_client.get("/api/v1/attendance/history", headers=headers)
    assert resp_hist.status_code == 200
    history = resp_hist.json()
    assert len(history) == 2
    assert history[0]["attendance_id"] == d1_in["attendance_id"]
    assert history[0]["duration_minutes"] == 120.0
    assert history[1]["attendance_id"] == d2_in["attendance_id"]
    assert history[1]["duration_minutes"] == 180.0

    # 6. Verify total calculation: 120 min + 180 min = 300 min = 5 hours
    total_minutes = sum(h["duration_minutes"] for h in history)
    assert total_minutes == 300.0
    total_hours = sum(h["duration_hours"] for h in history)
    assert total_hours == 5.0


@pytest.mark.asyncio
async def test_duplicate_active_checkin_rejection(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]

    # 1. First check-in succeeds
    resp1 = await async_client.post("/api/v1/attendance/check-in", headers=headers)
    assert resp1.status_code == 201
    assert resp1.json()["attendance"]["attendance_status"] == "IN_PROGRESS"

    # 2. Second check-in attempt while first is in progress -> 400 Bad Request
    resp2 = await async_client.post("/api/v1/attendance/check-in", headers=headers)
    assert resp2.status_code == 400
    assert "already has a check-in record in progress" in resp2.json()["message"]


@pytest.mark.asyncio
async def test_checkout_without_checkin_rejection(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]

    # Check-out when no active session has ever been started
    resp = await async_client.post("/api/v1/attendance/check-out", headers=headers)
    assert resp.status_code == 400
    assert "No check-in record found" in resp.json()["message"]

    # Check-in and check-out to complete a session
    await async_client.post("/api/v1/attendance/check-in", headers=headers)
    await async_client.post("/api/v1/attendance/check-out", headers=headers)

    # Check-out again when no active session is currently running
    resp_again = await async_client.post("/api/v1/attendance/check-out", headers=headers)
    assert resp_again.status_code == 400
    assert "already checked out" in resp_again.json()["message"]


@pytest.mark.asyncio
async def test_invalid_checkout_timestamps(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]

    entry_t = datetime(2026, 10, 25, 10, 0, 0, tzinfo=UTC)
    earlier_exit_t = datetime(2026, 10, 25, 9, 30, 0, tzinfo=UTC)
    equal_exit_t = datetime(2026, 10, 25, 10, 0, 0, tzinfo=UTC)

    # Check in at 10:00
    resp_in = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"timestamp": entry_t.isoformat()},
        headers=headers,
    )
    assert resp_in.status_code == 201

    # Attempt check-out earlier than entry time (09:30 < 10:00) -> 400
    resp_earlier = await async_client.post(
        "/api/v1/attendance/check-out",
        json={"timestamp": earlier_exit_t.isoformat()},
        headers=headers,
    )
    assert resp_earlier.status_code == 400
    assert "Exit time cannot precede entry time" in resp_earlier.json()["message"]

    # Attempt check-out equal to entry time (10:00 == 10:00) -> 400
    resp_equal = await async_client.post(
        "/api/v1/attendance/check-out",
        json={"timestamp": equal_exit_t.isoformat()},
        headers=headers,
    )
    assert resp_equal.status_code == 400
    assert "Exit time cannot precede entry time" in resp_equal.json()["message"]


@pytest.mark.asyncio
async def test_incomplete_sessions_handling(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]
    emp_id = seed_employee_user["employee"]["employee_id"]

    local_today = now_local().replace(hour=8, minute=0, second=0, microsecond=0)
    s1_in = local_today
    s1_out = local_today + timedelta(hours=2)

    # Complete session 1 (2 hours = 120 minutes)
    await async_client.post(
        "/api/v1/attendance/check-in",
        json={"timestamp": s1_in.isoformat()},
        headers=headers,
    )
    await async_client.post(
        "/api/v1/attendance/check-out",
        json={"timestamp": s1_out.isoformat()},
        headers=headers,
    )

    # Start session 2 (leave incomplete / IN_PROGRESS on the same workday)
    s2_in = local_today + timedelta(hours=2, minutes=30)
    await async_client.post(
        "/api/v1/attendance/check-in",
        json={"timestamp": s2_in.isoformat()},
        headers=headers,
    )

    # Today status should reflect IN_PROGRESS, but total completed minutes should only be 120
    resp_today = await async_client.get("/api/v1/attendance/today", headers=headers)
    assert resp_today.status_code == 200
    today_data = resp_today.json()

    assert today_data["attendance_status"] == "IN_PROGRESS"
    assert today_data["total_sessions"] == 2
    assert today_data["completed_sessions"] == 1
    assert today_data["active_session"] is not None
    assert today_data["active_session"]["attendance_status"] == "IN_PROGRESS"
    assert today_data["duration_minutes"] == 120.0
    assert today_data["duration_hours"] == 2.0


@pytest.mark.asyncio
async def test_cross_midnight_session_duration(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]

    # Night shift: 2026-10-25 23:00 to 2026-10-26 02:30 (3.5 hours = 210 minutes = 12600 seconds)
    in_time = datetime(2026, 10, 25, 23, 0, 0, tzinfo=UTC)
    out_time = datetime(2026, 10, 26, 2, 30, 0, tzinfo=UTC)

    resp_in = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"timestamp": in_time.isoformat()},
        headers=headers,
    )
    assert resp_in.status_code == 201

    resp_out = await async_client.post(
        "/api/v1/attendance/check-out",
        json={"timestamp": out_time.isoformat()},
        headers=headers,
    )
    assert resp_out.status_code == 200
    data = resp_out.json()["attendance"]
    assert data["duration_seconds"] == 12600
    assert data["duration_minutes"] == 210.0
    assert data["duration_hours"] == 3.5


@pytest.mark.asyncio
async def test_daily_and_custom_range_reports_with_multiple_sessions(
    async_client: AsyncClient,
    seed_admin_user,
    seed_employee_user,
    test_db,
):
    admin_headers = seed_admin_user["headers"]
    emp_headers = seed_employee_user["headers"]
    emp_id = seed_employee_user["employee"]["employee_id"]

    # Insert 2 completed sessions on 2026-09-28 (2h + 3h = 5h)
    d1 = datetime(2026, 9, 28, 7, 0, 0, tzinfo=UTC)
    d1_end = datetime(2026, 9, 28, 9, 0, 0, tzinfo=UTC)
    d2 = datetime(2026, 9, 28, 10, 0, 0, tzinfo=UTC)
    d2_end = datetime(2026, 9, 28, 13, 0, 0, tzinfo=UTC)

    await test_db.attendance.insert_many(
        [
            {
                "attendance_id": "multi-session-001",
                "tenant_id": "default",
                "employee_id": emp_id,
                "work_date": "2026-09-28",
                "entry_time": d1,
                "exit_time": d1_end,
                "check_in_time": d1,
                "check_out_time": d1_end,
                "duration_seconds": 7200,
                "duration_minutes": 120.0,
                "duration_hours": 2.0,
                "attendance_status": "COMPLETED",
                "created_at": d1,
                "updated_at": d1_end,
            },
            {
                "attendance_id": "multi-session-002",
                "tenant_id": "default",
                "employee_id": emp_id,
                "work_date": "2026-09-28",
                "entry_time": d2,
                "exit_time": d2_end,
                "check_in_time": d2,
                "check_out_time": d2_end,
                "duration_seconds": 10800,
                "duration_minutes": 180.0,
                "duration_hours": 3.0,
                "attendance_status": "COMPLETED",
                "created_at": d2,
                "updated_at": d2_end,
            },
        ]
    )

    # 1. Daily Report for 2026-09-28
    resp_daily = await async_client.get(
        "/api/v1/attendance/report?period=daily&target_date=2026-09-28",
        headers=admin_headers,
    )
    assert resp_daily.status_code == 200
    daily_json = resp_daily.json()
    emp_item = next(e for e in daily_json["employees"] if e["employee_id"] == emp_id)
    assert emp_item["total_attended_days"] == 1
    assert emp_item["total_office_hours"] == 5.0
    assert emp_item["total_duration_seconds"] == 18000
    assert emp_item["daily_records"][0]["status"] == "COMPLETED"
    assert emp_item["daily_records"][0]["duration_hours"] == 5.0

    # 2. Custom Date Range Report
    resp_custom = await async_client.get(
        "/api/v1/attendance/report?period=custom&start_date=2026-09-28&end_date=2026-09-30",
        headers=admin_headers,
    )
    assert resp_custom.status_code == 200
    custom_json = resp_custom.json()
    emp_custom = next(e for e in custom_json["employees"] if e["employee_id"] == emp_id)
    assert emp_custom["total_attended_days"] == 1
    assert emp_custom["total_office_hours"] == 5.0


@pytest.mark.asyncio
async def test_employee_and_admin_authorization(
    async_client: AsyncClient,
    seed_employee_user,
    seed_admin_user,
    test_db,
):
    emp_headers = seed_employee_user["headers"]
    emp_id = seed_employee_user["employee"]["employee_id"]
    admin_headers = seed_admin_user["headers"]

    # 1. Employee cannot view other employee's history -> 403
    resp_forbidden = await async_client.get(
        "/api/v1/attendance/history/OTHER_EMP_99",
        headers=emp_headers,
    )
    assert resp_forbidden.status_code == 403

    # 2. Employee cannot check in on behalf of another employee -> 403
    resp_checkin_forbidden = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"employee_id": "OTHER_EMP_99"},
        headers=emp_headers,
    )
    assert resp_checkin_forbidden.status_code == 403

    # 3. Admin can view history for any employee
    resp_admin = await async_client.get(
        f"/api/v1/attendance/history/{emp_id}",
        headers=admin_headers,
    )
    assert resp_admin.status_code == 200

    # 4. Admin can also use query param /api/v1/attendance/history?employee_id=...
    resp_admin_query = await async_client.get(
        f"/api/v1/attendance/history?employee_id={emp_id}",
        headers=admin_headers,
    )
    assert resp_admin_query.status_code == 200


@pytest.mark.asyncio
async def test_concurrent_checkin_attempts(async_client: AsyncClient, seed_employee_user):
    """
    Fire multiple concurrent check-in requests simultaneously for the same employee.
    Verify that only ONE request succeeds (201) and subsequent/concurrent ones are rejected (400).
    """
    headers = seed_employee_user["headers"]

    # Send 5 simultaneous check-in requests
    tasks = [
        async_client.post("/api/v1/attendance/check-in", headers=headers)
        for _ in range(5)
    ]
    responses = await asyncio.gather(*tasks)

    status_codes = [r.status_code for r in responses]
    success_count = status_codes.count(201)
    error_count = status_codes.count(400)

    # Exactly one must succeed, the other 4 must be rejected
    assert success_count == 1
    assert error_count == 4

    # Verify today status has exactly 1 active session
    resp_today = await async_client.get("/api/v1/attendance/today", headers=headers)
    assert resp_today.status_code == 200
    assert resp_today.json()["attendance_status"] == "IN_PROGRESS"
    assert resp_today.json()["total_sessions"] == 1

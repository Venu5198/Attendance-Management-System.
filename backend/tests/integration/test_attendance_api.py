"""Integration tests for Attendance Check-in, Check-out, and Ownership."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_attendance_checkin_checkout_success(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]

    # 1. Initial today status -> NOT_ATTENDED
    resp_init = await async_client.get("/api/v1/attendance/today", headers=headers)
    assert resp_init.status_code == 200
    assert resp_init.json()["attendance_status"] == "NOT_ATTENDED"

    # 2. Check-in
    resp_in = await async_client.post("/api/v1/attendance/check-in", headers=headers)
    assert resp_in.status_code == 201
    in_data = resp_in.json()["attendance"]
    assert in_data["attendance_status"] == "IN_PROGRESS"
    assert in_data["entry_time"] is not None
    assert in_data["exit_time"] is None
    assert in_data["duration_seconds"] == 0

    # 3. Check today status -> IN_PROGRESS
    resp_mid = await async_client.get("/api/v1/attendance/today", headers=headers)
    assert resp_mid.json()["attendance_status"] == "IN_PROGRESS"

    # 4. Duplicate check-in rejected
    resp_dup = await async_client.post("/api/v1/attendance/check-in", headers=headers)
    assert resp_dup.status_code == 400
    assert "already has a check-in record" in resp_dup.json()["message"]

    # 5. Check-out
    resp_out = await async_client.post("/api/v1/attendance/check-out", headers=headers)
    assert resp_out.status_code == 200
    out_data = resp_out.json()["attendance"]
    assert out_data["attendance_status"] == "COMPLETED"
    assert out_data["exit_time"] is not None

    # 6. Duplicate check-out rejected
    resp_out_dup = await async_client.post("/api/v1/attendance/check-out", headers=headers)
    assert resp_out_dup.status_code == 400
    assert "already checked out" in resp_out_dup.json()["message"]


@pytest.mark.asyncio
async def test_checkout_without_checkin_rejected(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]
    resp = await async_client.post("/api/v1/attendance/check-out", headers=headers)
    assert resp.status_code == 400
    assert "No check-in record found" in resp.json()["message"]


@pytest.mark.asyncio
async def test_cross_employee_checkin_forbidden(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]
    # Trying to check in for another employee ID
    resp = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"employee_id": "EMP_SOMEONE_ELSE"},
        headers=headers,
    )
    assert resp.status_code == 403
    assert "Cannot record attendance for another employee" in resp.json()["message"]


@pytest.mark.asyncio
async def test_remote_checkin_ip_binding_guardrail(async_client: AsyncClient, seed_employee_user, test_db):
    headers = seed_employee_user["headers"]
    emp_id = seed_employee_user["employee"]["employee_id"]

    from datetime import UTC, datetime

    from app.utils.time_utils import get_work_date, now_utc

    today = get_work_date(now_utc())

    # Configure employee with allowed remote IP
    await test_db.employees.update_one(
        {"employee_id": emp_id},
        {"$set": {"allowed_remote_ip": "198.51.100.25"}},
    )

    # Insert approved REMOTE_EXCEPTION for today
    await test_db.leaves.insert_one(
        {
            "leave_id": "leave-remote-ip-001",
            "employee_id": emp_id,
            "leave_type": "REMOTE_EXCEPTION",
            "status": "APPROVED",
            "start_date": today,
            "end_date": today,
            "reason": "WFH authorized",
            "submitted_at": datetime.now(UTC),
        }
    )

    # 1. Attempt clock-in with mismatching/spoofed IP -> 403
    resp_spoof = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"client_ip": "203.0.113.199"},
        headers=headers,
    )
    assert resp_spoof.status_code == 403
    assert "Client IP '203.0.113.199' does not match" in resp_spoof.json()["message"]

    # 2. Clock-in with matching authorized IP -> 201
    resp_valid = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"client_ip": "198.51.100.25"},
        headers=headers,
    )
    assert resp_valid.status_code == 201
    assert resp_valid.json()["attendance"]["attendance_status"] == "IN_PROGRESS"


@pytest.mark.asyncio
async def test_remote_checkin_geofence_guardrail(async_client: AsyncClient, seed_employee_user, test_db):
    headers = seed_employee_user["headers"]
    emp_id = seed_employee_user["employee"]["employee_id"]

    from datetime import UTC, datetime

    from app.utils.time_utils import get_work_date, now_utc

    today = get_work_date(now_utc())

    # Configure employee with allowed geo-fence coordinates (200m radius)
    await test_db.employees.update_one(
        {"employee_id": emp_id},
        {
            "$set": {
                "allowed_lat": 12.9716,
                "allowed_lng": 77.5946,
                "geo_fence_radius_meters": 200.0,
            }
        },
    )

    # Insert approved REMOTE_EXCEPTION for today
    await test_db.leaves.insert_one(
        {
            "leave_id": "leave-remote-geo-001",
            "employee_id": emp_id,
            "leave_type": "REMOTE_EXCEPTION",
            "status": "APPROVED",
            "start_date": today,
            "end_date": today,
            "reason": "WFH authorized",
            "submitted_at": datetime.now(UTC),
        }
    )

    # 1. Clock-in without required coordinates -> 422
    resp_missing = await async_client.post(
        "/api/v1/attendance/check-in",
        headers=headers,
    )
    assert resp_missing.status_code == 422
    assert "Geolocation coordinates required" in resp_missing.json()["message"]

    # 2. Clock-in outside approved radius (>1km away) -> 403
    resp_outside = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"latitude": 12.9850, "longitude": 77.6100},
        headers=headers,
    )
    assert resp_outside.status_code == 403
    assert "Outside approved boundary" in resp_outside.json()["message"]

    # 3. Clock-in within approved radius (~15m away) -> 201
    resp_inside = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"latitude": 12.9717, "longitude": 77.5947},
        headers=headers,
    )
    assert resp_inside.status_code == 201
    assert resp_inside.json()["attendance"]["attendance_status"] == "IN_PROGRESS"

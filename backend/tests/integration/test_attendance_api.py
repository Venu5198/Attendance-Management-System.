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

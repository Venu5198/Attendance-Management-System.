"""Integration tests for the Single Central Reporting API."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient


@pytest.fixture
async def setup_multi_employee_attendance(test_db):
    """Seed 3 employees: one compliant, one non-compliant, one zero attendance."""
    now = datetime.now(UTC)
    employees = [
        {
            "employee_id": "EMP_REP_1",
            "full_name": "Compliant Emp",
            "email": "rep1@comp.com",
            "department": "Eng",
            "role": "EMPLOYEE",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "employee_id": "EMP_REP_2",
            "full_name": "NonCompliant Emp",
            "email": "rep2@comp.com",
            "department": "HR",
            "role": "EMPLOYEE",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        },
        {
            "employee_id": "EMP_REP_3",
            "full_name": "ZeroAttendance Emp",
            "email": "rep3@comp.com",
            "department": "Sales",
            "role": "EMPLOYEE",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        },
    ]
    await test_db.employees.insert_many(employees)

    # Completed past week: 2026-09-28 (Mon) to 2026-10-04 (Sun)
    # EMP_REP_1: 3 days, 15h
    # EMP_REP_2: 2 days, 10h
    attendance = [
        {
            "attendance_id": "att1",
            "employee_id": "EMP_REP_1",
            "work_date": "2026-09-28",
            "entry_time": now,
            "exit_time": now,
            "duration_seconds": 5 * 3600,
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        },
        {
            "attendance_id": "att2",
            "employee_id": "EMP_REP_1",
            "work_date": "2026-09-29",
            "entry_time": now,
            "exit_time": now,
            "duration_seconds": 5 * 3600,
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        },
        {
            "attendance_id": "att3",
            "employee_id": "EMP_REP_1",
            "work_date": "2026-09-30",
            "entry_time": now,
            "exit_time": now,
            "duration_seconds": 5 * 3600,
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        },
        {
            "attendance_id": "att4",
            "employee_id": "EMP_REP_2",
            "work_date": "2026-09-28",
            "entry_time": now,
            "exit_time": now,
            "duration_seconds": 5 * 3600,
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        },
        {
            "attendance_id": "att5",
            "employee_id": "EMP_REP_2",
            "work_date": "2026-09-29",
            "entry_time": now,
            "exit_time": now,
            "duration_seconds": 5 * 3600,
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        },
    ]
    await test_db.attendance.insert_many(attendance)


@pytest.mark.asyncio
async def test_central_report_weekly_all_employees_included(
    async_client: AsyncClient,
    seed_admin_user,
    setup_multi_employee_attendance,
):
    headers = seed_admin_user["headers"]
    # Request weekly report for completed week targeting 2026-09-30
    resp = await async_client.get(
        "/api/v1/attendance/report?period=weekly&target_date=2026-09-30",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["metadata"]["period"] == "weekly"
    assert data["metadata"]["start_date"] == "2026-09-28"
    assert data["metadata"]["end_date"] == "2026-10-04"
    assert data["metadata"]["total_employees"] == 3

    # Verify all 3 employees appear in the single response
    emp_map = {e["employee_id"]: e for e in data["employees"]}
    assert len(emp_map) == 3

    # EMP_REP_1: 3 days, 15 hours -> COMPLIANT
    e1 = emp_map["EMP_REP_1"]
    assert e1["total_attended_days"] == 3
    assert e1["total_office_hours"] == 15.0
    assert e1["overall_compliance"] == "COMPLIANT"

    # EMP_REP_2: 2 days, 10 hours -> NON_COMPLIANT
    e2 = emp_map["EMP_REP_2"]
    assert e2["total_attended_days"] == 2
    assert e2["total_office_hours"] == 10.0
    assert e2["overall_compliance"] == "NON_COMPLIANT"

    # EMP_REP_3: 0 days, 0 hours -> NON_COMPLIANT, missing attendance handled correctly
    e3 = emp_map["EMP_REP_3"]
    assert e3["total_attended_days"] == 0
    assert e3["total_office_hours"] == 0.0
    assert e3["overall_compliance"] == "NON_COMPLIANT"


@pytest.mark.asyncio
async def test_central_report_custom_date_range(
    async_client: AsyncClient,
    seed_admin_user,
    setup_multi_employee_attendance,
):
    headers = seed_admin_user["headers"]
    resp = await async_client.get(
        "/api/v1/attendance/report?period=custom&start_date=2026-09-28&end_date=2026-09-30",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["metadata"]["period"] == "custom"
    assert data["metadata"]["start_date"] == "2026-09-28"
    assert data["metadata"]["end_date"] == "2026-09-30"


@pytest.mark.asyncio
async def test_central_report_invalid_dates_rejected(
    async_client: AsyncClient,
    seed_admin_user,
):
    headers = seed_admin_user["headers"]
    # Reversed date range
    resp = await async_client.get(
        "/api/v1/attendance/report?period=custom&start_date=2026-10-10&end_date=2026-10-01",
        headers=headers,
    )
    assert resp.status_code == 400
    assert "start_date cannot be greater than end_date" in resp.json()["message"]


@pytest.mark.asyncio
async def test_employee_gets_only_own_report(
    async_client: AsyncClient,
    seed_employee_user,
    setup_multi_employee_attendance,
):
    # Logged in as regular employee (EMP_TEST_01)
    headers = seed_employee_user["headers"]
    resp = await async_client.get(
        "/api/v1/attendance/report?period=weekly",
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    # Returns only 1 employee (themselves)
    assert len(data["employees"]) == 1
    assert data["employees"][0]["employee_id"] == "EMP_TEST_01"

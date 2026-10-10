"""Integration tests for Company Holiday Calendar and Mid-Week Onboarding targets."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_holiday_crud_workflow(async_client: AsyncClient, seed_employee_user, seed_admin_user):
    """Test admin can create, list, and delete holidays, and non-admin is forbidden."""
    admin_headers = seed_admin_user["headers"]
    emp_headers = seed_employee_user["headers"]

    # 1. Non-admin forbidden
    res = await async_client.post(
        "/api/v1/holidays",
        json={"holiday_date": "2026-10-02", "name": "Gandhi Jayanti", "description": "National Holiday"},
        headers=emp_headers,
    )
    assert res.status_code == 403

    # 2. Admin creates holiday
    res = await async_client.post(
        "/api/v1/holidays",
        json={"holiday_date": "2026-10-02", "name": "Gandhi Jayanti", "description": "National Holiday"},
        headers=admin_headers,
    )
    assert res.status_code == 201
    created = res.json()
    assert created["holiday_date"] == "2026-10-02"
    assert created["name"] == "Gandhi Jayanti"
    holiday_id = created["holiday_id"]

    # 3. Duplicate creation conflicts
    res_dup = await async_client.post(
        "/api/v1/holidays",
        json={"holiday_date": "2026-10-02", "name": "Duplicate Holiday"},
        headers=admin_headers,
    )
    assert res_dup.status_code == 409

    # 4. List holidays
    res_list = await async_client.get("/api/v1/holidays", headers=emp_headers)
    assert res_list.status_code == 200
    holidays = res_list.json()
    assert len(holidays) >= 1
    assert any(h["holiday_id"] == holiday_id for h in holidays)

    # 5. Admin deletes holiday
    res_del = await async_client.delete(f"/api/v1/holidays/{holiday_id}", headers=admin_headers)
    assert res_del.status_code == 204

    # Verify deleted
    res_list_after = await async_client.get("/api/v1/holidays", headers=emp_headers)
    assert not any(h["holiday_id"] == holiday_id for h in res_list_after.json())


@pytest.mark.asyncio
async def test_holiday_and_onboarding_scales_weekly_evaluation(async_client: AsyncClient, test_db, seed_admin_user):
    """
    Test that holidays and mid-week onboarding hire_dates dynamically scale required targets
    during evaluate-week endpoint run.
    """
    admin_headers = seed_admin_user["headers"]

    # Week: 2026-09-21 (Mon) to 2026-09-27 (Sun) - completed past week
    week_start = "2026-09-21"

    # Configure a holiday on Wednesday 2026-09-23
    await test_db.holidays.insert_one(
        {
            "holiday_id": "hol-001",
            "holiday_date": "2026-09-23",
            "name": "Mid-Week Holiday",
            "description": "Company Day Off",
            "created_by": "admin",
        }
    )

    # Employee 1: Regular employee, works 2 days (10 hours).
    # Since 1 holiday exists, target drops to 2 days / 10 hours -> COMPLIANT (no violation).
    emp1_doc = {
        "employee_id": "EMP_HOL_01",
        "full_name": "Holiday Test Employee",
        "email": "emp_hol@example.com",
        "department": "Engineering",
        "is_active": True,
        "hire_date": "2026-01-01",
    }
    await test_db.employees.insert_one(emp1_doc)

    # Attendance logs for EMP_HOL_01: 2 completed days (5h each = 10h)
    await test_db.attendance.insert_many(
        [
            {
                "session_id": "sess-h1",
                "employee_id": "EMP_HOL_01",
                "work_date": "2026-09-21",
                "attendance_status": "COMPLETED",
                "duration_seconds": 5 * 3600,
            },
            {
                "session_id": "sess-h2",
                "employee_id": "EMP_HOL_01",
                "work_date": "2026-09-22",
                "attendance_status": "COMPLETED",
                "duration_seconds": 5 * 3600,
            },
        ]
    )

    # Employee 2: Joined on Thursday 2026-09-24.
    # Pre-hire workdays = Mon, Tue, Wed = 3 days. Total exempt = 1 holiday + 3 pre-hire = 4 days >= 3.
    # Required target drops to 0 days / 0 hrs -> EXEMPT even with 0 attendance logs!
    emp2_doc = {
        "employee_id": "EMP_NEW_02",
        "full_name": "Mid-Week Onboarding Joiner",
        "email": "emp_joiner@example.com",
        "department": "Design",
        "is_active": True,
        "hire_date": "2026-09-24",
    }
    await test_db.employees.insert_one(emp2_doc)

    # Trigger evaluation for that completed week
    res = await async_client.post(
        "/api/v1/violations/evaluate",
        json={"reference_date": week_start},
        headers=admin_headers,
    )
    assert res.status_code == 200
    results = res.json()

    emp1_res = next(r for r in results if r["employee_id"] == "EMP_HOL_01")
    assert emp1_res["holidays_count"] == 1
    assert emp1_res["required_days"] == 2
    assert emp1_res["required_hours"] == 10.0
    assert emp1_res["compliance_status"] == "COMPLIANT"

    emp2_res = next(r for r in results if r["employee_id"] == "EMP_NEW_02")
    assert emp2_res["holidays_count"] == 1
    assert emp2_res["pre_hire_workdays"] == 3
    assert emp2_res["required_days"] == 0
    assert emp2_res["compliance_status"] == "EXEMPT"

    # Verify 0 violations recorded in database
    violation_count = await test_db.policy_violations.count_documents({})
    assert violation_count == 0

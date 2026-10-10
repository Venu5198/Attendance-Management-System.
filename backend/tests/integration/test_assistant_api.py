"""Integration tests for the Natural Language Assistant API."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from app.utils.time_utils import get_work_date, now_utc


@pytest.mark.asyncio
async def test_assistant_query_fallback(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]
    resp = await async_client.post(
        "/api/v1/assistant/query",
        json={"query": "tell me a joke"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["intent"] == "GENERAL_HELP"
    assert len(data["suggestions"]) > 0


@pytest.mark.asyncio
async def test_assistant_query_my_hours(async_client: AsyncClient, seed_employee_user, test_db):
    headers = seed_employee_user["headers"]
    emp_id = seed_employee_user["employee"]["employee_id"]

    today = get_work_date(now_utc())

    # Seed an attendance record for today
    await test_db.attendance.insert_one(
        {
            "attendance_id": "att-assistant-01",
            "employee_id": emp_id,
            "work_date": today,
            "attendance_status": "COMPLETED",
            "duration_seconds": 5 * 3600,
        }
    )

    resp = await async_client.post(
        "/api/v1/assistant/query",
        json={"query": "how many hours have I worked this week?"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["intent"] == "MY_HOURS"
    assert "5.0 hour(s)" in data["answer"]
    assert data["data"]["days_logged"] == 1


@pytest.mark.asyncio
async def test_assistant_query_upcoming_holidays(async_client: AsyncClient, seed_employee_user, test_db):
    headers = seed_employee_user["headers"]

    # Seed an upcoming holiday
    await test_db.holidays.insert_one(
        {
            "holiday_id": "hol-assist-01",
            "holiday_date": "2026-12-25",
            "name": "Christmas Day",
            "description": "Public holiday",
            "created_by": "admin",
        }
    )

    resp = await async_client.post(
        "/api/v1/assistant/query",
        json={"query": "when is the next holiday?"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["intent"] == "UPCOMING_HOLIDAYS"
    assert "Christmas Day" in data["answer"]
    assert len(data["data"]) >= 1


@pytest.mark.asyncio
async def test_assistant_query_violations_admin(async_client: AsyncClient, seed_admin_user, test_db):
    headers = seed_admin_user["headers"]

    # Seed a policy violation
    await test_db.policy_violations.insert_one(
        {
            "violation_id": "viol-assist-01",
            "employee_id": "EMP_VIOL_01",
            "employee_name": "Alice Green",
            "week_label": "2026-W40",
            "office_days": 1,
            "office_hours": 4.5,
            "violation_reasons": ["Office days below requirement"],
            "evaluated_at": datetime.now(UTC),
            "notification_sent": False,
        }
    )

    resp = await async_client.post(
        "/api/v1/assistant/query",
        json={"query": "who is non-compliant this week?"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["intent"] == "VIOLATIONS_CHECK"
    assert "2026-W40" in data["answer"]
    assert "Alice Green" in data["answer"]


@pytest.mark.asyncio
async def test_assistant_query_today_presence(async_client: AsyncClient, seed_employee_user, test_db):
    headers = seed_employee_user["headers"]
    today = get_work_date(now_utc())

    await test_db.attendance.insert_one(
        {
            "attendance_id": "att-presence-01",
            "employee_id": "EMP_OTHER",
            "work_date": today,
            "attendance_status": "IN_PROGRESS",
        }
    )

    resp = await async_client.post(
        "/api/v1/assistant/query",
        json={"query": "who is in the office today?"},
        headers=headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["intent"] == "TODAY_PRESENCE"
    assert data["data"]["active_now"] >= 1

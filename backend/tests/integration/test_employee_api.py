"""Integration tests for Employee management API and RBAC permissions."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_admin_create_employee_success(async_client: AsyncClient, seed_admin_user):
    headers = seed_admin_user["headers"]
    payload = {
        "employee_id": "EMP_001",
        "full_name": "John Doe",
        "email": "john.doe@company.com",
        "department": "Engineering",
        "role": "EMPLOYEE",
    }
    resp = await async_client.post("/api/v1/employees", json=payload, headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["employee_id"] == "EMP_001"
    assert data["full_name"] == "John Doe"
    assert data["is_active"] is True


@pytest.mark.asyncio
async def test_duplicate_employee_id_rejected(async_client: AsyncClient, seed_admin_user):
    headers = seed_admin_user["headers"]
    payload = {
        "employee_id": "EMP_DUP",
        "full_name": "First User",
        "email": "first@company.com",
        "department": "Engineering",
    }
    resp1 = await async_client.post("/api/v1/employees", json=payload, headers=headers)
    assert resp1.status_code == 201

    payload_dup = {
        "employee_id": "EMP_DUP",
        "full_name": "Second User",
        "email": "second@company.com",
        "department": "Design",
    }
    resp2 = await async_client.post("/api/v1/employees", json=payload_dup, headers=headers)
    assert resp2.status_code == 409
    assert "already exists" in resp2.json()["message"]


@pytest.mark.asyncio
async def test_employee_cannot_create_employee(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]
    payload = {
        "employee_id": "EMP_ROGUE",
        "full_name": "Rogue User",
        "email": "rogue@company.com",
        "department": "Operations",
    }
    resp = await async_client.post("/api/v1/employees", json=payload, headers=headers)
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_deactivate_employee(async_client: AsyncClient, seed_admin_user):
    headers = seed_admin_user["headers"]
    payload = {
        "employee_id": "EMP_DEACT",
        "full_name": "To Deactivate",
        "email": "deact@company.com",
        "department": "HR",
    }
    await async_client.post("/api/v1/employees", json=payload, headers=headers)

    del_resp = await async_client.delete("/api/v1/employees/EMP_DEACT", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json()["is_active"] is False

"""Integration tests for Authentication API endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_auth_login_success(async_client: AsyncClient, seed_admin_user):
    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "testadmin", "password": "AdminSecret123!"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["role"] == "ADMIN"
    assert data["username"] == "testadmin"
    assert "password" not in data
    assert "password_hash" not in data


@pytest.mark.asyncio
async def test_auth_login_invalid_credentials(async_client: AsyncClient, seed_admin_user):
    resp = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "testadmin", "password": "WrongPassword!"},
    )
    assert resp.status_code == 401
    assert "Invalid username or password" in resp.json()["message"]


@pytest.mark.asyncio
async def test_auth_unauthenticated_access_rejected(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_auth_get_me(async_client: AsyncClient, seed_employee_user):
    headers = seed_employee_user["headers"]
    resp = await async_client.get("/api/v1/auth/me", headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "testemp"
    assert data["role"] == "EMPLOYEE"
    assert data["employee_id"] == "EMP_TEST_01"


@pytest.mark.asyncio
async def test_auth_refresh_token_flow(async_client: AsyncClient, seed_employee_user):
    """Log in, receive refresh token, use it to get a fresh access token."""
    login_resp = await async_client.post(
        "/api/v1/auth/login",
        json={"username": "testemp", "password": "EmpSecret123!"},
    )
    assert login_resp.status_code == 200
    login_data = login_resp.json()
    refresh_token = login_data["refresh_token"]
    assert refresh_token is not None

    # Use refresh token
    refresh_resp = await async_client.post(
        "/api/v1/auth/refresh-token",
        json={"refresh_token": refresh_token},
    )
    assert refresh_resp.status_code == 200
    refreshed_data = refresh_resp.json()
    assert refreshed_data["access_token"] is not None
    assert refreshed_data["refresh_token"] is not None
    assert refreshed_data["username"] == "testemp"

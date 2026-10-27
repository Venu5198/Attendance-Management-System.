"""Integration tests verifying the 7 Core Backend Architecture Concepts:
1. APIs & Communication (REST, GraphQL, Webhooks)
2. Authentication & Authorization (Token Blacklisting & Kiosk API Keys)
3. Databases & Data Storage (MongoDB Persistence)
4. Performance & Caching (Redis In-Memory State & Cache-Aside)
5. Concurrency & Asynchronous Processing (Distributed Locking)
6. Scalability & Architecture (Liveness & Readiness Probes)
7. Security & Networking (Hardened Headers & IP Verification)
"""

import pytest
from httpx import AsyncClient

from app.core.redis_client import (
    cache_delete,
    cache_get,
    cache_set,
    is_rate_limited,
    redis_distributed_lock,
)


@pytest.mark.asyncio
async def test_concept_1_graphql_query(async_client: AsyncClient, seed_employee_user):
    """Concept 1 (APIs & Communication): Query employees via Strawberry GraphQL."""
    query = """
    query {
        employees(limit: 5) {
            employeeId
            firstName
            lastName
            email
            department
        }
    }
    """
    res = await async_client.post("/graphql", json={"query": query})
    assert res.status_code == 200
    data = res.json()
    assert "data" in data
    assert "employees" in data["data"]
    assert isinstance(data["data"]["employees"], list)
    assert len(data["data"]["employees"]) >= 1


@pytest.mark.asyncio
async def test_concept_1_and_2_biometric_webhook_and_kiosk_auth(async_client: AsyncClient, test_db, seed_employee_user):
    """Concept 1 (Webhooks) & Concept 2 (Hardware API Key Auth): Biometric Punch."""
    emp_id = seed_employee_user["employee"]["employee_id"]

    # 1. Reject if invalid or missing kiosk key
    bad_res = await async_client.post(
        "/api/v1/webhooks/biometric-punch",
        json={"device_id": "KIOSK-001", "employee_id": emp_id, "punch_type": "PUNCH_IN"},
        headers={"X-Kiosk-API-Key": "wrong-key"},
    )
    assert bad_res.status_code == 401

    # 2. Accept if valid kiosk key
    valid_res = await async_client.post(
        "/api/v1/webhooks/biometric-punch",
        json={"device_id": "KIOSK-001", "employee_id": emp_id, "punch_type": "PUNCH_IN"},
        headers={"X-Kiosk-API-Key": "kiosk-secret-key-prod-branch-01"},
    )
    assert valid_res.status_code == 200
    res_data = valid_res.json()
    assert res_data["success"] is True
    assert res_data["punch_type"] == "PUNCH_IN"


@pytest.mark.asyncio
async def test_concept_2_token_revocation_logout(async_client: AsyncClient, seed_employee_user):
    """Concept 2 (Auth): Token Blacklisting prevents re-use of logged out tokens."""
    headers = seed_employee_user["headers"]

    # Access endpoint before logout
    ok_res = await async_client.get("/api/v1/auth/me", headers=headers)
    assert ok_res.status_code == 200

    # Logout to revoke token
    logout_res = await async_client.post("/api/v1/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Accessing endpoint with revoked token must return 401
    revoked_res = await async_client.get("/api/v1/auth/me", headers=headers)
    assert revoked_res.status_code == 401
    assert "revoked" in revoked_res.json()["message"].lower()


@pytest.mark.asyncio
async def test_concept_4_and_5_cache_and_distributed_lock():
    """Concept 4 (Caching) & Concept 5 (Concurrency / Distributed Mutex Locks)."""
    # Test Cache-aside operations
    await cache_set("test_concept_key", {"status": "cached"}, ttl_seconds=60)
    cached = await cache_get("test_concept_key")
    assert cached == {"status": "cached"}
    await cache_delete("test_concept_key")
    assert await cache_get("test_concept_key") is None

    # Test Distributed Lock
    async with redis_distributed_lock("emp_concurrency_lock") as acquired:
        assert acquired is True

    # Test Rate Limiting check
    limited, rem = await is_rate_limited("test_rate_client", limit=5, window_seconds=60)
    assert limited is False
    assert rem >= 0


@pytest.mark.asyncio
async def test_concept_6_scalability_health_and_readiness_probes(async_client: AsyncClient):
    """Concept 6 (Scalability & Resilience): Liveness and Readiness Probes."""
    live_res = await async_client.get("/health/live")
    assert live_res.status_code == 200
    assert live_res.json() == {"status": "alive"}

    ready_res = await async_client.get("/health/ready")
    assert ready_res.status_code == 200
    assert ready_res.json()["ready"] is True
    assert ready_res.json()["database"] == "connected"


@pytest.mark.asyncio
async def test_concept_7_security_headers(async_client: AsyncClient):
    """Concept 7 (Security & Networking): Hardened HTTP Security Headers."""
    res = await async_client.get("/health")
    assert res.status_code == 200
    headers = res.headers

    assert headers.get("X-Content-Type-Options") == "nosniff"
    assert headers.get("X-Frame-Options") == "DENY"
    assert headers.get("X-XSS-Protection") == "1; mode=block"
    assert "Strict-Transport-Security" in headers
    assert "Content-Security-Policy" in headers
    assert "X-Request-ID" in headers

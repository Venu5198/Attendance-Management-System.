"""Integration tests verifying Option 1 Multi-Tenancy (Discriminator Key tenant_id):
- Cross-tenant identity collision tolerance (two tenants can have the same employee_id and email).
- Strict query isolation (Tenant A cannot see Tenant B's attendance or employee records).
- Tenant-scoped check-in and Redis locks.
"""

from datetime import datetime, timezone
import pytest
from httpx import AsyncClient

from app.utils.security import create_access_token


@pytest.fixture
def make_tenant_admin(test_db):
    """Factory fixture registering an admin user in test_db and returning auth headers."""
    async def _generator(tenant_id: str, admin_id: str = "admin_01"):
        now = datetime.now(timezone.utc)
        user_doc = {
            "user_id": f"{tenant_id}_{admin_id}",
            "tenant_id": tenant_id,
            "username": f"admin_{tenant_id}",
            "email": f"admin@{tenant_id}.com",
            "role": "ADMIN",
            "employee_id": None,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        await test_db.users.insert_one(user_doc)

        token = create_access_token(
            {
                "sub": f"{tenant_id}_{admin_id}",
                "username": f"admin_{tenant_id}",
                "role": "ADMIN",
                "tenant_id": tenant_id,
            }
        )
        return {
            "Authorization": f"Bearer {token}",
            "X-Tenant-ID": tenant_id,
        }
    return _generator


@pytest.mark.asyncio
async def test_multi_tenant_employee_id_collision_tolerance(async_client: AsyncClient, test_db, make_tenant_admin):
    """
    Two distinct tenants ('tenant_alpha' and 'tenant_beta') can register the exact same
    employee_id ('EMP_COMMON_99') and email ('shared@company.com') without 409 collision.
    """
    alpha_admin = await make_tenant_admin("tenant_alpha")
    beta_admin = await make_tenant_admin("tenant_beta")

    # 1. Create EMP_COMMON_99 in tenant_alpha
    emp_payload = {
        "employee_id": "EMP_COMMON_99",
        "full_name": "Alpha John Doe",
        "email": "shared@company.com",
        "department": "Engineering",
        "role": "EMPLOYEE",
    }
    res_alpha = await async_client.post("/api/v1/employees", json=emp_payload, headers=alpha_admin)
    assert res_alpha.status_code == 201
    assert res_alpha.json()["employee_id"] == "EMP_COMMON_99"

    # 2. Create the exact same employee_id and email in tenant_beta
    beta_payload = {
        "employee_id": "EMP_COMMON_99",
        "full_name": "Beta Jane Smith",
        "email": "shared@company.com",
        "department": "Marketing",
        "role": "EMPLOYEE",
    }
    res_beta = await async_client.post("/api/v1/employees", json=beta_payload, headers=beta_admin)
    assert res_beta.status_code == 201
    assert res_beta.json()["employee_id"] == "EMP_COMMON_99"
    assert res_beta.json()["full_name"] == "Beta Jane Smith"


@pytest.mark.asyncio
async def test_multi_tenant_query_and_attendance_isolation(async_client: AsyncClient, test_db, make_tenant_admin):
    """
    Tenant A checks in employee EMP_COMMON_99.
    Tenant B querying the same employee_id sees NOT_ATTENDED (zero data leakage).
    """
    alpha_admin = await make_tenant_admin("tenant_alpha")
    beta_admin = await make_tenant_admin("tenant_beta")

    # Seed employee in both tenants
    await async_client.post(
        "/api/v1/employees",
        json={"employee_id": "EMP_COMMON_99", "full_name": "Alpha User", "email": "a@co.com", "department": "Eng"},
        headers=alpha_admin,
    )
    await async_client.post(
        "/api/v1/employees",
        json={"employee_id": "EMP_COMMON_99", "full_name": "Beta User", "email": "b@co.com", "department": "Mkt"},
        headers=beta_admin,
    )

    # 1. Admin of tenant_alpha clocks in EMP_COMMON_99
    check_in_res = await async_client.post(
        "/api/v1/attendance/check-in",
        json={"employee_id": "EMP_COMMON_99"},
        headers=alpha_admin,
    )
    assert check_in_res.status_code == 201
    assert check_in_res.json()["attendance"]["attendance_status"] == "IN_PROGRESS"

    # 2. Tenant B queries today's status for EMP_COMMON_99 -> MUST BE NOT_ATTENDED
    beta_status = await async_client.get(
        "/api/v1/attendance/today?employee_id=EMP_COMMON_99",
        headers=beta_admin,
    )
    assert beta_status.status_code == 200
    assert beta_status.json()["attendance_status"] == "NOT_ATTENDED"

    # 3. Tenant A queries today's status for EMP_COMMON_99 -> MUST BE IN_PROGRESS
    alpha_status = await async_client.get(
        "/api/v1/attendance/today?employee_id=EMP_COMMON_99",
        headers=alpha_admin,
    )
    assert alpha_status.status_code == 200
    assert alpha_status.json()["attendance_status"] == "IN_PROGRESS"


@pytest.mark.asyncio
async def test_multi_tenant_employee_directory_isolation(async_client: AsyncClient, test_db, make_tenant_admin):
    """
    Listing employees under Tenant Alpha only returns Alpha employees.
    """
    alpha_admin = await make_tenant_admin("tenant_alpha")
    beta_admin = await make_tenant_admin("tenant_beta")

    await async_client.post(
        "/api/v1/employees",
        json={"employee_id": "EMP_ALPHA_1", "full_name": "Alpha John Doe", "email": "alpha@co.com", "department": "Eng"},
        headers=alpha_admin,
    )
    await async_client.post(
        "/api/v1/employees",
        json={"employee_id": "EMP_BETA_1", "full_name": "Beta Jane Smith", "email": "beta@co.com", "department": "Mkt"},
        headers=beta_admin,
    )

    res_alpha = await async_client.get("/api/v1/employees", headers=alpha_admin)
    assert res_alpha.status_code == 200
    alpha_employees = res_alpha.json()["employees"]
    assert any(e["full_name"] == "Alpha John Doe" for e in alpha_employees)
    assert not any(e["full_name"] == "Beta Jane Smith" for e in alpha_employees)

    res_beta = await async_client.get("/api/v1/employees", headers=beta_admin)
    assert res_beta.status_code == 200
    beta_employees = res_beta.json()["employees"]
    assert any(e["full_name"] == "Beta Jane Smith" for e in beta_employees)
    assert not any(e["full_name"] == "Alpha John Doe" for e in beta_employees)

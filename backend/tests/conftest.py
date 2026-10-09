"""Pytest fixtures for unit and integration testing."""

from collections.abc import AsyncGenerator
from datetime import UTC

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from pymongo import AsyncMongoClient

from app.config import get_settings
from app.database import db_manager, ensure_indexes
from app.main import app
from app.utils.security import create_access_token, get_password_hash


@pytest_asyncio.fixture(scope="function")
async def test_db():
    """Fixture initializing and cleaning up a dedicated test database per test session."""
    settings = get_settings()
    test_db_name = "test_attendance_management_db"
    client = AsyncMongoClient(settings.MONGODB_URI)
    db = client[test_db_name]

    # Point db_manager to the test database
    db_manager.client = client
    db_manager.db = db

    await ensure_indexes(db)
    yield db

    await client.drop_database(test_db_name)
    await client.close()


@pytest_asyncio.fixture(autouse=True)
async def clean_collections(test_db):
    """Clean collections before each test to maintain strict isolation."""
    await test_db.attendance.delete_many({})
    await test_db.employees.delete_many({})
    await test_db.users.delete_many({})
    await test_db.policy_violations.delete_many({})
    await test_db.notification_logs.delete_many({})
    yield


@pytest_asyncio.fixture
async def async_client() -> AsyncGenerator[AsyncClient, None]:
    """HTTPX AsyncClient bound to the FastAPI application."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest_asyncio.fixture
async def seed_admin_user(test_db):
    """Seed an admin user and return credentials + token."""
    user_doc = {
        "user_id": "admin-user-001",
        "username": "testadmin",
        "email": "admin@example.com",
        "password_hash": get_password_hash("AdminSecret123!"),
        "role": "ADMIN",
        "employee_id": None,
        "is_active": True,
    }
    await test_db.users.insert_one(user_doc)
    token = create_access_token({"sub": "admin-user-001", "username": "testadmin", "role": "ADMIN"})
    return {"user": user_doc, "token": token, "headers": {"Authorization": f"Bearer {token}"}}


@pytest_asyncio.fixture
async def seed_employee_user(test_db):
    """Seed an employee and associated user account, returning token."""
    from datetime import datetime

    now = datetime.now(UTC)
    emp_doc = {
        "employee_id": "EMP_TEST_01",
        "full_name": "Test Employee",
        "email": "test.emp@example.com",
        "department": "Engineering",
        "role": "EMPLOYEE",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await test_db.employees.insert_one(emp_doc)

    user_doc = {
        "user_id": "emp-user-001",
        "username": "testemp",
        "email": "test.emp@example.com",
        "password_hash": get_password_hash("EmpSecret123!"),
        "role": "EMPLOYEE",
        "employee_id": "EMP_TEST_01",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    await test_db.users.insert_one(user_doc)
    token = create_access_token(
        {
            "sub": "emp-user-001",
            "username": "testemp",
            "role": "EMPLOYEE",
            "employee_id": "EMP_TEST_01",
        }
    )
    return {
        "employee": emp_doc,
        "user": user_doc,
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
    }

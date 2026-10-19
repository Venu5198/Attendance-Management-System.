"""Authentication and user management service."""

import logging
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import HTTPException, status
from pymongo.asynchronous.database import AsyncDatabase

from app.schemas.auth import TokenResponse, UserCreate, UserLogin, UserResponse
from app.utils.security import create_access_token, get_password_hash, verify_password

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, db: AsyncDatabase, tenant_id: str = "default"):
        self.db = db
        self.users = db.users
        self.employees = db.employees
        self.tenant_id = tenant_id

    async def authenticate_user(self, credentials: UserLogin) -> TokenResponse:
        """Authenticate user by username or email scoped by tenant_id and return JWT access token."""
        effective_tenant = getattr(credentials, "tenant_id", None) or self.tenant_id

        # 1. Search scoped to tenant
        user = await self.users.find_one(
            {
                "tenant_id": effective_tenant,
                "$or": [
                    {"username": credentials.username},
                    {"email": credentials.username},
                ],
            }
        )
        # 2. Fallback for backwards compatibility with un-scoped legacy documents
        if not user:
            user = await self.users.find_one(
                {
                    "$or": [
                        {"username": credentials.username},
                        {"email": credentials.username},
                    ]
                }
            )

        if not user or not verify_password(credentials.password, user.get("password_hash", "")):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is deactivated",
            )

        resolved_tenant = user.get("tenant_id") or effective_tenant
        token_payload = {
            "sub": user["user_id"],
            "username": user["username"],
            "role": user["role"],
            "employee_id": user.get("employee_id"),
            "tenant_id": resolved_tenant,
        }
        token = create_access_token(token_payload)

        from datetime import timedelta

        refresh_token = create_access_token(
            {
                "sub": user["user_id"],
                "tenant_id": resolved_tenant,
                "type": "refresh",
            },
            expires_delta=timedelta(days=7),
        )

        return TokenResponse(
            access_token=token,
            refresh_token=refresh_token,
            expires_in_seconds=480 * 60,
            user_id=user["user_id"],
            username=user["username"],
            role=user["role"],
            employee_id=user.get("employee_id"),
            tenant_id=resolved_tenant,
        )

    async def refresh_access_token(self, refresh_token: str) -> TokenResponse:
        """Validate refresh token and issue a fresh token pair."""
        from datetime import timedelta

        from app.utils.security import decode_access_token

        try:
            payload = decode_access_token(refresh_token)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            ) from None

        if payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Provided token is not a refresh token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id = payload.get("sub")
        user = await self.users.find_one({"user_id": user_id})
        if not user or not user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User account is invalid or deactivated",
                headers={"WWW-Authenticate": "Bearer"},
            )

        new_access_token = create_access_token(
            {
                "sub": user["user_id"],
                "username": user["username"],
                "role": user["role"],
                "employee_id": user.get("employee_id"),
            }
        )
        new_refresh_token = create_access_token(
            {
                "sub": user["user_id"],
                "type": "refresh",
            },
            expires_delta=timedelta(days=7),
        )

        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            expires_in_seconds=480 * 60,
            user_id=user["user_id"],
            username=user["username"],
            role=user["role"],
            employee_id=user.get("employee_id"),
        )

    async def create_user(self, user_in: UserCreate) -> UserResponse:
        """Create a new user with hashed password scoped by tenant_id."""
        effective_tenant = getattr(user_in, "tenant_id", None) or self.tenant_id

        # Check existing username in this tenant
        existing_username = await self.users.find_one({"tenant_id": effective_tenant, "username": user_in.username})
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Username '{user_in.username}' is already taken in this organization",
            )

        # Check existing email in this tenant
        existing_email = await self.users.find_one({"tenant_id": effective_tenant, "email": user_in.email})
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email '{user_in.email}' is already registered in this organization",
            )

        # If employee_id provided, verify employee exists in the same tenant and has no duplicate account
        if user_in.employee_id:
            emp = await self.employees.find_one({"tenant_id": effective_tenant, "employee_id": user_in.employee_id})
            if not emp:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Employee '{user_in.employee_id}' does not exist in this organization",
                )
            existing_emp_user = await self.users.find_one(
                {"tenant_id": effective_tenant, "employee_id": user_in.employee_id}
            )
            if existing_emp_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A user account for employee '{user_in.employee_id}' already exists",
                )

        now = datetime.now(UTC)
        user_doc = {
            "user_id": str(uuid4()),
            "tenant_id": effective_tenant,
            "username": user_in.username,
            "email": user_in.email,
            "password_hash": get_password_hash(user_in.password),
            "role": user_in.role,
            "employee_id": user_in.employee_id,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        }
        await self.users.insert_one(user_doc)

        return UserResponse(
            user_id=user_doc["user_id"],
            username=user_doc["username"],
            email=user_doc["email"],
            role=user_doc["role"],
            employee_id=user_doc.get("employee_id"),
            tenant_id=effective_tenant,
            is_active=user_doc["is_active"],
            created_at=user_doc["created_at"],
        )

    async def get_user_by_id(self, user_id: str) -> dict | None:
        """Fetch user by user_id."""
        return await self.users.find_one({"user_id": user_id})

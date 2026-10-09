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
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.users = db.users
        self.employees = db.employees

    async def authenticate_user(self, credentials: UserLogin) -> TokenResponse:
        """Authenticate user by username or email and return JWT access token."""
        # Find user by username or email
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

        token_payload = {
            "sub": user["user_id"],
            "username": user["username"],
            "role": user["role"],
            "employee_id": user.get("employee_id"),
        }
        token = create_access_token(token_payload)

        return TokenResponse(
            access_token=token,
            expires_in_seconds=480 * 60,
            user_id=user["user_id"],
            username=user["username"],
            role=user["role"],
            employee_id=user.get("employee_id"),
        )

    async def create_user(self, user_in: UserCreate) -> UserResponse:
        """Create a new user with hashed password."""
        # Check existing username
        existing_username = await self.users.find_one({"username": user_in.username})
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Username '{user_in.username}' is already taken",
            )

        # Check existing email
        existing_email = await self.users.find_one({"email": user_in.email})
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email '{user_in.email}' is already registered",
            )

        # If employee_id provided, verify employee exists and has no duplicate account
        if user_in.employee_id:
            emp = await self.employees.find_one({"employee_id": user_in.employee_id})
            if not emp:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Employee '{user_in.employee_id}' does not exist",
                )
            existing_emp_user = await self.users.find_one({"employee_id": user_in.employee_id})
            if existing_emp_user:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"A user account for employee '{user_in.employee_id}' already exists",
                )

        now = datetime.now(UTC)
        user_doc = {
            "user_id": str(uuid4()),
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
            is_active=user_doc["is_active"],
            created_at=user_doc["created_at"],
        )

    async def get_user_by_id(self, user_id: str) -> dict | None:
        """Fetch user by user_id."""
        return await self.users.find_one({"user_id": user_id})

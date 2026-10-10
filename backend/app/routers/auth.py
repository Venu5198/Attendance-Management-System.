"""Authentication API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.schemas.auth import RefreshTokenRequest, TokenResponse, UserCreate, UserLogin, UserResponse
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login to obtain JWT access token",
)
async def login(
    credentials: UserLogin,
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Authenticate with username/email and password to receive JWT bearer token."""
    service = AuthService(db)
    return await service.authenticate_user(credentials)


@router.post(
    "/refresh-token",
    response_model=TokenResponse,
    summary="Renew access token using refresh token",
)
async def refresh_access_token(
    body: RefreshTokenRequest,
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Renew access token silently without re-entering credentials."""
    service = AuthService(db)
    return await service.refresh_access_token(body.refresh_token)


@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account (Admin only)",
)
async def register_user(
    user_in: UserCreate,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Admin-only endpoint to provision user credentials for employees or administrators."""
    service = AuthService(db)
    return await service.create_user(user_in)


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current authenticated user profile",
)
async def get_current_user_profile(
    current_user: Annotated[dict, Depends(get_current_user)],
):
    """Returns the profile of the current authenticated user."""
    return UserResponse(
        user_id=current_user["user_id"],
        username=current_user["username"],
        email=current_user["email"],
        role=current_user["role"],
        employee_id=current_user.get("employee_id"),
        is_active=current_user.get("is_active", True),
        created_at=current_user["created_at"],
    )

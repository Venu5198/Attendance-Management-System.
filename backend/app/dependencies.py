"""FastAPI authentication and RBAC authorization dependencies."""

from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.schemas.auth import TokenPayload
from app.utils.security import decode_access_token

security = HTTPBearer(auto_error=False)


async def get_current_user_payload(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(security)],
) -> TokenPayload:
    """Decode and validate JWT bearer token."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials. Bearer token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        payload_dict = decode_access_token(token)
        return TokenPayload(**payload_dict)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None
    except (jwt.InvalidTokenError, Exception):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


async def get_current_user(
    payload: Annotated[TokenPayload, Depends(get_current_user_payload)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
) -> dict:
    """Retrieve full user document from database and verify active status."""
    user = await db.users.find_one({"user_id": payload.sub})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with token no longer exists.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account has been deactivated.",
        )
    return user


def require_role(required_role: str):
    """Dependency factory checking if current user has the specified role."""

    async def role_checker(current_user: Annotated[dict, Depends(get_current_user)]) -> dict:
        user_role = current_user.get("role", "EMPLOYEE")
        if user_role != required_role:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden: requires '{required_role}' role.",
            )
        return current_user

    return role_checker


# Role dependencies
require_admin = require_role("ADMIN")


def verify_employee_ownership(current_user: dict, target_employee_id: str) -> None:
    """
    Verify that current user either has ADMIN role or owns the requested employee_id.
    Prevents cross-employee data access.
    """
    if current_user.get("role") == "ADMIN":
        return
    if current_user.get("employee_id") != target_employee_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: you do not have permission to access another employee's records.",
        )

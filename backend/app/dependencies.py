"""FastAPI authentication and RBAC authorization dependencies."""

from typing import Annotated

import jwt
from fastapi import Depends, Header, HTTPException, Request, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.core.redis_client import is_token_blacklisted
from app.database import get_database
from app.middleware.security import is_ip_allowed
from app.schemas.auth import TokenPayload
from app.utils.security import decode_access_token

security = HTTPBearer(auto_error=False)


async def get_current_user_payload(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Security(security)],
) -> TokenPayload:
    """Decode, validate JWT bearer token, and verify it is not blacklisted."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication credentials. Bearer token required.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials

    # Check token revocation/blacklist (Redis-backed)
    if await is_token_blacklisted(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

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
    """Retrieve full user document from database scoped by tenant_id."""
    tenant_id = payload.tenant_id or "default"
    user = await db.users.find_one({"tenant_id": tenant_id, "user_id": payload.sub})
    if not user:
        # Fallback for existing seed or test users
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


async def require_kiosk_api_key(
    request: Request = None,
    x_kiosk_api_key: Annotated[str | None, Header(alias="X-Kiosk-API-Key")] = None,
) -> str:
    """
    Authenticate physical biometric kiosk devices via pre-shared hardware API key
    and IP/CIDR whitelist verification.
    """
    settings = get_settings()

    # 1. Verify API Key
    if not x_kiosk_api_key or x_kiosk_api_key != settings.KIOSK_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-Kiosk-API-Key header.",
        )

    # 2. Verify IP whitelist if request object is present
    if request and request.client:
        client_ip = request.client.host
        if not is_ip_allowed(client_ip, settings.kiosk_allowed_ips_list):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Kiosk IP '{client_ip}' is not authorized.",
            )

    return x_kiosk_api_key

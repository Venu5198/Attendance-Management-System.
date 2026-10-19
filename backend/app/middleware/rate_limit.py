"""Rate limiting middleware and dependency."""

import logging
from fastapi import HTTPException, Request, status

from app.config import get_settings
from app.core.redis_client import is_rate_limited

logger = logging.getLogger(__name__)


async def rate_limiter_dependency(request: Request, max_requests: int = 60, window_seconds: int = 60):
    """FastAPI dependency to rate limit requests based on client IP or user identity."""
    client_ip = request.client.host if request.client else "unknown"
    path = request.url.path
    identifier = f"{client_ip}:{path}"

    limited, remaining = await is_rate_limited(identifier, limit=max_requests, window_seconds=window_seconds)
    if limited:
        logger.warning("Rate limit exceeded for client %s on %s", client_ip, path)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please slow down and try again shortly.",
            headers={"Retry-After": str(window_seconds)},
        )

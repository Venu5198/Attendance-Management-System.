"""Health check, Liveness, and Readiness probes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.core.redis_client import redis_manager
from app.database import get_database

router = APIRouter(tags=["Health & Reliability"])


@router.get("/health", summary="Application and database health check")
async def health_check(
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Verify application uptime, MongoDB connectivity, and Redis cache status."""
    settings = get_settings()

    # 1. MongoDB check
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception as exc:
        db_status = f"unreachable: {exc!s}"

    # 2. Redis check
    redis_status = "connected" if redis_manager.is_available else "fallback_in_memory"

    is_healthy = db_status == "connected"
    return {
        "status": "healthy" if is_healthy else "degraded",
        "app_name": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
        "cache_redis": redis_status,
    }


@router.get("/health/live", summary="Kubernetes / Docker Liveness probe")
async def liveness_probe():
    """Returns 200 if the web process is alive."""
    return {"status": "alive"}


@router.get("/health/ready", summary="Kubernetes / Docker Readiness probe")
async def readiness_probe(
    response: Response,
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Returns 200 if ready to receive traffic, or 503 if primary database is down."""
    try:
        await db.command("ping")
        return {
            "ready": True,
            "database": "connected",
            "cache": "connected" if redis_manager.is_available else "fallback",
        }
    except Exception as exc:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        return {
            "ready": False,
            "error": str(exc),
        }

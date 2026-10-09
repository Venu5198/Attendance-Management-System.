"""Health check API route."""

from typing import Annotated

from fastapi import APIRouter, Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.database import get_database

router = APIRouter(tags=["Health"])


@router.get("/health", summary="Application and database health check")
async def health_check(
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Verify application uptime and MongoDB connectivity."""
    settings = get_settings()
    try:
        await db.command("ping")
        db_status = "connected"
    except Exception as exc:
        db_status = f"unreachable: {exc!s}"

    return {
        "status": "healthy" if db_status == "connected" else "degraded",
        "app_name": settings.PROJECT_NAME,
        "environment": settings.ENVIRONMENT,
        "database": db_status,
    }

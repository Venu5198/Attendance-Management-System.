"""FastAPI application entry point, lifecycle management, and exception handlers."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.core.redis_client import close_redis_connection, connect_to_redis
from app.database import close_mongo_connection, connect_to_mongo
from app.middleware.security import SecurityHeadersMiddleware
from app.routers import (
    assistant,
    attendance,
    auth,
    employees,
    health,
    holidays,
    leaves,
    reports,
    tasks_router,
    violations,
    webhooks,
    tenants_router,
    audit_router,
    websocket_router,
)
from app.routers.graphql_router import graphql_app
from app.scheduler.jobs import shutdown_scheduler, start_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("attendance_backend")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager for startup and shutdown routines."""
    logger.info("Initializing application resources...")
    # 1. Connect to MongoDB & ensure indexes
    await connect_to_mongo()

    # 2. Connect to Redis (distributed locks, cache, token blacklist)
    await connect_to_redis()

    # 3. Start background scheduler
    start_scheduler()

    yield

    # 4. Shutdown background scheduler
    shutdown_scheduler()

    # 5. Close Redis connection
    await close_redis_connection()

    # 6. Disconnect from MongoDB
    await close_mongo_connection()
    logger.info("Application resources cleaned up successfully.")


def create_application() -> FastAPI:
    """Factory function to build and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title=settings.PROJECT_NAME,
        description="Centralized Employee Attendance Management and WFH Compliance Backend",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    # 1. Production Security Headers Middleware (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
    app.add_middleware(SecurityHeadersMiddleware)

    # 2. CORS configuration
    origins = settings.cors_origins_list
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins if origins else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Centralized Exception Handlers
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": True,
                "status_code": exc.status_code,
                "message": exc.detail,
            },
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": True,
                "status_code": status.HTTP_422_UNPROCESSABLE_ENTITY,
                "message": "Input validation error",
                "details": exc.errors(),
            },
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.exception("Unhandled application exception: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": True,
                "status_code": status.HTTP_500_INTERNAL_SERVER_ERROR,
                "message": "An unexpected internal server error occurred. Please try again later.",
            },
        )

    # Register API Routers
    api_prefix = settings.API_V1_PREFIX
    app.include_router(health.router, prefix=api_prefix)
    app.include_router(auth.router, prefix=api_prefix)
    app.include_router(employees.router, prefix=api_prefix)
    app.include_router(attendance.router, prefix=api_prefix)
    app.include_router(leaves.router, prefix=api_prefix)
    app.include_router(holidays.router, prefix=api_prefix)
    app.include_router(reports.router, prefix=api_prefix)
    app.include_router(violations.router, prefix=api_prefix)
    app.include_router(assistant.router, prefix=api_prefix)
    app.include_router(webhooks.router, prefix=api_prefix)
    app.include_router(tasks_router.router, prefix=api_prefix)
    app.include_router(tenants_router.router, prefix=api_prefix)
    app.include_router(audit_router.router, prefix=api_prefix)
    app.include_router(websocket_router.router)

    # Strawberry GraphQL endpoints
    app.include_router(graphql_app, prefix="/graphql", tags=["GraphQL"])
    app.include_router(graphql_app, prefix=f"{api_prefix}/graphql", tags=["GraphQL"])

    # Also register root health check
    app.include_router(health.router)

    # 3. Prometheus Metrics Instrumentation & /metrics exposition
    from prometheus_fastapi_instrumentator import Instrumentator
    Instrumentator(
        should_group_status_codes=False,
        should_ignore_untemplated=True,
        excluded_handlers=["/metrics", "/health", "/health/live", "/health/ready"],
    ).instrument(app).expose(app, endpoint="/metrics", include_in_schema=True, tags=["Monitoring"])

    return app


app = create_application()

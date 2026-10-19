"""Background task tracking and inspection router for RabbitMQ & Celery."""

import logging
from typing import Annotated, Any

from celery.result import AsyncResult
from fastapi import APIRouter, Depends, HTTPException, status

from app.celery_app import celery_app
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tasks", tags=["Background Tasks"])


@router.get(
    "/{task_id}",
    summary="Get background task status and progress",
    response_description="Task execution status, progress percentage, and final output.",
)
async def get_task_status(
    task_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict[str, Any]:
    """
    Poll the execution status of a background task dispatched through RabbitMQ to Celery.

    States:
    - PENDING: Queued in RabbitMQ, waiting for worker pickup.
    - PROGRESS: Worker is actively processing rows/records.
    - SUCCESS: Worker finished execution; result payload available.
    - FAILURE: Task raised an exception.
    """
    try:
        async_result = AsyncResult(task_id, app=celery_app)
        state = async_result.state

        if state == "PENDING":
            return {
                "task_id": task_id,
                "status": "PENDING",
                "message": "Task is queued in RabbitMQ waiting for an available Celery worker.",
                "progress": {"percent": 0},
                "result": None,
            }
        elif state in ["PROGRESS", "STARTED"]:
            meta = async_result.info if isinstance(async_result.info, dict) else {}
            return {
                "task_id": task_id,
                "status": "PROGRESS",
                "message": meta.get("status", "Task is being processed by Celery worker."),
                "progress": meta,
                "result": None,
            }
        elif state == "SUCCESS":
            return {
                "task_id": task_id,
                "status": "SUCCESS",
                "message": "Task completed successfully.",
                "progress": {"percent": 100},
                "result": async_result.result,
            }
        elif state == "FAILURE":
            return {
                "task_id": task_id,
                "status": "FAILURE",
                "message": "Task execution failed in Celery worker.",
                "error": str(async_result.info),
                "result": None,
            }
        else:
            return {
                "task_id": task_id,
                "status": state,
                "result": str(async_result.info),
            }
    except Exception as exc:
        logger.error("Failed to query task status for %s: %s", task_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error inspecting task {task_id}: {str(exc)}",
        )


@router.delete(
    "/{task_id}",
    summary="Cancel / Revoke a running background task",
)
async def cancel_task(
    task_id: str,
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict[str, Any]:
    """Revoke a pending or running Celery task."""
    try:
        celery_app.control.revoke(task_id, terminate=True)
        return {
            "task_id": task_id,
            "status": "REVOKED",
            "message": "Task revocation command dispatched to RabbitMQ.",
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke task {task_id}: {str(exc)}",
        )

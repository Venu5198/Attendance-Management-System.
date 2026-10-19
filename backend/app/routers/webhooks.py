"""Webhooks API for Biometric Attendance Hardware and Outbound Event Integrations."""

import logging
from datetime import datetime
from enum import StrEnum
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.database import get_database
from app.dependencies import require_kiosk_api_key
from app.services.attendance_service import AttendanceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks & Hardware Integrations"])


class PunchType(StrEnum):
    PUNCH_IN = "PUNCH_IN"
    PUNCH_OUT = "PUNCH_OUT"


class BiometricPunchPayload(BaseModel):
    device_id: str = Field(..., description="Unique biometric terminal identifier")
    employee_id: str = Field(..., description="Badge or biometric employee identifier")
    punch_type: PunchType = Field(..., description="PUNCH_IN or PUNCH_OUT")
    tenant_id: str = Field(default="default", description="Tenant organization ID")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Terminal timestamp")
    signature: str | None = Field(None, description="HMAC SHA-256 payload integrity signature")


class BiometricPunchResponse(BaseModel):
    success: bool
    message: str
    employee_id: str
    punch_type: str
    recorded_at: datetime


@router.post(
    "/biometric-punch",
    response_model=BiometricPunchResponse,
    status_code=status.HTTP_200_OK,
    summary="Biometric Kiosk Push Webhook (Hardware Integration)",
)
async def handle_biometric_punch(
    payload: BiometricPunchPayload,
    request: Request,
    api_key: Annotated[str, Depends(require_kiosk_api_key)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """
    Ingest real-time punch events directly from physical biometric timeclocks.
    Protected by Hardware API Key and office subnet IP whitelisting.
    """
    client_ip = request.client.host if request.client else "unknown"
    logger.info(
        "Received biometric %s from device '%s' for employee '%s' at IP %s (tenant: %s)",
        payload.punch_type,
        payload.device_id,
        payload.employee_id,
        client_ip,
        payload.tenant_id,
    )

    attendance_service = AttendanceService(db, tenant_id=payload.tenant_id)

    try:
        if payload.punch_type == PunchType.PUNCH_IN:
            await attendance_service.check_in(
                employee_id=payload.employee_id,
                client_ip=client_ip,
            )
        else:
            await attendance_service.check_out(
                employee_id=payload.employee_id,
            )

        return BiometricPunchResponse(
            success=True,
            message=f"{payload.punch_type} successfully recorded from terminal {payload.device_id}",
            employee_id=payload.employee_id,
            punch_type=payload.punch_type.value,
            recorded_at=datetime.utcnow(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error processing biometric punch: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record punch: {exc}",
        ) from exc


async def dispatch_outbound_webhook(event_type: str, data: dict) -> bool:
    """
    Outbound webhook dispatcher. Sends signed notification to external systems (Slack/Teams/HRIS).
    """
    settings = get_settings()
    if not settings.OUTBOUND_WEBHOOK_URL:
        logger.debug("Outbound webhook skipped (no URL configured)")
        return False

    payload = {
        "event": event_type,
        "timestamp": datetime.utcnow().isoformat(),
        "data": data,
    }

    headers = {"Content-Type": "application/json"}
    if settings.OUTBOUND_WEBHOOK_SECRET:
        headers["X-Webhook-Secret"] = settings.OUTBOUND_WEBHOOK_SECRET

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(settings.OUTBOUND_WEBHOOK_URL, json=payload, headers=headers)
            logger.info("Outbound webhook sent to %s: HTTP %d", settings.OUTBOUND_WEBHOOK_URL, resp.status_code)
            return resp.status_code < 300
    except Exception as exc:
        logger.warning("Failed to dispatch outbound webhook: %s", exc)
        return False

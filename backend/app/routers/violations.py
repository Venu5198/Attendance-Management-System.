"""Policy violations and notification audit API routes."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import require_admin
from app.schemas.notification import NotificationLogResponse
from app.schemas.policy import PolicyViolationRecord, WeeklyComplianceResult
from app.services.email_service import EmailService
from app.services.policy_service import PolicyService
from app.utils.time_utils import get_week_boundaries, parse_date

router = APIRouter(prefix="/violations", tags=["Policy Violations & Notifications"])


class EvaluateWeekRequest(BaseModel):
    reference_date: str | None = None  # YYYY-MM-DD
    employee_id: str | None = None


class DispatchNotificationsRequest(BaseModel):
    week_label: str
    force_resend: bool = False


@router.get(
    "",
    response_model=list[PolicyViolationRecord],
    summary="List recorded policy violations (Admin only)",
)
async def list_violations(
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    week_label: str | None = Query(None, description="Filter by week label (YYYY-MM-DD_to_YYYY-MM-DD)"),
    employee_id: str | None = Query(None, description="Filter by employee ID"),
):
    """Retrieve recorded policy violations."""
    service = PolicyService(db)
    raw_violations = await service.get_violations(week_label=week_label, employee_id=employee_id)
    return [
        PolicyViolationRecord(
            violation_id=v.get("violation_id", ""),
            employee_id=v["employee_id"],
            employee_name=v.get("employee_name"),
            employee_email=v.get("employee_email"),
            week_start=parse_date(v["week_start"]),
            week_end=parse_date(v["week_end"]),
            week_label=v["week_label"],
            office_days=v["office_days"],
            total_office_hours=v["total_office_hours"],
            required_days=v["required_days"],
            required_hours=v["required_hours"],
            compliance_status=v["compliance_status"],
            violation_reasons=v.get("violation_reasons", []),
            evaluated_at=v["evaluated_at"],
            notification_sent=v.get("notification_sent", False),
        )
        for v in raw_violations
    ]


@router.post(
    "/evaluate",
    response_model=list[WeeklyComplianceResult],
    summary="Manually trigger weekly policy evaluation (Admin only)",
)
async def evaluate_week(
    req: EvaluateWeekRequest,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """
    Evaluate compliance for a week containing reference_date (or previous completed week).
    Persists violations to policy_violations collection.
    """
    ref_d = parse_date(req.reference_date) if req.reference_date else None
    if not ref_d:
        from datetime import timedelta

        from app.utils.time_utils import now_local

        # Default to previous week
        ref_d = now_local().date() - timedelta(days=7)

    w_start, w_end = get_week_boundaries(ref_d)
    service = PolicyService(db)
    return await service.evaluate_and_record_completed_week(
        week_start=w_start,
        week_end=w_end,
        employee_id=req.employee_id,
    )


@router.post(
    "/dispatch-notifications",
    summary="Dispatch violation emails for a completed week (Admin only)",
)
async def dispatch_notifications(
    req: DispatchNotificationsRequest,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """
    Send policy violation email notifications for all recorded violations in a specific week.
    Idempotent: skips employees who have already received a notification unless force_resend is true.
    """
    violations = await db.policy_violations.find(
        {
            "week_label": req.week_label,
            "compliance_status": "NON_COMPLIANT",
        }
    ).to_list(length=None)

    email_service = EmailService(db)
    sent_count = 0
    skipped_count = 0

    for v in violations:
        emp = await db.employees.find_one({"employee_id": v["employee_id"]})
        if not emp or not emp.get("is_active", True):
            continue

        success = await email_service.send_violation_email(
            employee_id=v["employee_id"],
            recipient_email=emp["email"],
            employee_name=emp["full_name"],
            policy_week=req.week_label,
            office_days=v["office_days"],
            total_hours=v["total_office_hours"],
            reasons=v.get("violation_reasons", []),
            force_resend=req.force_resend,
        )
        if success:
            sent_count += 1
        else:
            skipped_count += 1

    return {
        "week_label": req.week_label,
        "total_violations": len(violations),
        "notifications_sent": sent_count,
        "notifications_skipped_or_failed": skipped_count,
    }


@router.get(
    "/notification-logs",
    response_model=list[NotificationLogResponse],
    summary="Inspect notification audit logs (Admin only)",
)
async def get_notification_logs(
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    employee_id: str | None = Query(None, description="Filter by employee ID"),
    policy_week: str | None = Query(None, description="Filter by policy week"),
):
    """Inspect notification delivery audit logs."""
    query = {}
    if employee_id:
        query["employee_id"] = employee_id
    if policy_week:
        query["policy_week"] = policy_week

    logs = await db.notification_logs.find(query).sort("attempted_at", -1).to_list(length=None)
    return [
        NotificationLogResponse(
            log_id=doc["log_id"],
            employee_id=doc["employee_id"],
            recipient=doc["recipient"],
            policy_week=doc["policy_week"],
            notification_type=doc["notification_type"],
            delivery_status=doc["delivery_status"],
            attempted_at=doc["attempted_at"],
            retry_count=doc.get("retry_count", 0),
            error_details=doc.get("error_details"),
            provider_response=doc.get("provider_response"),
        )
        for doc in logs
    ]

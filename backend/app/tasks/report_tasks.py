"""Celery background tasks for heavy analytics and attendance reporting."""

import logging
from datetime import datetime, timezone
from typing import Any

from app.celery_app import celery_app
from app.tasks.employee_tasks import _get_sync_db

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="app.tasks.report_tasks.generate_attendance_export_task")
def generate_attendance_export_task(
    self,
    tenant_id: str = "default",
    start_date: str | None = None,
    end_date: str | None = None,
    requested_by: str = "system",
) -> dict[str, Any]:
    """Calculate consolidated multi-tenant attendance report in the background."""
    logger.info("Starting background attendance export task [%s] for tenant: %s", self.request.id, tenant_id)
    self.update_state(state="PROGRESS", meta={"status": "Querying attendance database...", "percent": 25})

    db = _get_sync_db()
    query: dict[str, Any] = {"tenant_id": tenant_id}
    if start_date and end_date:
        query["work_date"] = {"$gte": start_date, "$lte": end_date}

    cursor = db["attendance"].find(query)
    records = list(cursor)

    self.update_state(state="PROGRESS", meta={"status": "Aggregating metrics...", "percent": 75})

    total_records = len(records)
    total_hours = sum(r.get("duration_hours", 0.0) for r in records)

    return {
        "status": "COMPLETED",
        "tenant_id": tenant_id,
        "requested_by": requested_by,
        "total_attendance_records": total_records,
        "total_office_hours_accumulated": round(total_hours, 2),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }

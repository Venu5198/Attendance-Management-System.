"""APScheduler background jobs for automated weekly attendance policy compliance checks."""

import logging
from datetime import timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings
from app.database import db_manager
from app.schemas.policy import ComplianceStatus
from app.services.email_service import EmailService
from app.services.policy_service import PolicyService
from app.utils.time_utils import get_week_boundaries, get_week_label, now_local

logger = logging.getLogger(__name__)

scheduler: AsyncIOScheduler | None = None


async def run_weekly_compliance_job() -> None:
    """
    Scheduled job that evaluates the most recently completed policy week (Monday to Sunday)
    and dispatches violation email notifications to non-compliant employees idempotently.
    """
    logger.info("Starting scheduled weekly attendance compliance job...")
    if not db_manager.db:
        logger.error("Database connection not ready for scheduler job")
        return

    try:
        db = db_manager.db
        today = now_local().date()
        # Evaluate previous completed week (last week's Monday to Sunday)
        previous_week_date = today - timedelta(days=7)
        week_start, week_end = get_week_boundaries(previous_week_date)
        week_label = get_week_label(week_start, week_end)

        logger.info("Evaluating completed policy week: %s (%s to %s)", week_label, week_start, week_end)

        policy_service = PolicyService(db)
        results = await policy_service.evaluate_and_record_completed_week(week_start, week_end)

        violations = [r for r in results if r.compliance_status == ComplianceStatus.NON_COMPLIANT]
        logger.info(
            "Evaluated %d employees. Found %d violations for week %s", len(results), len(violations), week_label
        )

        # Dispatch emails for violations
        email_service = EmailService(db)
        sent_count = 0
        skipped_count = 0

        for viol in violations:
            emp = await db.employees.find_one({"employee_id": viol.employee_id})
            if not emp or not emp.get("is_active", True):
                continue

            dispatched = await email_service.send_violation_email(
                employee_id=viol.employee_id,
                recipient_email=emp["email"],
                employee_name=emp.get("full_name", "Employee"),
                policy_week=week_label,
                office_days=viol.office_days,
                total_hours=viol.total_office_hours,
                reasons=viol.violation_reasons,
                force_resend=False,
            )
            if dispatched:
                sent_count += 1
            else:
                skipped_count += 1

        logger.info(
            "Weekly compliance job completed for %s: %d emails sent, %d skipped/already notified.",
            week_label,
            sent_count,
            skipped_count,
        )

    except Exception as exc:
        logger.exception("Error occurred during scheduled weekly compliance job: %s", exc)


def start_scheduler() -> AsyncIOScheduler | None:
    """Start APScheduler instance if enabled in configuration."""
    global scheduler
    settings = get_settings()

    if not settings.SCHEDULER_ENABLED:
        logger.info("Background scheduler is disabled via SCHEDULER_ENABLED=false")
        return None

    try:
        scheduler = AsyncIOScheduler()
        # Parse cron string: e.g. "0 2 * * 1" (minute hour day_of_month month day_of_week)
        parts = settings.ATTENDANCE_CHECK_SCHEDULE.split()
        if len(parts) == 5:
            trigger = CronTrigger(
                minute=parts[0],
                hour=parts[1],
                day=parts[2],
                month=parts[3],
                day_of_week=parts[4],
                timezone=settings.COMPANY_TIMEZONE,
            )
        else:
            # Fallback trigger: every Monday at 02:00 AM in company timezone
            trigger = CronTrigger(day_of_week="mon", hour=2, minute=0, timezone=settings.COMPANY_TIMEZONE)

        scheduler.add_job(
            run_weekly_compliance_job,
            trigger=trigger,
            id="weekly_compliance_job",
            name="Weekly Attendance Compliance Check",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("APScheduler started successfully with schedule: %s", settings.ATTENDANCE_CHECK_SCHEDULE)
        return scheduler
    except Exception as exc:
        logger.error("Failed to start APScheduler: %s", exc)
        return None


def shutdown_scheduler() -> None:
    """Gracefully stop APScheduler."""
    global scheduler
    if scheduler and scheduler.running:
        logger.info("Shutting down APScheduler...")
        scheduler.shutdown(wait=False)
        scheduler = None

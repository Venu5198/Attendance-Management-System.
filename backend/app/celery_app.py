"""Celery application instance configured for RabbitMQ broker and Redis result backend."""

import os
from celery import Celery
from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "attendance_tasks",
    broker=os.getenv("CELERY_BROKER_URL", settings.CELERY_BROKER_URL),
    backend=os.getenv("CELERY_RESULT_BACKEND", settings.CELERY_RESULT_BACKEND),
    include=[
        "app.tasks.employee_tasks",
        "app.tasks.report_tasks",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.COMPANY_TIMEZONE,
    enable_utc=True,
    task_track_started=True,
    task_time_limit=600,
    task_soft_time_limit=540,
    broker_connection_retry_on_startup=True,
    result_expires=86400,  # 24 hours
    task_default_queue="celery",
)

# Alias for celery cli `celery -A app.celery_app.celery worker`
celery = celery_app

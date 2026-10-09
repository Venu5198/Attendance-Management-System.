"""Unit tests for email service formatting and notification idempotency."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.schemas.notification import DeliveryStatus
from app.services.email_service import EmailService


@pytest.fixture
def email_service():
    mock_db = MagicMock()
    mock_db.notification_logs = AsyncMock()
    mock_db.policy_violations = AsyncMock()
    return EmailService(mock_db)


def test_build_violation_email_content(email_service):
    subject, body = email_service.build_violation_email_content(
        full_name="Alice Chen",
        office_days=2,
        total_hours=11.0,
        reasons=["Office attendance was 2 day(s), below the minimum required 3 days."],
    )

    assert subject == "Work From Home Policy Violation - Attendance Compliance"
    assert "Dear Alice Chen," in body
    assert "Minimum office days: 3" in body
    assert "Minimum total office hours: 15" in body
    assert "Office days: 2" in body
    assert "Completed office hours: 11.0" in body
    assert "Office attendance was 2 day(s)" in body
    assert "HR / Attendance Management System" in body


@pytest.mark.asyncio
async def test_email_send_idempotent_skips_duplicates(email_service):
    # Simulate already sent log
    email_service.logs.find_one.return_value = {
        "delivery_status": DeliveryStatus.SENT.value,
        "employee_id": "EMP01",
        "policy_week": "2026-09-28_to_2026-10-04",
    }

    sent = await email_service.send_violation_email(
        employee_id="EMP01",
        recipient_email="emp01@example.com",
        employee_name="Alice",
        policy_week="2026-09-28_to_2026-10-04",
        office_days=2,
        total_hours=10.0,
        reasons=["Days below 3"],
        force_resend=False,
    )

    assert sent is False
    # Ensure no new insert occurred
    email_service.logs.insert_one.assert_not_called()

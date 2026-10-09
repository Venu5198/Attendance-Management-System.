"""Unit tests for the WFH Attendance Policy Evaluation engine."""

from datetime import date
from unittest.mock import MagicMock

import pytest

from app.schemas.policy import ComplianceStatus
from app.services.policy_service import PolicyService


@pytest.fixture
def policy_service():
    mock_db = MagicMock()
    return PolicyService(mock_db)


def test_policy_3_days_15_hours_compliant(policy_service):
    """3 days and 15 hours meets both conditions -> COMPLIANT."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    records = [
        {"work_date": "2026-09-28", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
        {"work_date": "2026-09-29", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
        {"work_date": "2026-09-30", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP01",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
    )

    assert res.compliance_status == ComplianceStatus.COMPLIANT
    assert res.office_days == 3
    assert res.total_office_hours == 15.0
    assert len(res.violation_reasons) == 0


def test_policy_4_days_20_hours_compliant(policy_service):
    """4 days and 20 hours -> COMPLIANT."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    records = [
        {"work_date": f"2026-09-{28 + i}", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600}
        for i in range(4)
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP02",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
    )

    assert res.compliance_status == ComplianceStatus.COMPLIANT
    assert res.office_days == 4
    assert res.total_office_hours == 20.0


def test_policy_2_days_16_hours_non_compliant(policy_service):
    """2 days and 16 hours satisfies hours but fails office_days >= 3 -> NON_COMPLIANT."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    records = [
        {"work_date": "2026-09-28", "attendance_status": "COMPLETED", "duration_seconds": 8 * 3600},
        {"work_date": "2026-09-29", "attendance_status": "COMPLETED", "duration_seconds": 8 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP03",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
    )

    assert res.compliance_status == ComplianceStatus.NON_COMPLIANT
    assert res.office_days == 2
    assert res.total_office_hours == 16.0
    assert any("2 day(s)" in r for r in res.violation_reasons)


def test_policy_3_days_12_hours_non_compliant(policy_service):
    """3 days and 12 hours satisfies days but fails hours >= 15 -> NON_COMPLIANT."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    records = [
        {"work_date": "2026-09-28", "attendance_status": "COMPLETED", "duration_seconds": 4 * 3600},
        {"work_date": "2026-09-29", "attendance_status": "COMPLETED", "duration_seconds": 4 * 3600},
        {"work_date": "2026-09-30", "attendance_status": "COMPLETED", "duration_seconds": 4 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP04",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
    )

    assert res.compliance_status == ComplianceStatus.NON_COMPLIANT
    assert res.office_days == 3
    assert res.total_office_hours == 12.0
    assert any("12.0 hr(s)" in r for r in res.violation_reasons)


def test_policy_0_days_completed_week_non_compliant(policy_service):
    """0 attendance in a completed week -> NON_COMPLIANT."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP05",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=[],
        is_completed_week=True,
    )

    assert res.compliance_status == ComplianceStatus.NON_COMPLIANT
    assert res.office_days == 0
    assert res.total_office_hours == 0.0
    assert len(res.violation_reasons) == 2


def test_policy_incomplete_week_is_pending_not_violation(policy_service):
    """An incomplete / ongoing week with below-threshold attendance must be PENDING, not premature violation."""
    week_start = date(2026, 10, 5)
    week_end = date(2026, 10, 11)
    # Only 1 day attended so far in middle of week
    records = [
        {"work_date": "2026-10-05", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP06",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=False,  # Still ongoing
    )

    assert res.compliance_status == ComplianceStatus.PENDING
    assert res.office_days == 1
    assert res.total_office_hours == 5.0

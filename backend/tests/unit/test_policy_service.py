"""Unit tests for the WFH Attendance Policy Evaluation engine."""

from datetime import date
from unittest.mock import MagicMock

import pytest

from app.schemas.policy import ComplianceStatus
from app.services.policy_service import PolicyService, compute_pre_hire_workdays


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


def test_policy_incomplete_week_already_met_is_compliant(policy_service):
    """An ongoing week that already has >= 3 days and >= 15 hours should evaluate to COMPLIANT."""
    week_start = date(2026, 10, 5)
    week_end = date(2026, 10, 11)
    records = [
        {"work_date": "2026-10-05", "attendance_status": "COMPLETED", "duration_seconds": 6 * 3600},
        {"work_date": "2026-10-06", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
        {"work_date": "2026-10-07", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP07",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=False,
    )

    assert res.compliance_status == ComplianceStatus.COMPLIANT
    assert res.office_days == 3
    assert res.total_office_hours == 16.0
    assert len(res.violation_reasons) == 0


def test_policy_multiple_records_same_day_counts_as_one_distinct_day(policy_service):
    """Multiple completed punch sessions on the same date count as 1 distinct office day, but sum hours."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    records = [
        {"work_date": "2026-09-28", "attendance_status": "COMPLETED", "duration_seconds": 4 * 3600},
        {"work_date": "2026-09-28", "attendance_status": "COMPLETED", "duration_seconds": 4 * 3600},  # Same day
        {"work_date": "2026-09-29", "attendance_status": "COMPLETED", "duration_seconds": 8 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP08",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
    )

    # 2 distinct days, 16 hours -> Non compliant because office_days < 3
    assert res.compliance_status == ComplianceStatus.NON_COMPLIANT
    assert res.office_days == 2
    assert res.total_office_hours == 16.0


def test_policy_in_progress_records_ignored(policy_service):
    """Records with status IN_PROGRESS must be excluded from office day and hour counts."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    records = [
        {"work_date": "2026-09-28", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
        {"work_date": "2026-09-29", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
        {"work_date": "2026-09-30", "attendance_status": "IN_PROGRESS", "duration_seconds": 5 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP09",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
    )

    assert res.compliance_status == ComplianceStatus.NON_COMPLIANT
    assert res.office_days == 2
    assert res.total_office_hours == 10.0


def test_policy_exact_boundary_sub_15_hours_is_non_compliant(policy_service):
    """3 days but 14.99 hours fails the 15.0 hours requirement."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    # 14.9 hours = 53640 seconds
    records = [
        {"work_date": "2026-09-28", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
        {"work_date": "2026-09-29", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
        {"work_date": "2026-09-30", "attendance_status": "COMPLETED", "duration_seconds": 17640},  # 4.9 hours
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP10",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
    )

    assert res.compliance_status == ComplianceStatus.NON_COMPLIANT
    assert res.office_days == 3
    assert res.total_office_hours == 14.9
    assert any("14.9 hr(s)" in r for r in res.violation_reasons)


def test_policy_full_week_leave_is_exempt(policy_service):
    """Full week approved leave (3+ days) yields EXEMPT status with 0 violations."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP_LEAVE_FULL",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=[],
        is_completed_week=True,
        approved_leave_days=3,
    )

    assert res.compliance_status == ComplianceStatus.EXEMPT
    assert res.required_days == 0
    assert res.required_hours == 0.0
    assert len(res.violation_reasons) == 0


def test_policy_partial_leave_reduces_requirement_proportionally(policy_service):
    """1 day approved leave reduces requirement to 2 days & 10 hours; meeting it gives COMPLIANT."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    records = [
        {"work_date": "2026-09-28", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
        {"work_date": "2026-09-29", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP_LEAVE_PARTIAL",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
        approved_leave_days=1,
    )

    assert res.compliance_status == ComplianceStatus.COMPLIANT
    assert res.office_days == 2
    assert res.required_days == 2
    assert res.required_hours == 10.0
    assert res.total_office_hours == 10.0


def test_compute_pre_hire_workdays():
    """Verify pre-hire business days calculation for various onboarding scenarios."""
    week_start = date(2026, 9, 28)  # Monday
    week_end = date(2026, 10, 4)   # Sunday

    # Hired before week starts
    assert compute_pre_hire_workdays(date(2026, 9, 1), week_start, week_end) == 0
    # Hired on Monday of the week
    assert compute_pre_hire_workdays(date(2026, 9, 28), week_start, week_end) == 0
    # Hired on Wednesday (Mon & Tue are pre-hire -> 2 days)
    assert compute_pre_hire_workdays(date(2026, 9, 30), week_start, week_end) == 2
    # Hired on Friday (Mon, Tue, Wed, Thu -> 4 days)
    assert compute_pre_hire_workdays(date(2026, 10, 2), week_start, week_end) == 4
    # Hired following week
    assert compute_pre_hire_workdays(date(2026, 10, 5), week_start, week_end) == 5
    # None or empty
    assert compute_pre_hire_workdays(None, week_start, week_end) == 0


def test_policy_holiday_pro_rata_deduction(policy_service):
    """1 company holiday scales required targets down from 3d/15h to 2d/10h."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    records = [
        {"work_date": "2026-09-29", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
        {"work_date": "2026-09-30", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP_HOLIDAY",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
        holidays_count=1,
    )

    assert res.compliance_status == ComplianceStatus.COMPLIANT
    assert res.office_days == 2
    assert res.required_days == 2
    assert res.required_hours == 10.0
    assert res.total_office_hours == 10.0
    assert res.holidays_count == 1


def test_policy_midweek_joiner_pro_rata_deduction(policy_service):
    """Employee onboarding on Wednesday (2 pre-hire workdays) scales target down to 1d/5h."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)
    pre_hire = compute_pre_hire_workdays(date(2026, 9, 30), week_start, week_end)
    assert pre_hire == 2

    # Employee attends 1 day on Thursday for 5 hours
    records = [
        {"work_date": "2026-10-01", "attendance_status": "COMPLETED", "duration_seconds": 5 * 3600},
    ]

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP_NEW_HIRE",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=records,
        is_completed_week=True,
        pre_hire_workdays=pre_hire,
    )

    assert res.compliance_status == ComplianceStatus.COMPLIANT
    assert res.office_days == 1
    assert res.required_days == 1
    assert res.required_hours == 5.0
    assert res.total_office_hours == 5.0
    assert res.pre_hire_workdays == 2


def test_policy_combined_holiday_and_midweek_joiner_exempt(policy_service):
    """1 holiday + 2 pre-hire days = 3 total deductible days -> 0 required days (EXEMPT)."""
    week_start = date(2026, 9, 28)
    week_end = date(2026, 10, 4)

    res = policy_service.evaluate_weekly_compliance(
        employee_id="EMP_JOINER_HOLIDAY",
        week_start=week_start,
        week_end=week_end,
        completed_records_in_week=[],
        is_completed_week=True,
        holidays_count=1,
        pre_hire_workdays=2,
    )

    assert res.compliance_status == ComplianceStatus.EXEMPT
    assert res.required_days == 0
    assert res.required_hours == 0.0
    assert len(res.violation_reasons) == 0

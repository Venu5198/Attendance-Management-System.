"""Unit tests for time and timezone calculation utilities."""

from datetime import date

import pytest

from app.utils.time_utils import (
    get_date_range_for_period,
    get_overlapping_policy_weeks,
    get_week_boundaries,
    get_week_label,
    parse_date,
)


def test_parse_date():
    d = parse_date("2026-10-09")
    assert d.year == 2026
    assert d.month == 10
    assert d.day == 9


def test_get_week_boundaries():
    # 2026-10-09 is a Friday
    friday = date(2026, 10, 9)
    monday, sunday = get_week_boundaries(friday)
    assert monday == date(2026, 10, 5)
    assert sunday == date(2026, 10, 11)
    assert monday.weekday() == 0  # Monday
    assert sunday.weekday() == 6  # Sunday


def test_get_week_label():
    monday = date(2026, 10, 5)
    sunday = date(2026, 10, 11)
    label = get_week_label(monday, sunday)
    assert label == "2026-10-05_to_2026-10-11"


def test_get_overlapping_policy_weeks():
    # Range across 2 policy weeks
    start_d = date(2026, 10, 1)  # Thursday
    end_d = date(2026, 10, 9)  # Friday of following week
    weeks = get_overlapping_policy_weeks(start_d, end_d)

    assert len(weeks) == 2
    assert weeks[0] == (date(2026, 9, 28), date(2026, 10, 4))
    assert weeks[1] == (date(2026, 10, 5), date(2026, 10, 11))


def test_get_date_range_for_period():
    target = date(2026, 10, 9)

    # Daily
    s, e = get_date_range_for_period("daily", target_date=target)
    assert s == target and e == target

    # Weekly
    s, e = get_date_range_for_period("weekly", target_date=target)
    assert s == date(2026, 10, 5) and e == date(2026, 10, 11)

    # Monthly
    s, e = get_date_range_for_period("monthly", target_date=target)
    assert s == date(2026, 10, 1) and e == date(2026, 10, 31)

    # Yearly
    s, e = get_date_range_for_period("yearly", target_date=target)
    assert s == date(2026, 1, 1) and e == date(2026, 12, 31)

    # Custom valid
    custom_s = date(2026, 10, 1)
    custom_e = date(2026, 10, 9)
    s, e = get_date_range_for_period("custom", start_date=custom_s, end_date=custom_e)
    assert s == custom_s and e == custom_e

    # Custom reversed error
    with pytest.raises(ValueError):
        get_date_range_for_period("custom", start_date=custom_e, end_date=custom_s)

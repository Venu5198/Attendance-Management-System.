"""Time and timezone utilities for attendance policy and reporting."""

from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from app.config import get_settings


def get_company_tz() -> ZoneInfo:
    """Return the configured company timezone ZoneInfo object."""
    settings = get_settings()
    return ZoneInfo(settings.COMPANY_TIMEZONE)


def now_utc() -> datetime:
    """Current UTC datetime."""
    return datetime.now(UTC)


def now_local() -> datetime:
    """Current local datetime in company timezone."""
    return datetime.now(get_company_tz())


def to_utc(dt: datetime) -> datetime:
    """Ensure datetime is UTC timezone-aware."""
    if dt.tzinfo is None:
        # Assume UTC if naive
        return dt.replace(tzinfo=UTC)
    return dt.astimezone(UTC)


def to_company_tz(dt: datetime) -> datetime:
    """Convert any aware datetime to company timezone."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(get_company_tz())


def get_work_date(dt: datetime) -> str:
    """Get the business work date (YYYY-MM-DD) for a given datetime in company timezone."""
    local_dt = to_company_tz(dt)
    return local_dt.date().isoformat()


def parse_date(date_str: str) -> date:
    """Parse YYYY-MM-DD string into date object."""
    return date.fromisoformat(date_str)


def format_iso(dt: datetime | None) -> str | None:
    """Format datetime as ISO 8601 string with UTC indicator."""
    if dt is None:
        return None
    return to_utc(dt).isoformat()


def get_week_boundaries(d: date) -> tuple[date, date]:
    """Get Monday (start) and Sunday (end) dates for the week containing date `d`."""
    monday = d - timedelta(days=d.weekday())
    sunday = monday + timedelta(days=6)
    return monday, sunday


def get_week_label(start_date: date, end_date: date) -> str:
    """Generate a consistent week identifier label: YYYY-MM-DD_to_YYYY-MM-DD."""
    return f"{start_date.isoformat()}_to_{end_date.isoformat()}"


def get_overlapping_policy_weeks(start_date: date, end_date: date) -> list[tuple[date, date]]:
    """Return list of (monday, sunday) policy weeks overlapping [start_date, end_date]."""
    if start_date > end_date:
        raise ValueError("start_date cannot be after end_date")

    weeks = []
    current_monday, current_sunday = get_week_boundaries(start_date)
    last_monday, last_sunday = get_week_boundaries(end_date)

    iter_monday = current_monday
    while iter_monday <= last_monday:
        iter_sunday = iter_monday + timedelta(days=6)
        weeks.append((iter_monday, iter_sunday))
        iter_monday += timedelta(days=7)

    return weeks


def is_week_completed(week_end: date) -> bool:
    """Check if the given week_end (Sunday) has completely passed relative to company local time."""
    current_date = now_local().date()
    # If today is after Sunday, the week is fully completed
    return current_date > week_end


def get_date_range_for_period(
    period: str,
    target_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> tuple[date, date]:
    """Calculate (start_date, end_date) for a given reporting period."""
    today = now_local().date()
    base_date = target_date or today

    if period == "daily":
        return base_date, base_date

    elif period == "weekly":
        return get_week_boundaries(base_date)

    elif period == "monthly":
        first_day = base_date.replace(day=1)
        # Next month first day minus 1 day
        if base_date.month == 12:
            next_month = base_date.replace(year=base_date.year + 1, month=1, day=1)
        else:
            next_month = base_date.replace(month=base_date.month + 1, day=1)
        last_day = next_month - timedelta(days=1)
        return first_day, last_day

    elif period == "yearly":
        first_day = date(base_date.year, 1, 1)
        last_day = date(base_date.year, 12, 31)
        return first_day, last_day

    elif period == "custom":
        if not start_date or not end_date:
            raise ValueError("Both start_date and end_date are required for custom period.")
        if start_date > end_date:
            raise ValueError("start_date cannot be greater than end_date.")
        return start_date, end_date

    else:
        raise ValueError(f"Unsupported period: {period}")

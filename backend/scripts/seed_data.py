import asyncio
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

# Ensure app is importable when script is run directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pymongo import AsyncMongoClient

from app.config import get_settings
from app.database import ensure_indexes
from app.utils.security import get_password_hash
from app.utils.time_utils import get_company_tz


async def seed_data():
    settings = get_settings()
    client = AsyncMongoClient(settings.MONGODB_URI)
    db = client[settings.MONGODB_DATABASE]

    print("Ensuring indexes before seeding...")
    await ensure_indexes(db)

    print("Clearing existing collections for fresh seed...")
    await db.employees.delete_many({})
    await db.users.delete_many({})
    await db.attendance.delete_many({})
    await db.policy_violations.delete_many({})
    await db.notification_logs.delete_many({})

    tz = get_company_tz()
    now_utc = datetime.now(UTC)
    today = datetime.now(tz).date()

    # Calculate past completed week (Monday to Sunday)
    # The week ending previous Sunday
    days_since_monday = today.weekday()
    current_monday = today - timedelta(days=days_since_monday)
    past_week_sunday = current_monday - timedelta(days=1)
    past_week_monday = past_week_sunday - timedelta(days=6)

    print(f"Target completed policy week: {past_week_monday} to {past_week_sunday}")

    # 1. Define Employees
    employees_data = [
        {
            "employee_id": "EMP001",
            "full_name": "Alice Chen",
            "email": "alice.chen@company.com",
            "department": "Engineering",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP002",
            "full_name": "Bob Kumar",
            "email": "bob.kumar@company.com",
            "department": "Engineering",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP003",
            "full_name": "Charlie Smith",
            "email": "charlie.smith@company.com",
            "department": "Product",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP004",
            "full_name": "Diana Prince",
            "email": "diana.prince@company.com",
            "department": "Human Resources",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP005",
            "full_name": "Evan Wright",
            "email": "evan.wright@company.com",
            "department": "Marketing",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP006",
            "full_name": "Fiona Gallagher",
            "email": "fiona.g@company.com",
            "department": "Operations",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP007",
            "full_name": "George Clark",
            "email": "george.clark@company.com",
            "department": "Engineering",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP008",
            "full_name": "Hannah Abbott",
            "email": "hannah.a@company.com",
            "department": "Sales",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP009",
            "full_name": "Ian Malcolm",
            "email": "ian.malcolm@company.com",
            "department": "Data Science",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP010",
            "full_name": "Julia Roberts",
            "email": "julia.roberts@company.com",
            "department": "Design",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP011",
            "full_name": "Kevin Bacon",
            "email": "kevin.bacon@company.com",
            "department": "Quality Assurance",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP012",
            "full_name": "Laura Croft",
            "email": "laura.croft@company.com",
            "department": "Security",
            "role": "EMPLOYEE",
            "is_active": False,
        },
    ]

    emp_docs = []
    for emp in employees_data:
        emp_docs.append(
            {
                **emp,
                "created_at": now_utc,
                "updated_at": now_utc,
            }
        )
    await db.employees.insert_many(emp_docs)
    print(f"Inserted {len(emp_docs)} employees.")

    # 2. Define User Accounts
    users_data = [
        {
            "username": "admin",
            "email": "admin@company.com",
            "password": "AdminPass123!",
            "role": "ADMIN",
            "employee_id": None,
        },
        {
            "username": "emp001",
            "email": "alice.chen@company.com",
            "password": "EmpPass123!",
            "role": "EMPLOYEE",
            "employee_id": "EMP001",
        },
        {
            "username": "emp004",
            "email": "diana.prince@company.com",
            "password": "EmpPass123!",
            "role": "EMPLOYEE",
            "employee_id": "EMP004",
        },
        {
            "username": "emp005",
            "email": "evan.wright@company.com",
            "password": "EmpPass123!",
            "role": "EMPLOYEE",
            "employee_id": "EMP005",
        },
    ]
    user_docs = []
    for u in users_data:
        user_docs.append(
            {
                "user_id": str(uuid4()),
                "username": u["username"],
                "email": u["email"],
                "password_hash": get_password_hash(u["password"]),
                "role": u["role"],
                "employee_id": u["employee_id"],
                "is_active": True,
                "created_at": now_utc,
                "updated_at": now_utc,
            }
        )
    await db.users.insert_many(user_docs)
    print(f"Inserted {len(user_docs)} users.")

    # 3. Create attendance scenarios for the past completed week
    # Helper to generate entry/exit datetimes
    def make_session(work_date: date, entry_hour: int, duration_hours: float):
        entry_dt = datetime(work_date.year, work_date.month, work_date.day, entry_hour, 0, 0, tzinfo=tz).astimezone(UTC)
        exit_dt = entry_dt + timedelta(hours=duration_hours)
        duration_sec = int(duration_hours * 3600)
        return {
            "attendance_id": str(uuid4()),
            "work_date": work_date.isoformat(),
            "entry_time": entry_dt,
            "exit_time": exit_dt,
            "duration_seconds": duration_sec,
            "attendance_status": "COMPLETED",
            "created_at": entry_dt,
            "updated_at": exit_dt,
        }

    attendance_docs = []

    # EMP001: 3 days, 15 hours (5h/day on Mon, Tue, Wed) -> COMPLIANT
    attendance_docs.append({"employee_id": "EMP001", **make_session(past_week_monday + timedelta(days=0), 9, 5.0)})
    attendance_docs.append({"employee_id": "EMP001", **make_session(past_week_monday + timedelta(days=1), 9, 5.0)})
    attendance_docs.append({"employee_id": "EMP001", **make_session(past_week_monday + timedelta(days=2), 9, 5.0)})

    # EMP002: 4 days, 20 hours (5h/day on Mon, Tue, Wed, Thu) -> COMPLIANT
    for day_idx in range(4):
        attendance_docs.append(
            {"employee_id": "EMP002", **make_session(past_week_monday + timedelta(days=day_idx), 9, 5.0)}
        )

    # EMP003: 5 days, 35 hours (7h/day on Mon-Fri) -> COMPLIANT
    for day_idx in range(5):
        attendance_docs.append(
            {"employee_id": "EMP003", **make_session(past_week_monday + timedelta(days=day_idx), 9, 7.0)}
        )

    # EMP004: 2 days, 16 hours (8h/day on Mon, Tue) -> NON_COMPLIANT (office_days = 2 < 3)
    attendance_docs.append({"employee_id": "EMP004", **make_session(past_week_monday + timedelta(days=0), 9, 8.0)})
    attendance_docs.append({"employee_id": "EMP004", **make_session(past_week_monday + timedelta(days=1), 9, 8.0)})

    # EMP005: 3 days, 12 hours (4h/day on Mon, Tue, Wed) -> NON_COMPLIANT (hours = 12 < 15)
    attendance_docs.append({"employee_id": "EMP005", **make_session(past_week_monday + timedelta(days=0), 9, 4.0)})
    attendance_docs.append({"employee_id": "EMP005", **make_session(past_week_monday + timedelta(days=1), 9, 4.0)})
    attendance_docs.append({"employee_id": "EMP005", **make_session(past_week_monday + timedelta(days=2), 9, 4.0)})

    # EMP006: 1 day, 5 hours (Mon) -> NON_COMPLIANT (days = 1 < 3, hours = 5 < 15)
    attendance_docs.append({"employee_id": "EMP006", **make_session(past_week_monday + timedelta(days=0), 9, 5.0)})

    # EMP007: 0 days, 0 hours -> NON_COMPLIANT (no attendance records seeded)

    # EMP008: 4 days, 14 hours (3.5h/day Mon-Thu) -> NON_COMPLIANT (hours = 14 < 15)
    for day_idx in range(4):
        attendance_docs.append(
            {"employee_id": "EMP008", **make_session(past_week_monday + timedelta(days=day_idx), 9, 3.5)}
        )

    # EMP009: 3 days, 18 hours (6h/day Mon, Wed, Fri) -> COMPLIANT
    attendance_docs.append({"employee_id": "EMP009", **make_session(past_week_monday + timedelta(days=0), 9, 6.0)})
    attendance_docs.append({"employee_id": "EMP009", **make_session(past_week_monday + timedelta(days=2), 9, 6.0)})
    attendance_docs.append({"employee_id": "EMP009", **make_session(past_week_monday + timedelta(days=4), 9, 6.0)})

    # EMP010: 3 days, 15.5 hours -> COMPLIANT
    attendance_docs.append({"employee_id": "EMP010", **make_session(past_week_monday + timedelta(days=0), 9, 5.5)})
    attendance_docs.append({"employee_id": "EMP010", **make_session(past_week_monday + timedelta(days=1), 9, 5.0)})
    attendance_docs.append({"employee_id": "EMP010", **make_session(past_week_monday + timedelta(days=2), 9, 5.0)})

    # EMP011: Current week in-progress session for today
    today_entry = datetime(today.year, today.month, today.day, 9, 30, 0, tzinfo=tz).astimezone(UTC)
    attendance_docs.append(
        {
            "attendance_id": str(uuid4()),
            "employee_id": "EMP011",
            "work_date": today.isoformat(),
            "entry_time": today_entry,
            "exit_time": None,
            "duration_seconds": 0,
            "attendance_status": "IN_PROGRESS",
            "created_at": today_entry,
            "updated_at": today_entry,
        }
    )

    await db.attendance.insert_many(attendance_docs)
    print(f"Inserted {len(attendance_docs)} attendance records.")

    await client.close()
    print("Database seeding completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_data())

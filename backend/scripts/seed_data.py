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
from app.services.policy_service import PolicyService
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

    # Calculate current and past weeks
    days_since_monday = today.weekday()
    current_monday = today - timedelta(days=days_since_monday)
    past_week_sunday = current_monday - timedelta(days=1)
    past_week_monday = past_week_sunday - timedelta(days=6)

    print(f"Past completed week: {past_week_monday} to {past_week_sunday}")
    print(f"Current active week: {current_monday} to {today}")

    # 1. Define Employees (11 active, 1 inactive)
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
            "full_name": "Charlie Davis",
            "email": "charlie.davis@company.com",
            "department": "Marketing",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP004",
            "full_name": "Diana Prince",
            "email": "diana.prince@company.com",
            "department": "Product",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP005",
            "full_name": "Evan Wright",
            "email": "evan.wright@company.com",
            "department": "Finance",
            "role": "EMPLOYEE",
            "is_active": True,
        },
        {
            "employee_id": "EMP006",
            "full_name": "Fiona Gallagher",
            "email": "fiona.g@company.com",
            "department": "HR",
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

    emp_docs = [{**emp, "created_at": now_utc, "updated_at": now_utc} for emp in employees_data]
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

    user_docs = [
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
        for u in users_data
    ]
    await db.users.insert_many(user_docs)
    print(f"Inserted {len(user_docs)} users.")

    # Session helper
    def make_session(work_date: date, entry_hour: int, duration_hours: float):
        entry_dt = datetime(work_date.year, work_date.month, work_date.day, entry_hour, 0, 0, tzinfo=tz).astimezone(UTC)
        exit_dt = entry_dt + timedelta(hours=duration_hours)
        return {
            "attendance_id": str(uuid4()),
            "work_date": work_date.isoformat(),
            "entry_time": entry_dt,
            "exit_time": exit_dt,
            "duration_seconds": int(duration_hours * 3600),
            "attendance_status": "COMPLETED",
            "created_at": entry_dt,
            "updated_at": exit_dt,
        }

    attendance_docs = []

    # 3. PAST COMPLETED WEEK SESSIONS (2026-09-28 to 2026-10-04)
    # EMP001: 3 days, 15 hours -> COMPLIANT
    for d in [0, 1, 2]:
        attendance_docs.append({"employee_id": "EMP001", **make_session(past_week_monday + timedelta(days=d), 9, 5.0)})
    # EMP002: 4 days, 20 hours -> COMPLIANT
    for d in range(4):
        attendance_docs.append({"employee_id": "EMP002", **make_session(past_week_monday + timedelta(days=d), 9, 5.0)})
    # EMP003: 5 days, 35 hours -> COMPLIANT
    for d in range(5):
        attendance_docs.append({"employee_id": "EMP003", **make_session(past_week_monday + timedelta(days=d), 9, 7.0)})
    # EMP004: 2 days, 16 hours -> NON_COMPLIANT (office_days < 3)
    for d in [0, 1]:
        attendance_docs.append({"employee_id": "EMP004", **make_session(past_week_monday + timedelta(days=d), 9, 8.0)})
    # EMP005: 3 days, 12 hours -> NON_COMPLIANT (hours < 15)
    for d in [0, 1, 2]:
        attendance_docs.append({"employee_id": "EMP005", **make_session(past_week_monday + timedelta(days=d), 9, 4.0)})
    # EMP006: 1 day, 5 hours -> NON_COMPLIANT
    attendance_docs.append({"employee_id": "EMP006", **make_session(past_week_monday, 9, 5.0)})
    # EMP008: 4 days, 14 hours -> NON_COMPLIANT
    for d in range(4):
        attendance_docs.append({"employee_id": "EMP008", **make_session(past_week_monday + timedelta(days=d), 9, 3.5)})
    # EMP009: 3 days, 18 hours -> COMPLIANT
    for d in [0, 2, 4]:
        attendance_docs.append({"employee_id": "EMP009", **make_session(past_week_monday + timedelta(days=d), 9, 6.0)})
    # EMP010: 3 days, 16 hours -> COMPLIANT
    for d in [0, 1, 3]:
        attendance_docs.append({"employee_id": "EMP010", **make_session(past_week_monday + timedelta(days=d), 9, 5.33)})

    # 4. CURRENT ACTIVE WEEK SESSIONS (2026-10-05 onwards)
    # Alice (EMP001): Mon (7.0h), Wed (6.5h) -> 2 days, 13.5 hours. TODAY is empty and clickable!
    if days_since_monday >= 1:
        attendance_docs.append({"employee_id": "EMP001", **make_session(current_monday, 9, 7.0)})
    if days_since_monday >= 3:
        attendance_docs.append({"employee_id": "EMP001", **make_session(current_monday + timedelta(days=2), 9, 6.5)})

    # Other employees in current week:
    # EMP002: 4 days, 24h -> Already COMPLIANT
    for d in [0, 1, 2, 3]:
        if current_monday + timedelta(days=d) < today:
            attendance_docs.append(
                {"employee_id": "EMP002", **make_session(current_monday + timedelta(days=d), 9, 6.0)}
            )

    # EMP003: 3 days, 21h -> Already COMPLIANT
    for d in [0, 1, 2]:
        if current_monday + timedelta(days=d) < today:
            attendance_docs.append(
                {"employee_id": "EMP003", **make_session(current_monday + timedelta(days=d), 8, 7.0)}
            )

    # EMP009: 3 days, 18h -> Already COMPLIANT
    for d in [0, 2, 4]:
        if current_monday + timedelta(days=d) < today:
            attendance_docs.append(
                {"employee_id": "EMP009", **make_session(current_monday + timedelta(days=d), 9, 6.0)}
            )

    # EMP010: 3 days, 16h -> Already COMPLIANT
    for d in [0, 1, 3]:
        if current_monday + timedelta(days=d) < today:
            attendance_docs.append(
                {"employee_id": "EMP010", **make_session(current_monday + timedelta(days=d), 9, 5.5)}
            )

    # EMP004: 2 days, 12h -> PENDING
    for d in [0, 1]:
        if current_monday + timedelta(days=d) < today:
            attendance_docs.append(
                {"employee_id": "EMP004", **make_session(current_monday + timedelta(days=d), 10, 6.0)}
            )

    # EMP005: 2 days, 10h -> PENDING
    for d in [0, 2]:
        if current_monday + timedelta(days=d) < today:
            attendance_docs.append(
                {"employee_id": "EMP005", **make_session(current_monday + timedelta(days=d), 9, 5.0)}
            )

    # EMP006: 1 day, 6h -> PENDING
    if current_monday < today:
        attendance_docs.append({"employee_id": "EMP006", **make_session(current_monday, 9, 6.0)})

    # EMP008: 2 days, 11h -> PENDING
    for d in [1, 3]:
        if current_monday + timedelta(days=d) < today:
            attendance_docs.append(
                {"employee_id": "EMP008", **make_session(current_monday + timedelta(days=d), 9, 5.5)}
            )

    # EMP011: Active in-progress check-in today
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
    print(f"Inserted {len(attendance_docs)} attendance records across past and current weeks.")

    # 5. Populate Policy Violations for past completed week
    print("Evaluating and persisting violations for completed past week...")
    policy_svc = PolicyService(db)
    await policy_svc.evaluate_and_record_completed_week(past_week_monday, past_week_sunday)

    # 6. Seed Notification Logs
    # Mark 3 violations as notified and leave 2 as pending notifications
    violations_cursor = db.policy_violations.find({"week_start": past_week_monday.isoformat()})
    violations = await violations_cursor.to_list(length=10)

    for idx, viol in enumerate(violations):
        if idx < 3:
            await db.policy_violations.update_one(
                {"_id": viol["_id"]},
                {"$set": {"notification_sent": True, "notified_at": now_utc - timedelta(days=4)}},
            )
            await db.notification_logs.insert_one(
                {
                    "log_id": str(uuid4()),
                    "employee_id": viol["employee_id"],
                    "recipient": f"{viol['employee_id'].lower()}@company.com",
                    "policy_week": viol["week_label"],
                    "notification_type": "POLICY_VIOLATION_EMAIL",
                    "delivery_status": "SENT",
                    "attempted_at": now_utc - timedelta(days=4),
                    "retry_count": 0,
                    "error_details": None,
                    "provider_response": {"status": "smtp_delivered"},
                }
            )

    violation_count = await db.policy_violations.count_documents({})
    notification_count = await db.notification_logs.count_documents({})
    print(
        f"Seeded {violation_count} policy violations ({notification_count} dispatched, {violation_count - notification_count} pending)."
    )

    await client.close()
    print("Database seeding completed successfully.")


if __name__ == "__main__":
    asyncio.run(seed_data())

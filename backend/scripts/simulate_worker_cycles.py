"""Automated QA Simulation Transaction Suite.

Generates multi-archetype worker cycles (compliant, under-hours deficit,
remote exception, mid-week onboarding, regularization) and validates
the end-to-end policy evaluation transaction pipeline.
"""

import asyncio
import sys
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from uuid import uuid4

# Ensure app is importable when run directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.database import ensure_indexes
from app.schemas.leave import LeaveStatus, LeaveType
from app.schemas.regularization import RegularizationStatus
from app.services.policy_service import PolicyService
from app.utils.time_utils import get_company_tz


async def run_simulation(db: AsyncDatabase | None = None) -> dict:
    settings = get_settings()
    client = None
    should_close = False
    if db is None:
        client = AsyncMongoClient(settings.MONGODB_URI)
        db = client[settings.MONGODB_DATABASE]
        should_close = True

    await ensure_indexes(db)

    # 1. Timeline configuration: Use a completed past week
    # Let's anchor on 2026-09-14 (Monday) to 2026-09-20 (Sunday)
    sim_monday = date(2026, 9, 14)
    sim_sunday = date(2026, 9, 20)
    week_label = "2026-W38"

    print("=" * 70)
    print(" AUTOMATED QA SIMULATION TRANSACTION SUITE")
    print(f" Simulation Window: {sim_monday} to {sim_sunday} ({week_label})")
    print("=" * 70)

    # Clean existing simulation fixtures if requested
    sim_prefix = "EMP_SIM_"
    await db.employees.delete_many({"employee_id": {"$regex": f"^{sim_prefix}"}})
    await db.attendance.delete_many({"employee_id": {"$regex": f"^{sim_prefix}"}})
    await db.leaves.delete_many({"employee_id": {"$regex": f"^{sim_prefix}"}})
    await db.attendance_regularizations.delete_many({"employee_id": {"$regex": f"^{sim_prefix}"}})
    await db.policy_violations.delete_many({"employee_id": {"$regex": f"^{sim_prefix}"}})
    await db.holidays.delete_many({"holiday_id": {"$regex": "^SIM_HOL_"}})

    tz = get_company_tz()
    now = datetime.now(UTC)

    # 2. Worker Archetypes Definition
    workers = [
        {
            "employee_id": "EMP_SIM_01",
            "full_name": "Alex Compliant",
            "email": "alex.sim@company.com",
            "department": "Engineering",
            "role": "EMPLOYEE",
            "is_active": True,
            "archetype": "Compliant (3 days, 16h)",
        },
        {
            "employee_id": "EMP_SIM_02",
            "full_name": "Bob Deficit",
            "email": "bob.sim@company.com",
            "department": "Marketing",
            "role": "EMPLOYEE",
            "is_active": True,
            "archetype": "Deficit (1 day, 4h - Expected Violation)",
        },
        {
            "employee_id": "EMP_SIM_03",
            "full_name": "Charlie Remote",
            "email": "charlie.sim@company.com",
            "department": "Design",
            "role": "EMPLOYEE",
            "is_active": True,
            "allowed_remote_ip": "198.51.100.50",
            "allowed_lat": 12.9716,
            "allowed_lng": 77.5946,
            "geo_fence_radius_meters": 500.0,
            "archetype": "Remote Exception (WFH Approved)",
        },
        {
            "employee_id": "EMP_SIM_04",
            "full_name": "Diana Onboarding",
            "email": "diana.sim@company.com",
            "department": "Operations",
            "role": "EMPLOYEE",
            "is_active": True,
            "hire_date": date(2026, 9, 17),  # Joined Thursday (2 remaining working days)
            "archetype": "Mid-Week Onboarding Joiner (Pro-rata target: 1 day, 5h)",
        },
        {
            "employee_id": "EMP_SIM_05",
            "full_name": "Evan Regularized",
            "email": "evan.sim@company.com",
            "department": "Finance",
            "role": "EMPLOYEE",
            "is_active": True,
            "archetype": "Regularized Attendance (Missed punch corrected)",
        },
    ]

    for w in workers:
        doc = dict(w)
        doc.pop("archetype", None)
        doc["created_at"] = now
        doc["updated_at"] = now
        await db.employees.insert_one(doc)

    print(f"[+] Seeded {len(workers)} worker simulation archetypes.")

    # 3. Transaction Cycles Generation

    # --- Worker 1 (Alex): Mon, Tue, Wed (5.5h, 5.5h, 5h = 16h)
    alex_sessions = [
        {"day": sim_monday, "hours": 5.5},
        {"day": sim_monday + timedelta(days=1), "hours": 5.5},
        {"day": sim_monday + timedelta(days=2), "hours": 5.0},
    ]
    for s in alex_sessions:
        day_str = s["day"].isoformat()
        entry_time = datetime(s["day"].year, s["day"].month, s["day"].day, 9, 0, tzinfo=tz)
        exit_time = entry_time + timedelta(hours=s["hours"])
        await db.attendance.insert_one(
            {
                "attendance_id": str(uuid4()),
                "employee_id": "EMP_SIM_01",
                "work_date": day_str,
                "entry_time": entry_time,
                "exit_time": exit_time,
                "duration_seconds": int(s["hours"] * 3600),
                "attendance_status": "COMPLETED",
                "created_at": now,
                "updated_at": now,
            }
        )

    # --- Worker 2 (Bob): Monday only, 4h
    bob_entry = datetime(sim_monday.year, sim_monday.month, sim_monday.day, 10, 0, tzinfo=tz)
    bob_exit = bob_entry + timedelta(hours=4.0)
    await db.attendance.insert_one(
        {
            "attendance_id": str(uuid4()),
            "employee_id": "EMP_SIM_02",
            "work_date": sim_monday.isoformat(),
            "entry_time": bob_entry,
            "exit_time": bob_exit,
            "duration_seconds": 4 * 3600,
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        }
    )

    # --- Worker 3 (Charlie Remote): Approved Remote Exception for entire week
    await db.leaves.insert_one(
        {
            "leave_id": "SIM_LEAVE_CHARLIE",
            "employee_id": "EMP_SIM_03",
            "leave_type": LeaveType.REMOTE_EXCEPTION.value,
            "status": LeaveStatus.APPROVED.value,
            "start_date": sim_monday.isoformat(),
            "end_date": sim_sunday.isoformat(),
            "reason": "Authorized remote field work cycle",
            "submitted_at": now,
        }
    )
    # Remote clock-in logged with verified coordinates and IP
    charlie_entry = datetime(sim_monday.year, sim_monday.month, sim_monday.day, 9, 15, tzinfo=tz)
    charlie_exit = charlie_entry + timedelta(hours=8.0)
    await db.attendance.insert_one(
        {
            "attendance_id": str(uuid4()),
            "employee_id": "EMP_SIM_03",
            "work_date": sim_monday.isoformat(),
            "entry_time": charlie_entry,
            "exit_time": charlie_exit,
            "duration_seconds": 8 * 3600,
            "client_ip": "198.51.100.50",
            "latitude": 12.9716,
            "longitude": 77.5946,
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        }
    )

    # --- Worker 4 (Diana Onboarding): Works Friday (1 day, 6 hours)
    diana_work_date = sim_monday + timedelta(days=4)  # Friday
    diana_entry = datetime(diana_work_date.year, diana_work_date.month, diana_work_date.day, 9, 30, tzinfo=tz)
    diana_exit = diana_entry + timedelta(hours=6.0)
    await db.attendance.insert_one(
        {
            "attendance_id": str(uuid4()),
            "employee_id": "EMP_SIM_04",
            "work_date": diana_work_date.isoformat(),
            "entry_time": diana_entry,
            "exit_time": diana_exit,
            "duration_seconds": 6 * 3600,
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        }
    )

    # --- Worker 5 (Evan Regularized): 2 office days (Mon, Wed) + 1 approved regularization (Tue)
    evan_mon = datetime(sim_monday.year, sim_monday.month, sim_monday.day, 9, 0, tzinfo=tz)
    await db.attendance.insert_one(
        {
            "attendance_id": str(uuid4()),
            "employee_id": "EMP_SIM_05",
            "work_date": sim_monday.isoformat(),
            "entry_time": evan_mon,
            "exit_time": evan_mon + timedelta(hours=5.5),
            "duration_seconds": int(5.5 * 3600),
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        }
    )
    evan_wed_day = sim_monday + timedelta(days=2)
    evan_wed = datetime(evan_wed_day.year, evan_wed_day.month, evan_wed_day.day, 9, 0, tzinfo=tz)
    await db.attendance.insert_one(
        {
            "attendance_id": str(uuid4()),
            "employee_id": "EMP_SIM_05",
            "work_date": evan_wed_day.isoformat(),
            "entry_time": evan_wed,
            "exit_time": evan_wed + timedelta(hours=5.5),
            "duration_seconds": int(5.5 * 3600),
            "attendance_status": "COMPLETED",
            "created_at": now,
            "updated_at": now,
        }
    )
    # Regularization for Tuesday (5.0 hours) approved by Admin
    tue_day = sim_monday + timedelta(days=1)
    tue_entry = datetime(tue_day.year, tue_day.month, tue_day.day, 9, 30, tzinfo=tz)
    tue_exit = tue_entry + timedelta(hours=5.0)
    await db.attendance_regularizations.insert_one(
        {
            "request_id": "SIM_REG_EVAN",
            "employee_id": "EMP_SIM_05",
            "work_date": tue_day.isoformat(),
            "entry_time": tue_entry,
            "exit_time": tue_exit,
            "duration_seconds": 5 * 3600,
            "duration_hours": 5.0,
            "reason": "Missed RFID scanner punch due to network outage",
            "status": RegularizationStatus.APPROVED.value,
            "submitted_at": now,
            "reviewed_by": "admin",
            "reviewed_at": now,
        }
    )
    # Reflected in attendance collection
    await db.attendance.insert_one(
        {
            "attendance_id": str(uuid4()),
            "employee_id": "EMP_SIM_05",
            "work_date": tue_day.isoformat(),
            "entry_time": tue_entry,
            "exit_time": tue_exit,
            "duration_seconds": 5 * 3600,
            "attendance_status": "COMPLETED",
            "regularized": True,
            "created_at": now,
            "updated_at": now,
        }
    )

    print("[+] Successfully simulated transactions for 5 worker cycles.")

    # 4. Run Policy Evaluation
    policy_service = PolicyService(db)
    await policy_service.evaluate_weekly_policy(sim_monday)

    # 5. Verify Assertions & Synthesize Report Matrix
    sim_violations = await db.policy_violations.find({"employee_id": {"$regex": f"^{sim_prefix}"}}).to_list(100)
    violation_emp_ids = {v["employee_id"] for v in sim_violations}

    # Alex: Must be COMPLIANT
    alex_passed = "EMP_SIM_01" not in violation_emp_ids
    # Bob: Must be VIOLATION
    bob_violation = next((v for v in sim_violations if v["employee_id"] == "EMP_SIM_02"), None)
    bob_passed = bob_violation is not None
    # Charlie: Remote Exception exempt
    charlie_passed = "EMP_SIM_03" not in violation_emp_ids
    # Diana: Mid-week onboarding prorated target met
    diana_passed = "EMP_SIM_04" not in violation_emp_ids
    # Evan: Regularized punch counts toward floor
    evan_passed = "EMP_SIM_05" not in violation_emp_ids

    all_passed = alex_passed and bob_passed and charlie_passed and diana_passed and evan_passed

    report = {
        "simulation_window": f"{sim_monday} to {sim_sunday}",
        "total_simulated_workers": len(workers),
        "total_violations_recorded": len(sim_violations),
        "all_passed": all_passed,
        "archetype_results": [
            {
                "employee_id": "EMP_SIM_01",
                "name": "Alex Compliant",
                "expected": "COMPLIANT",
                "actual": "NON_COMPLIANT" if "EMP_SIM_01" in violation_emp_ids else "COMPLIANT",
                "passed": alex_passed,
            },
            {
                "employee_id": "EMP_SIM_02",
                "name": "Bob Deficit",
                "expected": "NON_COMPLIANT",
                "actual": "NON_COMPLIANT" if "EMP_SIM_02" in violation_emp_ids else "COMPLIANT",
                "passed": bob_passed,
                "reasons": bob_violation.get("violation_reasons") if bob_violation else [],
            },
            {
                "employee_id": "EMP_SIM_03",
                "name": "Charlie Remote",
                "expected": "COMPLIANT (REMOTE_EXCEPTION)",
                "actual": "NON_COMPLIANT" if "EMP_SIM_03" in violation_emp_ids else "COMPLIANT",
                "passed": charlie_passed,
            },
            {
                "employee_id": "EMP_SIM_04",
                "name": "Diana Onboarding",
                "expected": "COMPLIANT (PRO-RATA)",
                "actual": "NON_COMPLIANT" if "EMP_SIM_04" in violation_emp_ids else "COMPLIANT",
                "passed": diana_passed,
            },
            {
                "employee_id": "EMP_SIM_05",
                "name": "Evan Regularized",
                "expected": "COMPLIANT (REGULARIZATION)",
                "actual": "NON_COMPLIANT" if "EMP_SIM_05" in violation_emp_ids else "COMPLIANT",
                "passed": evan_passed,
            },
        ],
    }

    print("\n" + "-" * 70)
    print(" QA SIMULATION TRANSACTION RESULTS MATRIX:")
    print("-" * 70)
    for r in report["archetype_results"]:
        status_symbol = "[PASS]" if r["passed"] else "[FAIL]"
        print(
            f" {status_symbol} {r['employee_id']} - {r['name']:<20} | Expected: {r['expected']:<25} | Actual: {r['actual']}"
        )

    print("-" * 70)
    print(f" Simulation Status: {'SUCCEEDED (100% Verified)' if all_passed else 'FAILED'}")
    print("=" * 70 + "\n")

    if should_close and client:
        await client.close()
    return report


if __name__ == "__main__":
    result = asyncio.run(run_simulation())
    if not result["all_passed"]:
        sys.exit(1)

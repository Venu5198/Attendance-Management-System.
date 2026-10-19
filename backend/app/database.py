import asyncio
import logging

from pymongo import ASCENDING, AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.uri_parser import parse_uri

from app.config import get_settings

logger = logging.getLogger(__name__)


class DatabaseManager:
    client: AsyncMongoClient | None = None
    db: AsyncDatabase | None = None


db_manager = DatabaseManager()


async def get_database() -> AsyncDatabase:
    """Dependency / accessor for the active MongoDB database."""
    if db_manager.db is None:
        raise RuntimeError("Database connection is not initialized.")
    return db_manager.db


async def connect_to_mongo() -> None:
    """Initialize AsyncMongoClient, verify connection, and ensure collection indexes."""
    settings = get_settings()
    logger.info("Connecting to MongoDB at %s", settings.MONGODB_URI)

    db_name = settings.MONGODB_DATABASE
    try:
        parsed = parse_uri(settings.MONGODB_URI)
        if parsed.get("database"):
            db_name = parsed["database"]
    except Exception:
        pass

    max_retries = 10
    retry_delay = 2
    for attempt in range(1, max_retries + 1):
        try:
            db_manager.client = AsyncMongoClient(
                settings.MONGODB_URI,
                serverSelectionTimeoutMS=5000,
            )
            # Verify connection
            await db_manager.client.admin.command("ping")
            db_manager.db = db_manager.client[db_name]
            logger.info("Successfully connected to MongoDB database: %s", db_name)

            await ensure_indexes(db_manager.db)
            break
        except Exception as exc:
            if attempt == max_retries:
                logger.error("Failed to connect to MongoDB after %d attempts: %s", max_retries, exc)
                raise exc
            logger.warning(
                "MongoDB not ready yet (attempt %d/%d): %s. Retrying in %ds...",
                attempt,
                max_retries,
                exc,
                retry_delay,
            )
            await asyncio.sleep(retry_delay)


async def close_mongo_connection() -> None:
    """Gracefully close the MongoDB client connection."""
    if db_manager.client:
        logger.info("Closing MongoDB connection")
        await db_manager.client.close()
        db_manager.client = None
        db_manager.db = None


async def ensure_indexes(db: AsyncDatabase) -> None:
    """Create tenant-isolated compound unique and performance indexes on all collections."""
    logger.info("Ensuring multi-tenant MongoDB indexes...")

    # Helper to safely drop obsolete single-tenant indexes
    obsolete_indexes = [
        ("employees", "idx_employee_id_unique"),
        ("employees", "idx_email_unique"),
        ("users", "idx_user_username_unique"),
        ("users", "idx_user_email_unique"),
        ("users", "idx_user_emp_id_unique"),
        ("attendance", "idx_attendance_emp_date_unique"),
        ("policy_violations", "idx_violations_emp_week_unique"),
        ("holidays", "idx_holiday_date_unique"),
    ]
    for coll_name, idx_name in obsolete_indexes:
        try:
            await db[coll_name].drop_index(idx_name)
        except Exception:
            pass

    # 1. Employees collection indexes (Scoped by tenant_id)
    await db.employees.create_index(
        [("tenant_id", ASCENDING), ("employee_id", ASCENDING)],
        unique=True,
        name="idx_tenant_employee_id_unique",
    )
    await db.employees.create_index(
        [("tenant_id", ASCENDING), ("email", ASCENDING)],
        unique=True,
        name="idx_tenant_email_unique",
    )
    await db.employees.create_index(
        [("tenant_id", ASCENDING), ("is_active", ASCENDING)],
        name="idx_tenant_employee_is_active",
    )
    await db.employees.create_index(
        [("tenant_id", ASCENDING), ("department", ASCENDING)],
        name="idx_tenant_employee_department",
    )

    # 2. Users / Auth collection indexes (Scoped by tenant_id)
    await db.users.create_index(
        [("tenant_id", ASCENDING), ("username", ASCENDING)],
        unique=True,
        name="idx_tenant_user_username_unique",
    )
    await db.users.create_index(
        [("tenant_id", ASCENDING), ("email", ASCENDING)],
        unique=True,
        name="idx_tenant_user_email_unique",
    )
    await db.users.create_index(
        [("tenant_id", ASCENDING), ("employee_id", ASCENDING)],
        unique=True,
        partialFilterExpression={"employee_id": {"$type": "string"}},
        name="idx_tenant_user_emp_id_unique",
    )

    # 3. Attendance collection indexes (Scoped by tenant_id)
    await db.attendance.create_index(
        [("tenant_id", ASCENDING), ("employee_id", ASCENDING), ("work_date", ASCENDING)],
        unique=True,
        name="idx_tenant_attendance_emp_date_unique",
    )
    await db.attendance.create_index(
        [("tenant_id", ASCENDING), ("work_date", ASCENDING)],
        name="idx_tenant_attendance_work_date",
    )
    await db.attendance.create_index(
        [("tenant_id", ASCENDING), ("employee_id", ASCENDING), ("entry_time", ASCENDING)],
        name="idx_tenant_attendance_emp_entry",
    )
    await db.attendance.create_index(
        [("tenant_id", ASCENDING), ("attendance_status", ASCENDING)],
        name="idx_tenant_attendance_status",
    )

    # 4. Policy violations collection indexes (Scoped by tenant_id)
    await db.policy_violations.create_index(
        [("tenant_id", ASCENDING), ("employee_id", ASCENDING), ("week_start", ASCENDING), ("week_end", ASCENDING)],
        unique=True,
        name="idx_tenant_violations_emp_week_unique",
    )
    await db.policy_violations.create_index(
        [("tenant_id", ASCENDING), ("compliance_status", ASCENDING)],
        name="idx_tenant_violations_status",
    )
    await db.policy_violations.create_index(
        [("tenant_id", ASCENDING), ("week_start", ASCENDING)],
        name="idx_tenant_violations_week_start",
    )

    # 5. Notification logs collection indexes
    await db.notification_logs.create_index(
        [("tenant_id", ASCENDING), ("employee_id", ASCENDING), ("policy_week", ASCENDING)],
        name="idx_tenant_notifications_emp_week",
    )

    # 6. Regularization collection indexes
    await db.attendance_regularizations.create_index(
        [("tenant_id", ASCENDING), ("employee_id", ASCENDING)],
        name="idx_tenant_regularize_emp",
    )
    await db.attendance_regularizations.create_index(
        [("tenant_id", ASCENDING), ("status", ASCENDING)],
        name="idx_tenant_regularize_status",
    )
    await db.attendance_regularizations.create_index(
        [("tenant_id", ASCENDING), ("work_date", ASCENDING)],
        name="idx_tenant_regularize_date",
    )

    # 7. Leaves collection indexes
    await db.leaves.create_index(
        [("tenant_id", ASCENDING), ("employee_id", ASCENDING)],
        name="idx_tenant_leaves_emp",
    )
    await db.leaves.create_index(
        [("tenant_id", ASCENDING), ("status", ASCENDING)],
        name="idx_tenant_leaves_status",
    )

    # 8. Holidays collection indexes
    await db.holidays.create_index(
        [("tenant_id", ASCENDING), ("holiday_date", ASCENDING)],
        unique=True,
        name="idx_tenant_holiday_date_unique",
    )

    logger.info("Multi-tenant MongoDB indexes successfully created.")


# Collection getters
def get_employees_collection(db: AsyncDatabase):
    return db.employees


def get_users_collection(db: AsyncDatabase):
    return db.users


def get_attendance_collection(db: AsyncDatabase):
    return db.attendance


def get_violations_collection(db: AsyncDatabase):
    return db.policy_violations


def get_notification_logs_collection(db: AsyncDatabase):
    return db.notification_logs

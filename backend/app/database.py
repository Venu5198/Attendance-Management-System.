import asyncio
import logging

from pymongo import ASCENDING, DESCENDING, AsyncMongoClient
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
    """Create required unique and performance indexes on all collections."""
    logger.info("Ensuring MongoDB indexes...")

    # 1. Employees collection indexes
    await db.employees.create_index([("employee_id", ASCENDING)], unique=True, name="idx_employee_id_unique")
    await db.employees.create_index([("email", ASCENDING)], unique=True, name="idx_email_unique")
    await db.employees.create_index([("is_active", ASCENDING)], name="idx_employee_is_active")
    await db.employees.create_index([("department", ASCENDING)], name="idx_employee_department")

    # 2. Users / Auth collection indexes
    await db.users.create_index([("username", ASCENDING)], unique=True, name="idx_user_username_unique")
    await db.users.create_index([("email", ASCENDING)], unique=True, name="idx_user_email_unique")
    try:
        await db.users.drop_index("idx_user_emp_id_unique")
    except Exception:
        pass
    await db.users.create_index(
        [("employee_id", ASCENDING)],
        unique=True,
        partialFilterExpression={"employee_id": {"$type": "string"}},
        name="idx_user_emp_id_unique",
    )

    # 3. Attendance collection indexes
    # Compound unique index enforces one attendance session per employee per workday
    await db.attendance.create_index(
        [("employee_id", ASCENDING), ("work_date", ASCENDING)],
        unique=True,
        name="idx_attendance_emp_date_unique",
    )
    await db.attendance.create_index([("work_date", ASCENDING)], name="idx_attendance_work_date")
    await db.attendance.create_index(
        [("employee_id", ASCENDING), ("entry_time", ASCENDING)],
        name="idx_attendance_emp_entry",
    )
    await db.attendance.create_index([("attendance_status", ASCENDING)], name="idx_attendance_status")

    # 4. Policy violations collection indexes
    await db.policy_violations.create_index(
        [("employee_id", ASCENDING), ("week_start", ASCENDING), ("week_end", ASCENDING)],
        unique=True,
        name="idx_violations_emp_week_unique",
    )
    await db.policy_violations.create_index([("compliance_status", ASCENDING)], name="idx_violations_status")
    await db.policy_violations.create_index([("week_start", ASCENDING)], name="idx_violations_week_start")

    # 5. Notification logs collection indexes
    await db.notification_logs.create_index(
        [("employee_id", ASCENDING), ("policy_week", ASCENDING)],
        name="idx_notifications_emp_week",
    )
    await db.notification_logs.create_index([("delivery_status", ASCENDING)], name="idx_notifications_status")
    await db.notification_logs.create_index([("attempted_at", DESCENDING)], name="idx_notifications_attempted_at")

    # 6. Regularization collection indexes
    await db.attendance_regularizations.create_index([("employee_id", ASCENDING)], name="idx_regularize_emp")
    await db.attendance_regularizations.create_index([("status", ASCENDING)], name="idx_regularize_status")
    await db.attendance_regularizations.create_index([("work_date", ASCENDING)], name="idx_regularize_date")

    # 7. Leaves collection indexes
    await db.leaves.create_index([("employee_id", ASCENDING)], name="idx_leaves_emp")
    await db.leaves.create_index([("status", ASCENDING)], name="idx_leaves_status")
    await db.leaves.create_index([("start_date", ASCENDING), ("end_date", ASCENDING)], name="idx_leaves_dates")

    logger.info("MongoDB indexes successfully created.")


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

"""Strawberry GraphQL API schema, types, queries, and mutations."""

from datetime import datetime
from typing import Optional
import strawberry
from strawberry.fastapi import GraphQLRouter

from app.database import db_manager, get_database
from app.services.attendance_service import AttendanceService
from app.services.employee_service import EmployeeService
from app.services.report_service import ReportService


# -------------------------------------------------------------------
# GraphQL Types
# -------------------------------------------------------------------
@strawberry.type
class EmployeeType:
    employee_id: str
    first_name: str
    last_name: str
    email: str
    department: str
    designation: str
    is_active: bool
    role: str = "EMPLOYEE"


@strawberry.type
class AttendanceType:
    attendance_id: str
    employee_id: str
    work_date: str
    entry_time: Optional[str] = None
    exit_time: Optional[str] = None
    duration_seconds: int = 0
    duration_hours: float = 0.0
    attendance_status: str


@strawberry.type
class WeeklyComplianceType:
    employee_id: str
    employee_name: str
    department: str
    office_days: int
    total_office_hours: float
    compliance_status: str
    is_compliant: bool


# -------------------------------------------------------------------
# GraphQL Queries
# -------------------------------------------------------------------
@strawberry.type
class Query:
    @strawberry.field
    async def employees(self, limit: int = 50, tenant_id: str = "default") -> list[EmployeeType]:
        """Fetch list of employees with custom field selection within tenant."""
        db = await get_database()
        cursor = db.employees.find(
            {"$or": [{"tenant_id": tenant_id}, {"tenant_id": {"$exists": False}}]}
        ).limit(limit)
        results = []
        async for doc in cursor:
            results.append(
                EmployeeType(
                    employee_id=doc["employee_id"],
                    first_name=doc.get("first_name", ""),
                    last_name=doc.get("last_name", ""),
                    email=doc.get("email", ""),
                    department=doc.get("department", "General"),
                    designation=doc.get("designation", "Staff"),
                    is_active=doc.get("is_active", True),
                    role=doc.get("role", "EMPLOYEE"),
                )
            )
        return results

    @strawberry.field
    async def employee(self, employee_id: str, tenant_id: str = "default") -> Optional[EmployeeType]:
        """Fetch single employee by ID within tenant."""
        db = await get_database()
        doc = await db.employees.find_one(
            {"$or": [{"tenant_id": tenant_id, "employee_id": employee_id}, {"employee_id": employee_id}]}
        )
        if not doc:
            return None
        return EmployeeType(
            employee_id=doc["employee_id"],
            first_name=doc.get("first_name", ""),
            last_name=doc.get("last_name", ""),
            email=doc.get("email", ""),
            department=doc.get("department", "General"),
            designation=doc.get("designation", "Staff"),
            is_active=doc.get("is_active", True),
            role=doc.get("role", "EMPLOYEE"),
        )

    @strawberry.field
    async def today_status(self, employee_id: str, tenant_id: str = "default") -> Optional[AttendanceType]:
        """Fetch today's attendance status for an employee within tenant."""
        db = await get_database()
        service = AttendanceService(db, tenant_id=tenant_id)
        res = await service.get_today_status(employee_id)
        return AttendanceType(
            attendance_id=res.attendance_id,
            employee_id=res.employee_id,
            work_date=res.work_date,
            entry_time=res.entry_time.isoformat() if res.entry_time else None,
            exit_time=res.exit_time.isoformat() if res.exit_time else None,
            duration_seconds=res.duration_seconds,
            duration_hours=res.duration_hours,
            attendance_status=res.attendance_status.value if hasattr(res.attendance_status, "value") else str(res.attendance_status),
        )


# -------------------------------------------------------------------
# GraphQL Mutations
# -------------------------------------------------------------------
@strawberry.type
class Mutation:
    @strawberry.mutation
    async def clock_in(self, employee_id: str, tenant_id: str = "default") -> AttendanceType:
        """Record clock-in via GraphQL mutation within tenant."""
        db = await get_database()
        service = AttendanceService(db, tenant_id=tenant_id)
        res = await service.check_in(employee_id)
        att = res.attendance
        return AttendanceType(
            attendance_id=att.attendance_id,
            employee_id=att.employee_id,
            work_date=att.work_date,
            entry_time=att.entry_time.isoformat() if att.entry_time else None,
            exit_time=att.exit_time.isoformat() if att.exit_time else None,
            duration_seconds=att.duration_seconds,
            duration_hours=att.duration_hours,
            attendance_status=att.attendance_status.value if hasattr(att.attendance_status, "value") else str(att.attendance_status),
        )

    @strawberry.mutation
    async def clock_out(self, employee_id: str, tenant_id: str = "default") -> AttendanceType:
        """Record clock-out via GraphQL mutation within tenant."""
        db = await get_database()
        service = AttendanceService(db, tenant_id=tenant_id)
        res = await service.check_out(employee_id)
        att = res.attendance
        return AttendanceType(
            attendance_id=att.attendance_id,
            employee_id=att.employee_id,
            work_date=att.work_date,
            entry_time=att.entry_time.isoformat() if att.entry_time else None,
            exit_time=att.exit_time.isoformat() if att.exit_time else None,
            duration_seconds=att.duration_seconds,
            duration_hours=att.duration_hours,
            attendance_status=att.attendance_status.value if hasattr(att.attendance_status, "value") else str(att.attendance_status),
        )



schema = strawberry.Schema(query=Query, mutation=Mutation)
graphql_app = GraphQLRouter(schema)

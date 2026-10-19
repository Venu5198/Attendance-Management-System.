"""Employee management business logic service with multi-tenancy support."""

import logging
from datetime import UTC, datetime

from fastapi import HTTPException, status
from pymongo.asynchronous.database import AsyncDatabase

from app.schemas.employee import (
    EmployeeCreate,
    EmployeeListResponse,
    EmployeeResponse,
    EmployeeUpdate,
)

logger = logging.getLogger(__name__)


class EmployeeService:
    def __init__(self, db: AsyncDatabase, tenant_id: str = "default"):
        self.db = db
        self.employees = db.employees
        self.tenant_id = tenant_id

    async def create_employee(self, emp_in: EmployeeCreate) -> EmployeeResponse:
        """Create a new employee with uniqueness enforcement scoped to tenant."""
        # Check duplicate employee_id in this tenant
        if await self.employees.find_one({"tenant_id": self.tenant_id, "employee_id": emp_in.employee_id}):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Employee ID '{emp_in.employee_id}' already exists in this organization",
            )

        # Check duplicate email in this tenant
        if await self.employees.find_one({"tenant_id": self.tenant_id, "email": emp_in.email}):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Employee with email '{emp_in.email}' already exists in this organization",
            )

        now = datetime.now(UTC)
        doc = {
            "tenant_id": self.tenant_id,
            "employee_id": emp_in.employee_id,
            "full_name": emp_in.full_name,
            "email": emp_in.email,
            "department": emp_in.department,
            "role": emp_in.role,
            "is_active": emp_in.is_active,
            "created_at": now,
            "updated_at": now,
        }
        await self.employees.insert_one(doc)

        return EmployeeResponse(
            employee_id=doc["employee_id"],
            full_name=doc["full_name"],
            email=doc["email"],
            department=doc["department"],
            role=doc.get("role", "EMPLOYEE"),
            is_active=doc.get("is_active", True),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

    async def list_employees(self, active_only: bool = False) -> EmployeeListResponse:
        """List all employees within the tenant."""
        query: dict = {
            "$or": [
                {"tenant_id": self.tenant_id},
                {"tenant_id": {"$exists": False}},  # Legacy backwards compatibility
            ]
        }
        if active_only:
            query["is_active"] = True

        cursor = self.employees.find(query).sort("employee_id", 1)
        items: list[EmployeeResponse] = []
        async for doc in cursor:
            items.append(
                EmployeeResponse(
                    employee_id=doc["employee_id"],
                    full_name=doc["full_name"],
                    email=doc["email"],
                    department=doc["department"],
                    role=doc.get("role", "EMPLOYEE"),
                    is_active=doc.get("is_active", True),
                    created_at=doc["created_at"],
                    updated_at=doc["updated_at"],
                )
            )

        return EmployeeListResponse(total=len(items), employees=items)

    async def get_employee_by_id(self, employee_id: str) -> EmployeeResponse:
        """Fetch employee by employee_id within tenant."""
        doc = await self.employees.find_one(
            {
                "$or": [
                    {"tenant_id": self.tenant_id, "employee_id": employee_id},
                    {"employee_id": employee_id},
                ]
            }
        )
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee with ID '{employee_id}' not found",
            )
        return EmployeeResponse(
            employee_id=doc["employee_id"],
            full_name=doc["full_name"],
            email=doc["email"],
            department=doc["department"],
            role=doc.get("role", "EMPLOYEE"),
            is_active=doc.get("is_active", True),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
        )

    async def update_employee(self, employee_id: str, emp_update: EmployeeUpdate) -> EmployeeResponse:
        """Update employee details scoped to tenant. Enforces unique email check if modified."""
        existing = await self.employees.find_one(
            {
                "$or": [
                    {"tenant_id": self.tenant_id, "employee_id": employee_id},
                    {"employee_id": employee_id},
                ]
            }
        )
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Employee with ID '{employee_id}' not found",
            )

        update_dict = emp_update.model_dump(exclude_unset=True)
        if not update_dict:
            return await self.get_employee_by_id(employee_id)

        # If email updated, verify no collision within this tenant
        if "email" in update_dict and update_dict["email"] != existing["email"]:
            dup = await self.employees.find_one({"tenant_id": self.tenant_id, "email": update_dict["email"]})
            if dup:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Email '{update_dict['email']}' is already in use by another employee",
                )

        update_dict["updated_at"] = datetime.now(UTC)
        await self.employees.update_one(
            {"_id": existing["_id"]},
            {"$set": update_dict},
        )
        return await self.get_employee_by_id(employee_id)

    async def deactivate_employee(self, employee_id: str) -> EmployeeResponse:
        """Deactivate employee without deleting their historical attendance."""
        return await self.update_employee(employee_id, EmployeeUpdate(is_active=False))

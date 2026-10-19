"""Multi-Tenant Administration and Provisioning Router."""

import logging
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import require_admin
from app.utils.time_utils import now_utc

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tenants", tags=["Multi-Tenant Administration"])


class TenantCreateRequest(BaseModel):
    tenant_id: str = Field(..., min_length=2, max_length=50, pattern=r"^[a-z0-9-]+$")
    name: str = Field(..., min_length=2, max_length=100)
    plan: str = Field(default="ENTERPRISE")
    max_employees: int = Field(default=500, ge=1)
    contact_email: str | None = None


class TenantResponse(BaseModel):
    tenant_id: str
    name: str
    plan: str
    max_employees: int
    is_active: bool
    contact_email: str | None = None
    created_at: datetime | None = None
    total_employees: int = 0


@router.get(
    "",
    response_model=list[TenantResponse],
    summary="List all provisioned enterprise tenants",
)
async def list_tenants(
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
) -> list[TenantResponse]:
    """Retrieve all active tenant organizations along with current employee counts."""
    # Ensure default tenant exists in registry
    await db.tenants.update_one(
        {"tenant_id": "default"},
        {
            "$setOnInsert": {
                "tenant_id": "default",
                "name": "Global / Default Organization",
                "plan": "ENTERPRISE",
                "max_employees": 1000,
                "is_active": True,
                "created_at": now_utc(),
            }
        },
        upsert=True,
    )

    tenants_cursor = db.tenants.find({})
    tenants = await tenants_cursor.to_list(length=100)

    result = []
    for t in tenants:
        tid = t["tenant_id"]
        # Count employees in this tenant
        emp_count = await db.employees.count_documents(
            {
                "$or": [
                    {"tenant_id": tid},
                    *([{"tenant_id": {"$exists": False}}] if tid == "default" else []),
                ]
            }
        )
        result.append(
            TenantResponse(
                tenant_id=tid,
                name=t.get("name", tid.title()),
                plan=t.get("plan", "ENTERPRISE"),
                max_employees=t.get("max_employees", 500),
                is_active=t.get("is_active", True),
                contact_email=t.get("contact_email"),
                created_at=t.get("created_at"),
                total_employees=emp_count,
            )
        )
    return result


@router.post(
    "",
    response_model=TenantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Provision a new enterprise tenant organization",
)
async def create_tenant(
    body: TenantCreateRequest,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
) -> TenantResponse:
    """Create a new isolated tenant schema partition and register organization."""
    existing = await db.tenants.find_one({"tenant_id": body.tenant_id})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Tenant ID '{body.tenant_id}' already exists.",
        )

    doc = {
        "tenant_id": body.tenant_id,
        "name": body.name,
        "plan": body.plan,
        "max_employees": body.max_employees,
        "contact_email": body.contact_email,
        "is_active": True,
        "created_at": now_utc(),
        "created_by": current_admin.get("username", "admin"),
    }
    await db.tenants.insert_one(doc)

    return TenantResponse(
        tenant_id=body.tenant_id,
        name=body.name,
        plan=body.plan,
        max_employees=body.max_employees,
        is_active=True,
        contact_email=body.contact_email,
        created_at=doc["created_at"],
        total_employees=0,
    )


@router.patch(
    "/{tenant_id}",
    summary="Update tenant status or quotas",
)
async def update_tenant(
    tenant_id: str,
    update_data: dict[str, Any],
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """Toggle tenant active state or adjust employee quota limits."""
    allowed = {"name", "is_active", "max_employees", "contact_email", "plan"}
    clean_update = {k: v for k, v in update_data.items() if k in allowed}
    if not clean_update:
        raise HTTPException(status_code=400, detail="No valid fields to update.")

    res = await db.tenants.update_one({"tenant_id": tenant_id}, {"$set": clean_update})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail=f"Tenant '{tenant_id}' not found.")
    return {"message": f"Tenant '{tenant_id}' updated successfully.", "updated": clean_update}

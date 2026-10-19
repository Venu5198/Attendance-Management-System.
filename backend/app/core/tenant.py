"""Multi-tenancy context, resolution, and tenant isolation utilities."""

import logging
from typing import Annotated
from fastapi import Header, HTTPException, Request, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

DEFAULT_TENANT_ID = "default"


class TenantContext(BaseModel):
    """Execution context for the active tenant."""
    tenant_id: str = Field(default=DEFAULT_TENANT_ID, description="Unique tenant slug or organization ID")
    tenant_name: str | None = None
    is_active: bool = True


def extract_tenant_from_host(host_header: str | None) -> str | None:
    """Extract tenant subdomain from host header (e.g., 'acme.cams.local:8000' -> 'acme')."""
    if not host_header:
        return None
    hostname = host_header.split(":")[0].strip()
    parts = hostname.split(".")
    # If host has subdomain e.g. acme.cams.com or acme.localhost
    if len(parts) >= 2 and parts[0] not in {"www", "api", "localhost", "127", "0"}:
        return parts[0].lower()
    return None


async def get_tenant_id(
    request: Request,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
) -> str:
    """
    FastAPI dependency resolving the tenant identifier with hierarchical precedence:
    1. Explicit 'X-Tenant-ID' HTTP header.
    2. Subdomain from 'Host' header.
    3. Default tenant fallback ('default').
    """
    # 1. Header resolution
    if x_tenant_id and x_tenant_id.strip():
        tenant = x_tenant_id.strip().lower()
        request.state.tenant_id = tenant
        return tenant

    # 2. Host subdomain resolution
    host_tenant = extract_tenant_from_host(request.headers.get("host"))
    if host_tenant:
        request.state.tenant_id = host_tenant
        return host_tenant

    # 3. Default fallback
    request.state.tenant_id = DEFAULT_TENANT_ID
    return DEFAULT_TENANT_ID

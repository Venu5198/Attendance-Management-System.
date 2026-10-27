"""Security middleware for production-grade HTTP security headers and IP filtering."""

import ipaddress
import logging
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger(__name__)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Injects hardened security headers and request correlation IDs into all HTTP responses.
    Mitigates XSS, clickjacking, MIME-sniffing, and SSL stripping while enabling end-to-end tracing.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid4())
        request.state.request_id = request_id

        response: Response = await call_next(request)

        # Request Correlation Header
        response.headers["X-Request-ID"] = request_id

        # Standard Security Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        # Content Security Policy (allow CDN for Swagger / Docs / GraphQL UI)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com; "
            "font-src 'self' data: https://fonts.gstatic.com; "
            "img-src 'self' data: https: https://fastapi.tiangolo.com; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'none';"
        )
        return response


def is_ip_allowed(client_ip: str, allowed_list: list[str]) -> bool:
    """Check if client IP matches allowed IP addresses or CIDR subnets."""
    if not allowed_list or "*" in allowed_list:
        return True

    try:
        ip_obj = ipaddress.ip_address(client_ip)
    except ValueError:
        return False

    for allowed in allowed_list:
        try:
            if "/" in allowed:
                # CIDR subnet check
                network = ipaddress.ip_network(allowed, strict=False)
                if ip_obj in network:
                    return True
            else:
                if ip_obj == ipaddress.ip_address(allowed):
                    return True
        except ValueError:
            continue

    return False

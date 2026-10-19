"""Prometheus custom application and business metrics."""

from prometheus_client import Counter, Gauge

# Business Metrics
ATTENDANCE_CHECKIN_TOTAL = Counter(
    "attendance_checkin_total",
    "Total attendance scan/check-in operations",
    ["tenant_id", "status"],
)

ATTENDANCE_REGULARIZATION_TOTAL = Counter(
    "attendance_regularization_total",
    "Total attendance regularization requests submitted",
    ["tenant_id", "status"],
)

LEAVE_REQUESTS_TOTAL = Counter(
    "leave_requests_total",
    "Total leave applications submitted",
    ["tenant_id", "leave_type"],
)

# Celery & Message Broker Metrics
CELERY_TASKS_DISPATCHED_TOTAL = Counter(
    "celery_tasks_dispatched_total",
    "Total background tasks dispatched to RabbitMQ broker",
    ["task_name", "tenant_id"],
)

# Redis & Cache Metrics
REDIS_CACHE_OPERATIONS_TOTAL = Counter(
    "redis_cache_operations_total",
    "Total Redis cache operations",
    ["operation"],  # hit, miss, set, delete
)

REQUEST_DEDUPLICATIONS_TOTAL = Counter(
    "request_deduplications_total",
    "Total duplicate API requests caught and deduplicated by Redis",
    ["tenant_id", "endpoint"],
)

# Tenant & Active Connection Metrics
ACTIVE_TENANTS_COUNT = Gauge(
    "active_tenants_count",
    "Number of active tenants utilizing the attendance backend",
)

# Distributed Architecture Implementation Guide

## Background Task Processing (RabbitMQ + Celery), Redis Request Deduplication & Multi-Tenancy

---

## 1. System Architecture Blueprint

This document details the exact technical implementation of **Multi-Tenancy**, **Redis Request Deduplication**, and **Asynchronous Background Processing with RabbitMQ and Celery**.

```mermaid
flowchart TD
    subgraph ClientLayer["Client & Tenant Ingress"]
        Client["Browser SPA / Mobile Client"]
        Headers["Headers:\nAuthorization: Bearer <JWT>\nX-Tenant-ID: acme-corp\nX-Idempotency-Key: opt-key-123"]
    end

    subgraph FastAPI["FastAPI Ingress & Interception Layer"]
        TenantResolver["1. Tenant Context Resolver\n(Resolves X-Tenant-ID / Subdomain)"]
        DedupeGuard["2. Redis Deduplication Interceptor\n(SHA-256 Fingerprint Hash)"]
        Router["3. Endpoint Controller\n(/employees/bulk-import-async)"]
    end

    subgraph RedisStore["Redis 7 (In-Memory Guard)"]
        AtomicLock["SET req:<hash> IN_PROGRESS NX EX 120"]
    end

    subgraph MessageBroker["RabbitMQ 3.13 Broker"]
        AMQPExchange["AMQP Direct Exchange\nQueue: 'celery'"]
    end

    subgraph WorkerPool["Celery 5.6.3 Worker Pool"]
        WorkerProcess["Worker Process (Prefork)\nTask: process_employee_excel_import"]
        ProgressUpdater["self.update_state(state='PROGRESS')"]
    end

    subgraph Storage["Persistent Database Layer"]
        MongoDB[("MongoDB 7.0 (Multi-Tenant Partitioned)\nCollections: employees, attendance, audit_logs")]
    end

    Client -->|Upload Excel File| Headers --> TenantResolver
    TenantResolver --> DedupeGuard
    DedupeGuard <-->|Atomic Check & Lock| AtomicLock
    DedupeGuard -->|If Lock Acquired| Router
    DedupeGuard -->|If Locked / In-Progress| Client

    Router -->|1. Dispatch task.delay()| AMQPExchange
    Router -->>|2. Immediate HTTP 202 Accepted {task_id}| Client

    AMQPExchange -->|Pulls Task Message| WorkerProcess
    WorkerProcess --> ProgressUpdater
    WorkerProcess -->|Batch Ingest Records| MongoDB
    Client -.->|Polls GET /tasks/{task_id}| ProgressUpdater
```

---

## 2. Multi-Tenancy Implementation

### 2.1 Architectural Decision: Logical Data Separation

Instead of spinning up a separate MongoDB instance or database per tenant (which causes massive operational overhead and connection pool exhaustion), we chose **Logical Separation with Context-Bound Compound Indexing**:

- Every document in MongoDB embeds a `tenant_id` field.
- Fast, collision-free isolation is enforced with unique compound indexes:
  - Employees: `{"tenant_id": 1, "employee_id": 1}`
  - Attendance: `{"tenant_id": 1, "employee_id": 1, "work_date": 1}`

### 2.2 Hierarchical Tenant Resolution

In [`backend/app/core/tenant.py`](<file:///c:/devops/Attendance%20management/backend/app/core/tenant.py>), we implemented resolution with the following priority:

1. **Explicit HTTP Header:** `X-Tenant-ID: acme-corp`
2. **Subdomain Extraction:** `acme.cams.local:8000` -> resolves `acme`
3. **Default Fallback:** `default`

```python
async def get_tenant_id(
    request: Request,
    x_tenant_id: Annotated[str | None, Header(alias="X-Tenant-ID")] = None,
) -> str:
    if x_tenant_id and x_tenant_id.strip():
        tenant = x_tenant_id.strip().lower()
        request.state.tenant_id = tenant
        return tenant

    host_tenant = extract_tenant_from_host(request.headers.get("host"))
    if host_tenant:
        request.state.tenant_id = host_tenant
        return host_tenant

    request.state.tenant_id = DEFAULT_TENANT_ID
    return DEFAULT_TENANT_ID
```

---

## 3. Redis Request Deduplication (Idempotency Engine)

### 3.1 The Problem

When users upload large spreadsheets or clock in on poor mobile connections, network latency leads to repeated button clicks. Without deduplication:

- Multiple identical Celery tasks flood RabbitMQ.
- Duplicate rows and database race conditions occur.

### 3.2 The Solution

In [`backend/app/core/deduplication.py`](<file:///c:/devops/Attendance%20management/backend/app/core/deduplication.py>):

1. Compute a deterministic **SHA-256 fingerprint** of the request:
   $$
   \text{Fingerprint} = \text{SHA-256}(\text{tenant\_id} \parallel \text{method} \parallel \text{path} \parallel \text{user\_id} \parallel \text{body})
   $$

   *(Or uses the client-supplied `X-Idempotency-Key` if present).*
2. Execute an atomic Redis `SET ... NX EX 120`:
   - `NX`: Only set the key if it does **not** already exist.
   - `EX 120`: Key expires automatically after 120 seconds to prevent permanent locks.

```python
async def acquire_deduplication(fingerprint: str, ttl_seconds: int = 120) -> tuple[bool, dict | None]:
    client = get_redis_client()
    key = f"req:{fingerprint}"
    initial_payload = json.dumps({"status": "IN_PROGRESS", "timestamp": now_utc().isoformat()})

    # Atomic test-and-set
    acquired = await client.set(key, initial_payload, nx=True, ex=ttl_seconds)
    if acquired:
        return True, None

    raw = await client.get(key)
    existing_data = json.loads(raw) if raw else None
    return False, existing_data
```

### 3.3 Interceptor Response Behavior

- **First Request:** Acquires the key -> forwards to RabbitMQ -> returns HTTP 202.
- **Concurrent Duplicate (while processing):** Returns `HTTP 409 Conflict` with:`"Duplicate request detected. An identical file import is already being processed."`
- **Cached Duplicate (after completion):** Returns `HTTP 202 Accepted` with `X-Cache-Deduplicated: true` and the original result.

---

## 4. Background Processing Pipeline (RabbitMQ + Celery)

### 4.1 Broker & Worker Configuration

In [`backend/app/celery_app.py`](<file:///c:/devops/Attendance%20management/backend/app/celery_app.py>):

```python
celery_app = Celery(
    "attendance_tasks",
    broker="amqp://guest:guest@rabbitmq:5672//",
    backend="rpc://",
    include=["app.tasks.employee_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_acks_late=True,                 # Re-queue task if worker crashes mid-execution
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,        # Fair task distribution across worker threads
)
```

---

### 4.2 The Excel File Ingestion Task

In [`backend/app/tasks/employee_tasks.py`](<file:///c:/devops/Attendance%20management/backend/app/tasks/employee_tasks.py>):

```python
@celery_app.task(bind=True, name="app.tasks.employee_tasks.process_employee_excel_import")
def process_employee_excel_import(
    self,
    file_content_b64: str,
    filename: str,
    tenant_id: str = "default",
    uploaded_by: str = "system",
) -> dict:
    file_bytes = base64.b64decode(file_content_b64.encode("ascii"))
    workbook = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    total = len(rows) - 1

    success_count = 0
    failed_count = 0

    for idx, row in enumerate(rows[1:], start=1):
        try:
            # Parse row data and write to MongoDB
            success_count += 1
        except Exception:
            failed_count += 1

        # Real-time progress updates pushed to Celery state
        if idx % 10 == 0 or idx == total:
            self.update_state(
                state="PROGRESS",
                meta={
                    "current": idx,
                    "total": total,
                    "percent": int((idx / total) * 100),
                    "success": success_count,
                    "failed": failed_count,
                    "status": f"Processing row {idx} of {total}...",
                },
            )

    return {
        "status": "SUCCESS",
        "total": total,
        "success_count": success_count,
        "failed_count": failed_count,
    }
```

---

### 4.3 Task Status Tracking API

In [`backend/app/routers/tasks_router.py`](<file:///c:/devops/Attendance%20management/backend/app/routers/tasks_router.py>):
The endpoint `GET /api/v1/tasks/{task_id}` queries Celery's `AsyncResult`:

- **`PENDING`:** Queued in RabbitMQ, awaiting available worker.
- **`PROGRESS`:** Worker is actively processing rows (returns `percent`, `success`, `failed`).
- **`SUCCESS`:** Ingestion complete; returns final record summary.
- **`FAILURE`:** Worker raised an exception; returns error details.
- **`DELETE /tasks/{task_id}`:** Revokes and terminates running tasks immediately via `celery_app.control.revoke(task_id, terminate=True)`.

---

## 5. End-to-End Walkthrough: What Happens on File Upload

1. **User Drops File:** The admin drops `employees.xlsx` on [`frontend/src/components/Employees/BulkImportModal.tsx`](<file:///c:/devops/Attendance%20management/frontend/src/components/Employees/BulkImportModal.tsx>).
2. **Immediate 202 Response:**
   - The backend computes the SHA-256 hash.
   - Atomic lock is acquired in Redis.
   - Task is dispatched to RabbitMQ via `process_employee_excel_import.delay(...)`.
   - The API immediately responds with:
     ```json
     {
       "message": "File accepted. Processing queued in RabbitMQ Celery worker.",
       "task_id": "8cf552a4-4dfb-4b2a-8c34-eb17c6a99e82",
       "fingerprint": "dedup:acme-corp:POST:/employees/bulk-import-async:admin:3f8a9e..."
     }
     ```
3. **Frontend Polling & Animation:**
   - The modal starts a 1.5s polling loop on `GET /api/v1/tasks/{task_id}`.
   - The progress bar dynamically advances from `0%` to `100%`, displaying processed and successful row counts.
4. **Duplicate Protection:**
   - If the user re-uploads the exact same file within 120 seconds, Redis catches the fingerprint and responds with `409 Conflict: Duplicate request detected`.
   - The frontend displays a yellow **"Redis Deduplication Triggered"** badge instead of re-running the job.

---

## 6. How to Run and Test

### 6.1 Automated Integration Tests

Run the dedicated test suite inside the container:

```bash
docker compose exec -T backend pytest tests/integration/test_celery_deduplication.py -v
```

**What it tests:**

- `test_async_bulk_import_api_and_task_polling`: Validates 202 Accepted, task creation, and polling.
- `test_redis_request_deduplication_intercept`: Submits two identical requests and verifies that the second is blocked with HTTP 409.
- `test_idempotency_key_override`: Verifies that unique `X-Idempotency-Key` headers allow subsequent imports cleanly.

### 6.2 Manual Verification via CLI

#### 1. First Upload (Accepted)

```powershell
curl.exe -X POST "http://localhost:8000/api/v1/employees/bulk-import-async" `
  -H "Authorization: Bearer <TOKEN>" `
  -H "X-Tenant-ID: acme-corp" `
  -F "file=@employees.xlsx"
```

**Output:** `HTTP 202 Accepted` with `task_id`.

#### 2. Immediate Duplicate Upload (Blocked by Redis)

```powershell
curl.exe -X POST "http://localhost:8000/api/v1/employees/bulk-import-async" `
  -H "Authorization: Bearer <TOKEN>" `
  -H "X-Tenant-ID: acme-corp" `
  -F "file=@employees.xlsx"
```

**Output:** `HTTP 409 Conflict: Duplicate request detected. An identical file import is already being processed.`

#### 3. Inspect RabbitMQ Queue

Open the RabbitMQ Management UI at `http://localhost:15672` (User: `guest` / Pass: `guest`) -> navigate to **Queues** -> observe incoming and processed messages on queue `celery`.

# Centralized Employee Attendance Management Backend

A production-grade, secure, and resilient backend system built with **FastAPI**, **Pydantic v2**, and the official **PyMongo Asynchronous API** (`AsyncMongoClient`). The system automates employee attendance tracking, evaluates company Work-From-Home (WFH) compliance, aggregates multi-period reports across the organization via a single endpoint, and dispatches automated violation notices.

---

## 1. Project Overview & Business Requirements

### Company Attendance Policy

To maintain balanced hybrid work collaboration:

1. **Minimum Office Days:** Every employee must attend the office at least **3 days per week**.
2. **Minimum Office Hours:** Every employee must accumulate at least **15 completed office hours per week**.
3. **Daily Average:** When attending exactly 3 days, this averages 5 hours per attended day.
4. **Independent Evaluation:** Both conditions must be met for an employee to be **COMPLIANT**:
   - `office_days >= 3 AND total_office_hours >= 15.0` $\rightarrow$ `COMPLIANT`
   - `office_days < 3 OR total_office_hours < 15.0` $\rightarrow$ `NON_COMPLIANT` (for completed policy weeks)

### Policy Evaluation Rules Matrix

| Office Days | Completed Office Hours | Evaluation Status | Reasons                                                      |
| :---------: | :--------------------: | :---------------: | :----------------------------------------------------------- |
| **3** |     **15.0**     |   `COMPLIANT`   | Fully compliant                                              |
| **4** |     **20.0**     |   `COMPLIANT`   | Exceeds minimum requirements                                 |
| **2** |     **16.0**     | `NON_COMPLIANT` | Office attendance was 2 days (< 3 days required)             |
| **3** |     **12.0**     | `NON_COMPLIANT` | Accumulated office hours were 12.0 hrs (< 15.0 hrs required) |
| **1** |     **5.0**     | `NON_COMPLIANT` | Both days and hours below minimum                            |
| **0** |     **0.0**     | `NON_COMPLIANT` | Zero attendance in completed policy week                     |

### Key System Assumptions

- **Policy Week Boundary:** Defined strictly as **Monday 00:00:00 to Sunday 23:59:59** in the configured company timezone (`Asia/Kolkata`).
- **Session Model:** One attendance session per employee per workday (enforced via MongoDB compound unique index `[employee_id, work_date]`).
- **Server Timestamps:** Entry and exit timestamps are generated server-side in UTC to prevent client timestamp tampering.
- **Duration Calculation:** Strictly calculated as `(exit_time - entry_time)` in seconds. Entry alone without check-out remains `IN_PROGRESS` and contributes 0 hours to completed totals until checked out.
- **Incomplete Weeks:** Active ongoing weeks are evaluated as `PENDING` unless already compliant, ensuring employees are not falsely flagged with violations before their week finishes.

---

## 2. Technology Stack

| Layer                          | Component                      | Description                                              |
| ------------------------------ | ------------------------------ | -------------------------------------------------------- |
| **Runtime**              | Python 3.12+                   | Asynchronous Python runtime                              |
| **API Framework**        | FastAPI (0.119+)               | Modern high-performance async REST API                   |
| **Data Validation**      | Pydantic v2                    | Robust schema serialization and request parsing          |
| **Database**             | MongoDB 7.0                    | Document store for high throughput and flexible schema   |
| **Database Driver**      | PyMongo Async API              | Native`pymongo.AsyncMongoClient` async engine          |
| **Authentication**       | JWT (PyJWT) & Bcrypt           | Bearer tokens with RFC-standard authorization            |
| **Authorization**        | RBAC (`ADMIN`, `EMPLOYEE`) | Fine-grained endpoint permissions and resource ownership |
| **Background Scheduler** | APScheduler (3.10+)            | Automated cron-based weekly compliance and notifications |
| **Email Service**        | SMTP / SendGrid / Mock         | Configurable email delivery with idempotency tracking    |
| **Testing**              | pytest & HTTPX                 | 29 unit and integration tests with async coverage        |
| **Code Quality**         | Ruff                           | Modern linter and code formatter                         |
| **Security Scanning**    | Bandit & pip-audit             | Static security analysis and vulnerability auditing      |
| **Containers**           | Docker & Docker Compose        | Multi-container reproducible environments                |
| **CI Pipeline**          | GitHub Actions                 | Automated lint, security scan, test, and container build |

---

## 3. Architecture & Request Flow

```
                                      ┌────────────────────────────────────────────────────────┐
                                      │                   FastAPI Application                  │
[Client Request] ──(Bearer Token)──>  │                                                        │
                                      │  ┌─────────────────────────┐   ┌────────────────────┐  │
                                      │  │ Dependencies & RBAC     │──>│ Routers:           │  │
                                      │  │ - JWT Token Validation  │   │ - /auth            │  │
                                      │  │ - Role Verification     │   │ - /employees       │  │
                                      │  │ - Resource Ownership    │   │ - /attendance      │  │
                                      │  └─────────────────────────┘   │ - /violations      │  │
                                      │                                │ - /health          │  │
                                      │                                └─────────┬──────────┘  │
                                      │                                          │             │
                                      │                                          ▼             │
                                      │  ┌──────────────────────────────────────────────────┐  │
                                      │  │ Service Business Logic Layer                     │  │
                                      │  │ - ReportService  (Single Central Aggregator)     │  │
                                      │  │ - PolicyService  (3-Day & 15-Hr Compliance)      │  │
                                      │  │ - AttendanceService (Check-in / Check-out)       │  │
                                      │  │ - EmailService   (Idempotent Notifications)      │  │
                                      │  └───────────────────────┬──────────────────────────┘  │
                                      │                          │                             │
                                      └──────────────────────────┼─────────────────────────────┘
                                                                 │
                                                                 ▼
                                                  ┌──────────────────────────────┐
                                                  │       MongoDB Database       │
                                                  │ - employees                  │
                                                  │ - attendance                 │
                                                  │ - users                      │
                                                  │ - policy_violations          │
                                                  │ - notification_logs          │
                                                  └──────────────────────────────┘
```

---

## 4. Repository Structure

```text
attendance-management-backend/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI lifespan, CORS, and centralized exception handling
│   ├── config.py                # Pydantic Settings management (.env loader)
│   ├── database.py              # AsyncMongoClient lifecycle and index initialization
│   ├── dependencies.py          # JWT authentication, role verification, ownership checks
│   ├── models/                  # Domain document structures
│   ├── schemas/                 # Pydantic request and response schemas
│   │   ├── auth.py
│   │   ├── employee.py
│   │   ├── attendance.py
│   │   ├── policy.py
│   │   ├── report.py            # Central reporting schemas
│   │   └── notification.py
│   ├── routers/                 # API route handlers
│   │   ├── auth.py              # /api/v1/auth/login, /register, /me
│   │   ├── employees.py         # /api/v1/employees CRUD
│   │   ├── attendance.py        # /api/v1/attendance check-in, check-out, today
│   │   ├── reports.py           # /api/v1/attendance/report (Single Central Reporting)
│   │   ├── violations.py        # /api/v1/violations, evaluation, dispatch
│   │   └── health.py            # /health and /api/v1/health
│   ├── services/                # Business logic services
│   │   ├── auth_service.py
│   │   ├── employee_service.py
│   │   ├── attendance_service.py
│   │   ├── policy_service.py    # Policy evaluation engine
│   │   ├── report_service.py    # Single report generation across all modes
│   │   └── email_service.py     # Idempotent notification delivery
│   ├── scheduler/
│   │   └── jobs.py              # APScheduler background compliance cron
│   └── utils/
│       ├── security.py          # Bcrypt hashing and JWT encoding/decoding
│       └── time_utils.py        # Timezone conversion and policy week boundaries
├── tests/
│   ├── conftest.py              # Pytest fixtures and isolated MongoDB test setup
│   ├── unit/
│   │   ├── test_time_utils.py
│   │   ├── test_policy_service.py
│   │   └── test_email_service.py
│   └── integration/
│       ├── test_auth_api.py
│       ├── test_employee_api.py
│       ├── test_attendance_api.py
│       ├── test_reports_api.py
│       └── test_violations_scheduler_api.py
├── scripts/
│   ├── seed_data.py             # Realistic seed with 12 employees & attendance scenarios
│   └── create_admin.py          # CLI tool to securely bootstrap administrator accounts
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI workflow (lint, test, build)
├── Dockerfile                   # Python 3.12 slim container
├── compose.yaml                 # Docker Compose with MongoDB and health checks
├── requirements.txt             # Locked project dependencies
├── pyproject.toml               # Ruff and project configuration
├── pytest.ini                   # Pytest async configuration
├── .env.example                 # Example configuration template
└── README.md                    # Comprehensive documentation
```

---

## 5. MongoDB Database Design & Indexes

### Collections

#### 1. `employees`

Stores employee identity, contact information, department, role, and active status.

- **Indexes:**
  - `idx_employee_id_unique`: `{ "employee_id": 1 }` (Unique)
  - `idx_email_unique`: `{ "email": 1 }` (Unique)
  - `idx_employee_is_active`: `{ "is_active": 1 }`
  - `idx_employee_department`: `{ "department": 1 }`

#### 2. `users`

Stores authentication credentials, bcrypt password hash, assigned role, and linked employee ID.

- **Indexes:**
  - `idx_user_username_unique`: `{ "username": 1 }` (Unique)
  - `idx_user_email_unique`: `{ "email": 1 }` (Unique)
  - `idx_user_emp_id_unique`: `{ "employee_id": 1 }` (Unique, `partialFilterExpression: {"employee_id": {"$type": "string"}}`)

#### 3. `attendance`

Stores daily entry/exit timestamps, work date (YYYY-MM-DD), duration in seconds, and status (`COMPLETED`, `IN_PROGRESS`, `NOT_ATTENDED`).

- **Indexes:**
  - `idx_attendance_emp_date_unique`: `{ "employee_id": 1, "work_date": 1 }` (Compound Unique — enforces single session per day)
  - `idx_attendance_work_date`: `{ "work_date": 1 }`
  - `idx_attendance_emp_entry`: `{ "employee_id": 1, "entry_time": 1 }`
  - `idx_attendance_status`: `{ "attendance_status": 1 }`

#### 4. `policy_violations`

Stores evaluated weekly compliance records, attended days, total hours, and violation reasons for completed policy weeks.

- **Indexes:**
  - `idx_violations_emp_week_unique`: `{ "employee_id": 1, "week_start": 1, "week_end": 1 }` (Compound Unique — prevents duplicate evaluations)
  - `idx_violations_status`: `{ "compliance_status": 1 }`
  - `idx_violations_week_start`: `{ "week_start": 1 }`

#### 5. `notification_logs`

Audit log of all violation email notification attempts, delivery status, retries, and errors.

- **Indexes:**
  - `idx_notifications_emp_week`: `{ "employee_id": 1, "policy_week": 1 }`
  - `idx_notifications_status`: `{ "delivery_status": 1 }`
  - `idx_notifications_attempted_at`: `{ "attempted_at": -1 }`

---

## 6. Installation & Local Setup

### Prerequisites

- Python 3.12+
- MongoDB 7.0+ (running locally or via Docker)

### 1. Clone & Set Up Virtual Environment

```bash
cd "c:\devops\Attendance management backend"

# Create virtual environment
python -m venv .venv

# Activate virtual environment (Windows PowerShell)
.venv\Scripts\Activate.ps1

# Upgrade pip and install dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Review the `.env` settings:

```env
MONGODB_URI="mongodb://localhost:27018"
MONGODB_DATABASE="attendance_db"
JWT_SECRET_KEY="your-secure-random-secret-key"
COMPANY_TIMEZONE="Asia/Kolkata"
POLICY_REQUIRED_DAYS=3
POLICY_REQUIRED_HOURS=15.0
EMAIL_PROVIDER="mock"
SCHEDULER_ENABLED=true
```

### 3. Bootstrap Administrator Account

Never use a hardcoded default password in production. Provision an administrator securely via CLI:

```bash
python scripts/create_admin.py --username admin --email admin@company.com --password AdminPass123!
```

### 4. Seed Database with Realistic Scenarios

Populate 12 employees across multiple departments and realistic attendance scenarios:

```bash
python scripts/seed_data.py
```

### 5. Start Application Locally

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

The interactive OpenAPI Swagger documentation is available at:
`http://localhost:8000/docs`

---

## 7. Running with Docker Compose

Launch the complete stack (FastAPI Backend + MongoDB) in Docker containers with automatic health checks:

```bash
# Build and start services in background
docker compose up --build -d

# Check service status
docker compose ps

# View backend logs
docker compose logs -f api

# Stop services
docker compose down
```

> **Network Note:** Inside the Docker Compose network, the backend accesses MongoDB via `mongodb://mongodb:27017`. When running the backend directly on your host machine outside Docker, point `MONGODB_URI` to `mongodb://localhost:27018` or `mongodb://localhost:27017`.

---

## 8. Single Central Reporting API (`/api/v1/attendance/report`)

The central reporting endpoint supports **all five reporting modes** in a single route:

`GET /api/v1/attendance/report`

### Query Parameters

| Parameter       | Type   |           Required           | Description                                                                        |
| --------------- | ------ | :--------------------------: | ---------------------------------------------------------------------------------- |
| `period`      | string |        **Yes**        | `daily`, `weekly`, `monthly`, `yearly`, or `custom`                      |
| `target_date` | string |              No              | Reference date (`YYYY-MM-DD`) for `daily`, `weekly`, `monthly`, `yearly` |
| `start_date`  | string | **Yes** for `custom` | Start boundary (`YYYY-MM-DD`)                                                    |
| `end_date`    | string | **Yes** for `custom` | End boundary (`YYYY-MM-DD`)                                                      |
| `employee_id` | string |              No              | Filter by specific employee (Administrators only)                                  |

### Reporting Modes

#### 1. Daily Report

`GET /api/v1/attendance/report?period=daily&target_date=2026-09-28`
Returns day-level entry time, exit time, duration, and status (`COMPLETED`, `IN_PROGRESS`, `NOT_ATTENDED`) for every employee.

#### 2. Weekly Report

`GET /api/v1/attendance/report?period=weekly&target_date=2026-09-30`
Evaluates the Monday-to-Sunday business week. Includes attended days, total hours, and compliance status (`COMPLIANT`, `NON_COMPLIANT`, `PENDING`).

#### 3. Monthly Report

`GET /api/v1/attendance/report?period=monthly&target_date=2026-09-15`
Covers the calendar month (1st to last day) and evaluates weekly compliance for all overlapping policy weeks.

#### 4. Yearly Report

`GET /api/v1/attendance/report?period=yearly&target_date=2026-06-01`
Covers Jan 1 to Dec 31 and presents overall employee totals alongside individual weekly compliance outcomes.

#### 5. Custom Date Range Report

`GET /api/v1/attendance/report?period=custom&start_date=2026-09-28&end_date=2026-10-02`
Filters arbitrary date ranges while preserving policy week boundaries.

### Example Response Schema

```json
{
  "metadata": {
    "period": "weekly",
    "start_date": "2026-09-28",
    "end_date": "2026-10-04",
    "company_timezone": "Asia/Kolkata",
    "generated_at": "2026-10-09T14:10:17.445076Z",
    "total_employees": 11,
    "covered_policy_weeks_count": 1
  },
  "summary": {
    "total_active_employees": 11,
    "total_office_days_accumulated": 28,
    "total_office_hours_accumulated": 150.5,
    "average_hours_per_employee": 13.68,
    "compliant_weeks_count": 5,
    "non_compliant_weeks_count": 6,
    "pending_weeks_count": 0
  },
  "employees": [
    {
      "employee_id": "EMP001",
      "full_name": "Alice Chen",
      "email": "alice.chen@company.com",
      "department": "Engineering",
      "is_active": true,
      "total_attended_days": 3,
      "total_office_hours": 15.0,
      "total_duration_seconds": 54000,
      "daily_records": [
        {
          "work_date": "2026-09-28",
          "entry_time": "2026-09-28T03:30:00Z",
          "exit_time": "2026-09-28T08:30:00Z",
          "duration_seconds": 18000,
          "duration_hours": 5.0,
          "status": "COMPLETED"
        }
      ],
      "weekly_compliance": [
        {
          "employee_id": "EMP001",
          "week_start": "2026-09-28",
          "week_end": "2026-10-04",
          "week_label": "2026-09-28_to_2026-10-04",
          "office_days": 3,
          "total_office_hours": 15.0,
          "total_duration_seconds": 54000,
          "required_days": 3,
          "required_hours": 15.0,
          "is_week_completed": true,
          "compliance_status": "COMPLIANT",
          "violation_reasons": []
        }
      ],
      "overall_compliance": "COMPLIANT"
    }
  ]
}
```

---

## 9. Automated Email Notifications & Background Scheduler

### Notification Idempotency

- When an employee violates the policy in a completed week, an email is dispatched.
- Each attempt is recorded in `notification_logs`.
- If an employee has already received a notice for `policy_week`, repeated runs **skip** sending to prevent inbox spam.
- Manual resend is supported using `force_resend=true`.

### Automated Scheduler (APScheduler)

- Background cron runs weekly compliance evaluation (default: every Monday at 02:00 AM in company timezone).
- Evaluates the preceding Monday-to-Sunday completed week.
- Persists violations into `policy_violations`.
- Dispatches emails idempotently to non-compliant active employees.

### Multi-Instance Deployment Consideration

In horizontal multi-instance deployments (e.g. multiple container replicas), configure only **one** instance as the designated scheduler runner (`SCHEDULER_ENABLED=true`), or integrate a database-backed distributed lock (such as a MongoDB lease lock document) to ensure duplicate jobs do not execute simultaneously.

---

## 10. Automated Tests & Code Quality

### Running Tests

Execute the complete test suite with coverage:

```bash
pytest -v --cov=app --cov-report=term-missing tests/
```

**Results:**

- **29 Passed, 0 Failed**
- **79% Overall Coverage** (Report Service: 98%, Policy Service: 96%)

### Running Linting & Formatting Checks

```bash
# Check code style and rules
ruff check .

# Check code formatting
ruff format --check .
```

### Running Security Scans

```bash
# Static security analysis
bandit -r app

# Dependency vulnerability scan
pip-audit -r requirements.txt
```

---

## 11. Complete API Reference

| Method     | Endpoint                                      | Access                   | Summary                                 |
| ---------- | --------------------------------------------- | ------------------------ | --------------------------------------- |
| `POST`   | `/api/v1/auth/login`                        | Public                   | Obtain JWT bearer access token          |
| `POST`   | `/api/v1/auth/register`                     | `ADMIN`                | Provision user account                  |
| `GET`    | `/api/v1/auth/me`                           | Authenticated            | Get current authenticated profile       |
| `POST`   | `/api/v1/employees`                         | `ADMIN`                | Register new employee                   |
| `GET`    | `/api/v1/employees`                         | `ADMIN`                | List all employees                      |
| `GET`    | `/api/v1/employees/{id}`                    | `ADMIN` / Self         | Get employee by ID                      |
| `PUT`    | `/api/v1/employees/{id}`                    | `ADMIN`                | Update employee details                 |
| `DELETE` | `/api/v1/employees/{id}`                    | `ADMIN`                | Deactivate employee (preserves history) |
| `POST`   | `/api/v1/attendance/check-in`               | `EMPLOYEE` / `ADMIN` | Record entry timestamp                  |
| `POST`   | `/api/v1/attendance/check-out`              | `EMPLOYEE` / `ADMIN` | Record exit timestamp & duration        |
| `GET`    | `/api/v1/attendance/today`                  | `EMPLOYEE` / `ADMIN` | Get today's attendance status           |
| `GET`    | `/api/v1/attendance/history/{id}`           | `ADMIN` / Self         | Get attendance record history           |
| `GET`    | `/api/v1/attendance/report`                 | Authenticated            | **Single Central Reporting API**  |
| `GET`    | `/api/v1/violations`                        | `ADMIN`                | List recorded policy violations         |
| `POST`   | `/api/v1/violations/evaluate`               | `ADMIN`                | Manually evaluate completed week        |
| `POST`   | `/api/v1/violations/dispatch-notifications` | `ADMIN`                | Dispatch violation notices              |
| `GET`    | `/api/v1/violations/notification-logs`      | `ADMIN`                | Inspect notification delivery logs      |
| `GET`    | `/health`                                   | Public                   | Uptime and MongoDB ping check           |

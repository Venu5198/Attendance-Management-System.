# Architecture Overview

## 1. System Topology

The Centralized Attendance Management System is architected as a decoupled full-stack monorepo:

```
[ Browser / Client ]
         │  HTTP (REST + JWT Bearer)
         ▼
[ React + Vite + Tailwind Frontend ] (Port 5173)
         │  Axios Client
         ▼
[ FastAPI Backend Gateway ] (Port 8000)
   ├── Routers (Auth, Employees, Attendance, Reports, Violations, Health)
   ├── Security & RBAC Middleware (JWT validation, Role guards, CORS, HTTP Headers)
   ├── Core Services
   │     ├── AttendanceService
   │     ├── PolicyService (3 days / 15 hrs calendar week rules)
   │     ├── ReportService (Centralized multi-period reporting)
   │     ├── EmailService (SMTP / SendGrid / Mock with idempotency)
   │     └── EmployeeService
   ├── APScheduler (Automated weekly policy evaluation & notifications)
   └── Motor / Async PyMongo (Async MongoDB Driver)
         │
         ▼
[ MongoDB Database ] (Port 27017 / 27018)
```

## 2. Directory Structure

```
C:\devops\Attendance management
├── backend\
│   ├── app\
│   │   ├── models\          # Internal database document models
│   │   ├── routers\         # FastAPI API endpoints
│   │   ├── schemas\         # Pydantic v2 validation contracts
│   │   ├── scheduler\       # APScheduler cron jobs
│   │   ├── services\        # Core domain business logic
│   │   ├── utils\            # Timezone, date, and math calculations
│   │   ├── config.py        # Centralized settings via pydantic-settings
│   │   ├── database.py      # MongoDB client and index lifecycle
│   │   ├── dependencies.py  # FastApi dependency injection (auth, RBAC)
│   │   └── main.py          # FastAPI application entrypoint
│   ├── tests\               # Pytest test suite (integration & unit)
│   ├── Dockerfile
│   ├── compose.yaml
│   ├── pyproject.toml
│   └── requirements.txt
├── frontend\
│   ├── src\
│   │   ├── api\             # Centralized Axios client & resource services
│   │   ├── auth\            # AuthContext, ProtectedRoute, RoleProtectedRoute
│   │   ├── components\      # Reusable UI cards, tables, badges, layouts
│   │   ├── pages\           # Dashboards, attendance, reports, violations
│   │   └── types\           # Shared TypeScript interfaces
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
├── docs\                    # System documentation
└── README.md
```

## 3. Business Policy Specification

Compliance requires meeting both criteria in each Monday–Sunday calendar week:
1. **Attendance Days:** $\ge 3$ office days per calendar week.
2. **Office Hours:** $\ge 15.0$ total hours per calendar week.

- An employee is compliant only when:
  `attendance_days >= 3 AND total_hours >= 15.0`
- If either condition is not met for a completed week, the week is flagged as `NON_COMPLIANT` and recorded in the policy violations collection.
- In-progress calendar weeks are categorized as `PENDING` to prevent premature violation alerts.
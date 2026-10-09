# Attendance Management System

Enterprise-grade, full-stack Attendance Management and WFH Compliance Tracking Platform built with FastAPI, MongoDB, React, TypeScript, and Vite.

---

## 1. Project Overview

The Attendance Management System provides end-to-end management of physical office presence, automated Work From Home (WFH) policy enforcement, centralized cross-period compliance reporting, and automated email warning dispatch for policy breaches.

### WFH Attendance Policy
Compliance requires meeting **both** thresholds in every Monday–Sunday calendar week:
- **Office Attendance:** $\ge 3$ days per calendar week
- **Office Working Hours:** $\ge 15.0$ hours per calendar week
- *Average target:* 5 hours/day across 3 attendance days

---

## 2. Monorepo Structure

```
C:\devops\Attendance management
├── backend\
│   ├── app\             # FastAPI backend source code
│   ├── tests\           # Pytest unit & integration test suite (29 tests)
│   ├── scripts\         # Seed and database maintenance scripts
│   ├── Dockerfile
│   ├── compose.yaml
│   ├── requirements.txt
│   └── README.md
├── frontend\
│   ├── src\             # React + TypeScript + Vite + Tailwind dashboard
│   ├── public\
│   ├── package.json
│   ├── vite.config.ts
│   └── README.md
├── docs\
│   ├── architecture.md  # System topology & service breakdown
│   ├── security.md      # Authentication, RBAC, headers, and secrets
│   ├── api.md           # REST endpoint documentation
│   └── development.md   # Setup, test, and container deployment guide
├── .gitignore
└── README.md
```

---

## 3. Technology Stack

- **Backend:** Python 3.12+, FastAPI, Pydantic v2, Motor (Async PyMongo), MongoDB 6+, JWT, APScheduler, Pytest.
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Axios, Lucide React, React Router v7.
- **DevOps & Quality:** Docker, Docker Compose, Pytest-cov, Ruff, Bandit.

---

## 4. Quick Start

### Backend
```bash
cd "C:\devops\Attendance management\backend"
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
Backend API docs available at: `http://localhost:8000/docs`

### Frontend
```bash
cd "C:\devops\Attendance management\frontend"
npm install
npm run dev
```
Access dashboard at: `http://localhost:5173`

---

## 5. Security & RBAC

- **Role-Based Access Control:** Strict RBAC separating `ADMIN` and `EMPLOYEE`.
- **Resource Protection:** Employees can only access their own attendance logs and reports.
- **HTTP Hardening:** Security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection`).
- **CORS:** Environment-controlled via `CORS_ORIGINS`.

---

## 6. Verification & Test Results

- Backend Pytest Suite: **29 passed, 0 failed** (100% test pass rate).
- Frontend Build: **TypeScript build & Vite bundling completed with 0 errors**.
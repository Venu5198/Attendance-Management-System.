# Attendance Management System

Enterprise-grade, full-stack Attendance Management and WFH Compliance Tracking Platform built with FastAPI, MongoDB, React, TypeScript, and Docker.

---

## 1. Project Overview

The Attendance Management System provides end-to-end management of physical office presence, automated Work From Home (WFH) policy enforcement, centralized compliance reporting, and automated email warning dispatch for policy breaches.

### WFH Attendance Policy
Compliance requires meeting **both** thresholds in every Monday–Sunday calendar week:
- **Office Attendance:** $\ge 3$ days per calendar week
- **Office Working Hours:** $\ge 15.0$ hours per calendar week
- *Average target:* 5 hours/day across 3 attendance days

---

## 2. Architecture & Monorepo Structure

```
Attendance management/
├── .env                     # Global environment variables
├── docker-compose.yml       # Production-ready multi-container orchestration
├── backend/
│   ├── app/                 # FastAPI application (routes, models, services)
│   ├── tests/               # Pytest unit & integration test suite (29 tests)
│   ├── scripts/             # Database seed & admin creation scripts
│   ├── Dockerfile           # Optimized Python 3.12-slim backend container
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/                 # React 19 + TypeScript + Tailwind CSS application
│   ├── nginx.conf           # Production Nginx reverse proxy configuration
│   ├── Dockerfile           # Multi-stage build (Node build -> Nginx alpine)
│   └── package.json
└── docs/                    # Architecture, API, and security documentation
```

---

## 3. Technology Stack

- **Backend:** Python 3.12, FastAPI, Pydantic v2, Motor (Async PyMongo), MongoDB 7.0, python-jose (JWT), APScheduler, Pytest.
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Axios, Lucide React, React Router v7, Nginx.
- **DevOps & Containers:** Docker Compose, Healthchecks, Isolated Bridge Network, Non-root containers.

---

## 4. Quick Start (Docker Compose - Recommended)

### 1. Launch Services
Run the full stack with automatic networking and health checks:
```bash
docker-compose up -d
```

### 2. Seed Database
Populate initial employees, user accounts, and historical attendance logs:
```bash
docker exec attendance_backend python scripts/seed_data.py
```

### 3. Access Interfaces
| Service | URL | Notes |
| :--- | :--- | :--- |
| **Web Dashboard** | [http://localhost:5173](http://localhost:5173) | React frontend served via Nginx |
| **API Documentation** | [http://localhost:8000/docs](http://localhost:8000/docs) | Interactive Swagger UI |
| **Health Check** | [http://localhost:8000/health](http://localhost:8000/health) | API & MongoDB status |
| **MongoDB** | `mongodb://localhost:27017` | Database engine |

### Default Credentials (from seed data)
- **Administrator:** `admin` / `AdminPass123!` (Full dashboard, reports, employee management)
- **Employee:** `emp001` / `EmpPass123!` (Live check-in/out, personal compliance stats)

---

## 5. Local Development (Without Docker)

### Backend
```bash
cd backend
python -m venv venv
venv\Scripts\activate   # On Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 6. Environment Variables (`.env`)

| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `MONGO_URI` | `mongodb://mongodb:27017` | MongoDB connection URI |
| `MONGO_DB` | `attendance_db` | Database name |
| `JWT_SECRET_KEY` | `dev-secret-key-32ch...` | Secret key for JWT token signing |
| `JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Access token lifespan (8 hours) |
| `COMPANY_TIMEZONE` | `Asia/Kolkata` | Standard operating timezone |
| `POLICY_REQUIRED_DAYS` | `3` | Required weekly in-office days |
| `POLICY_REQUIRED_HOURS` | `15` | Required weekly in-office hours |
| `EMAIL_PROVIDER` | `mock` | Email service (`mock` or `smtp`) |
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Frontend API target |

---

## 7. Security & Role-Based Access Control (RBAC)

- **Role Segregation:** Strict separation between `ADMIN` and `EMPLOYEE`.
- **Route Guards:** Frontend protected routes dynamically reject unauthorized role access.
- **Resource Ownership:** Employees are restricted strictly to their own attendance records.
- **Security Headers:** Strict headers enforced (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`).

---

## 8. Complete Testing Suite

The platform is covered by 5 distinct testing tiers:

### 1. Backend Unit & Integration Tests (Pytest)
35 passed, 0 failed (19 unit + 16 integration tests). Covers policy compliance rules, timezone/date calculation boundaries, email templating, attendance endpoints, and scheduler dispatch.
```bash
docker exec attendance_backend pytest -v
```

### 2. Frontend Component Unit Tests (Vitest + RTL)
11 passed, 0 failed. Tests UI components (`StatusBadge`, `StatCard`) and authentication route guards (`ProtectedRoute`) inside jsdom.
```bash
cd frontend && npm test
```

### 3. End-to-End Browser Automation (Playwright)
4 passed, 0 failed. Verifies full user workflows in Chromium: route protection, invalid login rejection, admin dashboard metrics and sub-pages navigation, and employee check-in/out.
```bash
cd frontend && npm run test:e2e
```

### 4. Static Code Analysis & Linting
- **Backend (Ruff):** Zero syntax/import errors.
  ```bash
  docker exec attendance_backend ruff check app
  ```
- **Frontend (Oxlint & TypeScript):** Zero build or strict type errors.
  ```bash
  cd frontend && npm run lint && npm run build
  ```

### 5. Static Application Security Testing (Bandit)
Scans Python AST for security vulnerabilities, injection risks, and unsafe practices (0 high, 0 medium issues).
```bash
docker exec attendance_backend bandit -r app -ll
```

---

## 9. Continuous Integration (GitHub Actions)

The repository includes a comprehensive CI pipeline in `.github/workflows/ci.yml` that runs automatically on push and pull request to `master`/`main`:
1. **`backend-ci`:** Runs Ruff linter, Bandit security scanner, and Pytest suite with code coverage on MongoDB 7.0 container.
2. **`frontend-ci`:** Runs Oxlint, TypeScript compilation (`tsc -b`), Vite production build, and Vitest component unit tests.
3. **`e2e-ci`:** Spins up backend API, seeds test database, launches frontend server, and executes headless Playwright browser tests.
4. **`docker-build-ci`:** Validates Docker Compose file and verifies that all container images build cleanly.
# Docker & Docker Compose Documentation

This document describes the container architecture, orchestration, and operations for the **Employee Attendance Management System**.

---

## 1. Architecture Overview

The system runs as three multi-container services connected across an isolated Docker bridge network:

```text
                  ┌──────────────────────┐
                  │      Frontend        │
                  │ React + Vite + Nginx │
                  │     Port :5173       │
                  └──────────┬───────────┘
                             │
                             │ HTTP (Direct :8000 or Nginx /api/v1 reverse-proxy)
                             ▼
                  ┌──────────────────────┐
                  │       Backend        │
                  │       FastAPI        │
                  │     Port :8000       │
                  └──────────┬───────────┘
                             │
                             │ MongoDB wire protocol
                             ▼
                  ┌──────────────────────┐
                  │       MongoDB        │
                  │   Official Mongo 7   │
                  │     Port :27017      │
                  └──────────────────────┘

                  Backend ───────► External SMTP Server
```

---

## 2. Services Specification

| Service | Image / Build Context | Container Name | Host Port | Container Port | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`mongodb`** | `mongo:7.0` | `attendance_mongodb` | `27017` | `27017` | Persistent primary NoSQL database |
| **`backend`** | `./backend/Dockerfile` (Python 3.12-slim) | `attendance_backend` | `8000` | `8000` | FastAPI REST API, RBAC, Scheduler, EmailService |
| **`frontend`** | `./frontend/Dockerfile` (Multi-stage Node 20 -> Nginx 1.27) | `attendance_frontend` | `5173` | `80` | Single Page Application served via Nginx with reverse proxy |

---

## 3. Networking

A dedicated bridge network is defined:

```yaml
networks:
  attendance-network:
    name: attendance-network
    driver: bridge
```

- **Backend to MongoDB:** Backend resolves MongoDB using the service name `mongodb` (`mongodb://mongodb:27017/attendance_db`).
- **Frontend to Backend:**
  - In-browser API requests route directly to `http://localhost:8000/api/v1` (the exposed backend host port).
  - Nginx also includes a proxy pass block forwarding `/api/v1/` to `http://backend:8000/api/v1/` over `attendance-network`.
- **Database Isolation:** Direct communication from frontend to MongoDB is blocked by network architecture; all persistence goes through the backend API.

---

## 4. Volume & Persistence

Database records are persisted using a named volume:

```yaml
volumes:
  mongodb_data:
    name: attendance_mongodb_data
    driver: local
```

The volume is mounted to MongoDB's internal directory `/data/db`.

### Preserving Data Across Container Restarts
To shut down containers and restart without losing data:
```bash
docker compose down
docker compose up -d
```
All users, attendance check-ins, policy records, and violations remain intact.

> **Caution:** Running `docker compose down -v` removes named volumes and deletes all database records. Do not run with `-v` unless an explicit clean reset is intended.

---

## 5. Healthchecks

All services include active healthchecks with exponential/grace periods:

1. **MongoDB:**
   ```yaml
   test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
   interval: 10s
   timeout: 5s
   retries: 5
   start_period: 5s
   ```
2. **Backend:**
   ```yaml
   test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
   interval: 15s
   timeout: 5s
   retries: 3
   start_period: 10s
   ```
3. **Frontend:**
   ```yaml
   test: ["CMD-SHELL", "wget --spider -q http://127.0.0.1:80/ || exit 1"]
   interval: 15s
   timeout: 5s
   retries: 3
   start_period: 5s
   ```

Backend container initialization uses service readiness dependencies (`depends_on: mongodb: condition: service_healthy`) and incorporates internal asynchronous connection retries.

---

## 6. Environment Variables

Configuration is loaded from `.env` in the project root. Refer to `.env.example` for the template.

| Variable | Description | Default / Example |
| :--- | :--- | :--- |
| `MONGO_URI` / `MONGODB_URI` | Connection URI for MongoDB | `mongodb://mongodb:27017` |
| `MONGO_DB` / `MONGODB_DATABASE` | MongoDB database name | `attendance_db` |
| `JWT_SECRET_KEY` | Secret key for signing auth tokens (>= 32 chars) | Dev secret key |
| `JWT_ALGORITHM` | Cryptographic algorithm for JWT | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Lifetime of access tokens | `480` |
| `COMPANY_TIMEZONE` | Business timezone | `Asia/Kolkata` |
| `POLICY_REQUIRED_DAYS` | Minimum required workdays per week | `3` |
| `POLICY_REQUIRED_HOURS` | Minimum required total hours per week | `15` |
| `EMAIL_PROVIDER` | Email delivery adapter (`mock`, `smtp`, `sendgrid`) | `mock` (or `smtp`) |
| `SMTP_HOST` | Hostname of SMTP mailer | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USERNAME` | SMTP account username | *(from `.env`)* |
| `SMTP_PASSWORD` | SMTP account password / app password | *(from `.env`)* |
| `SMTP_USE_TLS` | Enable TLS encryption | `true` |
| `VITE_API_BASE_URL` | API endpoint used by the client browser | `http://localhost:8000/api/v1` |

---

## 7. Common Operational Commands

### Build Images
```bash
docker compose build
```

### Start Services (Detached Mode)
```bash
docker compose up -d
```

### Check Service Status and Health
```bash
docker compose ps
```

### View Service Logs
```bash
# All logs
docker compose logs -f

# Specific services
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f mongodb
```

### Seed Initial Admin & Demo Data Inside Containers
```bash
# Seed initial demo employees, admin (admin/AdminPass123!), and sample attendance
docker compose exec backend python scripts/seed_data.py
```

### Stop Containers (Preserving Data)
```bash
docker compose down
```

### Complete Reset (Wipes Database Volume)
```bash
docker compose down -v
```

---

## 8. Frontend-Backend Communication Details

- **Browser to Backend**: The browser runs on the user's host OS. It accesses the backend on `http://localhost:8000/api/v1`.
- **CORS Support**: The backend automatically allows CORS requests from `http://localhost:5173` and `http://127.0.0.1:5173`.
- **Nginx Reverse Proxy**: Requests dispatched to `http://localhost:5173/api/v1` are proxied internally by Nginx to `http://backend:8000/api/v1`.

---

## 9. SMTP Configuration

- SMTP credentials are completely isolated within the backend service and are never exposed to the frontend client bundle.
- In `EMAIL_PROVIDER=mock` mode, email deliveries are safely logged into the database and backend console without sending live emails.
- In `EMAIL_PROVIDER=smtp` mode, the backend connects outward to the configured SMTP provider via TLS.

---

## 10. Production Hardening Checklist

When transitioning from local Docker Compose to production deployment:
1. **Managed Database**: Replace local `mongodb` service with MongoDB Atlas or dedicated replica set.
2. **TLS / HTTPS**: Terminate SSL/TLS using a reverse proxy (e.g., Traefik, AWS ALB, Nginx with Certbot).
3. **Secrets Management**: Store `JWT_SECRET_KEY` and `SMTP_PASSWORD` in a secrets manager (AWS Secrets Manager, HashiCorp Vault, or Docker Secrets).
4. **CORS Restrictions**: Narrow `CORS_ORIGINS` strictly to production domains.
5. **Resource Limits**: Define CPU and memory reservations and limits for each service container.
6. **Container User**: Non-root execution is enforced in the backend Dockerfile (`appuser:1000`).

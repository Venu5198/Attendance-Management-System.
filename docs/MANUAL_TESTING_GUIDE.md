# End-to-End Manual Testing & Playwright Verification Guide

## How to Test Every Feature Across Frontend, Backend, Celery, Redis, RabbitMQ, MongoDB, Prometheus & Grafana

---

## 1. Automated Verification Results (Playwright E2E)

The entire full-stack ecosystem was validated using automated browser tests in [`frontend/e2e/full-stack-ecosystem.spec.ts`](<file:///c:/devops/Attendance%20management/frontend/e2e/full-stack-ecosystem.spec.ts>).

```text
Running 12 tests using 1 worker
  ok  1 [chromium] redirects unauthenticated visit to /login (1.1s)
  ok  2 [chromium] displays error alert on invalid credentials (1.2s)
  ok  3 [chromium] admin login, dashboard metrics, and navigation flows (2.5s)
  ok  4 [chromium] employee login, dashboard view, and role restriction (2.0s)
  ok  5 [chromium] calendar view toggle and date navigation on /attendance (2.1s)
  ok  6 [chromium] calendar cell interaction opens regularization modal (2.1s)
  ok  7 [chromium] employee submits leave request and views it on /leaves (2.1s)
  ok  8 [chromium] admin reviews regularization approvals and leave exemptions (2.1s)
  ok  9 [chromium] admin dashboard renders continuous compliance health score cards (1.8s)
  ok 10 [chromium] verifies all 8 infrastructure services: API, Celery, RabbitMQ, Mongo, Redis, Prometheus, Grafana, Frontend (4.4s)
  ok 11 [chromium] login displays organization selector and tenant badge in navbar (2.0s)
  ok 12 [chromium] asynchronous background task polling and Redis deduplication integration (1.7s)

  12 passed (26.4s)
```

---

## 2. Feature-by-Feature Manual Testing Instructions

### Feature 1: Multi-Tenant Organization Switcher

- **Objective:** Verify dynamic tenant context switching without data bleed.
- **Manual Steps:**
  1. Open `http://localhost:5173` and log in as `admin` (`admin` / `admin123`).
  2. In the top navbar, click the **Tenant Switcher** (showing `Global / Default Org`).
  3. Notice the organizations listed: `default`, `acme-corp`.
  4. Click **Provision New Tenant**:
     - Tenant ID: `test-corp`
     - Name: `Test Corporation`
     - Plan: `Enterprise`
     - Quota: `500`
  5. Click **Provision Partition**.
- **Expected Result:** The page refreshes with active organization `Test Corporation`. All requests inject `X-Tenant-ID: test-corp`.

---

### Feature 2: Celery Background Ingestion & Redis Request Deduplication

- **Objective:** Verify asynchronous execution via RabbitMQ and duplicate request filtering.
- **Manual Steps:**
  1. Navigate to `http://localhost:5173/employees`.
  2. Click the **Bulk Import (Excel)** button.
  3. Drag and drop any Excel file (or create `test.xlsx`).
  4. Click **Start Async Import**:
     - Observe the modal immediately receive a `task_id` (`HTTP 202 Accepted`).
     - Watch the live progress bar advance (`0%` -> `100%`) as Celery processes rows.
  5. Open RabbitMQ at `http://localhost:15672` (User: `guest` / Pass: `guest`) -> go to **Queues** -> verify message throughput on queue `celery`.
  6. Return to the browser and immediately click **Start Async Import** with the **same file**:
     - Observe the yellow badge: **"Redis Deduplication Triggered"** (`HTTP 409 Conflict`).
- **Expected Result:** Heavy imports never freeze the UI; identical requests are intercepted by Redis within 120 seconds.

---

### Feature 3: Geofencing & WFH GPS Clock-in

- **Objective:** Verify geolocation acquisition and Haversine boundary check.
- **Manual Steps:**
  1. Navigate to `http://localhost:5173/attendance`.
  2. Look at the top control bar beside the Check In button:
     - Notice the green badge: **`Geofence (GPS): 12.9716, 77.5946`**.
  3. Click **Check In**:
     - Success alert displays: `"Office check-in recorded! Geofence verified at (12.9716, 77.5946)"`.
  4. Check the top navbar bell icon:
     - Red badge increments with real-time WebSocket notification.
- **Expected Result:** Clock-in records exact coordinates and marks status as `IN_PROGRESS`.

---

### Feature 4: SOC2 Compliance Audit Trail

- **Objective:** Verify immutable audit logging and CSV export.
- **Manual Steps:**
  1. Navigate to `http://localhost:5173/reports`.
  2. Click the **Compliance Audit Trail** tab in the top header.
  3. Notice the logged actions: `GEOFENCE_VERIFIED`, `CELERY_BULK_INGEST`, `REGULARIZATION_APPROVED`.
  4. Click **Export CSV**.
- **Expected Result:** A clean CSV file downloads containing timestamps, actors, actions, and IP addresses.

---

### Feature 5: Prometheus & Grafana SRE Monitoring

- **Objective:** Verify real-time metric scraping and Golden Signal dashboards.
- **Manual Steps:**
  1. Open `http://localhost:9090/targets`:
     - Confirm target `attendance_backend` is in state **UP** (scraping every 5s).
  2. Open `http://localhost:3000` (User: `admin` / Pass: `admin`):
     - Go to **Dashboards** -> **Operations** -> **Centralized Attendance Management - SRE Dashboard**.
     - Verify all 8 panels are green:
       - Request Rate (RPS)
       - P50, P90, P95, P99 Latency Distribution
       - Celery Tasks Dispatched
       - Redis Deduplication Counter
       - CPU and Memory Footprint
- **Expected Result:** Real-time metrics show zero "No data" gaps and prove system health.

---

### Feature 6: Database Integrity (MongoDB & Redis)

- **Manual CLI Verification:**
  ```powershell
  # Check MongoDB connection
  curl.exe -s http://localhost:8000/api/v1/health
  # Response: {"status":"healthy","database":"connected","cache_redis":"connected"}
  ```

---

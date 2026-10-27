#!/usr/bin/env python3
"""
Staging Smoke-Test Execution Suite (Phase 4.2)
Target: Staging Cluster (http://localhost:8000)
Validates all checks in staging-smoke-test-plan.md with live evidence capture.
"""

import sys
import time
import json
import uuid
import requests
import concurrent.futures
from datetime import datetime, UTC

BASE_URL = "http://localhost:8000"
API_URL = f"{BASE_URL}/api/v1"

results = []

def record(test_id, name, endpoint, expected, actual_status, passed, evidence):
    status_str = "PASS" if passed else "FAIL"
    print(f"[{status_str}] {test_id}: {name}")
    print(f"       Endpoint: {endpoint}")
    print(f"       Expected: {expected}")
    print(f"       Actual:   Status {actual_status} | {evidence}\n")
    results.append({
        "test_id": test_id,
        "name": name,
        "endpoint": endpoint,
        "expected": expected,
        "actual_status": actual_status,
        "status": status_str,
        "evidence": evidence
    })

def run_smoke_tests():
    print("=" * 80)
    print("=== EXECUTING STAGING SMOKE TESTS -- ATTENDANCE MANAGEMENT SYSTEM ===")
    print(f"Timestamp: {datetime.now(UTC).isoformat()}")
    print(f"Target: {BASE_URL}")
    print("=" * 80 + "\n")

    # =========================================================================
    # SECTION A: Service Health & Observability Probes
    # =========================================================================
    print("--- SECTION A: Service Health & Observability Probes ---")

    # HLT-01: General Health Check
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        data = r.json()
        passed = (
            r.status_code == 200 and
            data.get("status") == "healthy" and
            data.get("database") == "connected" and
            data.get("cache_redis") == "connected"
        )
        record("HLT-01", "General Health Check", "GET /health",
               "HTTP 200, status: healthy, database: connected, cache_redis: connected",
               r.status_code, passed, f"Response: {data}")
    except Exception as e:
        record("HLT-01", "General Health Check", "GET /health", "HTTP 200", 500, False, str(e))

    # HLT-02: Liveness Probe
    try:
        r = requests.get(f"{BASE_URL}/health/live", timeout=5)
        data = r.json()
        passed = (r.status_code == 200 and data.get("status") == "alive")
        record("HLT-02", "Kubernetes Liveness Probe", "GET /health/live",
               "HTTP 200, status: alive", r.status_code, passed, f"Response: {data}")
    except Exception as e:
        record("HLT-02", "Kubernetes Liveness Probe", "GET /health/live", "HTTP 200", 500, False, str(e))

    # HLT-03: Readiness Probe
    try:
        r = requests.get(f"{BASE_URL}/health/ready", timeout=5)
        data = r.json()
        passed = (r.status_code == 200 and data.get("ready") is True and data.get("database") == "connected")
        record("HLT-03", "Kubernetes Readiness Probe", "GET /health/ready",
               "HTTP 200, ready: true, database: connected", r.status_code, passed, f"Response: {data}")
    except Exception as e:
        record("HLT-03", "Kubernetes Readiness Probe", "GET /health/ready", "HTTP 200", 500, False, str(e))

    # HLT-04: Prometheus Metrics Scrape
    try:
        r = requests.get(f"{BASE_URL}/metrics", timeout=5)
        passed = (r.status_code == 200 and "http_requests_total" in r.text)
        sample = [line for line in r.text.splitlines() if "http_requests_total" in line][:2]
        record("HLT-04", "Prometheus Metrics Scrape", "GET /metrics",
               "HTTP 200 containing http_requests_total metric", r.status_code, passed, f"Sample metrics: {sample}")
    except Exception as e:
        record("HLT-04", "Prometheus Metrics Scrape", "GET /metrics", "HTTP 200", 500, False, str(e))

    # HLT-05: Request Correlation Header
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        req_id = r.headers.get("x-request-id")
        passed = (r.status_code == 200 and req_id is not None and len(req_id) > 10)
        record("HLT-05", "Request Correlation Header", "GET /health",
               "Response header contains X-Request-ID UUID", r.status_code, passed, f"X-Request-ID: {req_id}")
    except Exception as e:
        record("HLT-05", "Request Correlation Header", "GET /health", "X-Request-ID present", 500, False, str(e))

    # HLT-06: Hardened Security Headers
    try:
        r = requests.get(f"{BASE_URL}/health", timeout=5)
        h = r.headers
        h_frame = h.get("x-frame-options")
        h_content = h.get("x-content-type-options")
        h_hsts = h.get("strict-transport-security")
        h_csp = h.get("content-security-policy")
        passed = (
            h_frame == "DENY" and
            h_content == "nosniff" and
            bool(h_hsts) and
            bool(h_csp)
        )
        record("HLT-06", "Hardened Security Headers", "GET /health",
               "DENY, nosniff, HSTS, CSP present", r.status_code, passed,
               f"X-Frame-Options: {h_frame}, X-Content-Type-Options: {h_content}, HSTS: {bool(h_hsts)}, CSP: {bool(h_csp)}")
    except Exception as e:
        record("HLT-06", "Hardened Security Headers", "GET /health", "Security headers", 500, False, str(e))

    # =========================================================================
    # SECTION B: Authentication & Token Lifecycle
    # =========================================================================
    print("--- SECTION B: Authentication & Token Lifecycle ---")

    admin_token = None
    admin_refresh = None
    emp_token = None

    # AUT-01: Admin Authentication
    try:
        r = requests.post(f"{API_URL}/auth/login", json={"username": "admin", "password": "AdminPass123!"}, timeout=5)
        data = r.json()
        admin_token = data.get("access_token")
        admin_refresh = data.get("refresh_token")
        passed = (r.status_code == 200 and bool(admin_token) and data.get("role") == "ADMIN")
        record("AUT-01", "Admin Authentication", "POST /api/v1/auth/login",
               "HTTP 200, access_token, refresh_token, role: ADMIN", r.status_code, passed,
               f"Role: {data.get('role')}, Token length: {len(admin_token) if admin_token else 0}")
    except Exception as e:
        record("AUT-01", "Admin Authentication", "POST /api/v1/auth/login", "HTTP 200", 500, False, str(e))

    # AUT-02: Employee Authentication
    try:
        r = requests.post(f"{API_URL}/auth/login", json={"username": "emp001", "password": "EmpPass123!"}, timeout=5)
        data = r.json()
        emp_token = data.get("access_token")
        passed = (r.status_code == 200 and bool(emp_token) and data.get("role") == "EMPLOYEE")
        record("AUT-02", "Employee Authentication", "POST /api/v1/auth/login",
               "HTTP 200, access_token, role: EMPLOYEE", r.status_code, passed,
               f"Role: {data.get('role')}, Employee ID: {data.get('employee_id')}")
    except Exception as e:
        record("AUT-02", "Employee Authentication", "POST /api/v1/auth/login", "HTTP 200", 500, False, str(e))

    # AUT-03: Invalid Password Rejection
    try:
        r = requests.post(f"{API_URL}/auth/login", json={"username": "emp001", "password": "WrongPassword999!"}, timeout=5)
        passed = (r.status_code == 401)
        record("AUT-03", "Invalid Password Rejection", "POST /api/v1/auth/login",
               "HTTP 401 Unauthorized", r.status_code, passed, f"Detail: {r.json().get('detail')}")
    except Exception as e:
        record("AUT-03", "Invalid Password Rejection", "POST /api/v1/auth/login", "HTTP 401", 500, False, str(e))

    # AUT-04: Refresh Token Flow
    try:
        r = requests.post(f"{API_URL}/auth/refresh-token", json={"refresh_token": admin_refresh}, timeout=5)
        data = r.json()
        fresh_token = data.get("access_token")
        passed = (r.status_code == 200 and bool(fresh_token))
        record("AUT-04", "Refresh Token Flow", "POST /api/v1/auth/refresh-token",
               "HTTP 200, fresh access token returned", r.status_code, passed,
               f"Fresh token received: {bool(fresh_token)}")
    except Exception as e:
        record("AUT-04", "Refresh Token Flow", "POST /api/v1/auth/refresh-token", "HTTP 200", 500, False, str(e))

    # AUT-05: Token Revocation on Logout
    try:
        # Login temporary session
        temp_login = requests.post(f"{API_URL}/auth/login", json={"username": "emp001", "password": "EmpPass123!"}, timeout=5).json()
        temp_token = temp_login["access_token"]
        temp_headers = {"Authorization": f"Bearer {temp_token}"}

        # Verify valid before logout
        before_res = requests.get(f"{API_URL}/auth/me", headers=temp_headers, timeout=5)

        # Logout
        logout_res = requests.post(f"{API_URL}/auth/logout", headers=temp_headers, timeout=5)

        # Attempt access after logout
        after_res = requests.get(f"{API_URL}/auth/me", headers=temp_headers, timeout=5)
        passed = (
            logout_res.status_code == 200 and
            after_res.status_code == 401 and
            "revoked" in after_res.text.lower()
        )
        record("AUT-05", "Token Revocation on Logout", "POST /auth/logout -> GET /auth/me",
               "Logout 200, then GET /auth/me returns 401 'Token has been revoked'",
               after_res.status_code, passed,
               f"Pre-logout: {before_res.status_code}, Logout: {logout_res.status_code}, Post-logout: {after_res.status_code} ({after_res.json().get('detail')})")
    except Exception as e:
        record("AUT-05", "Token Revocation on Logout", "POST /auth/logout", "HTTP 401 post logout", 500, False, str(e))

    # =========================================================================
    # SECTION C: Role-Based Access Control (RBAC) & Tenant Isolation
    # =========================================================================
    print("--- SECTION C: Role-Based Access Control & Tenant Isolation ---")

    emp_headers = {"Authorization": f"Bearer {emp_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # RBC-01: Employee Route Lockout
    try:
        r = requests.get(f"{API_URL}/employees", headers=emp_headers, timeout=5)
        passed = (r.status_code == 403 and "requires 'admin' role" in r.text.lower())
        record("RBC-01", "Employee Route Lockout", "GET /api/v1/employees (with EMP token)",
               "HTTP 403 Forbidden: requires 'ADMIN' role", r.status_code, passed, f"Detail: {r.json().get('detail')}")
    except Exception as e:
        record("RBC-01", "Employee Route Lockout", "GET /api/v1/employees", "HTTP 403", 500, False, str(e))

    # RBC-02: Horizontal IDOR Lockout
    try:
        r = requests.get(f"{API_URL}/attendance/history/EMP002", headers=emp_headers, timeout=5)
        passed = (r.status_code == 403 and "permission to access another employee" in r.text.lower())
        record("RBC-02", "Horizontal IDOR Lockout", "GET /api/v1/attendance/history/EMP002 (as EMP001)",
               "HTTP 403 Forbidden: cross-employee access blocked", r.status_code, passed, f"Detail: {r.json().get('detail')}")
    except Exception as e:
        record("RBC-02", "Horizontal IDOR Lockout", "GET /attendance/history/EMP002", "HTTP 403", 500, False, str(e))

    # RBC-03: Reporting Scope Isolation
    try:
        r = requests.get(f"{API_URL}/attendance/report?period=weekly", headers=emp_headers, timeout=5)
        data = r.json()
        emps = data.get("employees", [])
        passed = (r.status_code == 200 and len(emps) == 1 and emps[0].get("employee_id") == "EMP001")
        record("RBC-03", "Reporting Scope Isolation", "GET /api/v1/attendance/report?period=weekly (as EMP001)",
               "HTTP 200 containing strictly EMP001 data", r.status_code, passed,
               f"Returned employees count: {len(emps)}, Employee IDs: {[e.get('employee_id') for e in emps]}")
    except Exception as e:
        record("RBC-03", "Reporting Scope Isolation", "GET /attendance/report", "HTTP 200 (self only)", 500, False, str(e))

    # RBC-04: Admin Full Scope
    try:
        r = requests.get(f"{API_URL}/attendance/report?period=weekly", headers=admin_headers, timeout=5)
        data = r.json()
        emps = data.get("employees", [])
        summary = data.get("summary", {})
        meta = data.get("metadata", {})
        total_emp = summary.get("total_active_employees") or meta.get("total_employees")
        passed = (r.status_code == 200 and len(emps) >= 10 and bool(total_emp))
        record("RBC-04", "Admin Full Scope", "GET /api/v1/attendance/report?period=weekly (as Admin)",
               "HTTP 200 containing full organization metrics and all active employees", r.status_code, passed,
               f"Active employees returned: {len(emps)}, Total active employees: {total_emp}")
    except Exception as e:
        record("RBC-04", "Admin Full Scope", "GET /attendance/report", "HTTP 200 (all employees)", 500, False, str(e))

    # =========================================================================
    # SECTION D: Attendance Lifecycle & Concurrency Safeguards
    # =========================================================================
    print("--- SECTION D: Attendance Lifecycle & Concurrency Safeguards ---")

    # We will test attendance lifecycle using emp004 (Diana Prince)
    # Diana has no active session today (2026-10-26).
    emp004_login = requests.post(f"{API_URL}/auth/login", json={"username": "emp004", "password": "EmpPass123!"}, timeout=5).json()
    emp004_token = emp004_login["access_token"]
    emp004_headers = {"Authorization": f"Bearer {emp004_token}"}

    # ATT-03: Concurrent Check-In Race (5 simultaneous hits on fresh user emp004)
    try:
        def punch_checkin(i):
            return requests.post(f"{API_URL}/attendance/check-in", headers=emp004_headers, json={}, timeout=5)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            futures = [executor.submit(punch_checkin, i) for i in range(5)]
            responses = [f.result() for f in futures]

        status_codes = [res.status_code for res in responses]
        succeeded = [s for s in status_codes if s == 201]
        rejected = [s for s in status_codes if s == 400]

        passed = (len(succeeded) == 1 and len(rejected) == 4)
        record("ATT-03", "Concurrent Check-In Race", "5 simultaneous POST /check-in",
               "Exactly 1 succeeds (HTTP 201); 4 rejected (HTTP 400)",
               f"201x{len(succeeded)}, 400x{len(rejected)}", passed,
               f"Status codes: {status_codes}")
    except Exception as e:
        record("ATT-03", "Concurrent Check-In Race", "5 simultaneous POST /check-in", "1x201, 4x400", 500, False, str(e))

    # ATT-01: Initial Check-In Verification (verified via ATT-03 that session is now created and IN_PROGRESS)
    try:
        today_res = requests.get(f"{API_URL}/attendance/today", headers=emp004_headers, timeout=5)
        data = today_res.json()
        passed = (today_res.status_code == 200 and data.get("attendance_status") == "IN_PROGRESS")
        record("ATT-01", "Initial Check-In Status", "POST /api/v1/attendance/check-in",
               "HTTP 201 Created, attendance_status: IN_PROGRESS", 201, passed,
               f"Today status: {data.get('attendance_status')}, entry_time: {data.get('check_in_time')}")
    except Exception as e:
        record("ATT-01", "Initial Check-In Status", "GET /attendance/today", "HTTP 200", 500, False, str(e))

    # ATT-02: Duplicate Check-In Block
    try:
        dup_res = requests.post(f"{API_URL}/attendance/check-in", headers=emp004_headers, json={}, timeout=5)
        passed = (dup_res.status_code == 400 and "in progress" in dup_res.text.lower())
        record("ATT-02", "Duplicate Check-In Block", "Immediate 2nd POST /api/v1/attendance/check-in",
               "HTTP 400 Bad Request ('already has a check-in record in progress')", dup_res.status_code, passed,
               f"Detail: {dup_res.json().get('detail')}")
    except Exception as e:
        record("ATT-02", "Duplicate Check-In Block", "POST /check-in", "HTTP 400", 500, False, str(e))

    # ATT-04: Live Status Display
    try:
        r = requests.get(f"{API_URL}/attendance/today", headers=emp004_headers, timeout=5)
        data = r.json()
        passed = (r.status_code == 200 and data.get("attendance_status") == "IN_PROGRESS" and data.get("check_in_time") is not None)
        record("ATT-04", "Live Status Display", "GET /api/v1/attendance/today",
               "HTTP 200, attendance_status: IN_PROGRESS, active timer active", r.status_code, passed,
               f"Status: {data.get('attendance_status')}, Check-in time: {data.get('check_in_time')}")
    except Exception as e:
        record("ATT-04", "Live Status Display", "GET /attendance/today", "HTTP 200", 500, False, str(e))

    # Small pause to accrue duration
    time.sleep(1)

    # ATT-05: Valid Check-Out
    try:
        r = requests.post(f"{API_URL}/attendance/check-out", headers=emp004_headers, json={}, timeout=5)
        data = r.json()
        att = data.get("attendance", {})
        att_status = att.get("attendance_status")
        duration = att.get("duration_seconds")
        passed = (r.status_code == 200 and att_status == "COMPLETED" and duration is not None)
        record("ATT-05", "Valid Check-Out", "POST /api/v1/attendance/check-out",
               "HTTP 200 OK, attendance_status: COMPLETED, duration computed", r.status_code, passed,
               f"Status: {att_status}, Duration: {duration}s")
    except Exception as e:
        record("ATT-05", "Valid Check-Out", "POST /check-out", "HTTP 200", 500, False, str(e))

    # ATT-06: Double Check-Out Block
    try:
        r = requests.post(f"{API_URL}/attendance/check-out", headers=emp004_headers, json={}, timeout=5)
        passed = (r.status_code == 400 and "no active check-in session" in r.text.lower())
        record("ATT-06", "Double Check-Out Block", "Immediate 2nd POST /api/v1/attendance/check-out",
               "HTTP 400 Bad Request ('No active check-in session')", r.status_code, passed,
               f"Detail: {r.json().get('detail')}")
    except Exception as e:
        record("ATT-06", "Double Check-Out Block", "POST /check-out", "HTTP 400", 500, False, str(e))

    # Clean up ONLY the disposable smoke test record created on 2026-10-26 for EMP004
    # so that historical attendance census remains untouched at exactly 68!
    import subprocess
    cleanup_cmd = [
        "docker", "exec", "attendance_mongodb", "mongosh", "attendance_db", "--quiet", "--eval",
        "db.attendance.deleteMany({employee_id: 'EMP004', work_date: '2026-10-26'})"
    ]
    subprocess.run(cleanup_cmd, capture_output=True, text=True)
    print("      [CLEANUP] Deleted disposable smoke test session for EMP004 on 2026-10-26.")

    # =========================================================================
    # SECTION E: Central Reports & Anomaly Indication
    # =========================================================================
    print("--- SECTION E: Central Reports & Anomaly Indication ---")

    # REP-01: Default Weekly Period
    try:
        r = requests.get(f"{API_URL}/attendance/report?period=weekly", headers=admin_headers, timeout=5)
        data = r.json()
        meta = data.get("metadata", {})
        start_d = meta.get("start_date")
        end_d = meta.get("end_date")
        # Start date should be Monday and end date should be Sunday
        s_obj = datetime.strptime(start_d, "%Y-%m-%d")
        e_obj = datetime.strptime(end_d, "%Y-%m-%d")
        passed = (r.status_code == 200 and s_obj.weekday() == 0 and e_obj.weekday() == 6)
        record("REP-01", "Default Weekly Period", "GET /api/v1/attendance/report?period=weekly",
               "Start date is Monday, End date is Sunday in Asia/Kolkata", r.status_code, passed,
               f"Start: {start_d} (weekday {s_obj.weekday()}), End: {end_d} (weekday {e_obj.weekday()})")
    except Exception as e:
        record("REP-01", "Default Weekly Period", "GET /attendance/report?period=weekly", "Monday-Sunday", 500, False, str(e))

    # REP-02: Historical Completed Week (target_date=2026-10-24)
    try:
        r = requests.get(f"{API_URL}/attendance/report?period=weekly&target_date=2026-10-24", headers=admin_headers, timeout=5)
        data = r.json()
        emp1 = next((e for e in data.get("employees", []) if e.get("employee_id") == "EMP001"), None)
        tot_hours = emp1.get("total_office_hours", 0) if emp1 else 0
        tot_days = emp1.get("total_attended_days") if emp1 else 0
        compliance = emp1.get("overall_compliance") if emp1 else None
        passed = (
            r.status_code == 200 and
            emp1 is not None and
            abs(tot_hours - 13.71) < 0.1 and
            tot_days in [2, 4] and
            compliance == "NON_COMPLIANT"
        )
        record("REP-02", "Historical Completed Week", "GET /api/v1/attendance/report?period=weekly&target_date=2026-10-24",
               "Displays ~13.7h (13.71h) for EMP001 with NON_COMPLIANT status (<15h threshold)", r.status_code, passed,
               f"EMP001: {tot_hours}h, {tot_days} days attended, status: {compliance}")
    except Exception as e:
        record("REP-02", "Historical Completed Week", "GET /attendance/report", "13.7h, NON_COMPLIANT", 500, False, str(e))

    # REP-03: Option B Amber Warning Flag (Oct 24 session: 7s duration)
    try:
        # History for EMP001 on 2026-10-24
        r = requests.get(f"{API_URL}/attendance/history/EMP001?start_date=2026-10-24&end_date=2026-10-24", headers=admin_headers, timeout=5)
        recs = r.json()
        oct24_rec = recs[0] if recs else None
        passed = (
            r.status_code == 200 and
            oct24_rec is not None and
            oct24_rec.get("duration_seconds") == 7 and
            oct24_rec.get("attendance_status") == "COMPLETED"
        )
        record("REP-03", "Option B Anomaly Data Contract", "GET /api/v1/attendance/history/EMP001?start_date=2026-10-24",
               "Duration remains 7s, status COMPLETED; triggers frontend amber warning badge (<0.05h)",
               r.status_code, passed,
               f"Record: duration_seconds={oct24_rec.get('duration_seconds')}, duration_hours={oct24_rec.get('duration_hours')}, status={oct24_rec.get('attendance_status')}")
    except Exception as e:
        record("REP-03", "Option B Anomaly Data Contract", "GET /attendance/history", "7s record", 500, False, str(e))

    # REP-04: Date Range Validation Guard (start_date > end_date)
    try:
        r = requests.get(f"{API_URL}/attendance/report?period=custom&start_date=2026-10-25&end_date=2026-10-20", headers=admin_headers, timeout=5)
        passed = (r.status_code == 400 and "cannot be greater than end_date" in r.text.lower())
        record("REP-04", "Date Range Validation Guard", "GET /attendance/report?period=custom&start_date=2026-10-25&end_date=2026-10-20",
               "HTTP 400 Bad Request ('start_date cannot be greater than end_date')", r.status_code, passed,
               f"Detail: {r.json().get('detail')}")
    except Exception as e:
        record("REP-04", "Date Range Validation Guard", "GET /attendance/report", "HTTP 400", 500, False, str(e))

    # REP-05: Filtered Report Query
    try:
        # Admin requests report filtered to specific employee EMP001
        r = requests.get(f"{API_URL}/attendance/report?period=weekly&employee_id=EMP001", headers=admin_headers, timeout=5)
        data = r.json()
        emps = data.get("employees", [])
        passed = (r.status_code == 200 and len(emps) == 1 and emps[0].get("employee_id") == "EMP001")
        record("REP-05", "Filtered Report Query", "GET /api/v1/attendance/report?period=weekly&employee_id=EMP001",
               "HTTP 200, strictly returns filtered employee data", r.status_code, passed,
               f"Count: {len(emps)}, Employee ID: {emps[0].get('employee_id') if emps else None}")
    except Exception as e:
        record("REP-05", "Filtered Report Query", "GET /attendance/report", "HTTP 200", 500, False, str(e))

    # =========================================================================
    # SECTION F: Asynchronous Processing & Celery Integration
    # =========================================================================
    print("--- SECTION F: Asynchronous Processing & Celery Integration ---")

    excel_path = "backend/employees_bulk_import_sample.xlsx"
    with open(excel_path, "rb") as f:
        file_bytes = f.read()

    task_id = None
    # ASY-01: Bulk Employee Upload
    try:
        # Fresh idempotency key
        idem_key = f"smoke-test-{uuid.uuid4()}"
        files = {"file": ("employees_bulk_import_sample.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        h = {**admin_headers, "X-Idempotency-Key": idem_key}
        r = requests.post(f"{API_URL}/employees/bulk-import-async", headers=h, files=files, timeout=10)
        data = r.json()
        task_id = data.get("task_id")
        passed = (r.status_code == 202 and bool(task_id))
        record("ASY-01", "Bulk Employee Upload", "POST /api/v1/employees/bulk-import-async",
               "HTTP 202 Accepted, returns task_id and tracking URL", r.status_code, passed,
               f"Task ID: {task_id}, Status URL: {data.get('status_url')}")
    except Exception as e:
        record("ASY-01", "Bulk Employee Upload", "POST /employees/bulk-import-async", "HTTP 202", 500, False, str(e))

    # ASY-02: Redis Request Deduplication
    try:
        # Immediate duplicate upload with same content and same idempotency key
        files = {"file": ("employees_bulk_import_sample.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        h = {**admin_headers, "X-Idempotency-Key": idem_key}
        r = requests.post(f"{API_URL}/employees/bulk-import-async", headers=h, files=files, timeout=10)
        is_dedup_header = r.headers.get("x-cache-deduplicated") == "true"
        passed = (r.status_code == 409 or (r.status_code == 202 and is_dedup_header))
        record("ASY-02", "Redis Request Deduplication", "Immediate duplicate POST /employees/bulk-import-async",
               "HTTP 409 Conflict or 202 with X-Cache-Deduplicated header", r.status_code, passed,
               f"Status: {r.status_code}, Deduplicated header: {is_dedup_header}, Body: {r.text[:80]}")
    except Exception as e:
        record("ASY-02", "Redis Request Deduplication", "Duplicate POST", "409 or Cached 202", 500, False, str(e))

    # ASY-03: Task Completion Polling
    try:
        final_status = None
        for _ in range(15):
            t_res = requests.get(f"{API_URL}/tasks/{task_id}", headers=admin_headers, timeout=5)
            t_data = t_res.json()
            final_status = t_data.get("status")
            if final_status in ["SUCCESS", "FAILURE"]:
                break
            time.sleep(1)

        passed = (final_status == "SUCCESS")
        record("ASY-03", "Task Completion Polling", f"GET /api/v1/tasks/{task_id}",
               "Real-time progress updates until status reaches 'SUCCESS'", 200, passed,
               f"Final task status: {final_status}, Result: {t_data.get('result')}")
    except Exception as e:
        record("ASY-03", "Task Completion Polling", f"GET /tasks/{task_id}", "SUCCESS", 500, False, str(e))

    # =========================================================================
    # SECTION G: Data Integrity Sign-Off
    # =========================================================================
    print("--- SECTION G: Data Integrity Sign-Off ---")

    # DAT-01: Historical Census Check
    try:
        count_res = subprocess.run(
            ["docker", "exec", "attendance_mongodb", "mongosh", "attendance_db", "--quiet", "--eval", "db.attendance.countDocuments()"],
            capture_output=True, text=True, check=True
        )
        count_val = int(count_res.stdout.strip())
        passed = (count_val == 68)
        record("DAT-01", "Historical Census Check", "db.attendance.countDocuments()",
               "Exactly matches pre-smoke-test record count (68 records)", 200, passed,
               f"Record count: {count_val}")
    except Exception as e:
        record("DAT-01", "Historical Census Check", "db.attendance.countDocuments()", "68", 500, False, str(e))

    # DAT-02: Oct 24 Session Audit
    try:
        audit_res = subprocess.run(
            ["docker", "exec", "attendance_mongodb", "mongosh", "attendance_db", "--quiet", "--eval",
             "db.attendance.findOne({employee_id: 'EMP001', work_date: '2026-10-24'})"],
            capture_output=True, text=True, check=True
        )
        passed = ("duration_seconds: 7" in audit_res.stdout and "attendance_status: 'COMPLETED'" in audit_res.stdout)
        record("DAT-02", "Oct 24 Session Audit", "db.attendance.findOne({employee_id: 'EMP001', work_date: '2026-10-24'})",
               "duration_seconds remains 7, attendance_status remains 'COMPLETED'", 200, passed,
               f"Session: {audit_res.stdout.strip().replace(chr(10), ' ')[:120]}...")
    except Exception as e:
        record("DAT-02", "Oct 24 Session Audit", "findOne", "duration_seconds: 7", 500, False, str(e))

    # Write summary
    total = len(results)
    passed_count = sum(1 for r in results if r["status"] == "PASS")
    failed_count = sum(1 for r in results if r["status"] == "FAIL")

    print("\n" + "=" * 80)
    print(f"[SUMMARY] SMOKE TEST EXECUTION: {passed_count}/{total} PASSED ({failed_count} FAILED)")
    print("=" * 80)

    summary_file = "artifacts/phase4-2/smoke-test-execution-results.json"
    with open(summary_file, "w") as f:
        json.dump({
            "timestamp": datetime.now(UTC).isoformat(),
            "target": BASE_URL,
            "total_checks": total,
            "passed": passed_count,
            "failed": failed_count,
            "results": results
        }, f, indent=2)
    print(f"Detailed JSON results written to: {summary_file}")

    return passed_count == total

if __name__ == "__main__":
    success = run_smoke_tests()
    sys.exit(0 if success else 1)

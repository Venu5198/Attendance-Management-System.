"""Generate simulated multi-tenant production traffic for Prometheus & Grafana visualization."""

import io
import time
import requests
import openpyxl

BASE_URL = "http://localhost:8000/api/v1"

def generate_traffic():
    print("Generating simulated production traffic across tenants...")

    # 1. Login as Admin
    login_resp = requests.post(f"{BASE_URL}/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    if login_resp.status_code != 200:
        print("Login failed:", login_resp.text)
        return
    token = login_resp.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": "default"}

    # 2. Query various endpoints to generate 2xx traffic
    endpoints = [
        "/employees",
        "/reports/summary",
        "/holidays",
        "/violations/summary",
        "/attendance/live-summary",
    ]
    for ep in endpoints:
        for tenant in ["default", "tenant_alpha", "tenant_beta"]:
            h = {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant}
            requests.get(f"{BASE_URL}{ep}", headers=h)

    # 3. Trigger some intentional 404s and 401s for error distribution
    requests.get(f"{BASE_URL}/non-existent-endpoint-test", headers=admin_headers)
    requests.post(f"{BASE_URL}/auth/login", json={"username": "invalid_user", "password": "wrong"})

    # 4. Generate Celery Task Dispatches & Redis Deduplications
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Employees"
    ws.append(["employee_id", "full_name", "email", "department", "role", "hire_date"])
    ws.append(["TELEMETRY_01", "Telemetry User 1", f"telemetry1_{int(time.time())}@company.com", "DevOps", "EMPLOYEE", "2026-03-01"])
    buf = io.BytesIO()
    wb.save(buf)
    excel_bytes = buf.getvalue()

    idempotency_key = f"traffic-batch-{int(time.time())}"
    # Hit 1: Dispatches to RabbitMQ / Celery
    files1 = {"file": ("traffic_employees.xlsx", excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    h_task = {"Authorization": f"Bearer {token}", "X-Tenant-ID": "tenant_alpha", "X-Idempotency-Key": idempotency_key}
    requests.post(f"{BASE_URL}/employees/bulk-import-async", headers=h_task, files=files1)

    # Hit 2 & 3: Redis Deduplications (duplicate hits intercepted!)
    for _ in range(2):
        files2 = {"file": ("traffic_employees.xlsx", excel_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
        requests.post(f"{BASE_URL}/employees/bulk-import-async", headers=h_task, files=files2)

    # 5. Check-in operations for tenants
    for tenant, emp in [("default", "emp001"), ("tenant_alpha", "emp_alpha_01")]:
        h_checkin = {"Authorization": f"Bearer {token}", "X-Tenant-ID": tenant}
        requests.post(
            f"{BASE_URL}/attendance/check-in",
            headers=h_checkin,
            json={"employee_id": emp, "device_id": "KIOSK-GATE-A", "location": "Headquarters"},
        )

    print("Traffic generation complete. Telemetry ingested into Prometheus!")

if __name__ == "__main__":
    generate_traffic()

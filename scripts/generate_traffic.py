import time
import requests
import json

BASE_URL = "http://localhost:8000/api/v1"

def run_traffic_burst(count=60):
    print(f"[*] Authenticating admin...")
    login_res = requests.post(f"{BASE_URL}/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    token = login_res.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": "default"}

    endpoints = [
        ("GET", f"{BASE_URL}/attendance/report?period=weekly"),
        ("GET", f"{BASE_URL}/violations"),
        ("GET", f"{BASE_URL}/violations/health-scores"),
        ("GET", f"{BASE_URL}/tenants"),
        ("GET", f"{BASE_URL}/employees"),
    ]

    print(f"[*] Firing {count} API requests across endpoints to simulate live user traffic...")
    success = 0
    for i in range(count):
        method, url = endpoints[i % len(endpoints)]
        res = requests.get(url, headers=headers)
        if res.status_code == 200:
            success += 1
        time.sleep(0.03)

    print(f"[*] Dispatched {success}/{count} HTTP requests successfully.")

    # Trigger Celery background task with idempotency deduplication
    print(f"[*] Dispatching Celery background task to RabbitMQ...")
    csv_data = "employee_id,full_name,email,department,role,hire_date\nTRF_01,Traffic Test,traffic@demo.com,DevOps,EMPLOYEE,2026-04-01"
    task_res = requests.post(
        f"{BASE_URL}/employees/bulk-import-async",
        headers={**headers, "X-Idempotency-Key": f"traffic-key-{int(time.time())}"},
        files={"file": ("traffic_roster.csv", csv_data, "text/csv")},
    )
    print(f"[*] Celery task response: {task_res.status_code} -> {task_res.text[:100]}")

if __name__ == "__main__":
    run_traffic_burst(60)

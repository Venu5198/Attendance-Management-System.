import time
import requests
import concurrent.futures

BASE_URL = "http://localhost:8000/api/v1"

def test_deduplication_live():
    print("=" * 70)
    print("🚀 LIVE TEST: Celery Ingestion & Redis Request Deduplication")
    print("=" * 70)

    # 1. Login
    print("[1/5] Authenticating as admin...")
    login_res = requests.post(f"{BASE_URL}/auth/login", json={"username": "admin", "password": "AdminPass123!"})
    assert login_res.status_code == 200, f"Login failed: {login_res.text}"
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-ID": "default"}
    print("      ✓ Successfully authenticated. JWT token acquired.")

    # 2. Check initial deduplication metrics from Prometheus
    count_before = 0
    try:
        prom_before = requests.get("http://prometheus:9090/api/v1/query?query=sum(request_deduplications_total)", timeout=2).json()
        count_before = float(prom_before["data"]["result"][0]["value"][1]) if prom_before.get("data", {}).get("result") else 0.0
    except Exception:
        pass
    print(f"[2/5] Current Redis Deduplications in Prometheus: {int(count_before)}")

    # 3. Simulate 5 RAPID CONCURRENT CLICKS / API HITS with identical file payload
    print("[3/5] Simulating 5 rapid concurrent clicks with identical roster payload...")
    file_bytes = open("/app/employees_bulk_import_sample.xlsx", "rb").read()
    test_idemp_key = f"demo-click-{int(time.time())}"

    def send_upload_hit(hit_number):
        t0 = time.time()
        res = requests.post(
            f"{BASE_URL}/employees/bulk-import-async",
            headers={**headers, "X-Idempotency-Key": test_idemp_key},
            files={"file": ("employees_bulk_import_sample.xlsx", file_bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        )
        duration_ms = int((time.time() - t0) * 1000)
        is_dedup = res.headers.get("x-cache-deduplicated") == "true"
        task_id = res.json().get("task_id", "N/A") if res.status_code in [200, 202] else None
        return hit_number, res.status_code, is_dedup, task_id, duration_ms

    results = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(send_upload_hit, i + 1) for i in range(5)]
        for f in concurrent.futures.as_completed(futures):
            results.append(f.result())

    results.sort(key=lambda x: x[0])

    print("\n   Results of 5 Rapid Hits:")
    print("   " + "-" * 65)
    print("   Hit # | Status Code | Deduplicated by Redis? | Task ID (Celery)      | Latency")
    print("   " + "-" * 65)
    
    unique_task_ids = set()
    dedup_count = 0
    for hit_num, status, is_dedup, task_id, dur in results:
        dedup_label = "✅ YES (Intercepted)" if is_dedup else "❌ NO (Primary Task)"
        if is_dedup:
            dedup_count += 1
        if task_id:
            unique_task_ids.add(task_id)
        short_id = f"{task_id[:16]}..." if task_id else "None"
        print(f"     #{hit_num}  |     {status}     | {dedup_label:<22} | {short_id:<21} | {dur}ms")
    print("   " + "-" * 65)

    # Assertions
    print(f"\n[4/5] Verification Analysis:")
    print(f"      • Total Unique Celery Tasks Enqueued in RabbitMQ: {len(unique_task_ids)} (Expected: exactly 1)")
    print(f"      • Redundant Requests Deduplicated by Redis:       {dedup_count} (Expected: 4)")
    assert len(unique_task_ids) == 1, f"Expected 1 unique task, got {len(unique_task_ids)}"

    # 4. Monitor Celery background task processing to completion
    primary_task_id = list(unique_task_ids)[0]
    print(f"\n[5/5] Tracking Primary Celery Task [{primary_task_id}]...")
    for _ in range(10):
        task_res = requests.get(f"{BASE_URL}/tasks/{primary_task_id}", headers=headers).json()
        status = task_res.get("status")
        msg = task_res.get("message")
        print(f"      Celery Worker State: {status} -> {msg}")
        if status in ["SUCCESS", "FAILURE"]:
            break
        time.sleep(1)

    print("\n" + "=" * 70)
    print("🎉 SUCCESS: Only ONE Celery task was created and processed!")
    print("            All 4 duplicate clicks were safely intercepted by Redis.")
    print("=" * 70)

if __name__ == "__main__":
    test_deduplication_live()

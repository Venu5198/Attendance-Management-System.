# Multi-Session Employee Attendance API Documentation

## 1. Overview
The Multi-Session Attendance module allows employees to check in and check out multiple times within the same workday. Each check-in/check-out cycle is persisted as an independent session document in MongoDB.

### Key Capabilities
- Multiple completed sessions per employee per calendar day.
- Strict constraint of at most one active, in-progress session per employee at any given time.
- Duration tracking in minutes, seconds, and hours for individual sessions and aggregated daily totals.
- Zero-downtime concurrency control via Redis distributed locks and MongoDB partial unique indexes.
- Timezone-aware work date allocation with UTC timestamp duration calculations supporting midnight crossings.
- Clear reporting semantics for incomplete (in-progress) sessions versus completed sessions.

---

## 2. MongoDB Data Model & Indexes

### Document Schema (`attendance` collection)
```json
{
  "_id": "ObjectId('...')",
  "attendance_id": "c86a11e8-7ceb-4ef9-8a39-4ad74092dd99",
  "tenant_id": "default",
  "employee_id": "EMP_01",
  "work_date": "2026-10-25",
  "entry_time": "2026-10-25T06:00:00Z",
  "exit_time": "2026-10-25T08:00:00Z",
  "check_in_time": "2026-10-25T06:00:00Z",
  "check_out_time": "2026-10-25T08:00:00Z",
  "duration_seconds": 7200,
  "duration_minutes": 120.0,
  "duration_hours": 2.0,
  "attendance_status": "COMPLETED",
  "client_ip": "192.168.1.50",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "created_at": "2026-10-25T06:00:00Z",
  "updated_at": "2026-10-25T08:00:00Z"
}
```

### Field Definitions
| Field | Type | Description |
| :--- | :--- | :--- |
| `attendance_id` | string (UUID4) | Unique public identifier for the session |
| `tenant_id` | string | Multi-tenant isolation discriminator key |
| `employee_id` | string | Target employee identifier |
| `work_date` | string (YYYY-MM-DD) | Calendar work date derived in company timezone |
| `entry_time` / `check_in_time` | datetime (UTC) | Server-validated session clock-in timestamp |
| `exit_time` / `check_out_time` | datetime (UTC) or null | Session clock-out timestamp |
| `duration_seconds` | integer | Total duration of the completed session in seconds |
| `duration_minutes` | float | Total duration in minutes (`round(duration_seconds / 60.0, 2)`) |
| `duration_hours` | float | Total duration in hours (`round(duration_seconds / 3600.0, 2)`) |
| `attendance_status` | string | Status: `IN_PROGRESS` or `COMPLETED` |
| `client_ip` | string (optional) | IP address captured at clock-in |
| `latitude` / `longitude` | float (optional) | Geolocation coordinates captured at clock-in |

### Index Strategy
1. **`idx_tenant_attendance_active_unique`**:
   - Keys: `{"tenant_id": 1, "employee_id": 1}`
   - `unique: true`
   - `partialFilterExpression: {"attendance_status": "IN_PROGRESS"}`
   - **Purpose**: Database-level guarantee that an employee cannot have more than one active session at a time, preventing race conditions under concurrent requests.
2. **`idx_tenant_attendance_emp_date`**:
   - Keys: `{"tenant_id": 1, "employee_id": 1, "work_date": 1}`
   - `unique: false`
   - **Purpose**: Fast lookup and aggregation of all sessions for an employee on any given day.
3. **`idx_tenant_attendance_emp_entry`**:
   - Keys: `{"tenant_id": 1, "employee_id": 1, "entry_time": 1}`
   - **Purpose**: Chronological history sorting.

---

## 3. API Endpoints Reference

Base Path: `/api/v1/attendance`

### 3.1 Check-In (`POST /check-in`)
Starts a new attendance session.

- **URL**: `/api/v1/attendance/check-in`
- **Method**: `POST`
- **Auth**: JWT Bearer token (`EMPLOYEE` or `ADMIN`)
- **Request Body** (optional):
```json
{
  "employee_id": "EMP_01",
  "client_ip": "192.168.1.10",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "timestamp": "2026-10-25T06:00:00Z"
}
```
- **Responses**:
  - `201 Created`:
```json
{
  "message": "Check-in recorded successfully",
  "attendance": {
    "attendance_id": "b1b7c25a-4b6c-4829-9e8a-2e403d19eb20",
    "employee_id": "EMP_01",
    "work_date": "2026-10-25",
    "entry_time": "2026-10-25T06:00:00Z",
    "exit_time": null,
    "check_in_time": "2026-10-25T06:00:00Z",
    "check_out_time": null,
    "duration_seconds": 0,
    "duration_minutes": 0.0,
    "duration_hours": 0.0,
    "attendance_status": "IN_PROGRESS"
  }
}
```
  - `400 Bad Request`: When an active session is already in progress (`"Employee 'EMP_01' already has a check-in record in progress..."`).

---

### 3.2 Check-Out (`POST /check-out`)
Concludes the currently active session and calculates duration.

- **URL**: `/api/v1/attendance/check-out`
- **Method**: `POST`
- **Auth**: JWT Bearer token (`EMPLOYEE` or `ADMIN`)
- **Request Body** (optional):
```json
{
  "employee_id": "EMP_01",
  "timestamp": "2026-10-25T08:00:00Z"
}
```
- **Responses**:
  - `200 OK`:
```json
{
  "message": "Check-out recorded successfully",
  "attendance": {
    "attendance_id": "b1b7c25a-4b6c-4829-9e8a-2e403d19eb20",
    "employee_id": "EMP_01",
    "work_date": "2026-10-25",
    "entry_time": "2026-10-25T06:00:00Z",
    "exit_time": "2026-10-25T08:00:00Z",
    "check_in_time": "2026-10-25T06:00:00Z",
    "check_out_time": "2026-10-25T08:00:00Z",
    "duration_seconds": 7200,
    "duration_minutes": 120.0,
    "duration_hours": 2.0,
    "attendance_status": "COMPLETED"
  }
}
```
  - `400 Bad Request`: If no check-in exists, if already checked out with no active session, or if `exit_time <= entry_time`.

---

### 3.3 Today's Attendance (`GET /today`)
Returns the current employee's attendance status today, along with the list of all sessions.

- **URL**: `/api/v1/attendance/today`
- **Method**: `GET`
- **Query Parameters**: `employee_id` (optional, Admin only)
- **Responses**:
  - `200 OK` (Completed Sessions Example):
```json
{
  "attendance_id": "sess-2-uuid",
  "employee_id": "EMP_01",
  "work_date": "2026-10-25",
  "entry_time": "2026-10-25T06:00:00Z",
  "exit_time": "2026-10-25T12:00:00Z",
  "duration_seconds": 18000,
  "duration_minutes": 300.0,
  "duration_hours": 5.0,
  "attendance_status": "COMPLETED",
  "total_sessions": 2,
  "completed_sessions": 2,
  "active_session": null,
  "sessions": [
    {
      "attendance_id": "sess-1-uuid",
      "employee_id": "EMP_01",
      "work_date": "2026-10-25",
      "entry_time": "2026-10-25T06:00:00Z",
      "exit_time": "2026-10-25T08:00:00Z",
      "duration_seconds": 7200,
      "duration_minutes": 120.0,
      "duration_hours": 2.0,
      "attendance_status": "COMPLETED"
    },
    {
      "attendance_id": "sess-2-uuid",
      "employee_id": "EMP_01",
      "work_date": "2026-10-25",
      "entry_time": "2026-10-25T09:00:00Z",
      "exit_time": "2026-10-25T12:00:00Z",
      "duration_seconds": 10800,
      "duration_minutes": 180.0,
      "duration_hours": 3.0,
      "attendance_status": "COMPLETED"
    }
  ]
}
```

---

### 3.4 Attendance History (`GET /history`)
Returns historical session documents in ascending chronological order.

- **URL**: `/api/v1/attendance/history` (or `/api/v1/attendance/history/{employee_id}`)
- **Method**: `GET`
- **Query Parameters**:
  - `employee_id` (string, optional): Target employee (Admin only or own ID)
  - `start_date` (string, YYYY-MM-DD, optional)
  - `end_date` (string, YYYY-MM-DD, optional)
- **Response**: Array of `AttendanceRecordResponse` objects.

---

### 3.5 Centralized Reporting (`GET /report`)
Consolidates company-wide or employee-specific attendance across daily, weekly, monthly, yearly, and custom ranges.

- **URL**: `/api/v1/attendance/report`
- **Method**: `GET`
- **Query Parameters**:
  - `period`: `daily` | `weekly` | `monthly` | `yearly` | `custom` (required)
  - `target_date`: `YYYY-MM-DD` (for daily / weekly / monthly / yearly)
  - `start_date` / `end_date`: `YYYY-MM-DD` (for custom period)
  - `employee_id`: Target employee filter (Admin only)
- **Summary Fields Aggregated**:
  - `total_attended_days`: Distinct calendar days where completed sessions occurred.
  - `total_office_hours`: Sum of all completed session hours within period.
  - `total_duration_seconds`: Sum of all completed session seconds.
  - `daily_records`: Daily breakdown with aggregated day duration and overall status.

---

## 4. Business Rules & Concurrency Control

### 1. Daily Multi-Session Calculation
When an employee works multiple sessions on date $D$:
$$\text{Total Duration (seconds)} = \sum_{s \in \text{Completed Sessions on } D} \text{duration\_seconds}_s$$
$$\text{Total Duration (minutes)} = \frac{\text{Total Duration (seconds)}}{60.0}$$
$$\text{Total Office Days} = 1 \quad (\text{if at least one session is COMPLETED})$$

*Example*:
- Session 1: 06:00 to 08:00 (120 minutes = 2.0 hours)
- Session 2: 09:00 to 12:00 (180 minutes = 3.0 hours)
- Result: 300 minutes (5.0 hours), 1 office day attended.

### 2. Incomplete Sessions Policy
1. **Real-time Status**: If a session is open (`exit_time` is null), `GET /today` reports `attendance_status = "IN_PROGRESS"`.
2. **Policy Compliance & Weekly Calculation**: Weekly compliance targets (3 days, 15 hours minimum) consider verified office hours. Incomplete sessions contribute 0 seconds/hours until checked out. Completed sessions on the same day are fully credited.
3. **Daily Reports**: The day status shows `IN_PROGRESS` if an open session exists, while `duration_hours` reflects the sum of all completed sessions on that day.

### 3. Concurrency Protection
1. **Distributed Lock**: Every check-in and check-out operation acquires a tenant-scoped Redis lock (`tenant:{tenant_id}:attendance:{employee_id}`) with a 10-second TTL.
2. **Atomic Partial Unique Index**: The MongoDB index `idx_tenant_attendance_active_unique` enforces unique `(tenant_id, employee_id)` for `attendance_status: "IN_PROGRESS"`. Any simultaneous check-in attempt will trigger a `DuplicateKeyError` and return `400 Bad Request`.
3. **Atomic Check-Out**: Check-out uses MongoDB `find_one_and_update` matching `attendance_status: "IN_PROGRESS"` to ensure only one checkout transition can succeed.

### 4. Timezone & Midnight Crossing
- Check-in and check-out timestamps are stored as timezone-aware UTC ISO-8601 strings.
- `work_date` is evaluated in the company's local timezone (`COMPANY_TIMEZONE`, e.g. `Asia/Kolkata` or `UTC`).
- A shift crossing midnight (e.g. 23:00 to 02:30 next day) calculates exact duration via UTC delta:
  $$(t_{\text{exit}} - t_{\text{entry}}).\text{total\_seconds}() = 12600\text{ seconds } (3.5\text{ hours}).$$

---

## 5. Security & Error Reference

### Security Controls
- **JWT Authentication**: All endpoints require a valid Bearer token.
- **RBAC**:
  - Regular employees (`EMPLOYEE`) can only read and write their own attendance sessions.
  - Attempting to pass another `employee_id` yields `403 Forbidden`.
  - Admins (`ADMIN`) can query or report for any employee or all employees company-wide.

### Common Error Codes
| Status Code | Error Detail Pattern | Cause |
| :--- | :--- | :--- |
| `400 Bad Request` | `"Employee '...' already has a check-in record in progress..."` | Checking in while an active session is already open |
| `400 Bad Request` | `"Cannot check out: No check-in record found..."` | Checking out without any session created today |
| `400 Bad Request` | `"Employee '...' has already checked out for workday... No active check-in session."` | Checking out when all previous sessions are completed |
| `400 Bad Request` | `"Exit time cannot precede entry time. Check-out timestamp must be later than check-in timestamp."` | Provided check-out timestamp is $\le$ check-in timestamp |
| `403 Forbidden` | `"Cannot record attendance for another employee."` | Regular employee attempting to clock in/out for another user |
| `404 Not Found` | `"Employee '...' not found"` | Employee ID does not exist in tenant |
| `422 Unprocessable Entity` | `"Geolocation coordinates required for remote clock-in."` | Remote exception check-in missing coordinates |

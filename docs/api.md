# API Contract & Endpoints Reference

Base URL: `http://localhost:8000/api/v1`

## 1. Authentication (`/auth`)
- `POST /auth/login`: Authenticate with username and password. Returns JWT token, user details, and role.
- `GET /auth/me`: Retrieve currently authenticated user context.

## 2. Employees (`/employees`)
- `GET /employees`: List registered employees (Optional: `?active_only=true`). [ADMIN only]
- `GET /employees/{id}`: Retrieve employee by ID. [ADMIN or self]
- `POST /employees`: Register new employee record. [ADMIN only]
- `PUT /employees/{id}`: Update employee details. [ADMIN only]
- `DELETE /employees/{id}`: Deactivate employee record. [ADMIN only]

## 3. Attendance (`/attendance`)
- `POST /attendance/check-in`: Register office entry.
- `POST /attendance/check-out`: Register office departure and compute duration.
- `GET /attendance/today`: Fetch active or completed attendance record for current date.
- `GET /attendance/history/{employee_id}`: Fetch historical logs with optional date range (`start_date`, `end_date`).

## 4. Central Reports (`/attendance/report`)
- `GET /attendance/report`: Central multi-period reporting endpoint.
  - Query parameters:
    - `period`: `daily` | `weekly` | `monthly` | `yearly` | `custom`
    - `target_date`: Reference date (for daily/weekly/monthly/yearly)
    - `start_date`, `end_date`: Custom range boundaries
    - `employee_id`: Optional filter for individual employee view

## 5. Policy Violations & Notifications (`/violations`)
- `GET /violations`: List detected policy non-compliance records.
- `POST /violations/evaluate`: Trigger on-demand policy evaluation for the latest completed calendar week.
- `POST /violations/dispatch-notifications`: Dispatch email warnings to non-compliant staff.
- `GET /violations/notification-logs`: Audit logs of sent/failed email notifications.

## 6. Health
- `GET /health` or `GET /api/v1/health`: Liveness and readiness check with database connectivity status.
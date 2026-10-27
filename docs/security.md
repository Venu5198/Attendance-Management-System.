# Security Architecture & Hardening

## 1. Authentication & Session Management
- **Password Storage:** Passwords hashed with bcrypt before storage; plaintext credentials are never persisted.
- **JWT Authentication:** Cryptographically signed tokens (HS256) containing `sub` (user ID), `username`, `role`, and `employee_id`.
- **Token Expiry:** Access tokens have an explicit configurable lifetime (`ACCESS_TOKEN_EXPIRE_MINUTES`).
- **401 Response Handling:** Frontend Axios client intercepts 401 Unauthorized responses and purges tokens from local storage.

## 2. Authorization & RBAC
- **Strict Role Enforcement:**
  - `ADMIN`: Global reporting, employee CRUD, company-wide attendance tracking, manual policy evaluation, notification dispatch.
  - `EMPLOYEE`: Access strictly restricted to personal records (`/attendance/today`, `/attendance/check-in`, `/attendance/history/{own_id}`, own reports).
- **Backend Source of Truth:** Frontend routing rules are strictly UX-level. FastAPI dependencies enforce ownership verification on every secured endpoint.

## 3. Defense-in-Depth HTTP Headers
FastAPI application injects HTTP response headers on all requests:
- `X-Content-Type-Options: nosniff` (Prevents MIME-sniffing exploits)
- `X-Frame-Options: DENY` (Mitigates clickjacking)
- `X-XSS-Protection: 1; mode=block` (Cross-site scripting filter)

## 4. CORS Policy
- Configurable via `CORS_ORIGINS` environment variable (defaults to `http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173`).
- Wildcard `*` disabled in production mode.

## 5. Secret Isolation
- No secrets committed into version control (`.env` is excluded in root `.gitignore`).
- React frontend only receives `VITE_*` public variables (e.g. API base URL). Database URIs, JWT secrets, and SMTP passwords remain backend-only.
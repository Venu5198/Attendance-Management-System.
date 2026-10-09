# Attendance Management System — Frontend

Modern, high-performance React dashboard built with TypeScript, Vite, Tailwind CSS, and Axios.

## Features
- **Role-Based Routing:** Tailored navigation and views for ADMIN and EMPLOYEE.
- **Admin Dashboard:** Company-wide attendance stats, compliance KPI indicators, violation monitoring, and email status tracking.
- **Employee Dashboard:** Interactive Check-in / Check-out controls, live office hour tracking, and weekly policy compliance progress.
- **Central Reporting UI:** Daily, Weekly, Monthly, Yearly, and Custom date ranges with CSV export.
- **Violations Console:** On-demand policy evaluation trigger, email dispatch controls, and delivery audit log viewer.
- **Security:** Strict JWT Bearer token handling with automated 401 expiration handling.

## Development Setup

```bash
cd frontend
npm install
npm run dev
```

Build for production:
```bash
npm run build
```
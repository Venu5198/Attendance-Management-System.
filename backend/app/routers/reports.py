"""Single centralized attendance reporting API route."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.database import get_database
from app.dependencies import get_current_user, require_admin
from app.schemas.report import AttendanceReportResponse, EmailReportRequest, ReportPeriod
from app.services.email_service import EmailService
from app.services.report_service import ReportService

router = APIRouter(prefix="/attendance", tags=["Reporting"])


@router.get(
    "/report",
    response_model=AttendanceReportResponse,
    summary="Single Central Reporting API (daily, weekly, monthly, yearly, custom)",
)
async def get_attendance_report(
    current_user: Annotated[dict, Depends(get_current_user)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
    period: ReportPeriod = Query(..., description="Report period: daily, weekly, monthly, yearly, custom"),
    target_date: str | None = Query(None, description="Target date for daily/weekly reports (YYYY-MM-DD)"),
    start_date: str | None = Query(None, description="Start date for custom period (YYYY-MM-DD)"),
    end_date: str | None = Query(None, description="End date for custom period (YYYY-MM-DD)"),
    employee_id: str | None = Query(None, description="Optional employee filter (Admin only)"),
):
    """
    Mandatory Central Reporting API.
    Supports:
    - Daily: period=daily [&target_date=YYYY-MM-DD]
    - Weekly: period=weekly [&target_date=YYYY-MM-DD]
    - Monthly: period=monthly [&target_date=YYYY-MM-DD]
    - Yearly: period=yearly [&target_date=YYYY-MM-DD]
    - Custom: period=custom&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD

    Access Rules:
    - ADMIN can retrieve the complete company report covering all active employees in a single request.
    - Non-admin EMPLOYEE users automatically receive only their own attendance records.
    - Zero attendance records are presented as NOT_ATTENDED with 0 completed hours.
    - Email notifications are NEVER sent as a side effect of reporting.
    """
    user_role = current_user.get("role", "EMPLOYEE")
    filter_emp_id: str | None = None

    if user_role == "ADMIN":
        # Admin can view all or filter by specific employee
        filter_emp_id = employee_id
    else:
        # Regular employee can only view their own attendance report
        filter_emp_id = current_user.get("employee_id")

    service = ReportService(db)
    return await service.generate_report(
        period=period,
        target_date=target_date,
        start_date=start_date,
        end_date=end_date,
        employee_id_filter=filter_emp_id,
    )


@router.post(
    "/report/email",
    summary="Email Attendance Report to specified mail id (Admin only)",
)
async def email_attendance_report(
    req: EmailReportRequest,
    current_admin: Annotated[dict, Depends(require_admin)],
    db: Annotated[AsyncDatabase, Depends(get_database)],
):
    """
    Generate and email attendance report to any destination mail address via configured SMTP/email provider.
    """
    service = ReportService(db)
    report_data = await service.generate_report(
        period=req.period,
        target_date=req.target_date,
        start_date=req.start_date,
        end_date=req.end_date,
        employee_id_filter=req.employee_id,
    )

    email_service = EmailService(db)
    success = await email_service.send_report_email(
        recipient_email=req.recipient_email,
        period=req.period.value,
        start_date=report_data.metadata.start_date,
        end_date=report_data.metadata.end_date,
        summary=report_data.summary.model_dump(),
        employees=[e.model_dump() for e in report_data.employees],
    )

    if not success:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send report email. Check SMTP settings and server logs.",
        )

    return {
        "message": f"Attendance report successfully emailed to {req.recipient_email}",
        "recipient": req.recipient_email,
        "period": req.period,
        "date_range": f"{report_data.metadata.start_date} to {report_data.metadata.end_date}",
    }

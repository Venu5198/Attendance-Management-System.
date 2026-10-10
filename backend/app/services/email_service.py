"""Email notification service with pluggable providers and idempotent logging."""

import logging
import smtplib
from datetime import UTC, datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from uuid import uuid4

from pymongo.asynchronous.database import AsyncDatabase

from app.config import get_settings
from app.schemas.notification import DeliveryStatus

logger = logging.getLogger(__name__)


class EmailService:
    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.logs = db.notification_logs
        self.violations = db.policy_violations
        self.settings = get_settings()

    def build_violation_email_content(
        self,
        full_name: str,
        office_days: int,
        total_hours: float,
        reasons: list[str],
    ) -> tuple[str, str]:
        """Construct subject and plain text / HTML body for violation email."""
        subject = "Work From Home Policy Violation - Attendance Compliance"

        reason_lines = (
            "\n".join([f"- {r}" for r in reasons]) if reasons else "- Office attendance was below the required minimum."
        )

        body_text = (
            f"Dear {full_name},\n\n"
            f"Our attendance records indicate that you did not meet the company's weekly office attendance policy.\n\n"
            f"Required attendance:\n"
            f"- Minimum office days: {self.settings.POLICY_REQUIRED_DAYS}\n"
            f"- Minimum total office hours: {int(self.settings.POLICY_REQUIRED_HOURS)}\n\n"
            f"Your recorded attendance:\n"
            f"- Office days: {office_days}\n"
            f"- Completed office hours: {total_hours}\n\n"
            f"Reason for violation:\n"
            f"{reason_lines}\n\n"
            f"Please review your attendance and follow the company's office/WFH policy.\n\n"
            f"Regards,\n"
            f"HR / Attendance Management System\n"
        )
        return subject, body_text

    async def send_violation_email(
        self,
        employee_id: str,
        recipient_email: str,
        employee_name: str,
        policy_week: str,
        office_days: int,
        total_hours: float,
        reasons: list[str],
        force_resend: bool = False,
    ) -> bool:
        """
        Send violation email idempotently.
        Guarantees that an employee will NOT receive duplicate notifications for the same policy week
        unless force_resend is explicitly set.
        """
        # Idempotency check: verify if successfully sent previously
        if not force_resend:
            existing_sent = await self.logs.find_one(
                {
                    "employee_id": employee_id,
                    "policy_week": policy_week,
                    "delivery_status": DeliveryStatus.SENT.value,
                }
            )
            if existing_sent:
                logger.info(
                    "Violation notification already sent for employee %s for week %s. Skipping duplicate.",
                    employee_id,
                    policy_week,
                )
                return False

        subject, body = self.build_violation_email_content(
            full_name=employee_name or "Employee",
            office_days=office_days,
            total_hours=total_hours,
            reasons=reasons,
        )

        now = datetime.now(UTC)
        delivery_status = DeliveryStatus.FAILED
        error_details = None
        provider_resp = None

        try:
            provider = self.settings.EMAIL_PROVIDER.lower()
            if provider == "mock":
                provider_resp = await self._send_mock(recipient_email, subject, body)
                delivery_status = DeliveryStatus.SENT

            elif provider == "smtp":
                provider_resp = await self._send_smtp(recipient_email, subject, body)
                delivery_status = DeliveryStatus.SENT

            elif provider == "sendgrid":
                provider_resp = await self._send_sendgrid(recipient_email, subject, body)
                delivery_status = DeliveryStatus.SENT

            else:
                raise ValueError(f"Unknown EMAIL_PROVIDER: {provider}")

            logger.info(
                "Successfully sent violation email to %s for week %s via %s", recipient_email, policy_week, provider
            )

        except Exception as exc:
            # Secure error logging: never log passwords or secrets
            error_details = str(exc)
            logger.error("Failed to send violation email to %s: %s", recipient_email, error_details)
            delivery_status = DeliveryStatus.FAILED

        # Count prior attempts for retry tracking
        prior_attempts = await self.logs.count_documents(
            {
                "employee_id": employee_id,
                "policy_week": policy_week,
            }
        )

        log_doc = {
            "log_id": str(uuid4()),
            "employee_id": employee_id,
            "recipient": recipient_email,
            "policy_week": policy_week,
            "notification_type": "POLICY_VIOLATION_EMAIL",
            "delivery_status": delivery_status.value,
            "attempted_at": now,
            "retry_count": prior_attempts,
            "error_details": error_details,
            "provider_response": provider_resp,
        }
        await self.logs.insert_one(log_doc)

        if delivery_status == DeliveryStatus.SENT:
            # Update violation record
            await self.violations.update_one(
                {"employee_id": employee_id, "week_label": policy_week},
                {"$set": {"notification_sent": True, "notified_at": now}},
            )
            return True

        return False

    def build_report_email_content(
        self,
        period: str,
        start_date: str,
        end_date: str,
        summary: dict,
        employees: list[dict],
    ) -> tuple[str, str]:
        """Construct subject and HTML body for an attendance report email."""
        subject = f"Attendance Management Report — {period.capitalize()} ({start_date} to {end_date})"

        emp_rows = ""
        for emp in employees:
            status_color = "#16a34a" if emp.get("overall_compliance") == "COMPLIANT" else "#dc2626"
            emp_rows += f"""
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px; font-weight: 500;">{emp.get("full_name")} ({emp.get("employee_id")})</td>
                <td style="padding: 10px;">{emp.get("department", "N/A")}</td>
                <td style="padding: 10px; text-align: center;">{emp.get("total_attended_days", 0)} days</td>
                <td style="padding: 10px; text-align: center;">{emp.get("total_office_hours", 0.0):.1f} hrs</td>
                <td style="padding: 10px; text-align: center; color: {status_color}; font-weight: 600;">{emp.get("overall_compliance", "PENDING")}</td>
            </tr>
            """

        html_body = f"""
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; background-color: #f8fafc; padding: 24px;">
            <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="background: linear-gradient(135deg, #2563eb, #4f46e5); color: #ffffff; padding: 24px;">
                    <h2 style="margin: 0; font-size: 20px;">Company Attendance Report</h2>
                    <p style="margin: 4px 0 0; opacity: 0.9; font-size: 13px;">Period: {period.upper()} &bull; Range: {start_date} to {end_date}</p>
                </div>
                <div style="padding: 24px;">
                    <h3 style="margin-top: 0; font-size: 15px; color: #475569;">Summary Overview</h3>
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                        <tr style="background: #f1f5f9; text-align: center;">
                            <th style="padding: 10px; font-size: 12px; text-transform: uppercase;">Total Active Staff</th>
                            <th style="padding: 10px; font-size: 12px; text-transform: uppercase;">Compliant</th>
                            <th style="padding: 10px; font-size: 12px; text-transform: uppercase;">Non-Compliant</th>
                            <th style="padding: 10px; font-size: 12px; text-transform: uppercase;">Avg Hours</th>
                        </tr>
                        <tr style="text-align: center; font-size: 18px; font-weight: bold;">
                            <td style="padding: 12px;">{summary.get("total_active_employees", 0)}</td>
                            <td style="padding: 12px; color: #16a34a;">{summary.get("compliant_weeks_count", 0)}</td>
                            <td style="padding: 12px; color: #dc2626;">{summary.get("non_compliant_weeks_count", 0)}</td>
                            <td style="padding: 12px; color: #2563eb;">{summary.get("average_hours_per_employee", 0.0):.1f}h</td>
                        </tr>
                    </table>

                    <h3 style="font-size: 15px; color: #475569; margin-bottom: 8px;">Employee Compliance Breakdown</h3>
                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                        <thead>
                            <tr style="background: #f8fafc; border-bottom: 2px solid #e2e8f0; text-align: left;">
                                <th style="padding: 10px;">Employee</th>
                                <th style="padding: 10px;">Department</th>
                                <th style="padding: 10px; text-align: center;">Office Days</th>
                                <th style="padding: 10px; text-align: center;">Total Hours</th>
                                <th style="padding: 10px; text-align: center;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {emp_rows}
                        </tbody>
                    </table>
                </div>
                <div style="background: #f8fafc; padding: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center;">
                    Generated by Centralized Attendance Management System &bull; Policy: &ge; 3 days &amp; &ge; 15 hrs / week
                </div>
            </div>
        </body>
        </html>
        """
        return subject, html_body

    async def send_report_email(
        self,
        recipient_email: str,
        period: str,
        start_date: str,
        end_date: str,
        summary: dict,
        employees: list[dict],
    ) -> bool:
        """Send formatted attendance report to any email address."""
        subject, html_body = self.build_report_email_content(
            period=period,
            start_date=start_date,
            end_date=end_date,
            summary=summary,
            employees=employees,
        )
        now = datetime.now(UTC)
        provider = self.settings.EMAIL_PROVIDER.lower()
        delivery_status = DeliveryStatus.FAILED
        error_details = None
        provider_resp = None

        try:
            if provider == "mock":
                provider_resp = await self._send_mock(recipient_email, subject, html_body)
                delivery_status = DeliveryStatus.SENT
            elif provider == "smtp":
                provider_resp = await self._send_smtp(recipient_email, subject, html_body, is_html=True)
                delivery_status = DeliveryStatus.SENT
            elif provider == "sendgrid":
                provider_resp = await self._send_sendgrid(recipient_email, subject, html_body)
                delivery_status = DeliveryStatus.SENT
            else:
                raise ValueError(f"Unknown EMAIL_PROVIDER: {provider}")

            logger.info("Successfully sent report email to %s via %s", recipient_email, provider)
        except Exception as exc:
            error_details = str(exc)
            logger.error("Failed to send report email to %s: %s", recipient_email, error_details)
            delivery_status = DeliveryStatus.FAILED

        log_doc = {
            "log_id": str(uuid4()),
            "employee_id": "SYSTEM",
            "recipient": recipient_email,
            "policy_week": f"{start_date}_to_{end_date}",
            "notification_type": "REPORT_EMAIL",
            "delivery_status": delivery_status.value,
            "attempted_at": now,
            "retry_count": 0,
            "error_details": error_details,
            "provider_response": provider_resp,
        }
        await self.logs.insert_one(log_doc)
        return delivery_status == DeliveryStatus.SENT

    async def _send_mock(self, recipient: str, subject: str, body: str) -> dict:
        """Mock email dispatch for testing and development."""
        return {"status": "mock_delivered", "recipient": recipient, "subject": subject}

    async def _send_smtp(self, recipient: str, subject: str, body: str, is_html: bool = False) -> dict:
        """Send email via SMTP."""
        msg = MIMEMultipart("alternative")
        msg["From"] = self.settings.EMAIL_FROM
        msg["To"] = recipient
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "html" if is_html else "plain"))

        server = smtplib.SMTP(self.settings.SMTP_HOST, self.settings.SMTP_PORT, timeout=10)
        try:
            if self.settings.SMTP_USE_TLS:
                server.starttls()
            if self.settings.SMTP_USERNAME and self.settings.SMTP_PASSWORD:
                server.login(self.settings.SMTP_USERNAME, self.settings.SMTP_PASSWORD)
            server.send_message(msg)
            return {"status": "smtp_delivered", "recipient": recipient}
        finally:
            server.quit()

    async def _send_sendgrid(self, recipient: str, subject: str, body: str) -> dict:
        """Send email via SendGrid API."""
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        if not self.settings.SENDGRID_API_KEY:
            raise ValueError("SENDGRID_API_KEY is not configured")

        message = Mail(
            from_email=self.settings.EMAIL_FROM,
            to_emails=recipient,
            subject=subject,
            plain_text_content=body,
        )
        sg = SendGridAPIClient(self.settings.SENDGRID_API_KEY)
        response = sg.send(message)
        return {"status_code": response.status_code, "recipient": recipient}

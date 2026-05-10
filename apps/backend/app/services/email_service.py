"""
Email Service for sending notification emails.

Supports SendGrid and SMTP providers.
"""

from __future__ import annotations

import logging
import smtplib
from abc import ABC, abstractmethod
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any, Dict

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)


class EmailProvider(ABC):
    """Abstract base class for email providers."""

    @abstractmethod
    async def send(
        self,
        to: str,
        subject: str,
        html: str,
        text: str | None = None,
    ) -> bool:
        """Send an email.

        Args:
            to: Recipient email address
            subject: Email subject
            html: HTML body content
            text: Optional plain text body content

        Returns:
            True if email was sent successfully, False otherwise
        """
        pass


class SendGridProvider(EmailProvider):
    """SendGrid email provider."""

    def __init__(self):
        self.api_key = settings.SENDGRID_API_KEY
        self.from_email = settings.SENDGRID_FROM_EMAIL
        self.from_name = settings.SENDGRID_FROM_NAME

    async def send(
        self,
        to: str,
        subject: str,
        html: str,
        text: str | None = None,
    ) -> bool:
        if not self.api_key:
            logger.warning("SendGrid API key not configured")
            return False

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "personalizations": [{"to": [{"email": to}]}],
                        "from": {
                            "email": self.from_email,
                            "name": self.from_name,
                        },
                        "subject": subject,
                        "content": [
                            {"type": "text/plain", "value": text or ""},
                            {"type": "text/html", "value": html},
                        ],
                    },
                    timeout=30.0,
                )

                if response.status_code == 202:
                    logger.info(f"Email sent via SendGrid to {to}")
                    return True
                else:
                    logger.error(
                        f"SendGrid error: {response.status_code} - {response.text}"
                    )
                    return False
        except Exception as e:
            logger.error(f"Failed to send email via SendGrid: {e}")
            return False


class SMTPProvider(EmailProvider):
    """SMTP email provider."""

    def __init__(self):
        self.host = settings.SMTP_HOST
        self.port = settings.SMTP_PORT
        self.username = settings.SMTP_USERNAME
        self.password = settings.SMTP_PASSWORD
        self.use_tls = settings.SMTP_USE_TLS
        self.from_email = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME

    async def send(
        self,
        to: str,
        subject: str,
        html: str,
        text: str | None = None,
    ) -> bool:
        if not self.username or not self.password:
            logger.warning("SMTP credentials not configured")
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.from_email
            msg["To"] = to

            if text:
                msg.attach(MIMEText(text, "plain"))
            msg.attach(MIMEText(html, "html"))

            with smtplib.SMTP(self.host, self.port) as server:
                if self.use_tls:
                    server.starttls()
                server.login(self.username, self.password)
                server.send_message(msg)

            logger.info(f"Email sent via SMTP to {to}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email via SMTP: {e}")
            return False


class EmailService:
    """Service for sending notification emails."""

    def __init__(self):
        if settings.EMAIL_PROVIDER == "sendgrid":
            self._provider = SendGridProvider()
        else:
            self._provider = SMTPProvider()

    async def send_email(
        self,
        to: str,
        subject: str,
        html: str,
        text: str | None = None,
    ) -> bool:
        """Send a generic email."""
        if not settings.EMAIL_ENABLED:
            logger.debug("Email notifications disabled")
            return True  # Return True to not break flow

        return await self._provider.send(to, subject, html, text)

    async def send_assignment_email(
        self,
        user_email: str,
        data: Dict[str, Any],
    ) -> bool:
        """Send notification for new review assignment."""
        subject = f"New Review Assignment: {data.get('repo', 'Unknown')}"
        html = self._render_assignment_email(data)
        return await self.send_email(user_email, subject, html)

    async def send_comment_reply_email(
        self,
        user_email: str,
        data: Dict[str, Any],
    ) -> bool:
        """Send notification for comment reply."""
        subject = f"New reply to your comment in {data.get('file_path', 'review')}"
        html = self._render_comment_reply_email(data)
        return await self.send_email(user_email, subject, html)

    async def send_review_submitted_email(
        self,
        user_email: str,
        data: Dict[str, Any],
    ) -> bool:
        """Send notification when review is submitted."""
        subject = f"Review submitted for {data.get('repo', 'Unknown')}"
        html = self._render_review_submitted_email(data)
        return await self.send_email(user_email, subject, html)

    async def send_changes_requested_email(
        self,
        user_email: str,
        data: Dict[str, Any],
    ) -> bool:
        """Send notification when changes are requested."""
        subject = f"Changes requested for {data.get('repo', 'Unknown')}"
        html = self._render_changes_requested_email(data)
        return await self.send_email(user_email, subject, html)

    def _render_assignment_email(self, data: Dict[str, Any]) -> str:
        """Render new assignment email template."""
        repo = data.get("repo", "Unknown")
        priority = data.get("priority", "medium")
        due_at = data.get("due_at", "No deadline")
        review_url = data.get("review_url", "#")

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; }}
                .content {{ background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; }}
                .badge {{ display: inline-block; padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }}
                .badge-high {{ background: #fef3c7; color: #92400e; }}
                .badge-critical {{ background: #fee2e2; color: #991b1b; }}
                .badge-medium {{ background: #dbeafe; color: #1e40af; }}
                .badge-low {{ background: #d1fae5; color: #065f46; }}
                .button {{ display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }}
                .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>New Review Assignment</h1>
                </div>
                <div class="content">
                    <p>You have been assigned to review a new pull request.</p>
                    <p><strong>Repository:</strong> {repo}</p>
                    <p><strong>Priority:</strong> <span class="badge badge-{priority}">{priority.upper()}</span></p>
                    <p><strong>Due:</strong> {due_at}</p>
                    <a href="{review_url}" class="button">Start Review</a>
                </div>
                <div class="footer">
                    <p>AI Code Review Platform</p>
                </div>
            </div>
        </body>
        </html>
        """

    def _render_comment_reply_email(self, data: Dict[str, Any]) -> str:
        """Render comment reply email template."""
        file_path = data.get("file_path", "Unknown")
        replier_name = data.get("replier_name", "Someone")
        comment_content = data.get("comment_content", "")
        review_url = data.get("review_url", "#")

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; }}
                .content {{ background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; }}
                .quote {{ background: white; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 0 8px 8px 0; }}
                .button {{ display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }}
                .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>New Reply to Your Comment</h1>
                </div>
                <div class="content">
                    <p><strong>{replier_name}</strong> replied to your comment in <code>{file_path}</code>:</p>
                    <div class="quote">{comment_content}</div>
                    <a href="{review_url}" class="button">View Thread</a>
                </div>
                <div class="footer">
                    <p>AI Code Review Platform</p>
                </div>
            </div>
        </body>
        </html>
        """

    def _render_review_submitted_email(self, data: Dict[str, Any]) -> str:
        """Render review submitted email template."""
        repo = data.get("repo", "Unknown")
        reviewer_name = data.get("reviewer_name", "Unknown")
        verdict = data.get("verdict", "comment_only")
        summary = data.get("summary", "")
        review_url = data.get("review_url", "#")

        verdict_colors = {
            "approve": ("#10b981", "Approved"),
            "request_changes": ("#f59e0b", "Changes Requested"),
            "comment_only": ("#6366f1", "Commented"),
        }
        color, label = verdict_colors.get(verdict, ("#6b7280", verdict))

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: {color}; padding: 30px; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; }}
                .content {{ background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; }}
                .summary {{ background: white; padding: 15px; border-radius: 8px; margin: 15px 0; border: 1px solid #e5e7eb; }}
                .button {{ display: inline-block; background: {color}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }}
                .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Review {label}</h1>
                </div>
                <div class="content">
                    <p><strong>{reviewer_name}</strong> has submitted a review for <strong>{repo}</strong>.</p>
                    {f'<div class="summary"><strong>Summary:</strong><br>{summary}</div>' if summary else ''}
                    <a href="{review_url}" class="button">View Review</a>
                </div>
                <div class="footer">
                    <p>AI Code Review Platform</p>
                </div>
            </div>
        </body>
        </html>
        """

    def _render_changes_requested_email(self, data: Dict[str, Any]) -> str:
        """Render changes requested email template."""
        repo = data.get("repo", "Unknown")
        reviewer_name = data.get("reviewer_name", "Unknown")
        comments_count = data.get("comments_count", 0)
        blocking_count = data.get("blocking_count", 0)
        review_url = data.get("review_url", "#")

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 30px; border-radius: 10px 10px 0 0; }}
                .header h1 {{ color: white; margin: 0; font-size: 24px; }}
                .content {{ background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: 0; }}
                .stats {{ display: flex; gap: 20px; margin: 20px 0; }}
                .stat {{ background: white; padding: 15px 20px; border-radius: 8px; border: 1px solid #e5e7eb; flex: 1; text-align: center; }}
                .stat-value {{ font-size: 24px; font-weight: 700; color: #1f2937; }}
                .stat-label {{ font-size: 12px; color: #6b7280; margin-top: 4px; }}
                .button {{ display: inline-block; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 20px; }}
                .footer {{ text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Changes Requested</h1>
                </div>
                <div class="content">
                    <p><strong>{reviewer_name}</strong> has requested changes for <strong>{repo}</strong>.</p>
                    <div class="stats">
                        <div class="stat">
                            <div class="stat-value">{comments_count}</div>
                            <div class="stat-label">Comments</div>
                        </div>
                        <div class="stat">
                            <div class="stat-value" style="color: #dc2626;">{blocking_count}</div>
                            <div class="stat-label">Blocking</div>
                        </div>
                    </div>
                    <a href="{review_url}" class="button">View Feedback</a>
                </div>
                <div class="footer">
                    <p>AI Code Review Platform</p>
                </div>
            </div>
        </body>
        </html>
        """

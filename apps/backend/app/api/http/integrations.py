"""
Integrations API endpoints for Slack and Microsoft Teams.

Provides configuration management and test endpoints for third-party integrations.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.services.slack_service import SlackService
from app.services.teams_service import TeamsService
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/integrations", tags=["integrations"])


# ─── Response Models ──────────────────────────────────────────────────────────

class IntegrationStatus(BaseModel):
    name: str
    enabled: bool
    configured: bool
    webhook_configured: bool
    default_channel: str | None


class IntegrationsStatusResponse(BaseModel):
    slack: IntegrationStatus
    teams: IntegrationStatus
    github: IntegrationStatus


class TestMessageRequest(BaseModel):
    message: str = "Test notification from AI Code Review Platform"


class TestMessageResponse(BaseModel):
    success: bool
    message: str


class SlackConfigResponse(BaseModel):
    enabled: bool
    webhook_configured: bool
    default_channel: str


class TeamsConfigResponse(BaseModel):
    enabled: bool
    webhook_configured: bool
    default_channel: str


# ─── Status Endpoints ─────────────────────────────────────────────────────────

@router.get("/status", response_model=IntegrationsStatusResponse)
async def get_integrations_status(

):
    """Get status of all integrations."""
    return IntegrationsStatusResponse(
        slack=IntegrationStatus(
            name="Slack",
            enabled=settings.SLACK_ENABLED,
            configured=bool(settings.SLACK_WEBHOOK_URL),
            webhook_configured=bool(settings.SLACK_WEBHOOK_URL),
            default_channel=settings.SLACK_DEFAULT_CHANNEL,
        ),
        teams=IntegrationStatus(
            name="Microsoft Teams",
            enabled=settings.TEAMS_ENABLED,
            configured=bool(settings.TEAMS_WEBHOOK_URL),
            webhook_configured=bool(settings.TEAMS_WEBHOOK_URL),
            default_channel=settings.TEAMS_DEFAULT_CHANNEL,
        ),
        github=IntegrationStatus(
            name="GitHub",
            enabled=bool(settings.GITHUB_APP_ID),
            configured=bool(settings.GITHUB_APP_ID and settings.GITHUB_APP_PRIVATE_KEY_PEM),
            webhook_configured=bool(settings.GITHUB_WEBHOOK_SECRET),
            default_channel=None,
        ),
    )


# ─── Slack Endpoints ──────────────────────────────────────────────────────────

@router.get("/slack/config", response_model=SlackConfigResponse)
async def get_slack_config(

):
    """Get Slack integration configuration (safe values only)."""
    return SlackConfigResponse(
        enabled=settings.SLACK_ENABLED,
        webhook_configured=bool(settings.SLACK_WEBHOOK_URL),
        default_channel=settings.SLACK_DEFAULT_CHANNEL,
    )


@router.post("/slack/test", response_model=TestMessageResponse)
async def test_slack_integration(
    request: TestMessageRequest,

):
    """Send a test message to Slack."""
    if not settings.SLACK_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slack integration is not enabled",
        )

    if not settings.SLACK_WEBHOOK_URL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slack webhook URL is not configured",
        )

    slack_service = SlackService()
    success = await slack_service.send_message(
        text=request.message,
        blocks=[
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":white_check_mark: *Test Message*\n{request.message}",
                },
            },
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": "Sent from AI Code Review Platform",
                    }
                ],
            },
        ],
    )

    if success:
        return TestMessageResponse(
            success=True,
            message="Test message sent successfully to Slack",
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send test message to Slack",
        )


@router.post("/slack/notify/review", response_model=TestMessageResponse)
async def send_slack_review_notification(
    data: dict,

):
    """Send a review notification to Slack (for testing/manual triggering)."""
    if not settings.SLACK_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slack integration is not enabled",
        )

    slack_service = SlackService()
    success = await slack_service.notify_new_review(data)

    return TestMessageResponse(
        success=success,
        message="Review notification sent to Slack" if success else "Failed to send notification",
    )


# ─── Teams Endpoints ──────────────────────────────────────────────────────────

@router.get("/teams/config", response_model=TeamsConfigResponse)
async def get_teams_config(

):
    """Get Microsoft Teams integration configuration (safe values only)."""
    return TeamsConfigResponse(
        enabled=settings.TEAMS_ENABLED,
        webhook_configured=bool(settings.TEAMS_WEBHOOK_URL),
        default_channel=settings.TEAMS_DEFAULT_CHANNEL,
    )


@router.post("/teams/test", response_model=TestMessageResponse)
async def test_teams_integration(
    request: TestMessageRequest,

):
    """Send a test message to Microsoft Teams."""
    if not settings.TEAMS_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teams integration is not enabled",
        )

    if not settings.TEAMS_WEBHOOK_URL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teams webhook URL is not configured",
        )

    teams_service = TeamsService()
    success = await teams_service.send_message(
        title="Test Message",
        text=request.message,
        sections=[
            {
                "facts": [
                    {"name": "Source", "value": "AI Code Review Platform"},
                    {"name": "Type", "value": "Test Notification"},
                ],
            }
        ],
        theme_color="00FF00",  # Green for success
    )

    if success:
        return TestMessageResponse(
            success=True,
            message="Test message sent successfully to Microsoft Teams",
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send test message to Microsoft Teams",
        )


@router.post("/teams/notify/review", response_model=TestMessageResponse)
async def send_teams_review_notification(
    data: dict,

):
    """Send a review notification to Microsoft Teams (for testing/manual triggering)."""
    if not settings.TEAMS_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Teams integration is not enabled",
        )

    teams_service = TeamsService()
    success = await teams_service.notify_new_review(data)

    return TestMessageResponse(
        success=success,
        message="Review notification sent to Teams" if success else "Failed to send notification",
    )

"""
Slack Service for sending team notifications.

Uses Slack webhooks for channel notifications.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)


class SlackService:
    """Service for sending Slack notifications."""

    def __init__(self):
        self.webhook_url = settings.SLACK_WEBHOOK_URL
        self.default_channel = settings.SLACK_DEFAULT_CHANNEL

    async def send_message(
        self,
        text: str,
        blocks: List[Dict[str, Any]] | None = None,
        channel: str | None = None,
    ) -> bool:
        """Send a message to Slack.

        Args:
            text: Plain text fallback message
            blocks: Optional Block Kit blocks for rich formatting
            channel: Optional channel override (requires bot token)

        Returns:
            True if message was sent successfully, False otherwise
        """
        if not settings.SLACK_ENABLED:
            logger.debug("Slack notifications disabled")
            return True  # Return True to not break flow

        if not self.webhook_url:
            logger.warning("Slack webhook URL not configured")
            return False

        try:
            payload = {"text": text}
            if blocks:
                payload["blocks"] = blocks

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.webhook_url,
                    json=payload,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    logger.info("Slack message sent successfully")
                    return True
                else:
                    logger.error(
                        f"Slack webhook error: {response.status_code} - {response.text}"
                    )
                    return False
        except Exception as e:
            logger.error(f"Failed to send Slack message: {e}")
            return False

    async def notify_new_review(self, data: Dict[str, Any]) -> bool:
        """Notify channel about new PR review available."""
        repo = data.get("repo", "Unknown")
        pr_label = data.get("pr_label", "PR")
        author = data.get("author", "Unknown")
        priority = data.get("priority", "medium")
        blockers = data.get("blockers", 0)
        warnings = data.get("warnings", 0)
        review_url = data.get("review_url", "#")

        priority_emoji = {
            "critical": ":rotating_light:",
            "high": ":warning:",
            "medium": ":large_blue_circle:",
            "low": ":white_circle:",
        }.get(priority, ":large_blue_circle:")

        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": ":eyes: New Code Review Available",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": [
                    {"type": "mrkdwn", "text": f"*Repository:*\n{repo}"},
                    {"type": "mrkdwn", "text": f"*PR:*\n{pr_label}"},
                    {"type": "mrkdwn", "text": f"*Author:*\n{author}"},
                    {"type": "mrkdwn", "text": f"*Priority:*\n{priority_emoji} {priority.upper()}"},
                ],
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"*Findings:* :red_circle: {blockers} blockers | :yellow_circle: {warnings} warnings",
                },
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "View Review"},
                        "url": review_url,
                        "style": "primary",
                    }
                ],
            },
        ]

        return await self.send_message(
            text=f"New code review available: {repo} - {pr_label}",
            blocks=blocks,
        )

    async def notify_review_completed(self, data: Dict[str, Any]) -> bool:
        """Notify channel that a review was completed."""
        repo = data.get("repo", "Unknown")
        pr_label = data.get("pr_label", "PR")
        reviewer = data.get("reviewer", "Unknown")
        verdict = data.get("verdict", "comment_only")
        review_url = data.get("review_url", "#")

        verdict_config = {
            "approve": (":white_check_mark:", "Approved"),
            "request_changes": (":warning:", "Changes Requested"),
            "comment_only": (":speech_balloon:", "Commented"),
            "block": (":x:", "Blocked"),
        }
        emoji, label = verdict_config.get(verdict, (":memo:", verdict))

        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"{emoji} *Review Completed* for *{repo}* ({pr_label})\n"
                    f"Reviewer: {reviewer} | Verdict: *{label}*",
                },
                "accessory": {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View"},
                    "url": review_url,
                },
            },
        ]

        return await self.send_message(
            text=f"Review completed: {repo} - {label}",
            blocks=blocks,
        )

    async def notify_attention_required(self, data: Dict[str, Any]) -> bool:
        """Notify channel that a review requires attention (overdue, high priority)."""
        repo = data.get("repo", "Unknown")
        pr_label = data.get("pr_label", "PR")
        status = data.get("status", "needs attention")
        priority = data.get("priority", "high")
        wait_time = data.get("wait_time", "unknown")
        review_url = data.get("review_url", "#")

        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":rotating_light: *Attention Required*\n"
                    f"Review for *{repo}* ({pr_label}) is {status}\n"
                    f"Priority: *{priority.upper()}* | Waiting: {wait_time}",
                },
                "accessory": {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Review Now"},
                    "url": review_url,
                    "style": "danger",
                },
            },
        ]

        return await self.send_message(
            text=f"Attention required: {repo} review is {status}",
            blocks=blocks,
        )

    async def notify_review_assigned(self, data: Dict[str, Any]) -> bool:
        """Notify when a review is assigned to a specific user."""
        repo = data.get("repo", "Unknown")
        pr_label = data.get("pr_label", "PR")
        assignee = data.get("assignee", "Unknown")
        assigner = data.get("assigner", "System")
        priority = data.get("priority", "medium")
        due_at = data.get("due_at", "No deadline")
        review_url = data.get("review_url", "#")

        priority_emoji = {
            "critical": ":rotating_light:",
            "high": ":warning:",
            "medium": ":large_blue_circle:",
            "low": ":white_circle:",
        }.get(priority, ":large_blue_circle:")

        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":clipboard: *Review Assigned*\n"
                    f"*{assignee}* has been assigned to review *{repo}* ({pr_label})\n"
                    f"Assigned by: {assigner} | Priority: {priority_emoji} {priority.upper()}\n"
                    f"Due: {due_at}",
                },
                "accessory": {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View"},
                    "url": review_url,
                },
            },
        ]

        return await self.send_message(
            text=f"Review assigned: {assignee} -> {repo}",
            blocks=blocks,
        )

    async def notify_changes_requested(self, data: Dict[str, Any]) -> bool:
        """Notify when changes are requested on a PR."""
        repo = data.get("repo", "Unknown")
        pr_label = data.get("pr_label", "PR")
        reviewer = data.get("reviewer", "Unknown")
        author = data.get("author", "Unknown")
        comments_count = data.get("comments_count", 0)
        blocking_count = data.get("blocking_count", 0)
        review_url = data.get("review_url", "#")

        blocks = [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":warning: *Changes Requested*\n"
                    f"*{reviewer}* has requested changes on *{repo}* ({pr_label})\n"
                    f"Author: {author} | Comments: {comments_count} | Blocking: {blocking_count}",
                },
                "accessory": {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View Feedback"},
                    "url": review_url,
                    "style": "primary",
                },
            },
        ]

        return await self.send_message(
            text=f"Changes requested: {repo} by {reviewer}",
            blocks=blocks,
        )

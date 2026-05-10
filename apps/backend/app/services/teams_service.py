"""
Microsoft Teams Service for sending team notifications.

Uses Microsoft Teams incoming webhooks (Adaptive Cards) for channel notifications.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List

import httpx

from app.settings import settings

logger = logging.getLogger(__name__)


class TeamsService:
    """Service for sending Microsoft Teams notifications using Adaptive Cards."""

    def __init__(self):
        self.webhook_url = settings.TEAMS_WEBHOOK_URL
        self.default_channel = settings.TEAMS_DEFAULT_CHANNEL

    async def send_message(
        self,
        title: str,
        text: str,
        sections: List[Dict[str, Any]] | None = None,
        actions: List[Dict[str, Any]] | None = None,
        theme_color: str = "0076D7",
    ) -> bool:
        """Send a message to Microsoft Teams using Adaptive Cards.

        Args:
            title: Card title
            text: Main text content
            sections: Optional additional sections
            actions: Optional action buttons
            theme_color: Hex color for card accent (default: blue)

        Returns:
            True if message was sent successfully, False otherwise
        """
        if not settings.TEAMS_ENABLED:
            logger.debug("Teams notifications disabled")
            return True  # Return True to not break flow

        if not self.webhook_url:
            logger.warning("Teams webhook URL not configured")
            return False

        try:
            # Build Adaptive Card payload
            card = {
                "@type": "MessageCard",
                "@context": "http://schema.org/extensions",
                "themeColor": theme_color,
                "summary": title,
                "sections": [
                    {
                        "activityTitle": title,
                        "text": text,
                    }
                ],
            }

            # Add additional sections if provided
            if sections:
                card["sections"].extend(sections)

            # Add actions if provided
            if actions:
                card["potentialAction"] = actions

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.webhook_url,
                    json=card,
                    timeout=10.0,
                )

                # Teams webhook returns "1" on success
                if response.status_code == 200:
                    logger.info("Teams message sent successfully")
                    return True
                else:
                    logger.error(
                        f"Teams webhook error: {response.status_code} - {response.text}"
                    )
                    return False
        except Exception as e:
            logger.error(f"Failed to send Teams message: {e}")
            return False

    async def send_adaptive_card(self, card: Dict[str, Any]) -> bool:
        """Send a raw Adaptive Card payload to Teams.

        Args:
            card: Complete Adaptive Card JSON payload

        Returns:
            True if message was sent successfully, False otherwise
        """
        if not settings.TEAMS_ENABLED:
            logger.debug("Teams notifications disabled")
            return True

        if not self.webhook_url:
            logger.warning("Teams webhook URL not configured")
            return False

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.webhook_url,
                    json=card,
                    timeout=10.0,
                )

                if response.status_code == 200:
                    logger.info("Teams adaptive card sent successfully")
                    return True
                else:
                    logger.error(
                        f"Teams webhook error: {response.status_code} - {response.text}"
                    )
                    return False
        except Exception as e:
            logger.error(f"Failed to send Teams adaptive card: {e}")
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

        priority_colors = {
            "critical": "FF0000",
            "high": "FF8C00",
            "medium": "0076D7",
            "low": "808080",
        }
        theme_color = priority_colors.get(priority, "0076D7")

        sections = [
            {
                "facts": [
                    {"name": "Repository", "value": repo},
                    {"name": "PR", "value": pr_label},
                    {"name": "Author", "value": author},
                    {"name": "Priority", "value": priority.upper()},
                    {"name": "Blockers", "value": str(blockers)},
                    {"name": "Warnings", "value": str(warnings)},
                ],
            }
        ]

        actions = [
            {
                "@type": "OpenUri",
                "name": "View Review",
                "targets": [{"os": "default", "uri": review_url}],
            }
        ]

        return await self.send_message(
            title="🔍 New Code Review Available",
            text=f"A new code review is ready for {repo}",
            sections=sections,
            actions=actions,
            theme_color=theme_color,
        )

    async def notify_review_completed(self, data: Dict[str, Any]) -> bool:
        """Notify channel that a review was completed."""
        repo = data.get("repo", "Unknown")
        pr_label = data.get("pr_label", "PR")
        reviewer = data.get("reviewer", "Unknown")
        verdict = data.get("verdict", "comment_only")
        review_url = data.get("review_url", "#")

        verdict_config = {
            "approve": ("00FF00", "✅ Approved"),
            "request_changes": ("FF8C00", "⚠️ Changes Requested"),
            "comment_only": ("0076D7", "💬 Commented"),
            "block": ("FF0000", "❌ Blocked"),
        }
        theme_color, label = verdict_config.get(verdict, ("808080", verdict))

        sections = [
            {
                "facts": [
                    {"name": "Repository", "value": repo},
                    {"name": "PR", "value": pr_label},
                    {"name": "Reviewer", "value": reviewer},
                    {"name": "Verdict", "value": label},
                ],
            }
        ]

        actions = [
            {
                "@type": "OpenUri",
                "name": "View Review",
                "targets": [{"os": "default", "uri": review_url}],
            }
        ]

        return await self.send_message(
            title="📝 Review Completed",
            text=f"{reviewer} completed their review for {repo}",
            sections=sections,
            actions=actions,
            theme_color=theme_color,
        )

    async def notify_attention_required(self, data: Dict[str, Any]) -> bool:
        """Notify channel that a review requires attention (overdue, high priority)."""
        repo = data.get("repo", "Unknown")
        pr_label = data.get("pr_label", "PR")
        status = data.get("status", "needs attention")
        priority = data.get("priority", "high")
        wait_time = data.get("wait_time", "unknown")
        review_url = data.get("review_url", "#")

        sections = [
            {
                "facts": [
                    {"name": "Repository", "value": repo},
                    {"name": "PR", "value": pr_label},
                    {"name": "Status", "value": status},
                    {"name": "Priority", "value": priority.upper()},
                    {"name": "Waiting Time", "value": wait_time},
                ],
            }
        ]

        actions = [
            {
                "@type": "OpenUri",
                "name": "Review Now",
                "targets": [{"os": "default", "uri": review_url}],
            }
        ]

        return await self.send_message(
            title="🚨 Attention Required",
            text=f"Review for {repo} ({pr_label}) is {status}",
            sections=sections,
            actions=actions,
            theme_color="FF0000",
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

        priority_colors = {
            "critical": "FF0000",
            "high": "FF8C00",
            "medium": "0076D7",
            "low": "808080",
        }
        theme_color = priority_colors.get(priority, "0076D7")

        sections = [
            {
                "facts": [
                    {"name": "Repository", "value": repo},
                    {"name": "PR", "value": pr_label},
                    {"name": "Assignee", "value": assignee},
                    {"name": "Assigned By", "value": assigner},
                    {"name": "Priority", "value": priority.upper()},
                    {"name": "Due", "value": due_at},
                ],
            }
        ]

        actions = [
            {
                "@type": "OpenUri",
                "name": "View Review",
                "targets": [{"os": "default", "uri": review_url}],
            }
        ]

        return await self.send_message(
            title="📋 Review Assigned",
            text=f"{assignee} has been assigned to review {repo}",
            sections=sections,
            actions=actions,
            theme_color=theme_color,
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

        sections = [
            {
                "facts": [
                    {"name": "Repository", "value": repo},
                    {"name": "PR", "value": pr_label},
                    {"name": "Reviewer", "value": reviewer},
                    {"name": "Author", "value": author},
                    {"name": "Comments", "value": str(comments_count)},
                    {"name": "Blocking Issues", "value": str(blocking_count)},
                ],
            }
        ]

        actions = [
            {
                "@type": "OpenUri",
                "name": "View Feedback",
                "targets": [{"os": "default", "uri": review_url}],
            }
        ]

        return await self.send_message(
            title="⚠️ Changes Requested",
            text=f"{reviewer} has requested changes on {repo}",
            sections=sections,
            actions=actions,
            theme_color="FF8C00",
        )

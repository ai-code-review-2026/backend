from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from enum import Enum
from typing import Any

from sqlalchemy import text

from app.data.database import get_engine
from app.services.email_service import EmailService
from app.services.notification_realtime import notification_realtime_hub
from app.services.slack_service import SlackService
from app.services.teams_service import TeamsService
from app.services.web_push_service import WebPushService

logger = logging.getLogger(__name__)


class NotificationType(Enum):
    ASSIGNMENT_NEW = "assignment.new"
    ASSIGNMENT_REASSIGNED = "assignment.reassigned"
    REVIEW_OVERDUE_SOON = "review.overdue_soon"
    REVIEW_OVERDUE = "review.overdue"
    REVIEW_COMPLETED = "review.completed"
    COMMENT_ADDED = "comment.added"
    COMMENT_REPLY = "comment.reply"
    COMMENT_MENTION = "comment.mention"
    COMMENT_RESOLVED = "comment.resolved"
    CHANGE_REQUEST_CREATED = "change_request.created"
    CHANGE_REQUEST_RESOLVED = "change_request.resolved"
    LIVE_SESSION_INVITE = "live_session.invite"
    METRICS_WEEKLY_SUMMARY = "metrics.weekly_summary"
    DECISION_OVERRIDDEN = "decision.overridden"


class NotificationChannel(Enum):
    EMAIL = "email"
    PUSH = "push"
    IN_APP = "in_app"
    SLACK = "slack"
    TEAMS = "teams"


DEFAULT_NOTIFICATION_PREFERENCES: dict[str, Any] = {
    "email": {
        "enabled": True,
        "new_review_assigned": True,
        "review_completed": True,
        "comment_replies": True,
        "mention": True,
        "weekly_digest": False,
        "daily_summary": True,
        "security_alerts": True,
    },
    "push": {
        "enabled": True,
        "new_review_assigned": True,
        "review_completed": False,
        "comment_replies": True,
        "mention": True,
        "realtime_updates": True,
    },
    "inApp": {
        "enabled": True,
        "sound": False,
        "desktop": True,
        "show_preview": True,
    },
    "schedule": {
        "quiet_hours_enabled": False,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00",
        "weekend_notifications": False,
    },
}


class NotificationService:
    """Service for sending notifications to reviewers and developers."""

    def __init__(self) -> None:
        self._engine = get_engine()
        self._web_push = WebPushService()

    async def send_assignment_notification(
        self,
        assignment_data: dict[str, Any],
        channels: list[NotificationChannel] | None = None,
    ) -> bool:
        channels = channels or [NotificationChannel.EMAIL, NotificationChannel.IN_APP, NotificationChannel.PUSH]
        notification_data = {
            "type": NotificationType.ASSIGNMENT_NEW.value,
            "title": "New Review Assignment",
            "message": f"You've been assigned to review {assignment_data.get('analysis', {}).get('repo', 'repository')}",
            "data": {
                "assignment_id": assignment_data.get("id"),
                "analysis_id": assignment_data.get("analysis_id"),
                "repo": assignment_data.get("analysis", {}).get("repo", "Unknown"),
                "priority": assignment_data.get("priority", "medium"),
                "due_at": assignment_data.get("due_at"),
                "project_id": assignment_data.get("project_id"),
            },
            "recipient_id": assignment_data.get("reviewer_id"),
            "actor_id": assignment_data.get("assigner_id"),
        }
        return await self._send_notification(notification_data, channels)

    async def send_overdue_reminder(
        self,
        assignment_data: dict[str, Any],
        hours_overdue: int,
    ) -> bool:
        if hours_overdue < 2:
            notification_type = NotificationType.REVIEW_OVERDUE_SOON
            title = "Review Due Soon"
            message = f"Review for {assignment_data.get('analysis', {}).get('repo', 'repository')} is due in {2-hours_overdue} hours"
        else:
            notification_type = NotificationType.REVIEW_OVERDUE
            title = "Review Overdue"
            message = f"Review for {assignment_data.get('analysis', {}).get('repo', 'repository')} is {hours_overdue} hours overdue"

        notification_data = {
            "type": notification_type.value,
            "title": title,
            "message": message,
            "data": {
                "assignment_id": assignment_data.get("id"),
                "analysis_id": assignment_data.get("analysis_id"),
                "repo": assignment_data.get("analysis", {}).get("repo", "Unknown"),
                "hours_overdue": hours_overdue,
                "project_id": assignment_data.get("project_id"),
            },
            "recipient_id": assignment_data.get("reviewer_id"),
        }
        channels = [NotificationChannel.EMAIL, NotificationChannel.IN_APP, NotificationChannel.PUSH]
        return await self._send_notification(notification_data, channels)

    async def send_comment_reply_notification(
        self,
        comment_data: dict[str, Any],
        parent_comment_author: str,
    ) -> bool:
        if str(comment_data.get("author_id") or "") == str(parent_comment_author):
            return True

        notification_data = {
            "type": NotificationType.COMMENT_REPLY.value,
            "title": "Comment Reply",
            "message": f"New reply to your comment in {comment_data.get('file_path', 'review')}",
            "data": {
                "comment_id": comment_data.get("id"),
                "analysis_id": comment_data.get("analysis_id"),
                "file_path": comment_data.get("file_path"),
                "line_start": comment_data.get("line_start"),
                "project_id": comment_data.get("project_id"),
            },
            "recipient_id": parent_comment_author,
            "actor_id": comment_data.get("author_id"),
        }
        channels = [NotificationChannel.IN_APP, NotificationChannel.PUSH]
        return await self._send_notification(notification_data, channels)

    async def send_comment_added_notification(
        self,
        *,
        comment_data: dict[str, Any],
        recipient_ids: list[str] | None = None,
        actor_id: str | None = None,
        recipient_roles: list[str] | None = None,
    ) -> bool:
        notification_data = {
            "type": NotificationType.COMMENT_ADDED.value,
            "title": "New comment added",
            "message": f"New comment in {comment_data.get('file_path', 'review')}",
            "data": {
                "comment_id": comment_data.get("id"),
                "analysis_id": comment_data.get("analysis_id"),
                "file_path": comment_data.get("file_path"),
                "line_start": comment_data.get("line_start"),
                "project_id": comment_data.get("project_id"),
            },
            "recipient_ids": recipient_ids or [],
            "recipient_roles": recipient_roles or [],
            "actor_id": actor_id,
            "project_id": comment_data.get("project_id"),
        }
        channels = [NotificationChannel.IN_APP, NotificationChannel.PUSH, NotificationChannel.EMAIL]
        return await self._send_notification(notification_data, channels)

    async def send_comment_mention_notification(
        self,
        *,
        mentioned_user_id: str,
        author_id: str,
        comment_data: dict[str, Any],
    ) -> bool:
        if mentioned_user_id == author_id:
            return True

        notification_data = {
            "type": NotificationType.COMMENT_MENTION.value,
            "title": "You were mentioned",
            "message": f"You were mentioned in a comment in {comment_data.get('file_path', 'review')}",
            "data": {
                "comment_id": comment_data.get("id"),
                "analysis_id": comment_data.get("analysis_id"),
                "file_path": comment_data.get("file_path"),
                "line_start": comment_data.get("line_start"),
                "project_id": comment_data.get("project_id"),
            },
            "recipient_id": mentioned_user_id,
            "actor_id": author_id,
        }
        channels = [NotificationChannel.IN_APP, NotificationChannel.PUSH, NotificationChannel.EMAIL]
        return await self._send_notification(notification_data, channels)

    async def send_change_request_notification(
        self,
        change_request_data: dict[str, Any],
        analysis_author: str,
    ) -> bool:
        notification_data = {
            "type": NotificationType.CHANGE_REQUEST_CREATED.value,
            "title": "Change Request",
            "message": f"New change request: {change_request_data.get('title', 'Update requested')}",
            "data": {
                "change_request_id": change_request_data.get("id"),
                "analysis_id": change_request_data.get("analysis_id"),
                "title": change_request_data.get("title"),
                "category": change_request_data.get("category"),
                "priority": change_request_data.get("priority"),
                "project_id": change_request_data.get("project_id"),
            },
            "recipient_id": analysis_author,
            "actor_id": change_request_data.get("reviewer_id"),
        }
        channels = [NotificationChannel.EMAIL, NotificationChannel.IN_APP, NotificationChannel.PUSH]
        return await self._send_notification(notification_data, channels)

    async def send_live_session_invite(
        self,
        session_data: dict[str, Any],
        invitee_id: str,
        inviter_name: str,
    ) -> bool:
        notification_data = {
            "type": NotificationType.LIVE_SESSION_INVITE.value,
            "title": "Live Review Invitation",
            "message": f"{inviter_name} invited you to join a live review session",
            "data": {
                "session_id": session_data.get("id"),
                "analysis_id": session_data.get("analysis_id"),
                "initiator_name": inviter_name,
                "project_id": session_data.get("project_id"),
            },
            "recipient_id": invitee_id,
        }
        channels = [NotificationChannel.IN_APP, NotificationChannel.PUSH]
        return await self._send_notification(notification_data, channels)

    async def send_weekly_metrics_summary(self, reviewer_id: str, metrics_data: dict[str, Any]) -> bool:
        notification_data = {
            "type": NotificationType.METRICS_WEEKLY_SUMMARY.value,
            "title": "Weekly Review Summary",
            "message": f"You completed {metrics_data.get('reviews_completed', 0)} reviews this week!",
            "data": metrics_data,
            "recipient_id": reviewer_id,
        }
        channels = [NotificationChannel.EMAIL, NotificationChannel.IN_APP]
        return await self._send_notification(notification_data, channels)

    async def send_review_completed_notification(
        self,
        *,
        analysis_id: str,
        reviewer_id: str,
        decision: str,
        summary: str | None,
        recipient_ids: list[str] | None = None,
        project_id: str | None = None,
    ) -> bool:
        notification_data = {
            "type": NotificationType.REVIEW_COMPLETED.value,
            "title": "Review completed",
            "message": f"Review completed with decision: {decision}",
            "data": {
                "analysis_id": analysis_id,
                "decision": decision,
                "summary": summary,
                "project_id": project_id,
            },
            "recipient_ids": recipient_ids or [],
            "actor_id": reviewer_id,
            "recipient_roles": ["admin"],
            "project_id": project_id,
        }
        channels = [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH]
        return await self._send_notification(notification_data, channels)

    async def _send_notification(
        self,
        notification_data: dict[str, Any],
        channels: list[NotificationChannel],
    ) -> bool:
        recipient_ids: set[str] = set()

        recipient_id = notification_data.get("recipient_id")
        if isinstance(recipient_id, str) and recipient_id.strip():
            recipient_ids.add(recipient_id.strip())

        recipient_id_list = notification_data.get("recipient_ids")
        if isinstance(recipient_id_list, list):
            for item in recipient_id_list:
                if isinstance(item, str) and item.strip():
                    recipient_ids.add(item.strip())

        project_id = notification_data.get("project_id") or notification_data.get("data", {}).get("project_id")
        recipient_roles = notification_data.get("recipient_roles")
        if isinstance(recipient_roles, list) and recipient_roles:
            role_recipients = self._resolve_recipients_by_roles(
                roles=[str(r).strip().lower() for r in recipient_roles if str(r).strip()],
                project_id=project_id if isinstance(project_id, str) else None,
            )
            recipient_ids.update(role_recipients)

        actor_id = notification_data.get("actor_id")
        if isinstance(actor_id, str) and actor_id.strip():
            recipient_ids.discard(actor_id.strip())

        if not recipient_ids:
            return False

        success = True
        for rid in recipient_ids:
            delivered = await self._deliver_to_recipient(
                recipient_id=rid,
                notification_data=notification_data,
                channels=channels,
            )
            success = success and delivered
        return success

    async def _deliver_to_recipient(
        self,
        *,
        recipient_id: str,
        notification_data: dict[str, Any],
        channels: list[NotificationChannel],
    ) -> bool:
        notification_type = str(notification_data.get("type", ""))
        event_pref_key = self._preference_key_for_notification_type(notification_type)
        base_data = dict(notification_data.get("data") or {})
        project_id = notification_data.get("project_id") or base_data.get("project_id")

        recipient_role = self._resolve_recipient_role(recipient_id, project_id if isinstance(project_id, str) else None)
        base_data.setdefault("recipient", {"id": recipient_id, "role": recipient_role})
        if isinstance(project_id, str) and project_id:
            base_data.setdefault("project_id", project_id)

        user_prefs = await self._get_user_notification_preferences(recipient_id)
        payload = {
            "type": notification_type,
            "title": notification_data.get("title"),
            "message": notification_data.get("message"),
            "data": base_data,
            "recipient_id": recipient_id,
        }

        success = True
        for channel in channels:
            if not self._is_channel_enabled_for_event(user_prefs, channel, event_pref_key):
                continue
            try:
                if channel == NotificationChannel.EMAIL:
                    await self._send_email_notification(payload)
                elif channel == NotificationChannel.IN_APP:
                    await self._send_in_app_notification(payload)
                elif channel == NotificationChannel.PUSH:
                    await self._send_push_notification(payload)
                elif channel == NotificationChannel.SLACK:
                    await self._send_slack_notification(payload)
                elif channel == NotificationChannel.TEAMS:
                    await self._send_teams_notification(payload)
            except Exception as exc:  # noqa: BLE001
                logger.exception("Failed to send %s notification to user=%s: %s", channel.value, recipient_id, exc)
                success = False
        return success

    async def _send_email_notification(self, notification_data: dict[str, Any]) -> None:
        recipient_id = str(notification_data["recipient_id"])
        user_email = await self._get_user_email(recipient_id)
        if not user_email:
            logger.warning("No email found for user %s", recipient_id)
            return

        email_service = EmailService()
        notification_type = str(notification_data["type"])
        data = notification_data.get("data", {})

        if notification_type == NotificationType.ASSIGNMENT_NEW.value:
            await email_service.send_assignment_email(user_email, data)
        elif notification_type == NotificationType.COMMENT_REPLY.value:
            await email_service.send_comment_reply_email(user_email, data)
        elif notification_type == NotificationType.CHANGE_REQUEST_CREATED.value:
            await email_service.send_changes_requested_email(user_email, data)
        else:
            await email_service.send_email(
                to=user_email,
                subject=str(notification_data.get("title") or "Code review notification"),
                html=f"<p>{notification_data.get('message', '')}</p>",
            )

    async def _get_user_email(self, user_id: str) -> str | None:
        query = text(
            """
            SELECT email
            FROM users
            WHERE id = :user_id
            """
        )
        try:
            with self._engine.connect() as conn:
                result = conn.execute(query, {"user_id": user_id})
                row = result.mappings().first()
                value = row.get("email") if row else None
                return str(value) if isinstance(value, str) else None
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to get user email: %s", exc)
            return None

    async def _send_in_app_notification(self, notification_data: dict[str, Any]) -> None:
        query = text(
            """
            INSERT INTO notifications (
                user_id, type, title, message, data, read, created_at
            ) VALUES (
                :user_id, :type, :title, :message, CAST(:data AS jsonb), false, :created_at
            )
            RETURNING id, user_id, type, title, message, data, read, created_at, read_at
            """
        )

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "user_id": notification_data["recipient_id"],
                    "type": notification_data["type"],
                    "title": notification_data.get("title"),
                    "message": notification_data.get("message"),
                    "data": json.dumps(notification_data.get("data", {})),
                    "created_at": datetime.now(timezone.utc),
                },
            )
            row = result.mappings().first()

        if row:
            normalized = self._normalize_notification_row(dict(row))
            await notification_realtime_hub.emit_to_user(
                str(notification_data["recipient_id"]),
                {
                    "type": "notification:new",
                    "notification": normalized,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                },
            )

    async def _send_push_notification(self, notification_data: dict[str, Any]) -> None:
        recipient_id = str(notification_data["recipient_id"])
        push_payload = {
            "title": str(notification_data.get("title") or "AI Code Review"),
            "body": str(notification_data.get("message") or ""),
            "data": {
                "type": notification_data.get("type"),
                **(notification_data.get("data") or {}),
            },
        }
        await self._web_push.send_to_user(recipient_id, push_payload)

    async def _send_slack_notification(self, notification_data: dict[str, Any]) -> None:
        slack_service = SlackService()
        notification_type = str(notification_data["type"])
        data = notification_data.get("data", {})
        if notification_type == NotificationType.ASSIGNMENT_NEW.value:
            await slack_service.notify_new_review(data)
        elif notification_type == NotificationType.REVIEW_OVERDUE.value:
            await slack_service.notify_attention_required(data)
        elif notification_type == NotificationType.CHANGE_REQUEST_CREATED.value:
            await slack_service.notify_changes_requested(data)
        else:
            await slack_service.send_message(text=f"{notification_data.get('title')}: {notification_data.get('message')}")

    async def _send_teams_notification(self, notification_data: dict[str, Any]) -> None:
        teams_service = TeamsService()
        notification_type = str(notification_data["type"])
        data = notification_data.get("data", {})
        if notification_type == NotificationType.ASSIGNMENT_NEW.value:
            await teams_service.notify_new_review(data)
        elif notification_type == NotificationType.REVIEW_OVERDUE.value:
            await teams_service.notify_attention_required(data)
        elif notification_type == NotificationType.CHANGE_REQUEST_CREATED.value:
            await teams_service.notify_changes_requested(data)
        else:
            await teams_service.send_message(
                title=str(notification_data.get("title") or "Code Review"),
                text=str(notification_data.get("message") or ""),
            )

    async def _get_user_notification_preferences(self, user_id: str) -> dict[str, Any]:
        query = text(
            """
            SELECT notification_preferences
            FROM users
            WHERE id = :user_id
            """
        )
        try:
            with self._engine.connect() as conn:
                result = conn.execute(query, {"user_id": user_id})
                row = result.mappings().first()
                if row and row.get("notification_preferences"):
                    prefs = row["notification_preferences"]
                    if isinstance(prefs, str):
                        return json.loads(prefs)
                    if isinstance(prefs, dict):
                        return prefs
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to get user notification preferences: %s", exc)
        return self._default_preferences_copy()

    def _is_channel_enabled_for_event(
        self,
        user_prefs: dict[str, Any],
        channel: NotificationChannel,
        event_pref_key: str | None,
    ) -> bool:
        if channel == NotificationChannel.EMAIL:
            section = user_prefs.get("email")
            return self._is_pref_section_enabled(section, event_pref_key)
        if channel == NotificationChannel.PUSH:
            section = user_prefs.get("push")
            return self._is_pref_section_enabled(section, event_pref_key)
        if channel == NotificationChannel.IN_APP:
            section = user_prefs.get("inApp")
            return self._is_pref_section_enabled(section, None)
        return True

    @staticmethod
    def _is_pref_section_enabled(section: Any, event_pref_key: str | None) -> bool:
        if isinstance(section, bool):
            return section
        if isinstance(section, dict):
            if section.get("enabled") is False:
                return False
            if event_pref_key and isinstance(section.get(event_pref_key), bool):
                return bool(section.get(event_pref_key))
            return True
        return True

    @staticmethod
    def _preference_key_for_notification_type(notification_type: str) -> str | None:
        mapping = {
            NotificationType.ASSIGNMENT_NEW.value: "new_review_assigned",
            NotificationType.ASSIGNMENT_REASSIGNED.value: "new_review_assigned",
            NotificationType.REVIEW_COMPLETED.value: "review_completed",
            NotificationType.COMMENT_ADDED.value: "comment_replies",
            NotificationType.COMMENT_REPLY.value: "comment_replies",
            NotificationType.COMMENT_MENTION.value: "mention",
        }
        return mapping.get(notification_type)

    def _resolve_recipients_by_roles(
        self,
        *,
        roles: list[str],
        project_id: str | None = None,
        exclude_user_ids: list[str] | None = None,
    ) -> list[str]:
        if not roles:
            return []

        exclude_user_ids = exclude_user_ids or []
        params: dict[str, Any] = {"roles": roles, "exclude_user_ids": exclude_user_ids}

        if project_id:
            params["project_id"] = project_id
            query = text(
                """
                SELECT DISTINCT upr.user_id
                FROM user_project_roles upr
                JOIN roles r ON r.id = upr.role_id
                WHERE upr.is_active = TRUE
                  AND (upr.expires_at IS NULL OR upr.expires_at > NOW())
                  AND upr.project_id = :project_id
                  AND r.code = ANY(:roles)
                  AND (CARDINALITY(:exclude_user_ids::text[]) = 0 OR upr.user_id <> ALL(:exclude_user_ids::text[]))
                """
            )
        else:
            query = text(
                """
                SELECT DISTINCT ur.user_id
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
                WHERE r.code = ANY(:roles)
                  AND (CARDINALITY(:exclude_user_ids::text[]) = 0 OR ur.user_id <> ALL(:exclude_user_ids::text[]))
                """
            )

        with self._engine.connect() as conn:
            rows = conn.execute(query, params).mappings().all()
        return [str(row["user_id"]) for row in rows if row.get("user_id")]

    def _resolve_recipient_role(self, user_id: str, project_id: str | None = None) -> str:
        if project_id:
            query = text(
                """
                SELECT r.code
                FROM user_project_roles upr
                JOIN roles r ON r.id = upr.role_id
                WHERE upr.user_id = :user_id
                  AND upr.project_id = :project_id
                  AND upr.is_active = TRUE
                  AND (upr.expires_at IS NULL OR upr.expires_at > NOW())
                LIMIT 1
                """
            )
            with self._engine.connect() as conn:
                row = conn.execute(query, {"user_id": user_id, "project_id": project_id}).mappings().first()
            if row and row.get("code"):
                return str(row["code"])

        query = text(
            """
            SELECT r.code
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            WHERE ur.user_id = :user_id
            ORDER BY CASE
                WHEN r.code = 'admin' THEN 1
                WHEN r.code = 'reviewer' THEN 2
                WHEN r.code = 'developer' THEN 3
                ELSE 99
            END
            LIMIT 1
            """
        )
        with self._engine.connect() as conn:
            row = conn.execute(query, {"user_id": user_id}).mappings().first()
        if row and row.get("code"):
            return str(row["code"])
        return "developer"

    async def mark_notifications_read(self, user_id: str, notification_ids: list[str] | None = None) -> bool:
        if notification_ids:
            query = text(
                """
                UPDATE notifications
                SET read = true, read_at = :read_at
                WHERE user_id = :user_id AND id = ANY(:notification_ids)
                RETURNING id
                """
            )
            params = {
                "user_id": user_id,
                "notification_ids": notification_ids,
                "read_at": datetime.now(timezone.utc),
            }
        else:
            query = text(
                """
                UPDATE notifications
                SET read = true, read_at = :read_at
                WHERE user_id = :user_id AND read = false
                RETURNING id
                """
            )
            params = {"user_id": user_id, "read_at": datetime.now(timezone.utc)}

        try:
            with self._engine.begin() as conn:
                rows = conn.execute(query, params).mappings().all()
            read_ids = [str(row["id"]) for row in rows if row.get("id")]
            if read_ids:
                await notification_realtime_hub.emit_to_user(
                    user_id,
                    {
                        "type": "notification:read",
                        "notification_ids": read_ids,
                        "timestamp": datetime.now(timezone.utc).isoformat(),
                    },
                )
            return True
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to mark notifications as read: %s", exc)
            return False

    async def get_user_notifications(
        self,
        user_id: str,
        unread_only: bool = False,
        limit: int = 50,
        offset: int = 0,
        role_filter: str | None = None,
    ) -> list[dict[str, Any]]:
        conditions = ["user_id = :user_id"]
        params: dict[str, Any] = {"user_id": user_id, "limit": limit, "offset": offset}

        if unread_only:
            conditions.append("read = false")
        if role_filter and role_filter.strip():
            conditions.append("(data->'recipient'->>'role') = :role_filter")
            params["role_filter"] = role_filter.strip()

        query = text(
            f"""
            SELECT id, user_id, type, title, message, data, read, created_at, read_at
            FROM notifications
            WHERE {' AND '.join(conditions)}
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
            """
        )

        try:
            with self._engine.connect() as conn:
                result = conn.execute(query, params)
                rows = [dict(row) for row in result.mappings()]
            return [self._normalize_notification_row(row) for row in rows]
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to get user notifications: %s", exc)
            return []

    async def cleanup_old_notifications(self, days: int = 30) -> int:
        query = text(
            f"""
            DELETE FROM notifications
            WHERE created_at < NOW() - INTERVAL '{days} days'
            """
        )
        try:
            with self._engine.begin() as conn:
                result = conn.execute(query)
                return result.rowcount
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to cleanup notifications: %s", exc)
            return 0

    def register_push_subscription(self, *, user_id: str, subscription: dict[str, Any], user_agent: str | None = None) -> bool:
        endpoint = subscription.get("endpoint")
        keys = subscription.get("keys") if isinstance(subscription.get("keys"), dict) else {}
        p256dh = keys.get("p256dh")
        auth_key = keys.get("auth")
        if not all(isinstance(v, str) and v.strip() for v in [endpoint, p256dh, auth_key]):
            return False

        self._web_push.upsert_subscription(
            user_id=user_id,
            endpoint=str(endpoint),
            p256dh=str(p256dh),
            auth_key=str(auth_key),
            user_agent=user_agent,
        )
        return True

    def unregister_push_subscription(self, *, user_id: str, endpoint: str) -> bool:
        return self._web_push.delete_subscription(user_id=user_id, endpoint=endpoint)

    @staticmethod
    def _normalize_notification_row(row: dict[str, Any]) -> dict[str, Any]:
        data = row.get("data")
        if isinstance(data, str):
            try:
                row["data"] = json.loads(data)
            except json.JSONDecodeError:
                row["data"] = {}
        elif data is None:
            row["data"] = {}
        row["data"] = NotificationService._json_safe(row.get("data", {}))

        for key in ("id", "user_id", "type", "title", "message"):
            if key in row and row[key] is not None:
                row[key] = str(row[key])
        for key in ("created_at", "read_at"):
            if isinstance(row.get(key), datetime):
                row[key] = row[key].isoformat()
        return row

    @staticmethod
    def _json_safe(value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, dict):
            return {str(k): NotificationService._json_safe(v) for k, v in value.items()}
        if isinstance(value, list):
            return [NotificationService._json_safe(v) for v in value]
        return value

    @staticmethod
    def _default_preferences_copy() -> dict[str, Any]:
        return json.loads(json.dumps(DEFAULT_NOTIFICATION_PREFERENCES))

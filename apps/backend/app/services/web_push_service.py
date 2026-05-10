from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy import text

from app.data.database import get_engine
from app.settings import settings

logger = logging.getLogger(__name__)

try:
    from pywebpush import WebPushException, webpush  # type: ignore
except Exception:  # pragma: no cover - optional dependency at runtime
    WebPushException = Exception  # type: ignore[misc,assignment]
    webpush = None


class WebPushService:
    """Web Push delivery (VAPID) for browser subscriptions."""

    def __init__(self) -> None:
        self._engine = get_engine()

    @property
    def enabled(self) -> bool:
        return bool(
            settings.PUSH_NOTIFICATIONS_ENABLED
            and settings.VAPID_PUBLIC_KEY
            and settings.VAPID_PRIVATE_KEY
            and settings.VAPID_SUBJECT
            and webpush is not None
        )

    def ensure_push_subscription_table(self) -> None:
        query = text(
            """
            CREATE TABLE IF NOT EXISTS notification_push_subscriptions (
                id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
                user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                endpoint TEXT NOT NULL,
                p256dh TEXT NOT NULL,
                auth TEXT NOT NULL,
                user_agent TEXT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(user_id, endpoint)
            )
            """
        )
        with self._engine.begin() as conn:
            conn.execute(query)
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON notification_push_subscriptions(user_id)"
                )
            )

    async def send_to_user(self, user_id: str, payload: dict[str, Any]) -> int:
        """
        Send a push payload to all active subscriptions for a user.
        Returns number of successful deliveries.
        """
        if not self.enabled:
            logger.debug("Web push disabled or missing VAPID/pywebpush configuration")
            return 0

        self.ensure_push_subscription_table()
        with self._engine.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT endpoint, p256dh, auth
                    FROM notification_push_subscriptions
                    WHERE user_id = :user_id
                    """
                ),
                {"user_id": user_id},
            ).mappings().all()

        if not rows:
            return 0

        delivered = 0
        for row in rows:
            subscription = {
                "endpoint": row["endpoint"],
                "keys": {
                    "p256dh": row["p256dh"],
                    "auth": row["auth"],
                },
            }
            try:
                webpush(
                    subscription_info=subscription,
                    data=json.dumps(payload),
                    vapid_private_key=settings.VAPID_PRIVATE_KEY,
                    vapid_claims={"sub": settings.VAPID_SUBJECT},
                )
                delivered += 1
            except WebPushException as exc:
                # 410 Gone / 404 means stale subscription -> cleanup.
                status_code = getattr(getattr(exc, "response", None), "status_code", None)
                if status_code in {404, 410}:
                    self.delete_subscription(user_id=user_id, endpoint=row["endpoint"])
                logger.warning("Web push delivery failed for user=%s endpoint=%s: %s", user_id, row["endpoint"], exc)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Unexpected web push failure for user=%s: %s", user_id, exc)

        return delivered

    def upsert_subscription(
        self,
        *,
        user_id: str,
        endpoint: str,
        p256dh: str,
        auth_key: str,
        user_agent: str | None = None,
    ) -> None:
        self.ensure_push_subscription_table()
        with self._engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO notification_push_subscriptions (
                        user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at
                    ) VALUES (
                        :user_id, :endpoint, :p256dh, :auth, :user_agent, NOW(), NOW()
                    )
                    ON CONFLICT (user_id, endpoint) DO UPDATE
                    SET p256dh = EXCLUDED.p256dh,
                        auth = EXCLUDED.auth,
                        user_agent = EXCLUDED.user_agent,
                        updated_at = NOW()
                    """
                ),
                {
                    "user_id": user_id,
                    "endpoint": endpoint,
                    "p256dh": p256dh,
                    "auth": auth_key,
                    "user_agent": user_agent,
                },
            )

    def delete_subscription(self, *, user_id: str, endpoint: str) -> bool:
        self.ensure_push_subscription_table()
        with self._engine.begin() as conn:
            result = conn.execute(
                text(
                    """
                    DELETE FROM notification_push_subscriptions
                    WHERE user_id = :user_id AND endpoint = :endpoint
                    """
                ),
                {"user_id": user_id, "endpoint": endpoint},
            )
            return result.rowcount > 0


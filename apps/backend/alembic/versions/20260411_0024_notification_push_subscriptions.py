"""Add notification_push_subscriptions table for web push delivery.

Revision ID: 20260411_0024
Revises: 20260410_0023
Create Date: 2026-04-11
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260411_0024"
down_revision: Union[str, None] = "20260410_0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
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
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
        ON notification_push_subscriptions(user_id)
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notification_push_subscriptions")

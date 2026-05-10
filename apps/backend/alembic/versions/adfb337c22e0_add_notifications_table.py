"""add_notifications_table

Revision ID: adfb337c22e0
Revises: 7a2a496fa990
Create Date: 2026-03-24 17:17:17.652398

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'adfb337c22e0'
down_revision: Union[str, None] = '7a2a496fa990'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create notifications table for in-app notifications
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            data JSONB DEFAULT '{}'::jsonb,
            read BOOLEAN NOT NULL DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            read_at TIMESTAMPTZ
        )
        """
    )

    # Create indexes for notifications
    op.execute("CREATE INDEX idx_notifications_user_read ON notifications(user_id, read)")
    op.execute("CREATE INDEX idx_notifications_created ON notifications(created_at)")
    op.execute("CREATE INDEX idx_notifications_type ON notifications(type)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS notifications")

"""vscode_user_extension_tokens

Revision ID: 20260504_0028
Revises: 20260424_0027
Create Date: 2026-05-04 00:00:00.000000

Add per-user VS Code extension API tokens for account-linked analysis ingestion.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260504_0028"
down_revision: Union[str, None] = "20260424_0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_extension_tokens (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            token_prefix TEXT NOT NULL,
            label TEXT NULL,
            created_by TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            last_used_at TIMESTAMPTZ NULL,
            expires_at TIMESTAMPTZ NULL,
            revoked_at TIMESTAMPTZ NULL
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_extension_tokens_user_id ON user_extension_tokens(user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_extension_tokens_user_active ON user_extension_tokens(user_id, revoked_at)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_extension_tokens")


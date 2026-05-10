"""repo profiles table for automated kb retrieval

Revision ID: 20260309_0012
Revises: 20260306_0011
Create Date: 2026-03-09 08:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260309_0012"
down_revision = "20260306_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS repo_profiles (
            repo_id TEXT PRIMARY KEY,
            repo_path TEXT NULL,
            indexed_commit TEXT NULL,
            default_branch TEXT NULL,
            profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            overview_context TEXT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_repo_profiles_updated_at ON repo_profiles(updated_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS repo_profiles")

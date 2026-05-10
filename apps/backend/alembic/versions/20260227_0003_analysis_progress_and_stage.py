"""analysis progress and stage

Revision ID: 20260227_0003
Revises: 20260227_0002
Create Date: 2026-02-27 00:35:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260227_0003"
down_revision = "20260227_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS stage TEXT")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS progress INTEGER")
    op.execute("UPDATE analyses SET stage = COALESCE(stage, status)")
    op.execute("UPDATE analyses SET progress = COALESCE(progress, 0)")
    op.execute("ALTER TABLE analyses ALTER COLUMN progress SET DEFAULT 0")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_progress_range")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_progress_check")
    op.execute(
        """
        ALTER TABLE analyses
        ADD CONSTRAINT ck_analyses_progress_range
        CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100))
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_progress_range")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS progress")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS stage")

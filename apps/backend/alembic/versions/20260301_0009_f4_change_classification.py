"""f4 change classification columns

Revision ID: 20260301_0009
Revises: 20260228_0008
Create Date: 2026-03-01 11:40:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260301_0009"
down_revision = "20260228_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS change_type TEXT")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS change_type_confidence DOUBLE PRECISION")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS change_type_source TEXT")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS change_type_signals JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("UPDATE analyses SET change_type_signals = COALESCE(change_type_signals, '{}'::jsonb)")

    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_change_type")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_change_type_confidence")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_change_type_source")
    op.execute(
        """
        ALTER TABLE analyses
        ADD CONSTRAINT ck_analyses_change_type
        CHECK (change_type IS NULL OR change_type IN ('bugfix', 'feature', 'refactor'))
        """
    )
    op.execute(
        """
        ALTER TABLE analyses
        ADD CONSTRAINT ck_analyses_change_type_confidence
        CHECK (change_type_confidence IS NULL OR (change_type_confidence >= 0 AND change_type_confidence <= 1))
        """
    )
    op.execute(
        """
        ALTER TABLE analyses
        ADD CONSTRAINT ck_analyses_change_type_source
        CHECK (change_type_source IS NULL OR change_type_source IN ('heuristic', 'llm'))
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_change_type ON analyses(change_type)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_analyses_change_type")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_change_type_source")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_change_type_confidence")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_change_type")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS change_type_signals")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS change_type_source")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS change_type_confidence")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS change_type")

"""t6 static analysis schema

Revision ID: 20260227_0006
Revises: 20260227_0005
Create Date: 2026-02-27 21:10:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260227_0006"
down_revision = "20260227_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS static_stats JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("UPDATE analyses SET static_stats = COALESCE(static_stats, '{}'::jsonb)")

    op.execute("ALTER TABLE findings ADD COLUMN IF NOT EXISTS rule_id TEXT")
    op.execute("CREATE INDEX IF NOT EXISTS idx_findings_rule_id ON findings(rule_id)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_findings_rule_id")
    op.execute("ALTER TABLE findings DROP COLUMN IF EXISTS rule_id")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS static_stats")

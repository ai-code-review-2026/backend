"""t5 secret scan and redaction schema

Revision ID: 20260227_0005
Revises: 20260227_0004
Create Date: 2026-02-27 03:10:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260227_0005"
down_revision = "20260227_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS has_secrets BOOLEAN NOT NULL DEFAULT FALSE")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS redaction_stats JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("UPDATE analyses SET has_secrets = COALESCE(has_secrets, FALSE)")
    op.execute("UPDATE analyses SET redaction_stats = COALESCE(redaction_stats, '{}'::jsonb)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_has_secrets ON analyses(has_secrets)")

    op.execute("ALTER TABLE findings ADD COLUMN IF NOT EXISTS issue_type TEXT")
    op.execute("ALTER TABLE findings ADD COLUMN IF NOT EXISTS evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb")
    op.execute("UPDATE findings SET evidence_json = COALESCE(evidence_json, '{}'::jsonb)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_findings_analysis_category ON findings(analysis_id, category)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_findings_issue_type ON findings(issue_type)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_findings_issue_type")
    op.execute("DROP INDEX IF EXISTS idx_findings_analysis_category")
    op.execute("ALTER TABLE findings DROP COLUMN IF EXISTS evidence_json")
    op.execute("ALTER TABLE findings DROP COLUMN IF EXISTS issue_type")

    op.execute("DROP INDEX IF EXISTS idx_analyses_has_secrets")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS redaction_stats")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS has_secrets")

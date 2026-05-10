"""structured review outputs

Revision ID: 20260314_0015
Revises: 20260313_0014
Create Date: 2026-03-14 10:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260314_0015"
down_revision = "20260313_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_review_outputs (
            analysis_id TEXT PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE,
            source TEXT NOT NULL,
            qdrant_required BOOLEAN NOT NULL DEFAULT TRUE,
            payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_analysis_review_outputs_source ON analysis_review_outputs(source)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS analysis_review_outputs")

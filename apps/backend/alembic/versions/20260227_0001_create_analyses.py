"""create analyses table

Revision ID: 20260227_0001
Revises: 
Create Date: 2026-02-27 00:00:01
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260227_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("analyses"):
        op.create_table(
            "analyses",
            sa.Column("id", sa.Text(), nullable=False),
            sa.Column("repo", sa.Text(), nullable=False),
            sa.Column("pr_number", sa.Integer(), nullable=True),
            sa.Column("commit_sha", sa.Text(), nullable=True),
            sa.Column("source", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
            sa.Column("diff_hash", sa.Text(), nullable=False),
            sa.Column("diff_text", sa.Text(), nullable=False),
            sa.Column(
                "metadata_json",
                postgresql.JSONB(astext_type=sa.Text()),
                server_default=sa.text("'{}'::jsonb"),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id", name="pk_analyses"),
            sa.UniqueConstraint("repo", "diff_hash", name="uq_analyses_repo_diff_hash"),
            sa.CheckConstraint("pr_number IS NULL OR pr_number > 0", name="ck_analyses_pr_number_positive"),
            sa.CheckConstraint("status IN ('RECEIVED', 'RUNNING', 'DONE', 'FAILED')", name="ck_analyses_status"),
        )

    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses USING btree (created_at)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_repo_pr ON analyses (repo, pr_number)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses (status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_analyses_status")
    op.execute("DROP INDEX IF EXISTS idx_analyses_repo_pr")
    op.execute("DROP INDEX IF EXISTS idx_analyses_created_at")
    op.execute("DROP TABLE IF EXISTS analyses")

"""t6 tool runs tracking

Revision ID: 20260228_0007
Revises: 20260227_0006
Create Date: 2026-02-28 05:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260228_0007"
down_revision = "20260227_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS tool_runs (
            id TEXT PRIMARY KEY,
            analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
            tool_name TEXT NOT NULL,
            status TEXT NOT NULL,
            started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            finished_at TIMESTAMPTZ NULL,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            exit_code INTEGER NULL,
            findings_count INTEGER NOT NULL DEFAULT 0,
            scanned_files INTEGER NOT NULL DEFAULT 0,
            version TEXT NULL,
            warning TEXT NULL,
            command TEXT NULL,
            workspace_path TEXT NULL,
            stdout_snippet TEXT NULL,
            stderr_snippet TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS ck_tool_runs_status")
    op.execute("ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS ck_tool_runs_duration_ms")
    op.execute("ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS ck_tool_runs_findings_count")
    op.execute("ALTER TABLE tool_runs DROP CONSTRAINT IF EXISTS ck_tool_runs_scanned_files")
    op.execute(
        """
        ALTER TABLE tool_runs
        ADD CONSTRAINT ck_tool_runs_status
        CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED'))
        """
    )
    op.execute(
        """
        ALTER TABLE tool_runs
        ADD CONSTRAINT ck_tool_runs_duration_ms
        CHECK (duration_ms >= 0)
        """
    )
    op.execute(
        """
        ALTER TABLE tool_runs
        ADD CONSTRAINT ck_tool_runs_findings_count
        CHECK (findings_count >= 0)
        """
    )
    op.execute(
        """
        ALTER TABLE tool_runs
        ADD CONSTRAINT ck_tool_runs_scanned_files
        CHECK (scanned_files >= 0)
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_tool_runs_analysis_id ON tool_runs(analysis_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_tool_runs_analysis_tool ON tool_runs(analysis_id, tool_name)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_tool_runs_analysis_tool")
    op.execute("DROP INDEX IF EXISTS idx_tool_runs_analysis_id")
    op.execute("DROP TABLE IF EXISTS tool_runs")

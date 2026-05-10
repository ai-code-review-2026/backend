"""t4 unified diff schema

Revision ID: 20260227_0004
Revises: 20260227_0003
Create Date: 2026-02-27 00:55:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260227_0004"
down_revision = "20260227_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS nb_files_changed INTEGER")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS additions_total INTEGER")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS deletions_total INTEGER")
    op.execute("UPDATE analyses SET nb_files_changed = COALESCE(nb_files_changed, 0)")
    op.execute("UPDATE analyses SET additions_total = COALESCE(additions_total, 0)")
    op.execute("UPDATE analyses SET deletions_total = COALESCE(deletions_total, 0)")
    op.execute("ALTER TABLE analyses ALTER COLUMN nb_files_changed SET DEFAULT 0")
    op.execute("ALTER TABLE analyses ALTER COLUMN additions_total SET DEFAULT 0")
    op.execute("ALTER TABLE analyses ALTER COLUMN deletions_total SET DEFAULT 0")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_nb_files_changed")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_additions_total")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_deletions_total")
    op.execute(
        """
        ALTER TABLE analyses
        ADD CONSTRAINT ck_analyses_nb_files_changed
        CHECK (nb_files_changed IS NULL OR nb_files_changed >= 0)
        """
    )
    op.execute(
        """
        ALTER TABLE analyses
        ADD CONSTRAINT ck_analyses_additions_total
        CHECK (additions_total IS NULL OR additions_total >= 0)
        """
    )
    op.execute(
        """
        ALTER TABLE analyses
        ADD CONSTRAINT ck_analyses_deletions_total
        CHECK (deletions_total IS NULL OR deletions_total >= 0)
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_files (
            id TEXT PRIMARY KEY,
            analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
            path_old TEXT NULL,
            path_new TEXT NOT NULL,
            change_type TEXT NOT NULL CHECK (change_type IN ('modified', 'added', 'deleted', 'renamed')),
            is_binary BOOLEAN NOT NULL DEFAULT FALSE,
            additions_count INTEGER NOT NULL DEFAULT 0,
            deletions_count INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_analysis_files_analysis_id ON analysis_files(analysis_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analysis_files_path_new ON analysis_files(analysis_id, path_new)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_hunks (
            id TEXT PRIMARY KEY,
            analysis_file_id TEXT NOT NULL REFERENCES analysis_files(id) ON DELETE CASCADE,
            old_start INTEGER NOT NULL,
            old_lines INTEGER NOT NULL,
            new_start INTEGER NOT NULL,
            new_lines INTEGER NOT NULL,
            header TEXT NULL,
            raw_text TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_analysis_hunks_analysis_file_id ON analysis_hunks(analysis_file_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analysis_hunks_ranges ON analysis_hunks(analysis_file_id, new_start, new_lines)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS analysis_hunk_lines (
            id TEXT PRIMARY KEY,
            hunk_id TEXT NOT NULL REFERENCES analysis_hunks(id) ON DELETE CASCADE,
            line_type TEXT NOT NULL CHECK (line_type IN ('context', 'add', 'remove')),
            content TEXT NOT NULL,
            old_line_no INTEGER NULL,
            new_line_no INTEGER NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_analysis_hunk_lines_hunk_id ON analysis_hunk_lines(hunk_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analysis_hunk_lines_new_line ON analysis_hunk_lines(hunk_id, new_line_no)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS analysis_hunk_lines")
    op.execute("DROP TABLE IF EXISTS analysis_hunks")
    op.execute("DROP TABLE IF EXISTS analysis_files")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_deletions_total")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_additions_total")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_nb_files_changed")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS deletions_total")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS additions_total")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS nb_files_changed")

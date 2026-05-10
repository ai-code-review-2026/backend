"""t2 schema and lifecycle

Revision ID: 20260227_0002
Revises: 20260227_0001
Create Date: 2026-02-27 00:20:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260227_0002"
down_revision = "20260227_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # analyses: new lifecycle + richer metadata.
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'github'")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS diff_raw TEXT")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS diff_text TEXT")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS diff_redacted TEXT")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS error_code TEXT")
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS error_message TEXT")
    op.execute("UPDATE analyses SET diff_raw = COALESCE(diff_raw, diff_text, '') WHERE diff_raw IS NULL")
    op.execute("UPDATE analyses SET diff_text = COALESCE(diff_text, diff_raw, '') WHERE diff_text IS NULL")
    op.execute("UPDATE analyses SET updated_at = COALESCE(updated_at, created_at, NOW())")
    op.execute("ALTER TABLE analyses ALTER COLUMN diff_raw SET NOT NULL")
    op.execute("ALTER TABLE analyses ALTER COLUMN diff_text SET NOT NULL")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_status")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_status_check")
    op.execute(
        """
        ALTER TABLE analyses
        ADD CONSTRAINT ck_analyses_status
        CHECK (status IN ('RECEIVED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'))
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_repo_pr_sha ON analyses(repo, pr_number, commit_sha)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_diff_hash ON analyses(diff_hash)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS files_changed (
            id TEXT PRIMARY KEY,
            analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
            file_path TEXT NOT NULL,
            change_type TEXT NOT NULL CHECK (change_type IN ('modified', 'added', 'deleted', 'renamed')),
            old_path TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_files_changed_analysis_id ON files_changed(analysis_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_files_changed_analysis_path ON files_changed(analysis_id, file_path)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS findings (
            id TEXT PRIMARY KEY,
            analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
            source TEXT NOT NULL,
            file_path TEXT NULL,
            line_start INTEGER NULL,
            line_end INTEGER NULL,
            severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARN', 'BLOCKER')),
            category TEXT NOT NULL CHECK (category IN ('security', 'perf', 'quality', 'style', 'maintainability', 'other')),
            message TEXT NOT NULL,
            suggestion TEXT NULL,
            confidence DOUBLE PRECISION NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
            fingerprint TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(analysis_id, fingerprint)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_findings_analysis_severity ON findings(analysis_id, severity)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kb_documents (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            source_type TEXT NOT NULL,
            path_or_url TEXT NULL,
            tags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            doc_version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS citations (
            id TEXT PRIMARY KEY,
            finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
            doc_id TEXT NULL REFERENCES kb_documents(id) ON DELETE SET NULL,
            source TEXT NOT NULL,
            excerpt TEXT NOT NULL,
            score DOUBLE PRECISION NOT NULL DEFAULT 0,
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_citations_finding_id ON citations(finding_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS policies (
            id TEXT PRIMARY KEY,
            repo TEXT NOT NULL,
            version INTEGER NOT NULL,
            blocking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(repo, version)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_policies_repo_version ON policies(repo, version DESC)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kb_chunks (
            id TEXT PRIMARY KEY,
            doc_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
            chunk_index INTEGER NOT NULL,
            text TEXT NOT NULL,
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            embedding_id TEXT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(doc_id, chunk_index)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc_id ON kb_chunks(doc_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY,
            actor TEXT NOT NULL,
            action TEXT NOT NULL,
            target_type TEXT NOT NULL,
            target_id TEXT NOT NULL,
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS audit_logs")
    op.execute("DROP TABLE IF EXISTS kb_chunks")
    op.execute("DROP TABLE IF EXISTS policies")
    op.execute("DROP TABLE IF EXISTS citations")
    op.execute("DROP TABLE IF EXISTS kb_documents")
    op.execute("DROP TABLE IF EXISTS findings")
    op.execute("DROP TABLE IF EXISTS files_changed")

    op.execute("DROP INDEX IF EXISTS idx_analyses_diff_hash")
    op.execute("DROP INDEX IF EXISTS idx_analyses_repo_pr_sha")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_status")
    op.execute("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_status_check")
    op.execute(
        """
        ALTER TABLE analyses
        ADD CONSTRAINT ck_analyses_status
        CHECK (status IN ('RECEIVED', 'RUNNING', 'DONE', 'FAILED'))
        """
    )
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS error_message")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS error_code")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS diff_redacted")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS diff_raw")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS updated_at")
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS provider")

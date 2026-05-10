"""repo context lexical chunks and kb chunk fts

Revision ID: 20260313_0014
Revises: 20260312_0013
Create Date: 2026-03-13 12:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260313_0014"
down_revision = "20260312_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS repo_context_chunks (
            id TEXT PRIMARY KEY,
            repo_id TEXT NOT NULL,
            path TEXT NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            language TEXT NOT NULL,
            file_type TEXT NOT NULL,
            chunk_type TEXT NOT NULL,
            symbol_name TEXT NULL,
            start_line INTEGER NULL,
            end_line INTEGER NULL,
            indexed_commit TEXT NULL,
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(repo_id, path, chunk_index, chunk_type, start_line, end_line)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_repo_context_chunks_repo_id ON repo_context_chunks(repo_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_repo_context_chunks_repo_path ON repo_context_chunks(repo_id, path)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_repo_context_chunks_repo_symbol ON repo_context_chunks(repo_id, symbol_name)")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_repo_context_chunks_content_fts
        ON repo_context_chunks
        USING GIN (to_tsvector('simple', content))
        """
    )

    op.execute("ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS content TEXT")
    op.execute("ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS token_count INTEGER")
    op.execute("UPDATE kb_chunks SET content = COALESCE(content, text) WHERE content IS NULL")
    op.execute(
        """
        UPDATE kb_chunks
        SET token_count = GREATEST(1, LENGTH(COALESCE(content, text, '')) / 4)
        WHERE token_count IS NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_kb_chunks_content_fts
        ON kb_chunks
        USING GIN (to_tsvector('simple', COALESCE(content, text)))
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_kb_chunks_content_fts")
    op.execute("DROP TABLE IF EXISTS repo_context_chunks")

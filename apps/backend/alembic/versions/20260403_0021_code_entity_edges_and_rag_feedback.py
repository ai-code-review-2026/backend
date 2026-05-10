"""Add code_entity_edges and rag_feedback tables.

code_entity_edges: Lightweight graph for tracking code relationships
(imports, calls, inheritance) between files/symbols. Used by the
graph-enhanced exact retriever to find connected entities during
diff-based retrieval.

rag_feedback: Stores user signals (helpful / not_helpful / wrong) on
RAG-retrieved chunks.  Aggregated negative signals are used as score
penalties during re-ranking.

Revision ID: 20260403_0021
Revises: 20260401_0020
Create Date: 2026-04-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260403_0021"
down_revision: Union[str, None] = "20260401_0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── code_entity_edges ─────────────────────────────────────────────────
    op.create_table(
        "code_entity_edges",
        sa.Column("id", sa.Text, primary_key=True, server_default=sa.text("gen_random_uuid()::text")),
        sa.Column("repo_id", sa.Text, nullable=False),
        sa.Column("source_path", sa.Text, nullable=False),
        sa.Column("source_symbol", sa.Text, nullable=True),
        sa.Column("target_path", sa.Text, nullable=False),
        sa.Column("target_symbol", sa.Text, nullable=True),
        sa.Column(
            "edge_type",
            sa.Text,
            nullable=False,
            comment="imports | calls | inherits | implements",
        ),
        sa.Column("indexed_commit", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_code_edges_repo_target",
        "code_entity_edges",
        ["repo_id", "target_path"],
    )
    op.create_index(
        "idx_code_edges_repo_source",
        "code_entity_edges",
        ["repo_id", "source_path"],
    )

    # ── rag_feedback ──────────────────────────────────────────────────────
    op.create_table(
        "rag_feedback",
        sa.Column("id", sa.Text, primary_key=True, server_default=sa.text("gen_random_uuid()::text")),
        sa.Column("analysis_id", sa.Text, nullable=False),
        sa.Column("finding_id", sa.Text, nullable=True),
        sa.Column("chunk_id", sa.Text, nullable=False),
        sa.Column(
            "feedback_type",
            sa.Text,
            nullable=False,
            comment="helpful | not_helpful | wrong",
        ),
        sa.Column("user_id", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )
    op.create_index(
        "idx_rag_feedback_chunk",
        "rag_feedback",
        ["chunk_id", "feedback_type"],
    )
    op.create_index(
        "idx_rag_feedback_analysis",
        "rag_feedback",
        ["analysis_id"],
    )


def downgrade() -> None:
    op.drop_table("rag_feedback")
    op.drop_table("code_entity_edges")

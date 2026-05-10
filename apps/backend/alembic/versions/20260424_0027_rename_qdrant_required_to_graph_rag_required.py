"""rename_qdrant_required_to_graph_rag_required

Revision ID: 20260424_0027
Revises: 20260420_0026
Create Date: 2026-04-24 00:00:00.000000

Renames the `qdrant_required` column in `analysis_review_outputs` to
`graph_rag_required`, reflecting the completed migration from Qdrant to Neo4j.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "20260424_0027"
down_revision: Union[str, None] = "20260420_0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "analysis_review_outputs",
        "qdrant_required",
        new_column_name="graph_rag_required",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        existing_server_default=sa.text("true"),
    )


def downgrade() -> None:
    op.alter_column(
        "analysis_review_outputs",
        "graph_rag_required",
        new_column_name="qdrant_required",
        existing_type=sa.Boolean(),
        existing_nullable=False,
        existing_server_default=sa.text("true"),
    )

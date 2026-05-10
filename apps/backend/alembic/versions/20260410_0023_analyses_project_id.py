"""Add analyses.project_id (nullable) + backfill from project_profiles.

Introduces a nullable project_id column on analyses, FK to project_profiles.id.
Backfills existing rows by matching analyses.repo to project_profiles.repo_id.
Rows whose repo does not match any imported project are left NULL and will be
flagged for manual cleanup.

Enforcement of NOT NULL is deferred to a follow-up migration once application
code has been enforcing project_id at creation time for at least one release.

Revision ID: 20260410_0023
Revises: 20260405_0022
Create Date: 2026-04-10
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260410_0023"
down_revision: Union[str, None] = "20260405_0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "analyses",
        sa.Column("project_id", sa.Text(), nullable=True),
    )
    op.create_index(
        "idx_analyses_project_id",
        "analyses",
        ["project_id"],
    )
    # FK is advisory here (nullable). We do not add ON DELETE CASCADE to
    # preserve historical analyses if a project is removed.
    op.create_foreign_key(
        "fk_analyses_project_id",
        source_table="analyses",
        referent_table="project_profiles",
        local_cols=["project_id"],
        remote_cols=["id"],
        ondelete="SET NULL",
    )

    # Backfill: match analyses.repo -> project_profiles.repo_id (case-insensitive).
    # project_profiles.repo_id is stored as the lowercased "owner/repo" per the
    # import-full endpoint (see apps/backend/app/api/http/repositories.py).
    op.execute(
        """
        UPDATE analyses a
        SET project_id = pp.id
        FROM project_profiles pp
        WHERE a.project_id IS NULL
          AND lower(a.repo) = pp.repo_id
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_analyses_project_id", "analyses", type_="foreignkey")
    op.drop_index("idx_analyses_project_id", table_name="analyses")
    op.drop_column("analyses", "project_id")

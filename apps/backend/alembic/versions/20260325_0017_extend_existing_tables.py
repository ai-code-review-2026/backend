"""extend existing tables with branch context

Revision ID: 20260325_0017
Revises: 20260325_0016
Create Date: 2026-03-25 10:30:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260325_0017"
down_revision = "20260325_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ====================
    # Extension de la table: analyses
    # ====================
    op.execute(
        """
        ALTER TABLE analyses
        ADD COLUMN IF NOT EXISTS source_branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS target_branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS source_branch_name TEXT,
        ADD COLUMN IF NOT EXISTS target_branch_name TEXT,
        ADD COLUMN IF NOT EXISTS branch_type TEXT
        """
    )

    # Index pour analyses
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_source_branch ON analyses(source_branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_target_branch ON analyses(target_branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_branch_type ON analyses(branch_type)")

    # ====================
    # Extension de la table: project_profiles
    # ====================
    op.execute(
        """
        ALTER TABLE project_profiles
        ADD COLUMN IF NOT EXISTS default_branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS default_branch_name TEXT,
        ADD COLUMN IF NOT EXISTS active_branches_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS protected_branches_count INTEGER DEFAULT 0
        """
    )

    # Index pour project_profiles
    op.execute("CREATE INDEX IF NOT EXISTS idx_project_profiles_default_branch ON project_profiles(default_branch_id)")

    # ====================
    # Extension de la table: review_assignments
    # ====================
    op.execute(
        """
        ALTER TABLE review_assignments
        ADD COLUMN IF NOT EXISTS branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS branch_type TEXT,
        ADD COLUMN IF NOT EXISTS assigned_by_rule TEXT
        """
    )

    # Index pour review_assignments
    op.execute("CREATE INDEX IF NOT EXISTS idx_review_assignments_branch ON review_assignments(branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_review_assignments_branch_type ON review_assignments(branch_type)")


def downgrade() -> None:
    # Suppression des colonnes ajoutées (ordre inverse)

    # review_assignments
    op.execute("DROP INDEX IF EXISTS idx_review_assignments_branch_type")
    op.execute("DROP INDEX IF EXISTS idx_review_assignments_branch")
    op.execute(
        """
        ALTER TABLE review_assignments
        DROP COLUMN IF EXISTS assigned_by_rule,
        DROP COLUMN IF EXISTS branch_type,
        DROP COLUMN IF EXISTS branch_id
        """
    )

    # project_profiles
    op.execute("DROP INDEX IF EXISTS idx_project_profiles_default_branch")
    op.execute(
        """
        ALTER TABLE project_profiles
        DROP COLUMN IF EXISTS protected_branches_count,
        DROP COLUMN IF EXISTS active_branches_count,
        DROP COLUMN IF EXISTS default_branch_name,
        DROP COLUMN IF EXISTS default_branch_id
        """
    )

    # analyses
    op.execute("DROP INDEX IF EXISTS idx_analyses_branch_type")
    op.execute("DROP INDEX IF EXISTS idx_analyses_target_branch")
    op.execute("DROP INDEX IF EXISTS idx_analyses_source_branch")
    op.execute(
        """
        ALTER TABLE analyses
        DROP COLUMN IF EXISTS branch_type,
        DROP COLUMN IF EXISTS target_branch_name,
        DROP COLUMN IF EXISTS source_branch_name,
        DROP COLUMN IF EXISTS target_branch_id,
        DROP COLUMN IF EXISTS source_branch_id
        """
    )

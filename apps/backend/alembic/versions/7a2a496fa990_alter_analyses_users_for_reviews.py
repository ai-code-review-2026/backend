"""alter_analyses_users_for_reviews

Revision ID: 7a2a496fa990
Revises: 91040fc780f0
Create Date: 2026-03-24 16:34:38.780295

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7a2a496fa990'
down_revision: Union[str, None] = '91040fc780f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add review-related columns to analyses table
    op.execute(
        """
        ALTER TABLE analyses
        ADD COLUMN IF NOT EXISTS assigned_reviewer_id TEXT REFERENCES users(id),
        ADD COLUMN IF NOT EXISTS review_status TEXT DEFAULT 'pending' CHECK (review_status IN ('pending', 'in_review', 'changes_requested', 'approved', 'rejected')),
        ADD COLUMN IF NOT EXISTS review_priority TEXT DEFAULT 'medium' CHECK (review_priority IN ('low', 'medium', 'high', 'critical')),
        ADD COLUMN IF NOT EXISTS review_due_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS review_completed_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS blocking_comments_count INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS change_requests_count INTEGER DEFAULT 0
        """
    )

    # Create indexes for new analyses columns
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_review_status ON analyses(review_status, review_priority)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_analyses_assigned_reviewer ON analyses(assigned_reviewer_id) WHERE assigned_reviewer_id IS NOT NULL")

    # Add reviewer metadata columns to users table
    op.execute(
        """
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS reviewer_level TEXT CHECK (reviewer_level IN ('junior', 'senior', 'lead')),
        ADD COLUMN IF NOT EXISTS reviewer_capacity INTEGER DEFAULT 5,
        ADD COLUMN IF NOT EXISTS reviewer_specialties TEXT[],
        ADD COLUMN IF NOT EXISTS auto_assign_enabled BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"email": true, "push": true, "realtime": true}'::jsonb
        """
    )

    # Create index for reviewer level
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_reviewer_level ON users(reviewer_level) WHERE reviewer_level IS NOT NULL")


def downgrade() -> None:
    # Remove indexes first
    op.execute("DROP INDEX IF EXISTS idx_analyses_review_status")
    op.execute("DROP INDEX IF EXISTS idx_analyses_assigned_reviewer")
    op.execute("DROP INDEX IF EXISTS idx_users_reviewer_level")

    # Remove columns from analyses
    op.execute(
        """
        ALTER TABLE analyses
        DROP COLUMN IF EXISTS assigned_reviewer_id,
        DROP COLUMN IF EXISTS review_status,
        DROP COLUMN IF EXISTS review_priority,
        DROP COLUMN IF EXISTS review_due_at,
        DROP COLUMN IF EXISTS review_started_at,
        DROP COLUMN IF EXISTS review_completed_at,
        DROP COLUMN IF EXISTS blocking_comments_count,
        DROP COLUMN IF EXISTS change_requests_count
        """
    )

    # Remove columns from users
    op.execute(
        """
        ALTER TABLE users
        DROP COLUMN IF EXISTS reviewer_level,
        DROP COLUMN IF EXISTS reviewer_capacity,
        DROP COLUMN IF EXISTS reviewer_specialties,
        DROP COLUMN IF EXISTS auto_assign_enabled,
        DROP COLUMN IF EXISTS notification_preferences
        """
    )

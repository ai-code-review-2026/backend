"""add_review_tables

Revision ID: 299a184604f0
Revises: 56a10e831bc2
Create Date: 2026-03-24 16:31:54.595701

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '299a184604f0'
down_revision: Union[str, None] = '56a10e831bc2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create review_assignments table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS review_assignments (
            id TEXT PRIMARY KEY,
            analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
            reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            assigner_id TEXT REFERENCES users(id),
            assignment_type TEXT NOT NULL CHECK (assignment_type IN ('auto', 'manual', 'self_assigned')),
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'declined')),
            priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            due_at TIMESTAMPTZ,
            declined_reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE(analysis_id, reviewer_id)
        )
        """
    )

    # Create indexes for review_assignments
    op.execute("CREATE INDEX idx_review_assignments_reviewer ON review_assignments(reviewer_id, status)")
    op.execute("CREATE INDEX idx_review_assignments_analysis ON review_assignments(analysis_id)")
    op.execute("CREATE INDEX idx_review_assignments_due ON review_assignments(due_at) WHERE status IN ('pending', 'in_progress')")
    op.execute("CREATE INDEX idx_review_assignments_created ON review_assignments(created_at)")

    # Create review_comments table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS review_comments (
            id TEXT PRIMARY KEY,
            analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
            author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            parent_id TEXT REFERENCES review_comments(id) ON DELETE CASCADE,

            -- Location
            file_path TEXT NOT NULL,
            line_start INTEGER NOT NULL,
            line_end INTEGER,
            code_snippet TEXT,

            -- Content
            content TEXT NOT NULL,
            comment_type TEXT NOT NULL CHECK (comment_type IN ('comment', 'suggestion', 'question', 'praise', 'change_request')),
            severity TEXT CHECK (severity IN ('info', 'warn', 'blocker')),

            -- Status
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'wontfix')),
            resolved_by TEXT REFERENCES users(id),
            resolved_at TIMESTAMPTZ,

            -- Metadata
            is_blocking BOOLEAN DEFAULT false,
            reactions_json JSONB DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

            CONSTRAINT check_parent_not_self CHECK (id != parent_id)
        )
        """
    )

    # Create indexes for review_comments
    op.execute("CREATE INDEX idx_review_comments_analysis ON review_comments(analysis_id, status)")
    op.execute("CREATE INDEX idx_review_comments_author ON review_comments(author_id)")
    op.execute("CREATE INDEX idx_review_comments_thread ON review_comments(parent_id) WHERE parent_id IS NOT NULL")
    op.execute("CREATE INDEX idx_review_comments_blocking ON review_comments(analysis_id, is_blocking) WHERE is_blocking = true")
    op.execute("CREATE INDEX idx_review_comments_created ON review_comments(created_at)")

    # Create change_requests table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS change_requests (
            id TEXT PRIMARY KEY,
            analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
            reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

            title TEXT NOT NULL,
            description TEXT NOT NULL,
            category TEXT NOT NULL CHECK (category IN ('security', 'performance', 'quality', 'style', 'tests', 'documentation')),
            priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical')),

            -- Links
            related_comments TEXT[],
            related_findings TEXT[],

            -- Status
            status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'declined')),
            resolved_by TEXT REFERENCES users(id),
            resolved_at TIMESTAMPTZ,
            resolution_comment TEXT,

            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # Create indexes for change_requests
    op.execute("CREATE INDEX idx_change_requests_analysis ON change_requests(analysis_id, status)")
    op.execute("CREATE INDEX idx_change_requests_reviewer ON change_requests(reviewer_id)")
    op.execute("CREATE INDEX idx_change_requests_priority ON change_requests(priority, status) WHERE status IN ('open', 'in_progress')")
    op.execute("CREATE INDEX idx_change_requests_created ON change_requests(created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS change_requests")
    op.execute("DROP TABLE IF EXISTS review_comments")
    op.execute("DROP TABLE IF EXISTS review_assignments")

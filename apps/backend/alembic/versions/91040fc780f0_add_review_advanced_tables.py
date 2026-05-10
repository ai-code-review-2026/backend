"""add_review_advanced_tables

Revision ID: 91040fc780f0
Revises: 299a184604f0
Create Date: 2026-03-24 16:32:56.885157

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '91040fc780f0'
down_revision: Union[str, None] = '299a184604f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create review_templates table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS review_templates (
            id TEXT PRIMARY KEY,
            created_by TEXT NOT NULL REFERENCES users(id),
            organization_id TEXT REFERENCES organizations(id),

            name TEXT NOT NULL,
            description TEXT,
            category TEXT NOT NULL CHECK (category IN ('security', 'performance', 'general', 'critical_change', 'frontend', 'backend')),
            is_default BOOLEAN DEFAULT false,
            is_public BOOLEAN DEFAULT false,

            -- Template content
            checklist_items JSONB NOT NULL DEFAULT '[]'::jsonb,
            guidelines TEXT,
            auto_apply_rules JSONB DEFAULT '{}'::jsonb,

            usage_count INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # Create indexes for review_templates
    op.execute("CREATE INDEX idx_review_templates_org ON review_templates(organization_id) WHERE organization_id IS NOT NULL")
    op.execute("CREATE INDEX idx_review_templates_category ON review_templates(category, is_public)")
    op.execute("CREATE INDEX idx_review_templates_created_by ON review_templates(created_by)")

    # Create review_sessions table (for live collaboration)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS review_sessions (
            id TEXT PRIMARY KEY,
            analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
            initiator_id TEXT NOT NULL REFERENCES users(id),

            status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
            participants TEXT[] NOT NULL,

            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            ended_at TIMESTAMPTZ,

            -- Real-time state
            current_file TEXT,
            cursor_positions JSONB DEFAULT '{}'::jsonb,

            session_notes TEXT,
            recording_enabled BOOLEAN DEFAULT false,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )

    # Create indexes for review_sessions
    op.execute("CREATE INDEX idx_review_sessions_analysis ON review_sessions(analysis_id)")
    op.execute("CREATE INDEX idx_review_sessions_status ON review_sessions(status) WHERE status = 'active'")
    op.execute("CREATE INDEX idx_review_sessions_initiator ON review_sessions(initiator_id)")

    # Create reviewer_metrics table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS reviewer_metrics (
            id TEXT PRIMARY KEY,
            reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            period_start DATE NOT NULL,
            period_end DATE NOT NULL,

            -- Volume metrics
            reviews_assigned INTEGER DEFAULT 0,
            reviews_completed INTEGER DEFAULT 0,
            reviews_declined INTEGER DEFAULT 0,
            comments_created INTEGER DEFAULT 0,
            change_requests_created INTEGER DEFAULT 0,

            -- Quality metrics
            avg_review_time_minutes INTEGER,
            avg_comments_per_review DECIMAL(5,2),
            findings_identified INTEGER DEFAULT 0,
            false_positives INTEGER DEFAULT 0,

            -- Decision metrics
            approvals INTEGER DEFAULT 0,
            warnings INTEGER DEFAULT 0,
            blocks INTEGER DEFAULT 0,
            overrides_received INTEGER DEFAULT 0,

            -- SLA metrics
            reviews_within_sla INTEGER DEFAULT 0,
            reviews_breached_sla INTEGER DEFAULT 0,
            avg_response_time_minutes INTEGER,

            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

            UNIQUE(reviewer_id, period_start, period_end)
        )
        """
    )

    # Create indexes for reviewer_metrics
    op.execute("CREATE INDEX idx_reviewer_metrics_reviewer_period ON reviewer_metrics(reviewer_id, period_start DESC)")
    op.execute("CREATE INDEX idx_reviewer_metrics_period ON reviewer_metrics(period_start, period_end)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS reviewer_metrics")
    op.execute("DROP TABLE IF EXISTS review_sessions")
    op.execute("DROP TABLE IF EXISTS review_templates")

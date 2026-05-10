"""add_review_state_machine

Revision ID: 0e109f450063
Revises: 82ccfd69e646
Create Date: 2026-04-16 08:11:51.483981

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0e109f450063'
down_revision: Union[str, None] = '82ccfd69e646'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create review_states table
    op.create_table(
        'review_states',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('analysis_id', sa.Text(), nullable=False),
        sa.Column('current_state', sa.Text(), nullable=False),
        sa.Column('previous_state', sa.Text(), nullable=True),
        sa.Column('transition_reason', sa.Text(), nullable=True),
        sa.Column('transitioned_by', sa.Text(), nullable=True),
        sa.Column('transitioned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('metadata', sa.JSON(), server_default='{}', nullable=False),
        sa.Column('reviewers_assigned', sa.ARRAY(sa.Text()), server_default='{}', nullable=False),
        sa.Column('reviewers_completed', sa.ARRAY(sa.Text()), server_default='{}', nullable=False),
        sa.Column('blocking_comments', sa.Integer(), server_default='0', nullable=False),
        sa.Column('change_requests', sa.Integer(), server_default='0', nullable=False),
        sa.Column('time_in_current_state', sa.Numeric(10, 3), nullable=True),
        sa.Column('total_review_time', sa.Numeric(10, 3), nullable=True),
        sa.Column('sla_deadline', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_overdue', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['transitioned_by'], ['users.id']),
        sa.UniqueConstraint('analysis_id', name='uq_review_states_analysis'),
        sa.CheckConstraint(
            "current_state IN ('draft', 'ready_for_review', 'assigning_reviewers', 'pending_review', "
            "'in_review', 'waiting_for_changes', 'changes_requested', 'approved', 'approved_with_suggestions', "
            "'merged', 'closed', 'abandoned', 'blocked', 'failed')",
            name='ck_review_states_current_state'
        ),
        sa.CheckConstraint(
            "previous_state IS NULL OR previous_state IN ('draft', 'ready_for_review', 'assigning_reviewers', "
            "'pending_review', 'in_review', 'waiting_for_changes', 'changes_requested', 'approved', "
            "'approved_with_suggestions', 'merged', 'closed', 'abandoned', 'blocked', 'failed')",
            name='ck_review_states_previous_state'
        ),
        sa.CheckConstraint(
            "transition_reason IS NULL OR transition_reason IN ('submit_for_review', 'request_review', "
            "'update_changes', 'address_feedback', 'abandon', 'start_review', 'request_changes', 'approve', "
            "'approve_with_suggestions', 'block', 'reassign', 'auto_assign', 'merge', 'close', 'timeout', "
            "'error', 'restart_review')",
            name='ck_review_states_transition_reason'
        )
    )

    # Create review_state_history table
    op.create_table(
        'review_state_history',
        sa.Column('id', sa.Text(), nullable=False),
        sa.Column('analysis_id', sa.Text(), nullable=False),
        sa.Column('from_state', sa.Text(), nullable=True),
        sa.Column('to_state', sa.Text(), nullable=False),
        sa.Column('transition_reason', sa.Text(), nullable=False),
        sa.Column('transitioned_by', sa.Text(), nullable=True),
        sa.Column('transitioned_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('metadata', sa.JSON(), server_default='{}', nullable=False),
        sa.Column('duration_in_previous_state', sa.Numeric(10, 3), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['analysis_id'], ['analyses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['transitioned_by'], ['users.id']),
        sa.CheckConstraint(
            "from_state IS NULL OR from_state IN ('draft', 'ready_for_review', 'assigning_reviewers', "
            "'pending_review', 'in_review', 'waiting_for_changes', 'changes_requested', 'approved', "
            "'approved_with_suggestions', 'merged', 'closed', 'abandoned', 'blocked', 'failed')",
            name='ck_review_state_history_from_state'
        ),
        sa.CheckConstraint(
            "to_state IN ('draft', 'ready_for_review', 'assigning_reviewers', 'pending_review', "
            "'in_review', 'waiting_for_changes', 'changes_requested', 'approved', 'approved_with_suggestions', "
            "'merged', 'closed', 'abandoned', 'blocked', 'failed')",
            name='ck_review_state_history_to_state'
        ),
        sa.CheckConstraint(
            "transition_reason IN ('submit_for_review', 'request_review', 'update_changes', 'address_feedback', "
            "'abandon', 'start_review', 'request_changes', 'approve', 'approve_with_suggestions', 'block', "
            "'reassign', 'auto_assign', 'merge', 'close', 'timeout', 'error', 'restart_review')",
            name='ck_review_state_history_transition_reason'
        )
    )

    # Create indexes
    op.create_index('idx_review_states_analysis', 'review_states', ['analysis_id'])
    op.create_index('idx_review_states_current', 'review_states', ['current_state'])
    op.create_index('idx_review_states_transitioned', 'review_states', ['transitioned_at'])
    op.create_index('idx_review_states_overdue', 'review_states', ['is_overdue', 'sla_deadline'])
    op.create_index('idx_review_states_assignees', 'review_states', ['reviewers_assigned'])
    
    op.create_index('idx_review_state_history_analysis', 'review_state_history', ['analysis_id', 'transitioned_at'])
    op.create_index('idx_review_state_history_state', 'review_state_history', ['analysis_id', 'to_state'])
    op.create_index('idx_review_state_history_user', 'review_state_history', ['transitioned_by', 'transitioned_at'])


def downgrade() -> None:
    # Drop indexes
    op.drop_index('idx_review_state_history_user', 'review_state_history')
    op.drop_index('idx_review_state_history_state', 'review_state_history')
    op.drop_index('idx_review_state_history_analysis', 'review_state_history')
    op.drop_index('idx_review_states_assignees', 'review_states')
    op.drop_index('idx_review_states_overdue', 'review_states')
    op.drop_index('idx_review_states_transitioned', 'review_states')
    op.drop_index('idx_review_states_current', 'review_states')
    op.drop_index('idx_review_states_analysis', 'review_states')
    
    # Drop tables
    op.drop_table('review_state_history')
    op.drop_table('review_states')

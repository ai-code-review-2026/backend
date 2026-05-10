"""add_reviewer_roles_and_permissions

Revision ID: 56a10e831bc2
Revises: 20260314_0015
Create Date: 2026-03-24 16:27:00.385909

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '56a10e831bc2'
down_revision: Union[str, None] = '20260314_0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Insert new reviewer-specific permissions
    op.execute(
        """
        INSERT INTO permissions (id, code, description)
        VALUES
            -- Advanced review permissions
            ('perm_reviews_assign', 'reviews.assign', 'Assign/reassign reviews to reviewers'),
            ('perm_reviews_claim', 'reviews.claim', 'Self-assign reviews from queue'),
            ('perm_reviews_delegate', 'reviews.delegate', 'Delegate reviews to other reviewers'),
            ('perm_reviews_approve', 'reviews.approve', 'Set APPROVE decision'),
            ('perm_reviews_block', 'reviews.block', 'Set BLOCK decision'),
            ('perm_reviews_warn', 'reviews.warn', 'Set WARN decision'),
            ('perm_reviews_override', 'reviews.override', 'Override another reviewer decision'),
            ('perm_reviews_bulk', 'reviews.bulk_action', 'Perform batch operations'),
            ('perm_reviews_request_changes', 'reviews.request_changes', 'Request formal changes'),
            ('perm_reviews_suggest_changes', 'reviews.suggest_changes', 'Suggest changes (non-blocking)'),
            ('perm_reviews_escalate', 'reviews.escalate', 'Escalate review to senior/lead'),

            -- Collaboration permissions
            ('perm_comments_create', 'comments.create', 'Add inline comments on code'),
            ('perm_comments_read', 'comments.read', 'View all review comments'),
            ('perm_comments_resolve', 'comments.resolve', 'Mark comments as resolved'),
            ('perm_comments_edit', 'comments.edit', 'Edit own comments'),
            ('perm_comments_reply', 'comments.reply', 'Reply to comments'),
            ('perm_threads_create', 'threads.create', 'Start discussion threads'),
            ('perm_threads_participate', 'threads.participate', 'Participate in threads'),
            ('perm_threads_moderate', 'threads.moderate', 'Moderate discussion threads'),

            -- Assignment permissions
            ('perm_assignments_view_own', 'assignments.view_own', 'View own assignments'),
            ('perm_assignments_view_all', 'assignments.view_all', 'View all team assignments'),
            ('perm_assignments_create', 'assignments.create', 'Create new assignments'),
            ('perm_assignments_modify', 'assignments.modify', 'Modify existing assignments'),

            -- Metrics permissions
            ('perm_metrics_read_self', 'metrics.read_self', 'Read own metrics'),
            ('perm_metrics_read_team', 'metrics.read_team', 'Read team metrics'),
            ('perm_metrics_read_all', 'metrics.read_all', 'Read all metrics (admin)'),

            -- Template permissions
            ('perm_templates_create', 'templates.create', 'Create review templates'),
            ('perm_templates_use', 'templates.use', 'Use review templates')

        ON CONFLICT (code) DO NOTHING
        """
    )

    # Insert new reviewer role levels (remove old generic 'reviewer' role later if needed)
    op.execute(
        """
        INSERT INTO roles (id, code, label, is_system)
        VALUES
            ('role_reviewer_lead', 'reviewer_lead', 'Lead Reviewer', TRUE),
            ('role_reviewer_senior', 'reviewer_senior', 'Senior Reviewer', TRUE),
            ('role_reviewer_junior', 'reviewer_junior', 'Junior Reviewer', TRUE)
        ON CONFLICT (code) DO NOTHING
        """
    )

    # Assign permissions to reviewer_lead role (most permissions)
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        VALUES
            -- Core analysis permissions
            ('rp_lead_read', 'role_reviewer_lead', 'perm_analyses_read'),
            ('rp_lead_create', 'role_reviewer_lead', 'perm_analyses_create'),
            ('rp_lead_write', 'role_reviewer_lead', 'perm_analyses_write'),

            -- Review permissions
            ('rp_lead_approve', 'role_reviewer_lead', 'perm_reviews_approve'),
            ('rp_lead_block', 'role_reviewer_lead', 'perm_reviews_block'),
            ('rp_lead_warn', 'role_reviewer_lead', 'perm_reviews_warn'),
            ('rp_lead_assign', 'role_reviewer_lead', 'perm_reviews_assign'),
            ('rp_lead_claim', 'role_reviewer_lead', 'perm_reviews_claim'),
            ('rp_lead_delegate', 'role_reviewer_lead', 'perm_reviews_delegate'),
            ('rp_lead_override', 'role_reviewer_lead', 'perm_reviews_override'),
            ('rp_lead_bulk', 'role_reviewer_lead', 'perm_reviews_bulk'),
            ('rp_lead_request_changes', 'role_reviewer_lead', 'perm_reviews_request_changes'),
            ('rp_lead_escalate', 'role_reviewer_lead', 'perm_reviews_escalate'),

            -- Comment permissions
            ('rp_lead_comment_create', 'role_reviewer_lead', 'perm_comments_create'),
            ('rp_lead_comment_read', 'role_reviewer_lead', 'perm_comments_read'),
            ('rp_lead_comment_resolve', 'role_reviewer_lead', 'perm_comments_resolve'),
            ('rp_lead_comment_edit', 'role_reviewer_lead', 'perm_comments_edit'),
            ('rp_lead_thread_create', 'role_reviewer_lead', 'perm_threads_create'),
            ('rp_lead_thread_moderate', 'role_reviewer_lead', 'perm_threads_moderate'),

            -- Assignment permissions
            ('rp_lead_assign_view_all', 'role_reviewer_lead', 'perm_assignments_view_all'),
            ('rp_lead_assign_create', 'role_reviewer_lead', 'perm_assignments_create'),
            ('rp_lead_assign_modify', 'role_reviewer_lead', 'perm_assignments_modify'),

            -- Metrics permissions
            ('rp_lead_metrics_self', 'role_reviewer_lead', 'perm_metrics_read_self'),
            ('rp_lead_metrics_team', 'role_reviewer_lead', 'perm_metrics_read_team'),

            -- Template permissions
            ('rp_lead_template_create', 'role_reviewer_lead', 'perm_templates_create'),
            ('rp_lead_template_use', 'role_reviewer_lead', 'perm_templates_use')

        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )

    # Assign permissions to reviewer_senior role
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        VALUES
            -- Core analysis permissions
            ('rp_senior_read', 'role_reviewer_senior', 'perm_analyses_read'),
            ('rp_senior_create', 'role_reviewer_senior', 'perm_analyses_create'),
            ('rp_senior_write', 'role_reviewer_senior', 'perm_analyses_write'),

            -- Review permissions (can block)
            ('rp_senior_approve', 'role_reviewer_senior', 'perm_reviews_approve'),
            ('rp_senior_block', 'role_reviewer_senior', 'perm_reviews_block'),
            ('rp_senior_warn', 'role_reviewer_senior', 'perm_reviews_warn'),
            ('rp_senior_claim', 'role_reviewer_senior', 'perm_reviews_claim'),
            ('rp_senior_request_changes', 'role_reviewer_senior', 'perm_reviews_request_changes'),

            -- Comment permissions
            ('rp_senior_comment_create', 'role_reviewer_senior', 'perm_comments_create'),
            ('rp_senior_comment_read', 'role_reviewer_senior', 'perm_comments_read'),
            ('rp_senior_comment_resolve', 'role_reviewer_senior', 'perm_comments_resolve'),
            ('rp_senior_thread_create', 'role_reviewer_senior', 'perm_threads_create'),
            ('rp_senior_thread_participate', 'role_reviewer_senior', 'perm_threads_participate'),

            -- Assignment permissions
            ('rp_senior_assign_view_own', 'role_reviewer_senior', 'perm_assignments_view_own'),

            -- Metrics permissions
            ('rp_senior_metrics_self', 'role_reviewer_senior', 'perm_metrics_read_self'),

            -- Template permissions
            ('rp_senior_template_use', 'role_reviewer_senior', 'perm_templates_use')

        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )

    # Assign permissions to reviewer_junior role (limited permissions)
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        VALUES
            -- Core analysis permissions
            ('rp_junior_read', 'role_reviewer_junior', 'perm_analyses_read'),
            ('rp_junior_create', 'role_reviewer_junior', 'perm_analyses_create'),
            ('rp_junior_write', 'role_reviewer_junior', 'perm_analyses_write'),

            -- Review permissions (cannot block)
            ('rp_junior_approve', 'role_reviewer_junior', 'perm_reviews_approve'),
            ('rp_junior_warn', 'role_reviewer_junior', 'perm_reviews_warn'),
            ('rp_junior_claim', 'role_reviewer_junior', 'perm_reviews_claim'),
            ('rp_junior_suggest_changes', 'role_reviewer_junior', 'perm_reviews_suggest_changes'),

            -- Comment permissions
            ('rp_junior_comment_create', 'role_reviewer_junior', 'perm_comments_create'),
            ('rp_junior_comment_read', 'role_reviewer_junior', 'perm_comments_read'),
            ('rp_junior_thread_participate', 'role_reviewer_junior', 'perm_threads_participate'),

            -- Assignment permissions
            ('rp_junior_assign_view_own', 'role_reviewer_junior', 'perm_assignments_view_own'),

            -- Metrics permissions
            ('rp_junior_metrics_self', 'role_reviewer_junior', 'perm_metrics_read_self')

        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )

    # Update admin role permissions to include all new permissions
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT
            'rp_admin_' || REPLACE(code, '.', '_'),
            'role_admin',
            id
        FROM permissions
        WHERE code IN (
            'reviews.assign', 'reviews.claim', 'reviews.delegate', 'reviews.approve',
            'reviews.block', 'reviews.warn', 'reviews.override', 'reviews.bulk_action',
            'reviews.request_changes', 'reviews.suggest_changes', 'reviews.escalate',
            'comments.create', 'comments.read', 'comments.resolve', 'comments.edit', 'comments.reply',
            'threads.create', 'threads.participate', 'threads.moderate',
            'assignments.view_own', 'assignments.view_all', 'assignments.create', 'assignments.modify',
            'metrics.read_self', 'metrics.read_team', 'metrics.read_all',
            'templates.create', 'templates.use'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )

    # Add comment permissions to developer role (they can reply to comments)
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT
            'rp_developer_' || REPLACE(code, '.', '_'),
            (SELECT id FROM roles WHERE code = 'developer' LIMIT 1),
            id
        FROM permissions
        WHERE code IN ('comments.read', 'comments.reply', 'threads.participate')
        AND EXISTS (SELECT 1 FROM roles WHERE code = 'developer')
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Remove role_permissions for new reviewer roles
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE role_id IN ('role_reviewer_lead', 'role_reviewer_senior', 'role_reviewer_junior')
        """
    )

    # Remove role_permissions for new permissions (all roles)
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (
            SELECT id FROM permissions
            WHERE code LIKE 'reviews.%'
            OR code LIKE 'comments.%'
            OR code LIKE 'threads.%'
            OR code LIKE 'assignments.%'
            OR code LIKE 'metrics.%'
            OR code LIKE 'templates.%'
        )
        """
    )

    # Remove new roles
    op.execute(
        """
        DELETE FROM roles
        WHERE code IN ('reviewer_lead', 'reviewer_senior', 'reviewer_junior')
        """
    )

    # Remove new permissions
    op.execute(
        """
        DELETE FROM permissions
        WHERE code LIKE 'reviews.%'
        OR code LIKE 'comments.%'
        OR code LIKE 'threads.%'
        OR code LIKE 'assignments.%'
        OR code LIKE 'metrics.%'
        OR code LIKE 'templates.%'
        """
    )

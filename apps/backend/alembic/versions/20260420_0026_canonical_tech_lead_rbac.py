"""canonical_tech_lead_rbac

Revision ID: 20260420_0026
Revises: 74a41af1bc91
Create Date: 2026-04-20 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "20260420_0026"
down_revision: Union[str, None] = "74a41af1bc91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO roles (id, code, label, is_system)
        VALUES ('role_tech_lead', 'tech_lead', 'Tech Lead', TRUE)
        ON CONFLICT (code) DO UPDATE
        SET label = EXCLUDED.label,
            is_system = TRUE
        """
    )

    op.execute(
        """
        INSERT INTO permissions (id, code, description)
        VALUES
            ('perm_organizations_read', 'organizations.read', 'Read organization and member data'),
            ('perm_organizations_write', 'organizations.write', 'Manage organization settings'),
            ('perm_project_roles_read', 'project_roles.read', 'Read project role assignments'),
            ('perm_project_roles_write', 'project_roles.write', 'Manage project role assignments'),
            ('perm_role_permissions_read', 'role_permissions.read', 'Read role permission matrices'),
            ('perm_role_permissions_write', 'role_permissions.write', 'Manage role permission matrices'),
            ('perm_teams_read', 'teams.read', 'Read team structures'),
            ('perm_teams_create', 'teams.create', 'Create teams'),
            ('perm_teams_update', 'teams.update', 'Update teams'),
            ('perm_teams_delete', 'teams.delete', 'Delete teams'),
            ('perm_teams_manage_members', 'teams.manage_members', 'Manage team memberships'),
            ('perm_projects_read', 'projects.read', 'Read project metadata'),
            ('perm_projects_update', 'projects.update', 'Update project metadata'),
            ('perm_repositories_read', 'repositories.read', 'Read repository integrations'),
            ('perm_repositories_create', 'repositories.create', 'Create repository links'),
            ('perm_integrations_read', 'integrations.read', 'Read platform integrations'),
            ('perm_integrations_write', 'integrations.write', 'Manage platform integrations'),
            ('perm_observability_read', 'observability.read', 'Access observability dashboards'),
            ('perm_users_manage', 'users.manage', 'Manage platform users'),
            ('perm_admin_read', 'admin.read', 'Read admin-level configuration'),
            ('perm_admin_write', 'admin.write', 'Write admin-level configuration')
        ON CONFLICT (code) DO NOTHING
        """
    )

    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT
            'rp_tech_lead_' || REPLACE(p.code, '.', '_'),
            r.id,
            p.id
        FROM permissions p
        CROSS JOIN (
            SELECT id
            FROM roles
            WHERE code = 'tech_lead'
            LIMIT 1
        ) r
        WHERE p.code IN (
            'analyses.create',
            'analyses.read',
            'analyses.write',
            'assignments.create',
            'assignments.modify',
            'assignments.view_all',
            'assignments.view_own',
            'comments.create',
            'comments.edit',
            'comments.read',
            'comments.reply',
            'comments.resolve',
            'metrics.read_self',
            'metrics.read_team',
            'organizations.read',
            'project_roles.read',
            'project_roles.write',
            'project_settings.audit',
            'project_settings.read',
            'project_settings.write',
            'projects.read',
            'projects.update',
            'repositories.create',
            'repositories.read',
            'reviews.approve',
            'reviews.assign',
            'reviews.block',
            'reviews.bulk_action',
            'reviews.claim',
            'reviews.delegate',
            'reviews.request_changes',
            'reviews.warn',
            'teams.create',
            'teams.delete',
            'teams.manage_members',
            'teams.read',
            'teams.update',
            'templates.create',
            'templates.use',
            'threads.create',
            'threads.moderate',
            'threads.participate'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )

    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT
            'rp_admin_' || REPLACE(p.code, '.', '_'),
            r.id,
            p.id
        FROM permissions p
        CROSS JOIN (
            SELECT id
            FROM roles
            WHERE code = 'admin'
            LIMIT 1
        ) r
        WHERE p.code IN (
            'admin.read',
            'admin.write',
            'integrations.read',
            'integrations.write',
            'observability.read',
            'organizations.read',
            'organizations.write',
            'project_roles.read',
            'project_roles.write',
            'role_permissions.read',
            'role_permissions.write',
            'teams.create',
            'teams.delete',
            'teams.manage_members',
            'teams.read',
            'teams.update',
            'users.manage'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )

    op.execute(
        """
        INSERT INTO user_roles (id, user_id, role_id)
        SELECT
            'ur_tl_' || md5(ur.user_id || ':' || 'tech_lead'),
            ur.user_id,
            tl.id
        FROM user_roles ur
        JOIN roles old_role ON old_role.id = ur.role_id
        CROSS JOIN (
            SELECT id
            FROM roles
            WHERE code = 'tech_lead'
            LIMIT 1
        ) tl
        WHERE old_role.code IN ('reviewer', 'reviewer_lead', 'reviewer_senior', 'reviewer_junior')
        ON CONFLICT (user_id, role_id) DO NOTHING
        """
    )

    op.execute(
        """
        UPDATE user_project_roles
        SET role_id = (
                SELECT id
                FROM roles
                WHERE code = 'tech_lead'
                LIMIT 1
            ),
            updated_at = NOW()
        WHERE role_id IN (
            SELECT id
            FROM roles
            WHERE code IN ('reviewer', 'reviewer_lead', 'reviewer_senior', 'reviewer_junior')
        )
        """
    )

    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_name = 'pending_project_invitations'
                  AND column_name = 'updated_at'
            ) THEN
                UPDATE pending_project_invitations
                SET role_code = 'tech_lead',
                    updated_at = NOW()
                WHERE role_code IN ('reviewer', 'reviewer_lead', 'reviewer_senior', 'reviewer_junior');
            ELSE
                UPDATE pending_project_invitations
                SET role_code = 'tech_lead'
                WHERE role_code IN ('reviewer', 'reviewer_lead', 'reviewer_senior', 'reviewer_junior');
            END IF;
        END $$;
        """
    )

    op.execute(
        """
        DELETE FROM user_roles
        WHERE role_id IN (
            SELECT id
            FROM roles
            WHERE code IN ('reviewer', 'reviewer_lead', 'reviewer_senior', 'reviewer_junior')
        )
        """
    )

    op.execute(
        """
        DELETE FROM role_permissions
        WHERE role_id IN (
            SELECT id
            FROM roles
            WHERE code IN ('reviewer', 'reviewer_lead', 'reviewer_senior', 'reviewer_junior')
        )
        """
    )

    op.execute(
        """
        DELETE FROM roles
        WHERE code IN ('reviewer', 'reviewer_lead', 'reviewer_senior', 'reviewer_junior')
        """
    )


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO roles (id, code, label, is_system)
        VALUES ('role_reviewer', 'reviewer', 'Reviewer', TRUE)
        ON CONFLICT (code) DO UPDATE
        SET label = EXCLUDED.label,
            is_system = TRUE
        """
    )

    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT
            'rp_reviewer_' || REPLACE(p.code, '.', '_'),
            r.id,
            p.id
        FROM permissions p
        CROSS JOIN (
            SELECT id
            FROM roles
            WHERE code = 'reviewer'
            LIMIT 1
        ) r
        WHERE p.code IN (
            'analyses.create',
            'analyses.read',
            'analyses.write',
            'assignments.view_all',
            'assignments.view_own',
            'comments.create',
            'comments.read',
            'comments.reply',
            'comments.resolve',
            'metrics.read_self',
            'metrics.read_team',
            'project_settings.read',
            'project_settings.write',
            'reviews.approve',
            'reviews.assign',
            'reviews.block',
            'reviews.claim',
            'reviews.delegate',
            'reviews.request_changes',
            'reviews.warn',
            'templates.create',
            'templates.use',
            'threads.create',
            'threads.participate'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )

    op.execute(
        """
        INSERT INTO user_roles (id, user_id, role_id)
        SELECT
            'ur_reviewer_' || md5(ur.user_id || ':reviewer'),
            ur.user_id,
            rv.id
        FROM user_roles ur
        JOIN roles old_role ON old_role.id = ur.role_id
        CROSS JOIN (
            SELECT id
            FROM roles
            WHERE code = 'reviewer'
            LIMIT 1
        ) rv
        WHERE old_role.code = 'tech_lead'
        ON CONFLICT (user_id, role_id) DO NOTHING
        """
    )

    op.execute(
        """
        UPDATE user_project_roles
        SET role_id = (
                SELECT id
                FROM roles
                WHERE code = 'reviewer'
                LIMIT 1
            ),
            updated_at = NOW()
        WHERE role_id IN (
            SELECT id
            FROM roles
            WHERE code = 'tech_lead'
        )
        """
    )

    op.execute(
        """
        UPDATE pending_project_invitations
        SET role_code = 'reviewer',
            updated_at = NOW()
        WHERE role_code = 'tech_lead'
        """
    )

    op.execute(
        """
        DELETE FROM user_roles
        WHERE role_id IN (
            SELECT id
            FROM roles
            WHERE code = 'tech_lead'
        )
        """
    )

    op.execute(
        """
        DELETE FROM role_permissions
        WHERE role_id IN (
            SELECT id
            FROM roles
            WHERE code = 'tech_lead'
        )
        """
    )

    op.execute(
        """
        DELETE FROM roles
        WHERE code = 'tech_lead'
        """
    )

    op.execute(
        """
        DELETE FROM permissions
        WHERE code IN (
            'organizations.read',
            'organizations.write',
            'project_roles.read',
            'project_roles.write',
            'role_permissions.read',
            'role_permissions.write',
            'teams.read',
            'teams.create',
            'teams.update',
            'teams.delete',
            'teams.manage_members',
            'projects.read',
            'projects.update',
            'repositories.read',
            'repositories.create',
            'integrations.read',
            'integrations.write',
            'observability.read',
            'users.manage',
            'admin.read',
            'admin.write'
        )
        """
    )

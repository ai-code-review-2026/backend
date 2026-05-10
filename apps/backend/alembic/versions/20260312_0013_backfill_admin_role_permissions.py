"""backfill admin role and permissions

Revision ID: 20260312_0013
Revises: 20260309_0012
Create Date: 2026-03-12 10:30:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260312_0013"
down_revision = "20260309_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO roles (id, code, label, is_system)
        VALUES ('role_admin', 'admin', 'Administrator', TRUE)
        ON CONFLICT (code) DO UPDATE
        SET label = EXCLUDED.label,
            is_system = TRUE
        """
    )

    op.execute(
        """
        INSERT INTO permissions (id, code, description)
        VALUES
            ('perm_analyses_read', 'analyses.read', 'Read analyses and findings'),
            ('perm_analyses_create', 'analyses.create', 'Create analyses'),
            ('perm_analyses_write', 'analyses.write', 'Update analyses and findings'),
            ('perm_secrets_manage', 'secrets.manage', 'Manage encrypted secret material')
        ON CONFLICT (code) DO UPDATE
        SET description = EXCLUDED.description
        """
    )

    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT 'rp_admin_read_backfill', r.id, p.id
        FROM roles r
        JOIN permissions p ON p.code = 'analyses.read'
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT 'rp_admin_create_backfill', r.id, p.id
        FROM roles r
        JOIN permissions p ON p.code = 'analyses.create'
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT 'rp_admin_write_backfill', r.id, p.id
        FROM roles r
        JOIN permissions p ON p.code = 'analyses.write'
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT 'rp_admin_secrets_backfill', r.id, p.id
        FROM roles r
        JOIN permissions p ON p.code = 'secrets.manage'
        WHERE r.code = 'admin'
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE id IN (
            'rp_admin_read_backfill',
            'rp_admin_create_backfill',
            'rp_admin_write_backfill',
            'rp_admin_secrets_backfill'
        )
        """
    )

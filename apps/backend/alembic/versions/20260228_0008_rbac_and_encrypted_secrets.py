"""rbac and encrypted secrets schema

Revision ID: 20260228_0008
Revises: 20260228_0007
Create Date: 2026-02-28 18:45:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260228_0008"
down_revision = "20260228_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS encrypted_secrets (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL,
            secret_key TEXT NOT NULL,
            ciphertext TEXT NOT NULL,
            meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(namespace, secret_key)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_encrypted_secrets_namespace ON encrypted_secrets(namespace)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_encrypted_secrets_namespace_key ON encrypted_secrets(namespace, secret_key)"
    )

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS roles (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            label TEXT NOT NULL,
            is_system BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_roles_code ON roles(code)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS permissions (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            description TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_roles (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, role_id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS role_permissions (
            id TEXT PRIMARY KEY,
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(role_id, permission_id)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id)")

    op.execute(
        """
        INSERT INTO roles (id, code, label, is_system)
        VALUES
            ('role_admin', 'admin', 'Administrator', TRUE),
            ('role_reviewer', 'reviewer', 'Reviewer', TRUE),
            ('role_viewer', 'viewer', 'Viewer', TRUE)
        ON CONFLICT (code) DO NOTHING
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
        ON CONFLICT (code) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        VALUES
            ('rp_admin_read', 'role_admin', 'perm_analyses_read'),
            ('rp_admin_create', 'role_admin', 'perm_analyses_create'),
            ('rp_admin_write', 'role_admin', 'perm_analyses_write'),
            ('rp_admin_secrets', 'role_admin', 'perm_secrets_manage'),
            ('rp_reviewer_read', 'role_reviewer', 'perm_analyses_read'),
            ('rp_reviewer_create', 'role_reviewer', 'perm_analyses_create'),
            ('rp_reviewer_write', 'role_reviewer', 'perm_analyses_write'),
            ('rp_viewer_read', 'role_viewer', 'perm_analyses_read')
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS role_permissions")
    op.execute("DROP TABLE IF EXISTS user_roles")
    op.execute("DROP TABLE IF EXISTS permissions")
    op.execute("DROP TABLE IF EXISTS roles")
    op.execute("DROP TABLE IF EXISTS users")
    op.execute("DROP TABLE IF EXISTS encrypted_secrets")

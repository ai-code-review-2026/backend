"""add_user_project_roles_pivot_table

Revision ID: 20260401_0019
Revises: 20260401_0018
Create Date: 2026-04-01 10:00:00

This migration adds the user_project_roles pivot table for multi-role per project support.
Users can have different roles in different projects (e.g., Developer in Project A, Lead in Project B).
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260401_0019"
down_revision = "20260401_0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create user_project_roles pivot table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS user_project_roles (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            project_id TEXT NOT NULL,
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
            assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            notes TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            
            -- Each user can only have one role per project
            UNIQUE(user_id, project_id)
        )
        """
    )
    
    # Create indexes for efficient lookups
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_project_roles_user_id ON user_project_roles(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_project_roles_project_id ON user_project_roles(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_project_roles_role_id ON user_project_roles(role_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_project_roles_active ON user_project_roles(user_id, is_active)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_user_project_roles_lookup ON user_project_roles(user_id, project_id, is_active)")
    
    # Add trigger to update updated_at timestamp
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_user_project_roles_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    
    op.execute(
        """
        DROP TRIGGER IF EXISTS trigger_user_project_roles_updated_at ON user_project_roles;
        CREATE TRIGGER trigger_user_project_roles_updated_at
            BEFORE UPDATE ON user_project_roles
            FOR EACH ROW
            EXECUTE FUNCTION update_user_project_roles_updated_at()
        """
    )
    
    # Create a view for easy querying of user permissions in projects
    op.execute(
        """
        CREATE OR REPLACE VIEW user_project_permissions AS
        SELECT 
            upr.user_id,
            upr.project_id,
            r.code AS role_code,
            r.label AS role_label,
            p.code AS permission_code,
            p.description AS permission_description,
            upr.is_active,
            upr.expires_at
        FROM user_project_roles upr
        JOIN roles r ON r.id = upr.role_id
        JOIN role_permissions rp ON rp.role_id = r.id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE upr.is_active = TRUE
          AND (upr.expires_at IS NULL OR upr.expires_at > NOW())
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS user_project_permissions")
    op.execute("DROP TRIGGER IF EXISTS trigger_user_project_roles_updated_at ON user_project_roles")
    op.execute("DROP FUNCTION IF EXISTS update_user_project_roles_updated_at()")
    op.execute("DROP TABLE IF EXISTS user_project_roles")

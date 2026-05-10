"""add enabled flag to role_permissions for dynamic toggling

Revision ID: 20260401_0020
Revises: 20260401_0019
Create Date: 2026-04-01 14:30:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260401_0020"
down_revision = "20260401_0019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add enabled flag to role_permissions table for dynamic toggling
    # Default to TRUE so existing permissions remain active
    op.execute(
        """
        ALTER TABLE role_permissions
        ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE
        """
    )
    
    # Add updated_at column for tracking changes
    op.execute(
        """
        ALTER TABLE role_permissions
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        """
    )
    
    # Add updated_by column to track who made the change
    op.execute(
        """
        ALTER TABLE role_permissions
        ADD COLUMN IF NOT EXISTS updated_by TEXT NULL
        """
    )
    
    # Create index on enabled flag for efficient filtering
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_role_permissions_enabled 
        ON role_permissions(role_id, enabled) 
        WHERE enabled = TRUE
        """
    )
    
    # Create a trigger to auto-update updated_at
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_role_permissions_updated_at()
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
        DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON role_permissions
        """
    )
    
    op.execute(
        """
        CREATE TRIGGER trg_role_permissions_updated_at
        BEFORE UPDATE ON role_permissions
        FOR EACH ROW
        EXECUTE FUNCTION update_role_permissions_updated_at()
        """
    )
    
    # Create an audit table for permission toggle history
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS role_permission_audit (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            role_permission_id TEXT NOT NULL,
            role_id TEXT NOT NULL,
            permission_id TEXT NOT NULL,
            previous_enabled BOOLEAN NOT NULL,
            new_enabled BOOLEAN NOT NULL,
            changed_by TEXT NOT NULL,
            reason TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_role_permission_audit_role_id 
        ON role_permission_audit(role_id)
        """
    )
    
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_role_permission_audit_created_at 
        ON role_permission_audit(created_at DESC)
        """
    )
    
    # Create a view for active role permissions (for easier querying)
    op.execute(
        """
        CREATE OR REPLACE VIEW active_role_permissions AS
        SELECT 
            rp.id,
            rp.role_id,
            r.code AS role_code,
            r.label AS role_label,
            rp.permission_id,
            p.code AS permission_code,
            p.description AS permission_description,
            rp.enabled,
            rp.updated_at,
            rp.updated_by
        FROM role_permissions rp
        JOIN roles r ON r.id = rp.role_id
        JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.enabled = TRUE
        """
    )


def downgrade() -> None:
    op.execute("DROP VIEW IF EXISTS active_role_permissions")
    op.execute("DROP TABLE IF EXISTS role_permission_audit")
    op.execute("DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON role_permissions")
    op.execute("DROP FUNCTION IF EXISTS update_role_permissions_updated_at()")
    op.execute("DROP INDEX IF EXISTS idx_role_permissions_enabled")
    op.execute("ALTER TABLE role_permissions DROP COLUMN IF EXISTS updated_by")
    op.execute("ALTER TABLE role_permissions DROP COLUMN IF EXISTS updated_at")
    op.execute("ALTER TABLE role_permissions DROP COLUMN IF EXISTS enabled")

"""Add project_settings table with auto_analysis toggle and audit logging

Revision ID: 20260401_0018
Revises: 20260325_0017
Create Date: 2026-04-01 10:00:00

This migration adds:
1. project_settings table for per-project configuration (including auto-analysis toggle)
2. project_settings_audit_log table for tracking all configuration changes
3. New RBAC permissions for project settings management
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260401_0018"
down_revision = "20260325_0017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ====================
    # Table: project_settings
    # ====================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_settings (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL UNIQUE,
            organization_id TEXT NULL REFERENCES organizations(id) ON DELETE SET NULL,
            
            -- Auto-analysis toggle configuration
            auto_analysis_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            auto_analysis_disabled_until TIMESTAMPTZ NULL,
            auto_analysis_disabled_reason TEXT NULL,
            auto_analysis_last_changed_by TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
            auto_analysis_last_changed_at TIMESTAMPTZ NULL,
            
            -- Future extensibility: additional project-level settings can be added here
            settings_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # Indexes for project_settings
    op.execute("CREATE INDEX IF NOT EXISTS idx_project_settings_project_id ON project_settings(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_project_settings_org_id ON project_settings(organization_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_settings_auto_analysis ON project_settings(auto_analysis_enabled)"
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_project_settings_temp_disabled 
        ON project_settings(auto_analysis_disabled_until) 
        WHERE auto_analysis_disabled_until IS NOT NULL
        """
    )

    # ====================
    # Table: project_settings_audit_log
    # ====================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_settings_audit_log (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL,
            user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
            user_email TEXT NOT NULL,
            user_display_name TEXT NULL,
            
            -- Action details
            action TEXT NOT NULL CHECK (action IN (
                'auto_analysis_enabled',
                'auto_analysis_disabled', 
                'auto_analysis_temp_disabled',
                'auto_analysis_temp_disabled_expired',
                'settings_updated'
            )),
            
            -- State change tracking
            previous_state JSONB NOT NULL DEFAULT '{}'::jsonb,
            new_state JSONB NOT NULL DEFAULT '{}'::jsonb,
            
            -- Optional context
            reason TEXT NULL,
            ip_address TEXT NULL,
            user_agent TEXT NULL,
            
            -- Metadata for filtering/reporting
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # Indexes for audit log
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_settings_audit_project ON project_settings_audit_log(project_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_settings_audit_user ON project_settings_audit_log(user_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_settings_audit_action ON project_settings_audit_log(action)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_project_settings_audit_created ON project_settings_audit_log(created_at DESC)"
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_project_settings_audit_project_created 
        ON project_settings_audit_log(project_id, created_at DESC)
        """
    )

    # ====================
    # RBAC: New permissions for project settings
    # ====================
    op.execute(
        """
        INSERT INTO permissions (id, code, description)
        VALUES
            ('perm_project_settings_read', 'project_settings.read', 'View project settings'),
            ('perm_project_settings_write', 'project_settings.write', 'Modify project settings'),
            ('perm_project_settings_audit', 'project_settings.audit', 'View project settings audit log')
        ON CONFLICT (code) DO NOTHING
        """
    )

    # Grant permissions to admin role
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        VALUES
            ('rp_admin_proj_settings_read', 'role_admin', 'perm_project_settings_read'),
            ('rp_admin_proj_settings_write', 'role_admin', 'perm_project_settings_write'),
            ('rp_admin_proj_settings_audit', 'role_admin', 'perm_project_settings_audit')
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )

    # Grant read permission to reviewer roles (they can view but not modify)
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        VALUES
            ('rp_reviewer_proj_settings_read', 'role_reviewer', 'perm_project_settings_read')
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )

    # ====================
    # Create tech_lead role if it doesn't exist (for RBAC requirement)
    # ====================
    op.execute(
        """
        INSERT INTO roles (id, code, label, is_system)
        VALUES ('role_tech_lead', 'tech_lead', 'Tech Lead', TRUE)
        ON CONFLICT (code) DO NOTHING
        """
    )

    # Grant project settings permissions to tech_lead
    op.execute(
        """
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT 
            'rp_tech_lead_' || p.code,
            'role_tech_lead',
            p.id
        FROM permissions p
        WHERE p.code IN (
            'project_settings.read',
            'project_settings.write',
            'project_settings.audit',
            'analyses.read',
            'analyses.create',
            'analyses.write'
        )
        ON CONFLICT (role_id, permission_id) DO NOTHING
        """
    )


def downgrade() -> None:
    # Remove role permissions for project settings
    op.execute(
        """
        DELETE FROM role_permissions 
        WHERE permission_id IN (
            SELECT id FROM permissions 
            WHERE code LIKE 'project_settings.%'
        )
        """
    )

    # Remove project settings permissions
    op.execute("DELETE FROM permissions WHERE code LIKE 'project_settings.%'")

    # Note: We don't remove tech_lead role as it might have other uses

    # Drop audit log table
    op.execute("DROP INDEX IF EXISTS idx_project_settings_audit_project_created")
    op.execute("DROP INDEX IF EXISTS idx_project_settings_audit_created")
    op.execute("DROP INDEX IF EXISTS idx_project_settings_audit_action")
    op.execute("DROP INDEX IF EXISTS idx_project_settings_audit_user")
    op.execute("DROP INDEX IF EXISTS idx_project_settings_audit_project")
    op.execute("DROP TABLE IF EXISTS project_settings_audit_log")

    # Drop project settings table
    op.execute("DROP INDEX IF EXISTS idx_project_settings_temp_disabled")
    op.execute("DROP INDEX IF EXISTS idx_project_settings_auto_analysis")
    op.execute("DROP INDEX IF EXISTS idx_project_settings_org_id")
    op.execute("DROP INDEX IF EXISTS idx_project_settings_project_id")
    op.execute("DROP TABLE IF EXISTS project_settings")

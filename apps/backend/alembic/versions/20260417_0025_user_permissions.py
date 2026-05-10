"""Add user_permissions table for granular per-user permissions

Revision ID: 20260417_0025
Revises: 82ccfd69e646
Create Date: 2026-04-17

This migration adds a user_permissions table to allow assigning permissions
directly to users, bypassing role-based inheritance. This is useful for:
- Granting specific permissions to a user without changing their role
- Temporarily elevating access for specific tasks
- Fine-grained access control for sensitive operations
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = '20260417_0025'
down_revision: Union[str, None] = '82ccfd69e646'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create user_permissions table
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_permissions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
            granted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE,
            reason TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            UNIQUE(user_id, permission_id)
        )
    """)

    # Create indexes for efficient querying
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id 
        ON user_permissions(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_permissions_permission_id 
        ON user_permissions(permission_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_permissions_active 
        ON user_permissions(is_active) WHERE is_active = TRUE
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_permissions_expires 
        ON user_permissions(expires_at) WHERE expires_at IS NOT NULL
    """)

    # Create audit log table for permission changes
    op.execute("""
        CREATE TABLE IF NOT EXISTS user_permissions_audit (
            id TEXT PRIMARY KEY,
            user_permission_id TEXT,
            user_id TEXT NOT NULL,
            permission_id TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('granted', 'revoked', 'expired', 'modified')),
            performed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            old_values JSONB,
            new_values JSONB,
            reason TEXT
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_permissions_audit_user_id 
        ON user_permissions_audit(user_id)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_permissions_audit_performed_at 
        ON user_permissions_audit(performed_at)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_permissions_audit")
    op.execute("DROP TABLE IF EXISTS user_permissions")

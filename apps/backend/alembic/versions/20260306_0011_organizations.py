"""organizations and memberships schema

Revision ID: 20260306_0011
Revises: 20260301_0010
Create Date: 2026-03-06 10:30:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260306_0011"
down_revision = "20260301_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS organizations (
            id TEXT PRIMARY KEY,
            slug TEXT NULL UNIQUE,
            name TEXT NOT NULL,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active)")

    op.execute(
        """
        CREATE TABLE IF NOT EXISTS organization_memberships (
            id TEXT PRIMARY KEY,
            organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'member',
            status TEXT NOT NULL DEFAULT 'active',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(organization_id, user_id)
        )
        """
    )
    op.execute("ALTER TABLE organization_memberships DROP CONSTRAINT IF EXISTS ck_organization_memberships_role")
    op.execute("ALTER TABLE organization_memberships DROP CONSTRAINT IF EXISTS ck_organization_memberships_status")
    op.execute(
        """
        ALTER TABLE organization_memberships
        ADD CONSTRAINT ck_organization_memberships_role
        CHECK (role IN ('owner', 'admin', 'member'))
        """
    )
    op.execute(
        """
        ALTER TABLE organization_memberships
        ADD CONSTRAINT ck_organization_memberships_status
        CHECK (status IN ('active', 'invited', 'revoked'))
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_organization_memberships_org_id ON organization_memberships(organization_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_organization_memberships_user_id ON organization_memberships(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_organization_memberships_role ON organization_memberships(role)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS organization_memberships")
    op.execute("DROP TABLE IF EXISTS organizations")

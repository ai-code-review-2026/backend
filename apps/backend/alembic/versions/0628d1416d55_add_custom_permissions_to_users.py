"""add_custom_permissions_to_users

Revision ID: 0628d1416d55
Revises: 93fbd5b22451
Create Date: 2026-04-16 06:47:23.016532

Add custom_permissions JSONB column to users table for platform-level
granular permission overrides that apply across all projects.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '0628d1416d55'
down_revision: Union[str, None] = '93fbd5b22451'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add custom_permissions column to users table."""
    # Add custom_permissions JSONB column with default empty array
    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS custom_permissions JSONB DEFAULT '[]'::jsonb
    """)
    
    # Set default for existing rows
    op.execute("""
        UPDATE users
        SET custom_permissions = '[]'::jsonb
        WHERE custom_permissions IS NULL
    """)
    
    # Add index for faster permission lookups
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_users_custom_permissions
        ON users USING gin(custom_permissions)
    """)


def downgrade() -> None:
    """Remove custom_permissions column from users table."""
    op.execute("DROP INDEX IF EXISTS idx_users_custom_permissions")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS custom_permissions")

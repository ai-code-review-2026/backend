"""f3 analysis summary column

Revision ID: 20260301_0010
Revises: 20260301_0009
Create Date: 2026-03-01 16:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260301_0010"
down_revision = "20260301_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS summary TEXT")


def downgrade() -> None:
    op.execute("ALTER TABLE analyses DROP COLUMN IF EXISTS summary")

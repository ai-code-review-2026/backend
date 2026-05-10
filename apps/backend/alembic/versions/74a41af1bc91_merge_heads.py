"""merge_heads

Revision ID: 74a41af1bc91
Revises: 0e109f450063, 20260417_0025
Create Date: 2026-04-17 03:58:39.656934

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '74a41af1bc91'
down_revision: Union[str, None] = ('0e109f450063', '20260417_0025')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

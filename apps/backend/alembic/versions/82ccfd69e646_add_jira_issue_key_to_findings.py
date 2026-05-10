"""add_jira_issue_key_to_findings

Revision ID: 82ccfd69e646
Revises: 0628d1416d55
Create Date: 2026-04-16 08:04:00.912223

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '82ccfd69e646'
down_revision: Union[str, None] = '0628d1416d55'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add jira_issue_key column to findings table
    op.add_column('findings', sa.Column('jira_issue_key', sa.String(length=255), nullable=True))


def downgrade() -> None:
    # Remove jira_issue_key column from findings table
    op.drop_column('findings', 'jira_issue_key')

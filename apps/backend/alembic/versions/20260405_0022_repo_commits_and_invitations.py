"""Add repo_commits and pending_project_invitations tables.

repo_commits: Full Git commit history imported from GitHub.
  One row per (repo, sha) — branches share commits.

pending_project_invitations: Clerk invitation tracking.
  Created during repo import for GitHub collaborators who don't
  yet have a platform account. Resolved at their first login.

Revision ID: 20260405_0022
Revises: 20260403_0021
Create Date: 2026-04-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260405_0022"
down_revision: Union[str, None] = "20260403_0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── repo_commits ─────────────────────────────────────────────────────────
    op.create_table(
        "repo_commits",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("repo_id", sa.Text, nullable=False),
        sa.Column("branch_id", sa.Text, sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("branch_name", sa.Text, nullable=True),
        sa.Column("sha", sa.Text, nullable=False),
        sa.Column("message", sa.Text, nullable=True),
        sa.Column("author_name", sa.Text, nullable=True),
        sa.Column("author_email", sa.Text, nullable=True),
        sa.Column("authored_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("committer_name", sa.Text, nullable=True),
        sa.Column("committer_email", sa.Text, nullable=True),
        sa.Column("committed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("parent_shas", sa.JSON, nullable=False, server_default="[]"),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )
    op.create_index("repo_commits_repo_sha_idx", "repo_commits", ["repo_id", "sha"], unique=True)
    op.create_index("repo_commits_branch_idx", "repo_commits", ["repo_id", "branch_id"])
    op.create_index("repo_commits_authored_idx", "repo_commits", [sa.text("authored_at DESC")])

    # ── pending_project_invitations ──────────────────────────────────────────
    op.create_table(
        "pending_project_invitations",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("project_id", sa.Text, nullable=False),
        sa.Column("email", sa.Text, nullable=False),
        sa.Column("github_login", sa.Text, nullable=True),
        sa.Column("role_code", sa.Text, nullable=False, server_default="developer"),
        sa.Column("invited_by", sa.Text, nullable=True),
        sa.Column("status", sa.Text, nullable=False, server_default="pending"),
        sa.Column("clerk_invitation_id", sa.Text, nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("accepted_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_index(
        "pending_inv_project_email_pending_idx",
        "pending_project_invitations",
        ["project_id", "email"],
        unique=True,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index("pending_inv_email_idx", "pending_project_invitations", ["email"])
    op.create_index("pending_inv_project_idx", "pending_project_invitations", ["project_id"])


def downgrade() -> None:
    op.drop_table("pending_project_invitations")
    op.drop_table("repo_commits")

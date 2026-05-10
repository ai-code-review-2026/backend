from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.data.base import Base


class BranchORM(Base):
    """
    Model ORM pour la table branches.
    Représente une branche Git dans un repository.
    """

    __tablename__ = "branches"
    __table_args__ = (
        UniqueConstraint("repo_id", "branch_name", name="uq_branches_repo_name"),
        CheckConstraint(
            "branch_type IN ('main', 'develop', 'feature', 'hotfix', 'release', 'custom')",
            name="ck_branches_type",
        ),
        CheckConstraint(
            "merge_status IS NULL OR merge_status IN ('open', 'merged', 'closed', 'deleted')",
            name="ck_branches_merge_status",
        ),
        Index("idx_branches_repo_id", "repo_id"),
        Index("idx_branches_org_id", "org_id"),
        Index("idx_branches_type", "branch_type"),
        Index("idx_branches_active", "is_active"),
        Index("idx_branches_protected", "is_protected"),
        Index("idx_branches_merge_status", "merge_status"),
        Index("idx_branches_created_by", "created_by"),
    )

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, server_default=func.gen_random_uuid())

    # Identification
    repo_id: Mapped[str] = mapped_column(Text, nullable=False)
    org_id: Mapped[str | None] = mapped_column(Text, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    branch_name: Mapped[str] = mapped_column(Text, nullable=False)
    branch_type: Mapped[str] = mapped_column(Text, nullable=False)
    branch_pattern: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Métadonnées Git
    last_commit_sha: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_commit_author: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_commit_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    last_commit_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Lifecycle
    created_by: Mapped[str | None] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    base_branch: Mapped[str | None] = mapped_column(Text, nullable=True)
    merged_into: Mapped[str | None] = mapped_column(Text, nullable=True)
    merge_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    merged_by: Mapped[str | None] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Protection et statut
    is_protected: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    # Tracking
    ahead_count: Mapped[int] = mapped_column(Integer, nullable=True, server_default="0")
    behind_count: Mapped[int] = mapped_column(Integer, nullable=True, server_default="0")
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Métadonnées
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BranchProtectionRuleORM(Base):
    """
    Model ORM pour la table branch_protection_rules.
    Définit les règles de protection pour les branches.
    """

    __tablename__ = "branch_protection_rules"
    __table_args__ = (
        CheckConstraint(
            "enforcement_level IN ('strict', 'moderate', 'advisory')",
            name="ck_branch_protection_enforcement",
        ),
        CheckConstraint(
            "applies_to_type IS NULL OR applies_to_type IN ('main', 'develop', 'feature', 'hotfix', 'release', 'all')",
            name="ck_branch_protection_applies_to",
        ),
        Index("idx_branch_protection_branch", "branch_id"),
        Index("idx_branch_protection_org", "org_id"),
        Index("idx_branch_protection_repo", "repo_id"),
        Index("idx_branch_protection_pattern", "branch_pattern"),
        Index("idx_branch_protection_type", "applies_to_type"),
        Index("idx_branch_protection_active", "is_active"),
    )

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, server_default=func.gen_random_uuid())

    # Relations
    branch_id: Mapped[str | None] = mapped_column(Text, ForeignKey("branches.id", ondelete="CASCADE"), nullable=True)
    org_id: Mapped[str] = mapped_column(Text, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    repo_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Ciblage
    branch_pattern: Mapped[str | None] = mapped_column(Text, nullable=True)
    applies_to_type: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Restrictions de merge
    require_pull_request: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    required_approvals: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    require_code_owner_review: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    dismiss_stale_reviews: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    require_review_from_lead: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Restrictions de commit
    block_direct_commits: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    allow_force_pushes: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    allow_deletions: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Status checks
    require_status_checks: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    required_status_checks: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    require_branches_up_to_date: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Auto-assignation
    auto_assign_reviewers: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    required_reviewer_roles: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")

    # Restrictions par rôle
    allowed_merge_roles: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    allowed_push_roles: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    bypass_roles: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")

    # Enforcement
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    enforcement_level: Mapped[str] = mapped_column(Text, nullable=False, server_default="strict")

    # Métadonnées
    created_by: Mapped[str | None] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BranchPermissionORM(Base):
    """
    Model ORM pour la table branch_permissions.
    Permissions granulaires par rôle et organisation.
    """

    __tablename__ = "branch_permissions"
    __table_args__ = (
        UniqueConstraint("org_id", "role_id", "branch_type", "repo_id", name="uq_branch_permissions_org_role_type"),
        CheckConstraint(
            "branch_type IS NULL OR branch_type IN ('main', 'develop', 'feature', 'hotfix', 'release', 'custom')",
            name="ck_branch_permissions_type",
        ),
        Index("idx_branch_permissions_org", "org_id"),
        Index("idx_branch_permissions_role", "role_id"),
        Index("idx_branch_permissions_type", "branch_type"),
        Index("idx_branch_permissions_repo", "repo_id"),
    )

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, server_default=func.gen_random_uuid())

    # Relations
    org_id: Mapped[str] = mapped_column(Text, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    role_id: Mapped[str] = mapped_column(Text, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)

    # Ciblage
    branch_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    repo_id: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Permissions d'opérations
    can_create_branch: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    can_delete_branch: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    can_rename_branch: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    can_merge_to_branch: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    can_force_push: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    can_push: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Opérations de protection
    can_configure_protection: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    can_bypass_protection: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    can_approve_merges: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    can_block_merges: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Opérations de politique
    can_set_default_branch: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    can_archive_branch: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Métadonnées
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BranchReviewerAssignmentORM(Base):
    """
    Model ORM pour la table branch_reviewer_assignments.
    Assigne des reviewers aux branches avec règles d'auto-assignation.
    """

    __tablename__ = "branch_reviewer_assignments"
    __table_args__ = (
        CheckConstraint(
            "assignment_type IN ('manual', 'auto', 'codeowner')",
            name="ck_branch_reviewer_assignment_type",
        ),
        CheckConstraint(
            "branch_type IS NULL OR branch_type IN ('main', 'develop', 'feature', 'hotfix', 'release', 'custom')",
            name="ck_branch_reviewer_branch_type",
        ),
        Index("idx_branch_reviewer_org", "org_id"),
        Index("idx_branch_reviewer_repo", "repo_id"),
        Index("idx_branch_reviewer_branch", "branch_id"),
        Index("idx_branch_reviewer_pattern", "branch_pattern"),
        Index("idx_branch_reviewer_type", "branch_type"),
        Index("idx_branch_reviewer_user", "reviewer_id"),
        Index("idx_branch_reviewer_auto", "auto_assign_on_pr"),
    )

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, server_default=func.gen_random_uuid())

    # Relations
    org_id: Mapped[str] = mapped_column(Text, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    repo_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Ciblage de branche
    branch_id: Mapped[str | None] = mapped_column(Text, ForeignKey("branches.id", ondelete="CASCADE"), nullable=True)
    branch_pattern: Mapped[str | None] = mapped_column(Text, nullable=True)
    branch_type: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Assignation reviewer
    reviewer_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    assignment_type: Mapped[str] = mapped_column(Text, nullable=False, server_default="manual")

    # Règles auto-assignation
    auto_assign_on_pr: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    conditions: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    # Métadonnées
    created_by: Mapped[str | None] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BranchPolicyORM(Base):
    """
    Model ORM pour la table branch_policies.
    Politiques de branches au niveau organisationnel.
    """

    __tablename__ = "branch_policies"
    __table_args__ = (
        UniqueConstraint("org_id", "policy_name", name="uq_branch_policies_org_name"),
        CheckConstraint(
            "policy_type IN ('naming', 'workflow', 'protection', 'merge_strategy')",
            name="ck_branch_policies_type",
        ),
        CheckConstraint(
            "default_merge_method IN ('merge', 'squash', 'rebase')",
            name="ck_branch_policies_merge_method",
        ),
        Index("idx_branch_policies_org", "org_id"),
        Index("idx_branch_policies_type", "policy_type"),
        Index("idx_branch_policies_active", "is_active"),
    )

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, server_default=func.gen_random_uuid())

    # Relations
    org_id: Mapped[str] = mapped_column(Text, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)

    # Identification
    policy_name: Mapped[str] = mapped_column(Text, nullable=False)
    policy_type: Mapped[str] = mapped_column(Text, nullable=False)

    # Conventions de nommage
    branch_naming_patterns: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    enforce_naming: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    # Politiques de workflow
    require_base_branch: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    allowed_base_branches: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    auto_delete_on_merge: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    max_branch_age_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Stratégies de merge
    allowed_merge_methods: Mapped[list] = mapped_column(JSONB, nullable=False, server_default='["merge", "squash", "rebase"]')
    default_merge_method: Mapped[str] = mapped_column(Text, nullable=False, server_default="merge")

    # Portée
    applies_to_repos: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    priority: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    # Métadonnées
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class BranchMergeRequestORM(Base):
    """
    Model ORM pour la table branch_merge_requests.
    Track les merge/PR requests avec contexte de branche.
    """

    __tablename__ = "branch_merge_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open', 'approved', 'changes_requested', 'merged', 'closed')",
            name="ck_branch_merge_status",
        ),
        CheckConstraint(
            "merge_method IS NULL OR merge_method IN ('merge', 'squash', 'rebase')",
            name="ck_branch_merge_method",
        ),
        CheckConstraint(
            "checks_status IS NULL OR checks_status IN ('pending', 'passing', 'failing')",
            name="ck_branch_merge_checks",
        ),
        Index("idx_branch_merge_analysis", "analysis_id"),
        Index("idx_branch_merge_org", "org_id"),
        Index("idx_branch_merge_repo", "repo_id"),
        Index("idx_branch_merge_source", "source_branch_id"),
        Index("idx_branch_merge_target", "target_branch_id"),
        Index("idx_branch_merge_status", "status"),
        Index("idx_branch_merge_pr", "repo_id", "pr_number"),
    )

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, server_default=func.gen_random_uuid())

    # Relations
    analysis_id: Mapped[str | None] = mapped_column(Text, ForeignKey("analyses.id", ondelete="CASCADE"), nullable=True)
    org_id: Mapped[str | None] = mapped_column(Text, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    repo_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Information de branche
    source_branch_id: Mapped[str | None] = mapped_column(Text, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    target_branch_id: Mapped[str] = mapped_column(Text, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    source_branch_name: Mapped[str] = mapped_column(Text, nullable=False)
    target_branch_name: Mapped[str] = mapped_column(Text, nullable=False)

    # Métadonnées PR
    pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pr_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    pr_author: Mapped[str | None] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Statut
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="open")
    merge_method: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Approbations
    required_approvals: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    approvals_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    approvers: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    blockers: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")

    # Checks
    checks_status: Mapped[str | None] = mapped_column(Text, nullable=True)
    checks_details: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")

    # Métadonnées
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    merged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BranchAuditLogORM(Base):
    """
    Model ORM pour la table branch_audit_logs.
    Audit trail pour toutes les opérations sur les branches.
    """

    __tablename__ = "branch_audit_logs"
    __table_args__ = (
        CheckConstraint(
            "action IN ('create', 'delete', 'rename', 'merge', 'protect', 'unprotect', 'push', 'force_push', 'set_default', 'archive', 'restore')",
            name="ck_branch_audit_action",
        ),
        Index("idx_branch_audit_branch", "branch_id"),
        Index("idx_branch_audit_org", "org_id"),
        Index("idx_branch_audit_repo", "repo_id"),
        Index("idx_branch_audit_actor", "actor_id"),
        Index("idx_branch_audit_action", "action"),
        Index("idx_branch_audit_created", "created_at", postgresql_ops={"created_at": "DESC"}),
    )

    # Primary key
    id: Mapped[str] = mapped_column(Text, primary_key=True, server_default=func.gen_random_uuid())

    # Relations
    branch_id: Mapped[str | None] = mapped_column(Text, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    org_id: Mapped[str | None] = mapped_column(Text, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True)
    repo_id: Mapped[str] = mapped_column(Text, nullable=False)

    # Détails de l'action
    action: Mapped[str] = mapped_column(Text, nullable=False)
    actor_id: Mapped[str | None] = mapped_column(Text, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_role: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Contexte
    branch_name: Mapped[str] = mapped_column(Text, nullable=False)
    target_branch_name: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Détails
    action_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")

    # Résultat
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Métadonnées
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
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


class AnalysisORM(Base):
    __tablename__ = "analyses"
    __table_args__ = (
        UniqueConstraint("repo", "diff_hash", name="uq_analyses_repo_diff_hash"),
        CheckConstraint("pr_number IS NULL OR pr_number > 0", name="ck_analyses_pr_number_positive"),
        CheckConstraint(
            "status IN ('RECEIVED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')",
            name="ck_analyses_status",
        ),
        CheckConstraint("progress IS NULL OR (progress >= 0 AND progress <= 100)", name="ck_analyses_progress_range"),
        CheckConstraint("nb_files_changed IS NULL OR nb_files_changed >= 0", name="ck_analyses_nb_files_changed"),
        CheckConstraint("additions_total IS NULL OR additions_total >= 0", name="ck_analyses_additions_total"),
        CheckConstraint("deletions_total IS NULL OR deletions_total >= 0", name="ck_analyses_deletions_total"),
        CheckConstraint(
            "change_type IS NULL OR change_type IN ('bugfix', 'feature', 'refactor')",
            name="ck_analyses_change_type",
        ),
        CheckConstraint(
            "change_type_confidence IS NULL OR (change_type_confidence >= 0 AND change_type_confidence <= 1)",
            name="ck_analyses_change_type_confidence",
        ),
        CheckConstraint(
            "change_type_source IS NULL OR change_type_source IN ('heuristic', 'llm')",
            name="ck_analyses_change_type_source",
        ),
        Index("idx_analyses_repo_pr_sha", "repo", "pr_number", "commit_sha"),
        Index("idx_analyses_diff_hash", "diff_hash"),
        Index("idx_analyses_created_at", "created_at"),
        Index("idx_analyses_has_secrets", "has_secrets"),
        Index("idx_analyses_change_type", "change_type"),
        Index("idx_analyses_project_id", "project_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    project_id: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("project_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    repo: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False, server_default="github")
    pr_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    commit_sha: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    stage: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress: Mapped[int | None] = mapped_column(Integer, nullable=True, server_default="0")
    nb_files_changed: Mapped[int | None] = mapped_column(Integer, nullable=True, server_default="0")
    additions_total: Mapped[int | None] = mapped_column(Integer, nullable=True, server_default="0")
    deletions_total: Mapped[int | None] = mapped_column(Integer, nullable=True, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    diff_hash: Mapped[str] = mapped_column(Text, nullable=False)
    diff_raw: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    diff_redacted: Mapped[str | None] = mapped_column(Text, nullable=True)
    has_secrets: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    redaction_stats: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    static_stats: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    change_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_type_confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    change_type_source: Mapped[str | None] = mapped_column(Text, nullable=True)
    change_type_signals: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    error_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")


class FileChangedORM(Base):
    __tablename__ = "files_changed"
    __table_args__ = (
        CheckConstraint("change_type IN ('modified', 'added', 'deleted', 'renamed')", name="ck_files_changed_type"),
        Index("idx_files_changed_analysis_id", "analysis_id"),
        Index("idx_files_changed_analysis_path", "analysis_id", "file_path"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
    )
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    change_type: Mapped[str] = mapped_column(Text, nullable=False)
    old_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AnalysisFileORM(Base):
    __tablename__ = "analysis_files"
    __table_args__ = (
        CheckConstraint("change_type IN ('modified', 'added', 'deleted', 'renamed')", name="ck_analysis_files_type"),
        Index("idx_analysis_files_analysis_id", "analysis_id"),
        Index("idx_analysis_files_path_new", "analysis_id", "path_new"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
    )
    path_old: Mapped[str | None] = mapped_column(Text, nullable=True)
    path_new: Mapped[str] = mapped_column(Text, nullable=False)
    change_type: Mapped[str] = mapped_column(Text, nullable=False)
    is_binary: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    additions_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    deletions_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AnalysisHunkORM(Base):
    __tablename__ = "analysis_hunks"
    __table_args__ = (
        Index("idx_analysis_hunks_analysis_file_id", "analysis_file_id"),
        Index("idx_analysis_hunks_ranges", "analysis_file_id", "new_start", "new_lines"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_file_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analysis_files.id", ondelete="CASCADE"),
        nullable=False,
    )
    old_start: Mapped[int] = mapped_column(Integer, nullable=False)
    old_lines: Mapped[int] = mapped_column(Integer, nullable=False)
    new_start: Mapped[int] = mapped_column(Integer, nullable=False)
    new_lines: Mapped[int] = mapped_column(Integer, nullable=False)
    header: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AnalysisHunkLineORM(Base):
    __tablename__ = "analysis_hunk_lines"
    __table_args__ = (
        CheckConstraint("line_type IN ('context', 'add', 'remove')", name="ck_analysis_hunk_lines_type"),
        Index("idx_analysis_hunk_lines_hunk_id", "hunk_id"),
        Index("idx_analysis_hunk_lines_new_line", "hunk_id", "new_line_no"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    hunk_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analysis_hunks.id", ondelete="CASCADE"),
        nullable=False,
    )
    line_type: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    old_line_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    new_line_no: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class FindingORM(Base):
    __tablename__ = "findings"
    __table_args__ = (
        CheckConstraint("severity IN ('INFO', 'WARN', 'BLOCKER')", name="ck_findings_severity"),
        CheckConstraint(
            "category IN ('security', 'perf', 'quality', 'style', 'maintainability', 'other')",
            name="ck_findings_category",
        ),
        CheckConstraint("confidence IS NULL OR (confidence >= 0 AND confidence <= 1)", name="ck_findings_confidence"),
        UniqueConstraint("analysis_id", "fingerprint", name="uq_findings_analysis_fingerprint"),
        Index("idx_findings_analysis_severity", "analysis_id", "severity"),
        Index("idx_findings_analysis_category", "analysis_id", "category"),
        Index("idx_findings_issue_type", "issue_type"),
        Index("idx_findings_rule_id", "rule_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
    )
    source: Mapped[str] = mapped_column(Text, nullable=False)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    line_start: Mapped[int | None] = mapped_column(Integer, nullable=True)
    line_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    severity: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    issue_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    rule_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    fingerprint: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ToolRunORM(Base):
    __tablename__ = "tool_runs"
    __table_args__ = (
        CheckConstraint("status IN ('SUCCESS', 'FAILED', 'SKIPPED')", name="ck_tool_runs_status"),
        CheckConstraint("duration_ms IS NULL OR duration_ms >= 0", name="ck_tool_runs_duration_ms"),
        CheckConstraint("findings_count IS NULL OR findings_count >= 0", name="ck_tool_runs_findings_count"),
        CheckConstraint("scanned_files IS NULL OR scanned_files >= 0", name="ck_tool_runs_scanned_files"),
        Index("idx_tool_runs_analysis_id", "analysis_id"),
        Index("idx_tool_runs_analysis_tool", "analysis_id", "tool_name"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(Text, ForeignKey("analyses.id", ondelete="CASCADE"), nullable=False)
    tool_name: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_ms: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    exit_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    findings_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    scanned_files: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    version: Mapped[str | None] = mapped_column(Text, nullable=True)
    warning: Mapped[str | None] = mapped_column(Text, nullable=True)
    command: Mapped[str | None] = mapped_column(Text, nullable=True)
    workspace_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    stdout_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    stderr_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class KBDocumentORM(Base):
    __tablename__ = "kb_documents"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    path_or_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    doc_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class CitationORM(Base):
    __tablename__ = "citations"
    __table_args__ = (Index("idx_citations_finding_id", "finding_id"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    finding_id: Mapped[str] = mapped_column(Text, ForeignKey("findings.id", ondelete="CASCADE"), nullable=False)
    doc_id: Mapped[str | None] = mapped_column(Text, ForeignKey("kb_documents.id", ondelete="SET NULL"), nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False, server_default="0")
    meta_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PolicyORM(Base):
    __tablename__ = "policies"
    __table_args__ = (UniqueConstraint("repo", "version", name="uq_policies_repo_version"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    repo: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    blocking_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    rules_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class KBChunkORM(Base):
    __tablename__ = "kb_chunks"
    __table_args__ = (UniqueConstraint("doc_id", "chunk_index", name="uq_kb_chunks_doc_chunk_index"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    doc_id: Mapped[str] = mapped_column(Text, ForeignKey("kb_documents.id", ondelete="CASCADE"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    embedding_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class EncryptedSecretORM(Base):
    __tablename__ = "encrypted_secrets"
    __table_args__ = (
        UniqueConstraint("namespace", "secret_key", name="uq_encrypted_secrets_namespace_key"),
        Index("idx_encrypted_secrets_namespace", "namespace"),
        Index("idx_encrypted_secrets_namespace_key", "namespace", "secret_key"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    namespace: Mapped[str] = mapped_column(Text, nullable=False)
    secret_key: Mapped[str] = mapped_column(Text, nullable=False)
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    meta_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserORM(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        Index("idx_users_email", "email"),
        Index("idx_users_is_active", "is_active"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class OrganizationORM(Base):
    __tablename__ = "organizations"
    __table_args__ = (
        UniqueConstraint("slug", name="uq_organizations_slug"),
        Index("idx_organizations_slug", "slug"),
        Index("idx_organizations_is_active", "is_active"),
        Index("idx_organizations_clerk_org_id", "clerk_org_id"),
        Index("idx_organizations_github_org_login", "github_org_login"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    slug: Mapped[str | None] = mapped_column(Text, nullable=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    clerk_org_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    github_org_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    github_org_login: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False, server_default="platform")
    sync_status: Mapped[str] = mapped_column(Text, nullable=False, server_default="local_only")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class OrganizationMembershipORM(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_organization_memberships_org_user"),
        CheckConstraint("role IN ('owner', 'admin', 'member')", name="ck_organization_memberships_role"),
        CheckConstraint("status IN ('active', 'invited', 'revoked')", name="ck_organization_memberships_status"),
        Index("idx_organization_memberships_org_id", "organization_id"),
        Index("idx_organization_memberships_user_id", "user_id"),
        Index("idx_organization_memberships_role", "role"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    organization_id: Mapped[str] = mapped_column(Text, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str] = mapped_column(Text, nullable=False, server_default="member")
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class RoleORM(Base):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("code", name="uq_roles_code"),
        Index("idx_roles_code", "code"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class PermissionORM(Base):
    __tablename__ = "permissions"
    __table_args__ = (
        UniqueConstraint("code", name="uq_permissions_code"),
        Index("idx_permissions_code", "code"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class UserRoleORM(Base):
    __tablename__ = "user_roles"
    __table_args__ = (
        UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),
        Index("idx_user_roles_user_id", "user_id"),
        Index("idx_user_roles_role_id", "role_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    user_id: Mapped[str] = mapped_column(Text, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id: Mapped[str] = mapped_column(Text, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class RolePermissionORM(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (
        UniqueConstraint("role_id", "permission_id", name="uq_role_permissions_role_permission"),
        Index("idx_role_permissions_role_id", "role_id"),
        Index("idx_role_permissions_permission_id", "permission_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    role_id: Mapped[str] = mapped_column(Text, ForeignKey("roles.id", ondelete="CASCADE"), nullable=False)
    permission_id: Mapped[str] = mapped_column(Text, ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class AuditLogORM(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("idx_audit_logs_created_at", "created_at"),)

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    target_type: Mapped[str] = mapped_column(Text, nullable=False)
    target_id: Mapped[str] = mapped_column(Text, nullable=False)
    meta_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

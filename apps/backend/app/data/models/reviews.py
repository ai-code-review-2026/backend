from __future__ import annotations

from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.data.base import Base


class ReviewStateORM(Base):
    """Review state machine tracking"""
    __tablename__ = "review_states"
    __table_args__ = (
        UniqueConstraint("analysis_id", name="uq_review_states_analysis"),
        CheckConstraint(
            "current_state IN ('draft', 'ready_for_review', 'assigning_reviewers', 'pending_review', "
            "'in_review', 'waiting_for_changes', 'changes_requested', 'approved', 'approved_with_suggestions', "
            "'merged', 'closed', 'abandoned', 'blocked', 'failed')",
            name="ck_review_states_current_state",
        ),
        CheckConstraint(
            "previous_state IS NULL OR previous_state IN ('draft', 'ready_for_review', 'assigning_reviewers', "
            "'pending_review', 'in_review', 'waiting_for_changes', 'changes_requested', 'approved', "
            "'approved_with_suggestions', 'merged', 'closed', 'abandoned', 'blocked', 'failed')",
            name="ck_review_states_previous_state",
        ),
        CheckConstraint(
            "transition_reason IS NULL OR transition_reason IN ('submit_for_review', 'request_review', "
            "'update_changes', 'address_feedback', 'abandon', 'start_review', 'request_changes', 'approve', "
            "'approve_with_suggestions', 'block', 'reassign', 'auto_assign', 'merge', 'close', 'timeout', "
            "'error', 'restart_review')",
            name="ck_review_states_transition_reason",
        ),
        Index("idx_review_states_analysis", "analysis_id"),
        Index("idx_review_states_current", "current_state"),
        Index("idx_review_states_transitioned", "transitioned_at"),
        Index("idx_review_states_overdue", "is_overdue", "sla_deadline"),
        Index("idx_review_states_assignees", "reviewers_assigned"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
    )
    current_state: Mapped[str] = mapped_column(Text, nullable=False)
    previous_state: Mapped[str | None] = mapped_column(Text, nullable=True)
    transition_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    transitioned_by: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("users.id"),
        nullable=True,
    )
    transitioned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    
    # Review progress tracking
    reviewers_assigned: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    reviewers_completed: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    blocking_comments: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    change_requests: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    
    # Timing metrics
    time_in_current_state: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    total_review_time: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    sla_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_overdue: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReviewStateHistoryORM(Base):
    """Review state transition history"""
    __tablename__ = "review_state_history"
    __table_args__ = (
        CheckConstraint(
            "from_state IS NULL OR from_state IN ('draft', 'ready_for_review', 'assigning_reviewers', "
            "'pending_review', 'in_review', 'waiting_for_changes', 'changes_requested', 'approved', "
            "'approved_with_suggestions', 'merged', 'closed', 'abandoned', 'blocked', 'failed')",
            name="ck_review_state_history_from_state",
        ),
        CheckConstraint(
            "to_state IN ('draft', 'ready_for_review', 'assigning_reviewers', 'pending_review', "
            "'in_review', 'waiting_for_changes', 'changes_requested', 'approved', 'approved_with_suggestions', "
            "'merged', 'closed', 'abandoned', 'blocked', 'failed')",
            name="ck_review_state_history_to_state",
        ),
        CheckConstraint(
            "transition_reason IN ('submit_for_review', 'request_review', 'update_changes', 'address_feedback', "
            "'abandon', 'start_review', 'request_changes', 'approve', 'approve_with_suggestions', 'block', "
            "'reassign', 'auto_assign', 'merge', 'close', 'timeout', 'error', 'restart_review')",
            name="ck_review_state_history_transition_reason",
        ),
        Index("idx_review_state_history_analysis", "analysis_id", "transitioned_at"),
        Index("idx_review_state_history_state", "analysis_id", "to_state"),
        Index("idx_review_state_history_user", "transitioned_by", "transitioned_at"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_state: Mapped[str | None] = mapped_column(Text, nullable=True)  # NULL for initial state
    to_state: Mapped[str] = mapped_column(Text, nullable=False)
    transition_reason: Mapped[str] = mapped_column(Text, nullable=False)
    transitioned_by: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("users.id"),
        nullable=True,
    )
    transitioned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    duration_in_previous_state: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReviewAssignmentORM(Base):
    """Review assignment to reviewer"""
    __tablename__ = "review_assignments"
    __table_args__ = (
        UniqueConstraint("analysis_id", "reviewer_id", name="uq_review_assignments_analysis_reviewer"),
        CheckConstraint(
            "assignment_type IN ('auto', 'manual', 'self_assigned')",
            name="ck_review_assignments_type",
        ),
        CheckConstraint(
            "status IN ('pending', 'in_progress', 'completed', 'declined')",
            name="ck_review_assignments_status",
        ),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'critical')",
            name="ck_review_assignments_priority",
        ),
        Index("idx_review_assignments_reviewer", "reviewer_id", "status"),
        Index("idx_review_assignments_analysis", "analysis_id"),
        Index("idx_review_assignments_due", "due_at"),
        Index("idx_review_assignments_created", "created_at"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewer_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    assigner_id: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("users.id"),
        nullable=True,
    )
    assignment_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="pending")
    priority: Mapped[str] = mapped_column(Text, nullable=False, server_default="medium")
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    declined_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReviewCommentORM(Base):
    """Inline comments on code during review"""
    __tablename__ = "review_comments"
    __table_args__ = (
        CheckConstraint(
            "comment_type IN ('comment', 'suggestion', 'question', 'praise', 'change_request')",
            name="ck_review_comments_type",
        ),
        CheckConstraint(
            "severity IS NULL OR severity IN ('info', 'warn', 'blocker')",
            name="ck_review_comments_severity",
        ),
        CheckConstraint(
            "status IN ('open', 'resolved', 'wontfix')",
            name="ck_review_comments_status",
        ),
        CheckConstraint("id != parent_id", name="ck_review_comments_parent_not_self"),
        Index("idx_review_comments_analysis", "analysis_id", "status"),
        Index("idx_review_comments_author", "author_id"),
        Index("idx_review_comments_thread", "parent_id"),
        Index("idx_review_comments_blocking", "analysis_id", "is_blocking"),
        Index("idx_review_comments_created", "created_at"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    parent_id: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("review_comments.id", ondelete="CASCADE"),
        nullable=True,
    )
    # Location
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    line_start: Mapped[int] = mapped_column(Integer, nullable=False)
    line_end: Mapped[int | None] = mapped_column(Integer, nullable=True)
    code_snippet: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Content
    content: Mapped[str] = mapped_column(Text, nullable=False)
    comment_type: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Status
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="open")
    resolved_by: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("users.id"),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Metadata
    is_blocking: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    reactions_json: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ChangeRequestORM(Base):
    """Formal change requests from reviewers"""
    __tablename__ = "change_requests"
    __table_args__ = (
        CheckConstraint(
            "category IN ('security', 'performance', 'quality', 'style', 'tests', 'documentation')",
            name="ck_change_requests_category",
        ),
        CheckConstraint(
            "priority IN ('low', 'medium', 'high', 'critical')",
            name="ck_change_requests_priority",
        ),
        CheckConstraint(
            "status IN ('open', 'in_progress', 'resolved', 'declined')",
            name="ck_change_requests_status",
        ),
        Index("idx_change_requests_analysis", "analysis_id", "status"),
        Index("idx_change_requests_reviewer", "reviewer_id"),
        Index("idx_change_requests_priority", "priority", "status"),
        Index("idx_change_requests_created", "created_at"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
    )
    reviewer_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(Text, nullable=False)
    # Links
    related_comments: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    related_findings: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False, server_default="{}")
    # Status
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="open")
    resolved_by: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("users.id"),
        nullable=True,
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReviewTemplateORM(Base):
    """Reusable review templates with checklists"""
    __tablename__ = "review_templates"
    __table_args__ = (
        CheckConstraint(
            "category IN ('security', 'performance', 'general', 'critical_change', 'frontend', 'backend')",
            name="ck_review_templates_category",
        ),
        Index("idx_review_templates_org", "organization_id"),
        Index("idx_review_templates_category", "category", "is_public"),
        Index("idx_review_templates_created_by", "created_by"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    created_by: Mapped[str] = mapped_column(
        Text,
        ForeignKey("users.id"),
        nullable=False,
    )
    organization_id: Mapped[str | None] = mapped_column(
        Text,
        ForeignKey("organizations.id"),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # Template content
    checklist_items: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="[]")
    guidelines: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_apply_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReviewSessionORM(Base):
    """Live review sessions for real-time collaboration"""
    __tablename__ = "review_sessions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'paused', 'completed')",
            name="ck_review_sessions_status",
        ),
        Index("idx_review_sessions_analysis", "analysis_id"),
        Index("idx_review_sessions_status", "status"),
        Index("idx_review_sessions_initiator", "initiator_id"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    analysis_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("analyses.id", ondelete="CASCADE"),
        nullable=False,
    )
    initiator_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("users.id"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(Text, nullable=False, server_default="active")
    participants: Mapped[list[str]] = mapped_column(ARRAY(Text), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Real-time state
    current_file: Mapped[str | None] = mapped_column(Text, nullable=True)
    cursor_positions: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    session_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    recording_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ReviewerMetricsORM(Base):
    """Aggregated reviewer metrics by period"""
    __tablename__ = "reviewer_metrics"
    __table_args__ = (
        UniqueConstraint("reviewer_id", "period_start", "period_end", name="uq_reviewer_metrics_period"),
        Index("idx_reviewer_metrics_reviewer_period", "reviewer_id", "period_start"),
        Index("idx_reviewer_metrics_period", "period_start", "period_end"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    reviewer_id: Mapped[str] = mapped_column(
        Text,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    # Volume metrics
    reviews_assigned: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reviews_completed: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reviews_declined: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    comments_created: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    change_requests_created: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Quality metrics
    avg_review_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    avg_comments_per_review: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    findings_identified: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    false_positives: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # Decision metrics
    approvals: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    warnings: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    blocks: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    overrides_received: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    # SLA metrics
    reviews_within_sla: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    reviews_breached_sla: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    avg_response_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())

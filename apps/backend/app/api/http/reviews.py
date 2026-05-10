from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone, date, timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text

from app.api.middleware.auth import AuthenticatedPrincipal, enforce_permission, get_current_principal, require_permission
from app.data.database import get_engine
from app.data.repos.change_requests_repo import (
    ChangeRequestsRepo,
    CreateChangeRequestInput,
    UpdateChangeRequestInput,
)
from app.data.repos.review_assignments_repo import (
    CreateReviewAssignmentInput,
    ReviewAssignmentsRepo,
    UpdateReviewAssignmentInput,
)
from app.data.repos.review_comments_repo import (
    CreateReviewCommentInput,
    ReviewCommentsRepo,
    UpdateReviewCommentInput,
)
from app.data.repos.review_templates_repo import (
    CreateReviewTemplateInput,
    ReviewTemplatesRepo,
    UpdateReviewTemplateInput,
)
from app.services.notifications import NotificationChannel, NotificationService

logger = logging.getLogger(__name__)


def _serialize_datetime_fields(row: dict[str, Any]) -> dict[str, Any]:
    """Convert datetime objects to ISO format strings for API responses."""
    result = dict(row)
    for key, value in result.items():
        if isinstance(value, datetime):
            result[key] = value.isoformat()
    return result

router = APIRouter(prefix="/api/v1/reviews", tags=["reviews"])

_MENTION_PATTERN = re.compile(r"@([A-Za-z0-9._-]{3,80})")
_TEMPLATE_CATEGORIES = ("security", "performance", "general", "critical_change", "frontend", "backend")


def _get_analysis_context(analysis_id: str) -> dict[str, Any] | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT id, repo, pr_number, project_id, metadata_json
                FROM analyses
                WHERE id = :analysis_id
                LIMIT 1
                """
            ),
            {"analysis_id": analysis_id},
        ).mappings().first()
    return dict(row) if row else None


def _resolve_analysis_owner_ids(analysis: dict[str, Any] | None) -> list[str]:
    if not analysis:
        return []
    metadata = analysis.get("metadata_json") or {}
    if isinstance(metadata, str):
        try:
            metadata = json.loads(metadata)
        except Exception:  # noqa: BLE001
            metadata = {}
    owner_keys = ("author_id", "user_id", "actor_id", "clerk_user_id")
    owner_ids: list[str] = []
    for key in owner_keys:
        value = metadata.get(key) if isinstance(metadata, dict) else None
        if isinstance(value, str) and value.strip() and value.strip() not in owner_ids:
            owner_ids.append(value.strip())
    return owner_ids


def _resolve_assigned_reviewer_ids(analysis_id: str) -> list[str]:
    try:
        engine = get_engine()
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT DISTINCT reviewer_id
                    FROM review_assignments
                    WHERE analysis_id = :analysis_id
                      AND status IN ('pending', 'in_progress', 'completed')
                    """
                ),
                {"analysis_id": analysis_id},
            ).mappings().all()
    except Exception:  # noqa: BLE001
        return []
    return [str(row["reviewer_id"]) for row in rows if row.get("reviewer_id")]


def _resolve_mentions_user_ids(text_content: str) -> list[str]:
    """
    Resolve @mentions to user ids using id/email/display_name prefixes.
    """
    mention_tokens = {m.group(1).strip().lower() for m in _MENTION_PATTERN.finditer(text_content or "")}
    if not mention_tokens:
        return []

    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, email, display_name
                FROM users
                WHERE is_active = TRUE
                """
            )
        ).mappings().all()

    matched_ids: list[str] = []
    for row in rows:
        user_id = str(row.get("id") or "").strip()
        if not user_id:
            continue
        email = str(row.get("email") or "").strip().lower()
        display_name = str(row.get("display_name") or "").strip().lower()
        email_local = email.split("@", 1)[0] if "@" in email else email

        candidates = {user_id.lower(), email_local}
        if display_name:
            candidates.add(display_name.replace(" ", ""))
            candidates.update(part for part in re.split(r"[^a-z0-9._-]+", display_name) if part)

        if mention_tokens.intersection(candidates):
            matched_ids.append(user_id)
    return list(dict.fromkeys(matched_ids))


def _is_admin_principal(principal: AuthenticatedPrincipal | None) -> bool:
    if principal is None:
        return False
    return str(principal.role).strip().lower() == "admin"


def _parse_json_field(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:  # noqa: BLE001
            return fallback
    return fallback


def _resolve_template_creator_names(user_ids: list[str]) -> dict[str, str]:
    unique_ids = list(dict.fromkeys(uid for uid in user_ids if isinstance(uid, str) and uid.strip()))
    if not unique_ids:
        return {}

    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT id, display_name, email
                FROM users
                WHERE id = ANY(:user_ids)
                """
            ),
            {"user_ids": unique_ids},
        ).mappings().all()

    resolved: dict[str, str] = {}
    for row in rows:
        user_id = str(row.get("id") or "").strip()
        if not user_id:
            continue
        display_name = str(row.get("display_name") or "").strip()
        email = str(row.get("email") or "").strip()
        resolved[user_id] = display_name or email or "Unknown"
    return resolved


def _serialize_template(row: dict[str, Any], created_by_name: str | None = None) -> dict[str, Any]:
    data = _serialize_datetime_fields(dict(row))
    data["checklist_items"] = _parse_json_field(data.get("checklist_items"), [])
    data["auto_apply_rules"] = _parse_json_field(data.get("auto_apply_rules"), {})
    data["created_by_name"] = created_by_name
    return data


# Review Assignment Models
class CreateAssignmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: str = Field(min_length=1)
    reviewer_id: str = Field(min_length=1)
    assignment_type: Literal["auto", "manual", "self_assigned"] = "manual"
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    due_at: str | None = None


class UpdateAssignmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending", "in_progress", "completed", "declined"] | None = None
    started_at: str | None = None
    completed_at: str | None = None
    declined_reason: str | None = None
    priority: Literal["low", "medium", "high", "critical"] | None = None
    reviewer_id: str | None = None


class AssignmentResponse(BaseModel):
    id: str
    analysis_id: str
    reviewer_id: str
    assigner_id: str | None
    assignment_type: str
    status: str
    priority: str
    assigned_at: str
    started_at: str | None
    completed_at: str | None
    due_at: str | None
    declined_reason: str | None
    created_at: str
    updated_at: str


# Review Comment Models
class CreateCommentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: str = Field(min_length=1)
    file_path: str = Field(min_length=1)
    line_start: int = Field(ge=1)
    content: str = Field(min_length=1)
    comment_type: Literal["comment", "suggestion", "question", "praise", "change_request"] = "comment"
    parent_id: str | None = None
    line_end: int | None = Field(None, ge=1)
    code_snippet: str | None = None
    severity: Literal["info", "warn", "blocker"] | None = None
    is_blocking: bool = False


class UpdateCommentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str | None = None
    status: Literal["open", "resolved", "wontfix"] | None = None


class CommentResponse(BaseModel):
    id: str
    analysis_id: str
    author_id: str
    parent_id: str | None
    file_path: str
    line_start: int
    line_end: int | None
    code_snippet: str | None
    content: str
    comment_type: str
    severity: str | None
    status: str
    resolved_by: str | None
    resolved_at: datetime | None
    is_blocking: bool
    reactions_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime


# Change Request Models
class CreateChangeRequestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    analysis_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = Field(min_length=1)
    category: Literal["security", "performance", "quality", "style", "tests", "documentation"]
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    related_comments: list[str] = Field(default_factory=list)
    related_findings: list[str] = Field(default_factory=list)


class UpdateChangeRequestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["open", "in_progress", "resolved", "declined"] | None = None
    resolved_at: str | None = None
    resolution_comment: str | None = None


class ChangeRequestResponse(BaseModel):
    id: str
    analysis_id: str
    reviewer_id: str
    title: str
    description: str
    category: str
    priority: str
    related_comments: list[str]
    related_findings: list[str]
    status: str
    resolved_by: str | None
    resolved_at: str | None
    resolution_comment: str | None
    created_at: str
    updated_at: str


class CreateTemplateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=180)
    description: str | None = None
    category: Literal["security", "performance", "general", "critical_change", "frontend", "backend"] = "general"
    is_default: bool = False
    is_public: bool = False
    checklist_items: list[dict[str, Any]] = Field(default_factory=list)
    guidelines: str | None = None
    auto_apply_rules: dict[str, Any] = Field(default_factory=dict)


class UpdateTemplateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=180)
    description: str | None = None
    is_default: bool | None = None
    is_public: bool | None = None
    checklist_items: list[dict[str, Any]] | None = None
    guidelines: str | None = None
    auto_apply_rules: dict[str, Any] | None = None


class ReviewTemplateResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    category: str
    is_default: bool
    is_public: bool
    created_by: str
    created_by_name: str | None = None
    organization_id: str | None = None
    checklist_items: list[dict[str, Any]] = Field(default_factory=list)
    guidelines: str | None = None
    auto_apply_rules: dict[str, Any] = Field(default_factory=dict)
    usage_count: int = 0
    created_at: str
    updated_at: str


# Assignment Endpoints
@router.post("/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
async def create_assignment(
    request: CreateAssignmentRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> AssignmentResponse:
    """Create a new review assignment"""
    # Check permissions
    enforce_permission(principal, "reviews.assign")

    repo = ReviewAssignmentsRepo()
    input_data = CreateReviewAssignmentInput(
        analysis_id=request.analysis_id,
        reviewer_id=request.reviewer_id,
        assigner_id=principal.user_id,
        assignment_type=request.assignment_type,
        priority=request.priority,
        due_at=request.due_at,
    )

    assignment_id = repo.create_assignment(input_data)
    assignment = repo.get_assignment_by_id(assignment_id)

    if not assignment:
        raise HTTPException(status_code=500, detail="Failed to create assignment")

    analysis = _get_analysis_context(request.analysis_id)
    notification_service = NotificationService()
    await notification_service.send_assignment_notification(
        assignment_data={
            "id": assignment_id,
            "analysis_id": request.analysis_id,
            "reviewer_id": request.reviewer_id,
            "assigner_id": principal.user_id,
            "project_id": (analysis or {}).get("project_id"),
            "priority": request.priority,
            "due_at": request.due_at,
            "analysis": {"repo": (analysis or {}).get("repo", "Unknown")},
        },
        channels=[NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.PUSH],
    )

    return AssignmentResponse(**dict(assignment))


@router.get("/assignments", response_model=list[AssignmentResponse])
async def list_assignments(
    reviewer_id: str | None = Query(None),
    analysis_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> list[AssignmentResponse]:
    """List review assignments"""
    # Check permissions - users can view their own assignments, leads can view all
    if reviewer_id and reviewer_id != principal.user_id:
        enforce_permission(principal, "assignments.view_all")
    else:
        enforce_permission(principal, "assignments.view_own")

    repo = ReviewAssignmentsRepo()

    # If both analysis_id and reviewer_id are specified, use the specific finder
    if analysis_id and reviewer_id:
        assignment = repo.find_assignment_by_analysis_and_reviewer(analysis_id, reviewer_id, status_filter)
        return [AssignmentResponse(**_serialize_datetime_fields(dict(assignment)))] if assignment else []

    # If only analysis_id is specified, get all assignments for that analysis
    if analysis_id:
        assignments = repo.get_assignments_by_analysis(analysis_id)
        # Apply status filter if provided
        if status_filter:
            assignments = [a for a in assignments if a["status"] == status_filter]
        # Apply pagination
        assignments = assignments[offset:offset + limit]
        return [AssignmentResponse(**_serialize_datetime_fields(dict(assignment))) for assignment in assignments]

    if reviewer_id:
        assignments = repo.get_assignments_by_reviewer(reviewer_id, status_filter, limit, offset)
    else:
        # If no reviewer_id specified, show current user's assignments
        assignments = repo.get_assignments_by_reviewer(principal.user_id, status_filter, limit, offset)

    return [AssignmentResponse(**_serialize_datetime_fields(dict(assignment))) for assignment in assignments]


@router.get("/assignments/{assignment_id}", response_model=AssignmentResponse)
async def get_assignment(
    assignment_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> AssignmentResponse:
    """Get assignment by ID"""
    repo = ReviewAssignmentsRepo()
    assignment = repo.get_assignment_by_id(assignment_id)

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    # Check permissions - can view own assignments or all if has permission
    if assignment["reviewer_id"] != principal.user_id:
        enforce_permission(principal, "assignments.view_all")
    else:
        enforce_permission(principal, "assignments.view_own")

    return AssignmentResponse(**_serialize_datetime_fields(dict(assignment)))


@router.patch("/assignments/{assignment_id}", response_model=AssignmentResponse)
async def update_assignment(
    assignment_id: str,
    request: UpdateAssignmentRequest,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> AssignmentResponse:
    """Update assignment status"""
    try:
        if not principal:
            raise HTTPException(status_code=401, detail="Authentication required")
        
        repo = ReviewAssignmentsRepo()
        assignment = repo.get_assignment_by_id(assignment_id)

        if not assignment:
            raise HTTPException(status_code=404, detail="Assignment not found")

        # Check permissions - can modify own assignments or all if has permission
        logger.info(f"Assignment reviewer_id: {assignment['reviewer_id']}, principal.user_id: {principal.user_id}")
        if assignment["reviewer_id"] != principal.user_id:
            enforce_permission(principal, "assignments.modify")
        else:
            enforce_permission(principal, "assignments.view_own")

        update_data = UpdateReviewAssignmentInput(
            status=request.status,
            started_at=request.started_at,
            completed_at=request.completed_at,
            declined_reason=request.declined_reason,
            priority=request.priority,
            reviewer_id=request.reviewer_id,
        )

        success = repo.update_assignment(assignment_id, update_data)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to update assignment")

        updated_assignment = repo.get_assignment_by_id(assignment_id)

        if request.status == "completed":
            analysis = _get_analysis_context(str(assignment["analysis_id"]))
            recipient_ids = _resolve_analysis_owner_ids(analysis)
            assigner_id = assignment.get("assigner_id")
            if isinstance(assigner_id, str) and assigner_id.strip() and assigner_id not in recipient_ids:
                recipient_ids.append(assigner_id)
            if recipient_ids:
                notification_service = NotificationService()
                await notification_service.send_review_completed_notification(
                    analysis_id=str(assignment["analysis_id"]),
                    reviewer_id=principal.user_id,
                    decision="completed",
                    summary=None,
                    recipient_ids=recipient_ids,
                    project_id=(analysis or {}).get("project_id"),
                )

        return AssignmentResponse(**_serialize_datetime_fields(dict(updated_assignment)))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating assignment {assignment_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/assignments/{assignment_id}/claim", response_model=AssignmentResponse)
async def claim_assignment(
    assignment_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> AssignmentResponse:
    """Self-assign (claim) a review"""
    enforce_permission(principal, "reviews.claim")

    repo = ReviewAssignmentsRepo()
    assignment = repo.get_assignment_by_id(assignment_id)

    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    if assignment["status"] != "pending":
        raise HTTPException(status_code=400, detail="Assignment is not available for claiming")

    # Update assignment to claim it
    now = datetime.now(timezone.utc).isoformat()
    update_data = UpdateReviewAssignmentInput(
        status="in_progress",
        started_at=now,
    )

    # Update reviewer_id to current user and assignment_type to self_assigned
    # Note: This would need additional repo method to change reviewer_id
    success = repo.update_assignment(assignment_id, update_data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to claim assignment")

    updated_assignment = repo.get_assignment_by_id(assignment_id)
    return AssignmentResponse(**_serialize_datetime_fields(dict(updated_assignment)))


# Comment Endpoints
@router.post("/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
async def create_comment(
    request: CreateCommentRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> CommentResponse:
    """Create a review comment"""
    enforce_permission(principal, "comments.create")

    repo = ReviewCommentsRepo()
    input_data = CreateReviewCommentInput(
        analysis_id=request.analysis_id,
        author_id=principal.user_id,
        file_path=request.file_path,
        line_start=request.line_start,
        content=request.content,
        comment_type=request.comment_type,
        parent_id=request.parent_id,
        line_end=request.line_end,
        code_snippet=request.code_snippet,
        severity=request.severity,
        is_blocking=request.is_blocking,
    )

    comment_id = repo.create_comment(input_data)
    comment = repo.get_comment_by_id(comment_id)

    if not comment:
        raise HTTPException(status_code=500, detail="Failed to create comment")

    analysis = _get_analysis_context(request.analysis_id) or {}
    project_id = analysis.get("project_id")
    comment_payload = dict(comment)
    comment_payload["project_id"] = project_id

    notification_service = NotificationService()

    parent_author_id: str | None = None
    if request.parent_id:
        parent_comment = repo.get_comment_by_id(request.parent_id)
        if parent_comment and parent_comment.get("author_id"):
            parent_author_id = str(parent_comment["author_id"])
            await notification_service.send_comment_reply_notification(
                comment_data=comment_payload,
                parent_comment_author=parent_author_id,
            )

    mentioned_user_ids = _resolve_mentions_user_ids(request.content)
    for mentioned_user_id in mentioned_user_ids:
        await notification_service.send_comment_mention_notification(
            mentioned_user_id=mentioned_user_id,
            author_id=principal.user_id,
            comment_data=comment_payload,
        )

    general_recipients = set(_resolve_analysis_owner_ids(analysis))
    general_recipients.update(_resolve_assigned_reviewer_ids(request.analysis_id))
    general_recipients.discard(principal.user_id)
    if parent_author_id:
        general_recipients.discard(parent_author_id)
    for mentioned_user_id in mentioned_user_ids:
        general_recipients.discard(mentioned_user_id)

    if general_recipients:
        await notification_service.send_comment_added_notification(
            comment_data=comment_payload,
            recipient_ids=list(general_recipients),
            actor_id=principal.user_id,
            recipient_roles=["admin"],
        )

    return CommentResponse(**dict(comment))


@router.get("/comments", response_model=list[CommentResponse])
async def list_comments(
    analysis_id: str | None = Query(None),
    author_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    file_path: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> list[CommentResponse]:
    """List review comments"""
    enforce_permission(principal, "comments.read")

    repo = ReviewCommentsRepo()

    if analysis_id:
        comments = repo.get_comments_by_analysis(analysis_id, status_filter, file_path)
    elif author_id:
        comments = repo.get_comments_by_author(author_id, limit, offset)
    else:
        raise HTTPException(status_code=400, detail="Must specify analysis_id or author_id")

    return [CommentResponse(**dict(comment)) for comment in comments]


@router.get("/comments/{comment_id}/thread", response_model=list[CommentResponse])
async def get_comment_thread(
    comment_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> list[CommentResponse]:
    """Get comment thread (replies)"""
    enforce_permission(principal, "comments.read")

    repo = ReviewCommentsRepo()
    thread_comments = repo.get_comment_thread(comment_id)

    return [CommentResponse(**dict(comment)) for comment in thread_comments]


@router.patch("/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    comment_id: str,
    request: UpdateCommentRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> CommentResponse:
    """Update a comment"""
    repo = ReviewCommentsRepo()
    comment = repo.get_comment_by_id(comment_id)

    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    # Check permissions - can edit own comments or resolve if has permission
    if request.status and request.status == "resolved":
        enforce_permission(principal, "comments.resolve")
    elif comment["author_id"] == principal.user_id:
        enforce_permission(principal, "comments.create")  # Can edit own
    else:
        enforce_permission(principal, "comments.edit")  # Can edit others

    update_data = UpdateReviewCommentInput(
        content=request.content,
        status=request.status,
        resolved_by=principal.user_id if request.status == "resolved" else None,
        resolved_at=datetime.now(timezone.utc).isoformat() if request.status == "resolved" else None,
    )

    success = repo.update_comment(comment_id, update_data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update comment")

    updated_comment = repo.get_comment_by_id(comment_id)
    return CommentResponse(**dict(updated_comment))


# Change Request Endpoints
@router.post("/change-requests", response_model=ChangeRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_change_request(
    request: CreateChangeRequestRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ChangeRequestResponse:
    """Create a change request"""
    enforce_permission(principal, "reviews.request_changes")

    repo = ChangeRequestsRepo()
    input_data = CreateChangeRequestInput(
        analysis_id=request.analysis_id,
        reviewer_id=principal.user_id,
        title=request.title,
        description=request.description,
        category=request.category,
        priority=request.priority,
        related_comments=request.related_comments,
        related_findings=request.related_findings,
    )

    cr_id = repo.create_change_request(input_data)
    change_request = repo.get_change_request_by_id(cr_id)

    if not change_request:
        raise HTTPException(status_code=500, detail="Failed to create change request")

    analysis = _get_analysis_context(request.analysis_id)
    owner_ids = _resolve_analysis_owner_ids(analysis)
    if owner_ids:
        notification_service = NotificationService()
        payload = dict(change_request)
        payload["project_id"] = (analysis or {}).get("project_id")
        await notification_service.send_change_request_notification(
            change_request_data=payload,
            analysis_author=owner_ids[0],
        )

    return ChangeRequestResponse(**dict(change_request))


@router.get("/change-requests", response_model=list[ChangeRequestResponse])
async def list_change_requests(
    analysis_id: str | None = Query(None),
    reviewer_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> list[ChangeRequestResponse]:
    """List change requests"""
    enforce_permission(principal, "comments.read")  # Basic read permission

    repo = ChangeRequestsRepo()

    if analysis_id:
        change_requests = repo.get_change_requests_by_analysis(analysis_id, status_filter)
    elif reviewer_id:
        change_requests = repo.get_change_requests_by_reviewer(reviewer_id, status_filter)
    else:
        change_requests = repo.get_open_change_requests()

    return [ChangeRequestResponse(**dict(cr)) for cr in change_requests]


@router.patch("/change-requests/{cr_id}", response_model=ChangeRequestResponse)
async def update_change_request(
    cr_id: str,
    request: UpdateChangeRequestRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ChangeRequestResponse:
    """Update a change request"""
    repo = ChangeRequestsRepo()
    change_request = repo.get_change_request_by_id(cr_id)

    if not change_request:
        raise HTTPException(status_code=404, detail="Change request not found")

    # Check permissions
    if change_request["reviewer_id"] == principal.user_id:
        # Reviewer can update their own CRs
        enforce_permission(principal, "reviews.request_changes")
    else:
        # Developer can resolve CRs (mark as resolved)
        if request.status in ["resolved", "declined"]:
            enforce_permission(principal, "comments.reply")  # Basic permission
        else:
            raise HTTPException(status_code=403, detail="Cannot modify others' change requests")

    update_data = UpdateChangeRequestInput(
        status=request.status,
        resolved_at=request.resolved_at,
        resolution_comment=request.resolution_comment,
    )

    if request.status in ["resolved", "declined"]:
        update_data.resolved_by = principal.user_id
        if not request.resolved_at:
            update_data.resolved_at = datetime.now(timezone.utc).isoformat()

    success = repo.update_change_request(cr_id, update_data)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update change request")

    updated_cr = repo.get_change_request_by_id(cr_id)
    return ChangeRequestResponse(**dict(updated_cr))


@router.get("/templates", response_model=list[ReviewTemplateResponse])
async def list_review_templates(
    category: str | None = Query(None),
    mine_only: bool = Query(False),
    principal: AuthenticatedPrincipal | None = Depends(require_permission("templates.use")),
) -> list[ReviewTemplateResponse]:
    """List review templates visible to the current user."""
    if category is not None and category not in _TEMPLATE_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid template category")

    user_id = principal.user_id if principal else "local-dev-user"
    org_id = principal.org_id if principal else None
    repo = ReviewTemplatesRepo()

    if mine_only:
        rows = repo.get_templates_by_user(user_id)
        if category:
            rows = [row for row in rows if row.get("category") == category]
    elif category:
        rows = repo.get_templates_by_category(category=category, user_id=user_id, organization_id=org_id)
    else:
        public_rows = repo.get_public_templates(organization_id=org_id)
        own_rows = repo.get_templates_by_user(user_id)
        merged: dict[str, dict[str, Any]] = {}
        for row in [*public_rows, *own_rows]:
            row_dict = dict(row)
            template_id = str(row_dict.get("id") or "").strip()
            if template_id:
                merged[template_id] = row_dict
        rows = list(merged.values())
        rows.sort(
            key=lambda item: (
                -int(bool(item.get("is_default"))),
                -int(item.get("usage_count") or 0),
                str(item.get("name") or "").lower(),
            )
        )

    if org_id:
        rows = [
            row for row in rows
            if (row.get("organization_id") is None or str(row.get("organization_id")) == org_id)
        ]

    creator_names = _resolve_template_creator_names([str(row.get("created_by") or "") for row in rows])
    payload: list[ReviewTemplateResponse] = []
    for row in rows:
        row_dict = dict(row)
        creator_id = str(row_dict.get("created_by") or "")
        payload.append(
            ReviewTemplateResponse(
                **_serialize_template(row_dict, created_by_name=creator_names.get(creator_id)),
            )
        )
    return payload


@router.get("/templates/{template_id}", response_model=ReviewTemplateResponse)
async def get_review_template(
    template_id: str,
    principal: AuthenticatedPrincipal | None = Depends(require_permission("templates.use")),
) -> ReviewTemplateResponse:
    """Get a single review template."""
    repo = ReviewTemplatesRepo()
    template = repo.get_template_by_id(template_id)
    if template is None:
        raise HTTPException(status_code=404, detail="Template not found")

    row = dict(template)
    user_id = principal.user_id if principal else "local-dev-user"
    org_id = principal.org_id if principal else None
    is_owner = str(row.get("created_by") or "") == user_id
    is_public = bool(row.get("is_public"))
    is_admin = _is_admin_principal(principal)
    same_org = row.get("organization_id") is None or str(row.get("organization_id")) == str(org_id)

    if org_id and not same_org:
        raise HTTPException(status_code=403, detail="Template belongs to another organization")
    if not (is_public or is_owner or is_admin):
        raise HTTPException(status_code=403, detail="You do not have access to this template")

    creator_names = _resolve_template_creator_names([str(row.get("created_by") or "")])
    return ReviewTemplateResponse(
        **_serialize_template(
            row,
            created_by_name=creator_names.get(str(row.get("created_by") or "")),
        )
    )


@router.post("/templates", response_model=ReviewTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_review_template(
    request: CreateTemplateRequest,
    principal: AuthenticatedPrincipal | None = Depends(require_permission("templates.create")),
) -> ReviewTemplateResponse:
    """Create a new review template."""
    if request.category not in _TEMPLATE_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid template category")

    creator_id = principal.user_id if principal else "local-dev-user"
    org_id = principal.org_id if principal else None
    repo = ReviewTemplatesRepo()

    template_id = repo.create_template(
        CreateReviewTemplateInput(
            created_by=creator_id,
            organization_id=org_id,
            name=request.name.strip(),
            description=request.description.strip() if isinstance(request.description, str) else request.description,
            category=request.category,
            is_default=request.is_default,
            is_public=request.is_public,
            checklist_items=request.checklist_items,
            guidelines=request.guidelines,
            auto_apply_rules=request.auto_apply_rules,
        )
    )

    if request.is_default:
        engine = get_engine()
        with engine.begin() as conn:
            if org_id:
                conn.execute(
                    text(
                        """
                        UPDATE review_templates
                        SET is_default = FALSE
                        WHERE category = :category
                          AND organization_id = :organization_id
                          AND id != :template_id
                        """
                    ),
                    {
                        "category": request.category,
                        "organization_id": org_id,
                        "template_id": template_id,
                    },
                )
            else:
                conn.execute(
                    text(
                        """
                        UPDATE review_templates
                        SET is_default = FALSE
                        WHERE category = :category
                          AND organization_id IS NULL
                          AND id != :template_id
                        """
                    ),
                    {
                        "category": request.category,
                        "template_id": template_id,
                    },
                )

    created = repo.get_template_by_id(template_id)
    if created is None:
        raise HTTPException(status_code=500, detail="Failed to create template")

    creator_names = _resolve_template_creator_names([creator_id])
    return ReviewTemplateResponse(
        **_serialize_template(created, created_by_name=creator_names.get(creator_id))
    )


@router.patch("/templates/{template_id}", response_model=ReviewTemplateResponse)
async def update_review_template(
    template_id: str,
    request: UpdateTemplateRequest,
    principal: AuthenticatedPrincipal | None = Depends(require_permission("templates.create")),
) -> ReviewTemplateResponse:
    """Update an existing review template."""
    repo = ReviewTemplatesRepo()
    existing = repo.get_template_by_id(template_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Template not found")

    existing_dict = dict(existing)
    user_id = principal.user_id if principal else "local-dev-user"
    org_id = principal.org_id if principal else None
    is_owner = str(existing_dict.get("created_by") or "") == user_id
    is_admin = _is_admin_principal(principal)
    same_org = existing_dict.get("organization_id") is None or str(existing_dict.get("organization_id")) == str(org_id)

    if not same_org and org_id:
        raise HTTPException(status_code=403, detail="Template belongs to another organization")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only owner or admin can edit this template")

    success = repo.update_template(
        template_id,
        UpdateReviewTemplateInput(
            name=request.name.strip() if isinstance(request.name, str) else request.name,
            description=request.description.strip() if isinstance(request.description, str) else request.description,
            is_default=request.is_default,
            is_public=request.is_public,
            checklist_items=request.checklist_items,
            guidelines=request.guidelines,
            auto_apply_rules=request.auto_apply_rules,
        ),
    )
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update template")

    if request.is_default:
        category = str(existing_dict.get("category") or "")
        engine = get_engine()
        with engine.begin() as conn:
            if org_id:
                conn.execute(
                    text(
                        """
                        UPDATE review_templates
                        SET is_default = FALSE
                        WHERE category = :category
                          AND organization_id = :organization_id
                          AND id != :template_id
                        """
                    ),
                    {
                        "category": category,
                        "organization_id": org_id,
                        "template_id": template_id,
                    },
                )
            else:
                conn.execute(
                    text(
                        """
                        UPDATE review_templates
                        SET is_default = FALSE
                        WHERE category = :category
                          AND organization_id IS NULL
                          AND id != :template_id
                        """
                    ),
                    {
                        "category": category,
                        "template_id": template_id,
                    },
                )

    updated = repo.get_template_by_id(template_id)
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to load updated template")

    creator_id = str(updated.get("created_by") or "")
    creator_names = _resolve_template_creator_names([creator_id])
    return ReviewTemplateResponse(
        **_serialize_template(updated, created_by_name=creator_names.get(creator_id))
    )


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review_template(
    template_id: str,
    principal: AuthenticatedPrincipal | None = Depends(require_permission("templates.create")),
) -> None:
    """Delete a review template."""
    repo = ReviewTemplatesRepo()
    existing = repo.get_template_by_id(template_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Template not found")

    existing_dict = dict(existing)
    user_id = principal.user_id if principal else "local-dev-user"
    org_id = principal.org_id if principal else None
    is_owner = str(existing_dict.get("created_by") or "") == user_id
    is_admin = _is_admin_principal(principal)
    same_org = existing_dict.get("organization_id") is None or str(existing_dict.get("organization_id")) == str(org_id)

    if not same_org and org_id:
        raise HTTPException(status_code=403, detail="Template belongs to another organization")
    if not (is_owner or is_admin):
        raise HTTPException(status_code=403, detail="Only owner or admin can delete this template")
    if bool(existing_dict.get("is_default")) and not is_admin:
        raise HTTPException(status_code=403, detail="Default templates can only be deleted by admin")

    deleted = repo.delete_template(template_id)
    if not deleted:
        raise HTTPException(status_code=500, detail="Failed to delete template")


@router.post("/templates/{template_id}/use", response_model=ReviewTemplateResponse)
async def use_review_template(
    template_id: str,
    principal: AuthenticatedPrincipal | None = Depends(require_permission("templates.use")),
) -> ReviewTemplateResponse:
    """Mark a template as used and return it."""
    repo = ReviewTemplatesRepo()
    existing = repo.get_template_by_id(template_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="Template not found")

    row = dict(existing)
    user_id = principal.user_id if principal else "local-dev-user"
    org_id = principal.org_id if principal else None
    is_owner = str(row.get("created_by") or "") == user_id
    is_public = bool(row.get("is_public"))
    is_admin = _is_admin_principal(principal)
    same_org = row.get("organization_id") is None or str(row.get("organization_id")) == str(org_id)

    if org_id and not same_org:
        raise HTTPException(status_code=403, detail="Template belongs to another organization")
    if not (is_owner or is_public or is_admin):
        raise HTTPException(status_code=403, detail="You do not have access to this template")

    updated_ok = repo.increment_usage_count(template_id)
    if not updated_ok:
        raise HTTPException(status_code=500, detail="Failed to register template usage")

    updated = repo.get_template_by_id(template_id)
    if updated is None:
        raise HTTPException(status_code=500, detail="Failed to load template")

    creator_id = str(updated.get("created_by") or "")
    creator_names = _resolve_template_creator_names([creator_id])
    return ReviewTemplateResponse(
        **_serialize_template(updated, created_by_name=creator_names.get(creator_id))
    )


# Dashboard Models
class ReviewKPIs(BaseModel):
    """KPI metrics for reviewer dashboard."""
    pending_reviews: int = 0
    in_progress_reviews: int = 0
    completed_today: int = 0
    completed_this_week: int = 0
    avg_review_time_hours: float | None = None
    overdue_reviews: int = 0


class ActiveReview(BaseModel):
    """Active review item for dashboard."""
    id: str
    analysis_id: str
    repo: str
    pr_number: int | None
    priority: str
    status: str
    assigned_at: str
    due_at: str | None
    files_changed: int = 0
    findings_count: int = 0


class RecentActivity(BaseModel):
    """Recent activity item."""
    id: str
    type: str  # 'comment', 'review_completed', 'change_request'
    description: str
    created_at: str
    analysis_id: str | None = None
    repo: str | None = None


class ReviewerDashboardResponse(BaseModel):
    """Reviewer dashboard response."""
    kpis: ReviewKPIs
    active_reviews: list[ActiveReview]
    recent_activity: list[RecentActivity]
    is_lead: bool = False


@router.get("/dashboard", response_model=ReviewerDashboardResponse)
async def get_reviewer_dashboard(
    principal: AuthenticatedPrincipal = Depends(require_permission("assignments.view_own")),
) -> ReviewerDashboardResponse:
    """
    Get reviewer dashboard data.
    
    Returns KPIs, active reviews, and recent activity for the current user.
    """
    
    engine = get_engine()
    from sqlalchemy import text
    
    user_id = principal.user_id
    
    # Check if user is a lead/admin
    is_lead = "admin" in principal.roles or "lead" in principal.roles or "reviewer" in principal.roles
    
    # Get KPIs
    kpi_query = text("""
        SELECT 
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
            SUM(CASE WHEN status = 'completed' AND DATE(completed_at) = CURRENT_DATE THEN 1 ELSE 0 END) as completed_today,
            SUM(CASE WHEN status = 'completed' AND completed_at > NOW() - INTERVAL '7 days' THEN 1 ELSE 0 END) as completed_week,
            AVG(EXTRACT(EPOCH FROM (completed_at - assigned_at)) / 3600) FILTER (WHERE status = 'completed') as avg_time_hours,
            SUM(CASE WHEN status IN ('pending', 'in_progress') AND due_at < NOW() THEN 1 ELSE 0 END) as overdue
        FROM review_assignments
        WHERE reviewer_id = :user_id
    """)
    
    kpis = ReviewKPIs()
    
    with engine.connect() as conn:
        try:
            result = conn.execute(kpi_query, {"user_id": user_id})
            row = result.mappings().first()
            
            if row:
                kpis = ReviewKPIs(
                    pending_reviews=row.get("pending") or 0,
                    in_progress_reviews=row.get("in_progress") or 0,
                    completed_today=row.get("completed_today") or 0,
                    completed_this_week=row.get("completed_week") or 0,
                    avg_review_time_hours=float(row["avg_time_hours"]) if row.get("avg_time_hours") else None,
                    overdue_reviews=row.get("overdue") or 0,
                )
        except Exception:
            # Table might not exist, return defaults
            pass
    
    # Get active reviews
    active_query = text("""
        SELECT 
            ra.id,
            ra.analysis_id,
            ra.priority,
            ra.status,
            ra.assigned_at,
            ra.due_at,
            a.repo,
            a.pr_number,
            a.nb_files_changed,
            a.findings_count
        FROM review_assignments ra
        JOIN analyses a ON ra.analysis_id = a.id
        WHERE ra.reviewer_id = :user_id
        AND ra.status IN ('pending', 'in_progress')
        ORDER BY 
            CASE ra.priority 
                WHEN 'critical' THEN 1 
                WHEN 'high' THEN 2 
                WHEN 'medium' THEN 3 
                ELSE 4 
            END,
            ra.due_at NULLS LAST,
            ra.assigned_at DESC
        LIMIT 10
    """)
    
    active_reviews: list[ActiveReview] = []
    
    with engine.connect() as conn:
        try:
            result = conn.execute(active_query, {"user_id": user_id})
            for row in result.mappings():
                active_reviews.append(ActiveReview(
                    id=row["id"],
                    analysis_id=row["analysis_id"],
                    repo=row["repo"],
                    pr_number=row.get("pr_number"),
                    priority=row["priority"],
                    status=row["status"],
                    assigned_at=row["assigned_at"].isoformat() if isinstance(row.get("assigned_at"), datetime) else str(row.get("assigned_at", "")),
                    due_at=row["due_at"].isoformat() if isinstance(row.get("due_at"), datetime) else None,
                    files_changed=row.get("nb_files_changed") or 0,
                    findings_count=row.get("findings_count") or 0,
                ))
        except Exception:
            pass
    
    # Get recent activity
    activity_query = text("""
        (
            SELECT 
                rc.id,
                'comment' as type,
                CONCAT('Commented on ', a.repo) as description,
                rc.created_at,
                rc.analysis_id,
                a.repo
            FROM review_comments rc
            JOIN analyses a ON rc.analysis_id = a.id
            WHERE rc.author_id = :user_id
            ORDER BY rc.created_at DESC
            LIMIT 5
        )
        UNION ALL
        (
            SELECT 
                ra.id,
                'review_completed' as type,
                CONCAT('Completed review for ', a.repo) as description,
                ra.completed_at as created_at,
                ra.analysis_id,
                a.repo
            FROM review_assignments ra
            JOIN analyses a ON ra.analysis_id = a.id
            WHERE ra.reviewer_id = :user_id AND ra.status = 'completed'
            ORDER BY ra.completed_at DESC
            LIMIT 5
        )
        ORDER BY created_at DESC
        LIMIT 10
    """)
    
    recent_activity: list[RecentActivity] = []
    
    with engine.connect() as conn:
        try:
            result = conn.execute(activity_query, {"user_id": user_id})
            for row in result.mappings():
                recent_activity.append(RecentActivity(
                    id=row["id"],
                    type=row["type"],
                    description=row["description"],
                    created_at=row["created_at"].isoformat() if isinstance(row.get("created_at"), datetime) else str(row.get("created_at", "")),
                    analysis_id=row.get("analysis_id"),
                    repo=row.get("repo"),
                ))
        except Exception:
            pass
    
    return ReviewerDashboardResponse(
        kpis=kpis,
        active_reviews=active_reviews,
        recent_activity=recent_activity,
        is_lead=is_lead,
    )


# Personal Metrics Models
class PersonalMetricsPeriod(BaseModel):
    """Period information for metrics."""
    start: str
    end: str
    days: int


class PersonalMetricsCurrent(BaseModel):
    """Current period metrics."""
    reviews_completed: int = 0
    avg_review_time_minutes: int = 0
    avg_comments_per_review: float = 0.0
    sla_compliance_rate: float = 0.0
    approvals: int = 0
    warnings: int = 0
    blocks: int = 0
    findings_identified: int = 0


class PersonalMetricsTrends(BaseModel):
    """Trends data for metrics."""
    dates: list[str] = []
    reviews_completed: list[int] = []
    avg_review_time: list[int] = []
    sla_compliance: list[float] = []
    avg_comments: list[float] = []


class PersonalMetricsRankings(BaseModel):
    """Ranking information."""
    reviews_count: int = 0
    quality_score: int = 0
    response_time: int = 0


class PersonalMetricsResponse(BaseModel):
    """Personal metrics response."""
    reviewer_id: str
    period: PersonalMetricsPeriod
    current_period: PersonalMetricsCurrent
    trends: PersonalMetricsTrends
    rankings: PersonalMetricsRankings


@router.get("/metrics/personal", response_model=PersonalMetricsResponse)
async def get_personal_metrics(
    period_days: int = Query(30, description="Period in days"),
    principal: AuthenticatedPrincipal = Depends(require_permission("assignments.view_own")),
) -> PersonalMetricsResponse:
    """
    Get personal metrics for the current reviewer.
    
    Returns aggregated metrics, trends, and rankings for the specified period.
    """
    from app.services.reviewer_metrics_calculator import ReviewerMetricsCalculator
    
    user_id = principal.user_id
    calculator = ReviewerMetricsCalculator()
    
    # Calculate period
    end_date = date.today()
    start_date = end_date - timedelta(days=period_days)
    
    # Get current period metrics
    try:
        current_metrics = await calculator.calculate_reviewer_metrics(
            reviewer_id=user_id,
            period_start=start_date,
            period_end=end_date
        )
    except Exception:
        # Return default metrics if calculation fails
        current_metrics = {
            "reviews_completed": 0,
            "avg_review_time_minutes": 0,
            "avg_comments_per_review": 0.0,
            "sla_compliance_rate": 0.0,
            "approvals": 0,
            "warnings": 0,
            "blocks": 0,
            "findings_identified": 0,
        }
    
    # Get trends (last 30 days in 7-day chunks)
    try:
        trends_data = await calculator.get_reviewer_trends(user_id, periods=4)
    except Exception:
        trends_data = {
            "dates": [],
            "reviews_completed": [],
            "avg_review_time": [],
            "sla_compliance": [],
            "avg_comments": [],
        }
    
    # Calculate rankings (simplified - just return 0 for now)
    rankings = {
        "reviews_count": 0,
        "quality_score": 0,
        "response_time": 0,
    }
    
    return PersonalMetricsResponse(
        reviewer_id=user_id,
        period=PersonalMetricsPeriod(
            start=start_date.isoformat(),
            end=end_date.isoformat(),
            days=period_days
        ),
        current_period=PersonalMetricsCurrent(**current_metrics),
        trends=PersonalMetricsTrends(**trends_data),
        rankings=PersonalMetricsRankings(**rankings)
    )
class SubmitReviewRequest(BaseModel):
    """Request to submit a review decision."""
    model_config = ConfigDict(extra="forbid")

    analysis_id: str = Field(min_length=1)
    decision: Literal["approve", "request_changes", "comment"] | None = None
    verdict: Literal["approve", "request_changes", "comment_only"] | None = None
    summary: str | None = Field(None, max_length=2000)
    comments: list[dict[str, Any]] = Field(default_factory=list)


class SubmitReviewResponse(BaseModel):
    """Response after submitting a review."""
    success: bool
    assignment_id: str | None = None
    comments_created: int = 0
    decision: str


@router.post("/submit", response_model=SubmitReviewResponse)
async def submit_review(
    request: SubmitReviewRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> SubmitReviewResponse:
    """
    Submit a review decision.

    Marks the assignment as completed and records the decision.
    """
    if principal is None:
        raise HTTPException(status_code=401, detail="Missing authentication credentials")

    decision = request.decision
    if request.verdict is not None:
        verdict_decision = "comment" if request.verdict == "comment_only" else request.verdict
        if decision is None:
            decision = verdict_decision
        elif decision != verdict_decision:
            raise HTTPException(status_code=400, detail="decision and verdict must match")

    if decision is None:
        raise HTTPException(status_code=400, detail="decision is required")

    permission_by_decision = {
        "approve": "reviews.approve",
        "request_changes": "reviews.request_changes",
        "comment": "comments.create",
    }
    enforce_permission(principal, permission_by_decision[decision])

    assignments_repo = ReviewAssignmentsRepo()
    comments_repo = ReviewCommentsRepo()
    
    # Find the user's assignment for this analysis
    assignments = assignments_repo.get_assignments_by_reviewer(
        principal.user_id, 
        status_filter=None, 
        limit=100, 
        offset=0
    )
    
    assignment = None
    for a in assignments:
        if a["analysis_id"] == request.analysis_id and a["status"] in ["pending", "in_progress"]:
            assignment = a
            break
    
    if not assignment:
        raise HTTPException(status_code=404, detail="No active assignment found for this analysis")
    
    # Create comments if provided
    comments_created = 0
    for comment_data in request.comments:
        try:
            comment_input = CreateReviewCommentInput(
                analysis_id=request.analysis_id,
                author_id=principal.user_id,
                file_path=comment_data.get("file_path", ""),
                line_start=comment_data.get("line_start", 1),
                content=comment_data.get("content", ""),
                comment_type=comment_data.get("comment_type", "comment"),
                parent_id=comment_data.get("parent_id"),
                line_end=comment_data.get("line_end"),
                code_snippet=comment_data.get("code_snippet"),
                severity=comment_data.get("severity"),
                is_blocking=comment_data.get("is_blocking", False),
            )
            comments_repo.create_comment(comment_input)
            comments_created += 1
        except Exception:
            pass  # Skip invalid comments
    
    # Update assignment status
    now = datetime.now(timezone.utc).isoformat()
    update_data = UpdateReviewAssignmentInput(
        status="completed",
        completed_at=now,
    )
    
    assignments_repo.update_assignment(assignment["id"], update_data)

    analysis = _get_analysis_context(request.analysis_id)
    recipient_ids = _resolve_analysis_owner_ids(analysis)
    assigner_id = assignment.get("assigner_id")
    if isinstance(assigner_id, str) and assigner_id.strip() and assigner_id not in recipient_ids:
        recipient_ids.append(assigner_id)

    if recipient_ids:
        notification_service = NotificationService()
        await notification_service.send_review_completed_notification(
            analysis_id=request.analysis_id,
            reviewer_id=principal.user_id,
            decision=decision,
            summary=request.summary,
            recipient_ids=recipient_ids,
            project_id=(analysis or {}).get("project_id"),
        )

    return SubmitReviewResponse(
        success=True,
        assignment_id=assignment["id"],
        comments_created=comments_created,
        decision=decision,
    )

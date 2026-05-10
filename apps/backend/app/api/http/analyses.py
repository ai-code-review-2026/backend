from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.api.deps import get_analysis_service
from app.api.errors import ApiError
from app.api.middleware.auth import (
    AuthenticatedPrincipal,
    enforce_permission,
    get_current_principal,
    get_rbac_repo,
    normalize_role_code,
    permissions_for_roles,
    require_permission,
)
from app.core.review_intelligence.schemas import StructuredReviewOutput
from app.core.services.analysis_service import (
    AnalysisService,
    CreateAnalysisCommand,
    CreateFindingCommand,
    ServiceError,
    UpdateAnalysisStatusCommand,
)
from app.data.models.analysis import Analysis
from app.data.models.finding import Finding
from app.data.models.parsed_diff import AnalysisFileData, AnalysisHunkData, AnalysisHunkLineData
from app.data.models.tool_run import ToolRun
from app.data.repos.rbac_repo import RBACRepo
from app.data.repos.review_outputs_repo import ReviewOutputsRepo
from app.settings import settings
from app.workers.queue import QueueUnavailableError, enqueue_analysis_job

router = APIRouter(tags=["analyses"])


def _is_placeholder_email(email: str | None) -> bool:
    if not isinstance(email, str):
        return True
    normalized = email.strip().lower()
    if not normalized:
        return True
    return normalized == "unknown@example.local" or normalized.endswith("@clerk.local")


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: Literal["github_actions", "github_webhook", "cli", "manual"] = "github_actions"
    repo: str = Field(max_length=255)
    project_id: str = Field(
        min_length=1,
        max_length=255,
        description="Project the analysis belongs to (required). Must reference an existing project_profiles.id.",
    )
    pr_number: int | None = Field(default=None, ge=1)
    commit_sha: str | None = Field(default=None, min_length=6, max_length=64, pattern=r"^[0-9a-fA-F]+$")
    diff_text: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class AnalyzeAcceptedResponse(BaseModel):
    analysis_id: str
    status: Literal["QUEUED"]
    task_id: str | None = None


class DeleteAnalysisResponse(BaseModel):
    analysis_id: str
    deleted: bool


class FindingResponse(BaseModel):
    id: str
    analysis_id: str
    source: str
    file_path: str | None
    line_start: int | None
    line_end: int | None
    severity: Literal["INFO", "WARN", "BLOCKER"]
    category: str
    message: str
    suggestion: str | None
    confidence: float | None
    issue_type: str | None
    rule_id: str | None
    evidence: dict[str, Any] = Field(default_factory=dict)
    fingerprint: str
    created_at: str


class RagChunkReference(BaseModel):
    """A single knowledge base chunk retrieved during the RAG phase."""

    path: str | None = None
    title: str | None = None
    source: str | None = None
    source_type: str | None = None
    chunk_type: str | None = None
    symbol_name: str | None = None
    score: float | None = None
    tags: list[str] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    analysis_id: str
    project_id: str | None = None
    status: str
    stage: str | None
    progress: int | None
    nb_files_changed: int | None
    additions_total: int | None
    deletions_total: int | None
    repo: str
    provider: str
    pr_number: int | None
    commit_sha: str | None
    source: str
    created_at: str
    updated_at: str
    diff_hash: str
    summary: str | None
    diff_redacted: str | None
    has_secrets: bool
    redaction_stats: dict[str, Any] = Field(default_factory=dict)
    static_stats: dict[str, Any] = Field(default_factory=dict)
    change_type: Literal["bugfix", "feature", "refactor"] | None = None
    change_type_confidence: float | None = Field(default=None, ge=0, le=1)
    change_type_source: Literal["heuristic", "llm"] | None = None
    change_type_signals: dict[str, Any] = Field(default_factory=dict)
    error_code: str | None
    error_message: str | None
    metadata: dict[str, Any] = Field(default_factory=dict)
    findings_count: int = 0
    blocker_count: int = 0
    warn_count: int = 0
    info_count: int = 0
    findings: list[FindingResponse] = Field(default_factory=list)
    security_findings: list[FindingResponse] = Field(default_factory=list)
    static_findings: list[FindingResponse] = Field(default_factory=list)
    tool_runs: list["ToolRunResponse"] = Field(default_factory=list)
    files_changed: list["AnalysisFileResponse"] = Field(default_factory=list)
    review_output: StructuredReviewOutput | None = None
    # RAG context: chunks retrieved from the knowledge base during this analysis
    rag_context: list[RagChunkReference] = Field(default_factory=list)
    rag_context_chunks_count: int = 0
    rag_retrieval_mode: str | None = None


class AnalysisListResponse(BaseModel):
    items: list[AnalysisResponse]
    page: int
    size: int
    total: int
    pages: int


class UpdateStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: Literal["RECEIVED", "QUEUED", "RUNNING", "COMPLETED", "FAILED"]
    error_code: str | None = None
    error_message: str | None = None
    stage: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)


class CreateFindingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    source: str = Field(default="manual")
    file_path: str | None = None
    line_start: int | None = Field(default=None, ge=1)
    line_end: int | None = Field(default=None, ge=1)
    severity: Literal["INFO", "WARN", "BLOCKER"] = "WARN"
    category: str = Field(default="quality", min_length=1, max_length=64)
    message: str = Field(min_length=1)
    suggestion: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    issue_type: str | None = Field(default=None, min_length=1, max_length=64)
    rule_id: str | None = Field(default=None, min_length=1, max_length=255)
    evidence: dict[str, Any] = Field(default_factory=dict)


class ReviewDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    decision: Literal["APPROVE", "WARN", "BLOCK"]
    comment: str | None = Field(default=None, max_length=2000)


class AnalysisHunkLineResponse(BaseModel):
    id: str
    line_type: Literal["context", "add", "remove"]
    content: str
    old_line_no: int | None
    new_line_no: int | None


class AnalysisHunkResponse(BaseModel):
    id: str
    old_start: int
    old_lines: int
    new_start: int
    new_lines: int
    header: str | None
    raw_text: str | None
    lines: list[AnalysisHunkLineResponse] = Field(default_factory=list)


class AnalysisFileResponse(BaseModel):
    id: str
    path_old: str | None
    path_new: str
    change_type: Literal["added", "modified", "deleted", "renamed"]
    is_binary: bool
    additions_count: int
    deletions_count: int
    hunks: list[AnalysisHunkResponse] = Field(default_factory=list)


class ToolRunResponse(BaseModel):
    id: str
    analysis_id: str
    tool_name: str
    status: Literal["SUCCESS", "FAILED", "SKIPPED"]
    started_at: str
    finished_at: str | None
    duration_ms: int
    exit_code: int | None
    findings_count: int
    scanned_files: int
    version: str | None
    warning: str | None
    command: str | None
    workspace_path: str | None
    stdout_snippet: str | None
    stderr_snippet: str | None
    created_at: str


AnalysisResponse.model_rebuild()


class AuthSyncResponse(BaseModel):
    user_id: str
    email: str
    display_name: str | None
    github_login: str | None = None
    canonical_role: str
    roles: list[str]
    permissions: list[str]
    org_id: str | None = None
    org_slug: str | None = None
    org_name: str | None = None
    org_role: str | None = None


class AuthSyncPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    email: str | None = None
    display_name: str | None = None
    github_login: str | None = None
    role: str | None = None
    org_id: str | None = None
    org_slug: str | None = None
    org_name: str | None = None
    org_role: str | None = None


def _raise_api_error(exc: ServiceError) -> None:
    raise ApiError(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
    ) from exc


@router.post("/auth/sync", response_model=AuthSyncResponse)
async def sync_authenticated_user(
    payload: AuthSyncPayload | None = None,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
    repo: RBACRepo = Depends(get_rbac_repo),
) -> AuthSyncResponse:
    if principal is None:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Missing authentication credentials",
        )

    payload_email = None
    if payload is not None and isinstance(payload.email, str) and payload.email.strip():
        payload_email = payload.email.strip().lower()

    payload_github_login = None
    if payload is not None and isinstance(payload.github_login, str) and payload.github_login.strip():
        payload_github_login = payload.github_login.strip().lower()

    email = (principal.email or "").strip().lower()
    if _is_placeholder_email(email):
        if payload_email:
            email = payload_email
        elif not email:
            email = f"{principal.user_id}@clerk.local"
    elif payload_email and payload_email == email:
        email = payload_email

    display_name = principal.display_name
    if payload is not None and isinstance(payload.display_name, str) and payload.display_name.strip():
        display_name = payload.display_name.strip()

    github_login = principal.github_login
    if not github_login:
        github_login = payload_github_login

    role_to_sync = principal.role or "developer"
    if payload is not None and isinstance(payload.role, str) and payload.role.strip():
        role_to_sync = normalize_role_code(payload.role)
    if email in settings.admin_emails:
        role_to_sync = "admin"

    org_id = principal.org_id
    if payload is not None and isinstance(payload.org_id, str) and payload.org_id.strip():
        org_id = payload.org_id.strip()
    org_slug = principal.org_slug
    if payload is not None and isinstance(payload.org_slug, str) and payload.org_slug.strip():
        org_slug = payload.org_slug.strip().lower()
    org_name = principal.org_name
    if payload is not None and isinstance(payload.org_name, str) and payload.org_name.strip():
        org_name = payload.org_name.strip()
    org_role = principal.org_role
    if payload is not None and isinstance(payload.org_role, str) and payload.org_role.strip():
        normalized_org_role = payload.org_role.strip().lower()
        org_role = normalized_org_role.removeprefix("org:") if normalized_org_role.startswith("org:") else normalized_org_role

    await asyncio.to_thread(repo.upsert_clerk_user, principal.user_id, email, display_name, role_to_sync)
    if org_id:
        await asyncio.to_thread(
            repo.upsert_organization_membership,
            principal.user_id,
            org_id,
            org_name or org_id,
            org_slug,
            org_role,
        )

    # Resolve any pending project invitations sent during GitHub import
    try:
        await asyncio.to_thread(
            repo.get_and_accept_pending_invitations,
            email,
            principal.user_id,
        )
    except Exception:
        pass  # Non-critical: don't break login if invitation resolution fails

    synced_user = await asyncio.to_thread(repo.get_user, principal.user_id)
    if synced_user is not None:
        canonical_role = normalize_role_code((synced_user.roles or [role_to_sync])[0])
        permissions = sorted(set(synced_user.permissions or []) | set(permissions_for_roles([canonical_role])))
        return AuthSyncResponse(
            user_id=synced_user.id,
            email=synced_user.email,
            display_name=synced_user.display_name,
            github_login=github_login,
            roles=synced_user.roles,
            canonical_role=canonical_role,
            permissions=permissions,
            org_id=org_id,
            org_slug=org_slug,
            org_name=org_name,
            org_role=org_role,
        )

    principal_roles = principal.roles or [role_to_sync]
    canonical_role = normalize_role_code(role_to_sync)
    return AuthSyncResponse(
        user_id=principal.user_id,
        email=email,
        display_name=display_name,
        github_login=github_login,
        canonical_role=canonical_role,
        roles=principal_roles,
        permissions=sorted(set(principal.permissions or []) | set(permissions_for_roles([canonical_role]))),
        org_id=org_id,
        org_slug=org_slug,
        org_name=org_name,
        org_role=org_role,
    )


def _parse_metadata_query(raw: str | None) -> dict[str, Any]:
    if raw is None or not raw.strip():
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ApiError(
            status_code=400,
            code="INVALID_METADATA",
            message="metadata query must be valid JSON object",
            details={"field": "metadata"},
        ) from exc
    if not isinstance(parsed, dict):
        raise ApiError(
            status_code=400,
            code="INVALID_METADATA",
            message="metadata query must be a JSON object",
            details={"field": "metadata"},
        )
    return parsed


def _has_owner_identity(metadata: dict[str, Any]) -> bool:
    identity_candidates = [
        metadata.get("author_id"),
        metadata.get("user_id"),
        metadata.get("actor_id"),
        metadata.get("clerk_user_id"),
        metadata.get("github_actor_id"),
        metadata.get("author_email"),
        metadata.get("user_email"),
        metadata.get("actor_email"),
    ]
    return any(isinstance(candidate, str) and candidate.strip() for candidate in identity_candidates)


def _is_owned_by_principal(metadata: dict[str, Any], principal: AuthenticatedPrincipal) -> bool:
    id_candidates = [
        metadata.get("author_id"),
        metadata.get("user_id"),
        metadata.get("actor_id"),
        metadata.get("clerk_user_id"),
        metadata.get("github_actor_id"),
    ]
    for candidate in id_candidates:
        if isinstance(candidate, str) and candidate.strip() == principal.user_id:
            return True

    if _is_placeholder_email(principal.email):
        return False

    principal_email = principal.email.strip().lower()
    email_candidates = [metadata.get("author_email"), metadata.get("user_email"), metadata.get("actor_email")]
    for candidate in email_candidates:
        if isinstance(candidate, str) and candidate.strip().lower() == principal_email:
            return True
    return False


def _is_limited_to_own_analyses(principal: AuthenticatedPrincipal) -> bool:
    normalized_roles = {role.strip().lower() for role in principal.roles}
    return "admin" not in normalized_roles and "tech_lead" not in normalized_roles


def _to_finding_response(model: Finding) -> FindingResponse:
    return FindingResponse(
        id=model.id,
        analysis_id=model.analysis_id,
        source=model.source,
        file_path=model.file_path,
        line_start=model.line_start,
        line_end=model.line_end,
        severity=model.severity,
        category=model.category,
        message=model.message,
        suggestion=model.suggestion,
        confidence=model.confidence,
        issue_type=model.issue_type,
        rule_id=model.rule_id,
        evidence=model.evidence,
        fingerprint=model.fingerprint,
        created_at=model.created_at,
    )


def _to_hunk_line_response(model: AnalysisHunkLineData) -> AnalysisHunkLineResponse:
    return AnalysisHunkLineResponse(
        id=model.id,
        line_type=model.line_type,
        content=model.content,
        old_line_no=model.old_line_no,
        new_line_no=model.new_line_no,
    )


def _to_hunk_response(model: AnalysisHunkData) -> AnalysisHunkResponse:
    return AnalysisHunkResponse(
        id=model.id,
        old_start=model.old_start,
        old_lines=model.old_lines,
        new_start=model.new_start,
        new_lines=model.new_lines,
        header=model.header,
        raw_text=model.raw_text,
        lines=[_to_hunk_line_response(line) for line in model.lines],
    )


def _to_file_response(model: AnalysisFileData) -> AnalysisFileResponse:
    return AnalysisFileResponse(
        id=model.id,
        path_old=model.path_old,
        path_new=model.path_new,
        change_type=model.change_type,
        is_binary=model.is_binary,
        additions_count=model.additions_count,
        deletions_count=model.deletions_count,
        hunks=[_to_hunk_response(hunk) for hunk in model.hunks],
    )


def _to_tool_run_response(model: ToolRun) -> ToolRunResponse:
    return ToolRunResponse(
        id=model.id,
        analysis_id=model.analysis_id,
        tool_name=model.tool_name,
        status=model.status,
        started_at=model.started_at,
        finished_at=model.finished_at,
        duration_ms=model.duration_ms,
        exit_code=model.exit_code,
        findings_count=model.findings_count,
        scanned_files=model.scanned_files,
        version=model.version,
        warning=model.warning,
        command=model.command,
        workspace_path=model.workspace_path,
        stdout_snippet=model.stdout_snippet,
        stderr_snippet=model.stderr_snippet,
        created_at=model.created_at,
    )


def _extract_rag_context(metadata: dict[str, Any]) -> tuple[list[RagChunkReference], int, str | None]:
    """Extract RAG chunk references from the pipeline metadata stored by the worker."""
    kb_retrieval: dict[str, Any] = (metadata.get("pipeline") or {}).get("kb_retrieval") or {}
    raw_refs: list[Any] = kb_retrieval.get("references") or []
    chunks_count: int = int(kb_retrieval.get("context_chunks") or 0)
    retrieval_mode: str | None = kb_retrieval.get("mode") or None
    rag_chunks: list[RagChunkReference] = []
    for ref in raw_refs:
        if not isinstance(ref, dict):
            continue
        try:
            rag_chunks.append(
                RagChunkReference(
                    path=ref.get("path"),
                    title=ref.get("title"),
                    source=ref.get("source"),
                    source_type=ref.get("source_type"),
                    chunk_type=ref.get("chunk_type"),
                    symbol_name=ref.get("symbol_name"),
                    score=ref.get("score"),
                    tags=list(ref.get("tags") or []),
                )
            )
        except Exception:
            continue
    return rag_chunks, chunks_count, retrieval_mode


def _to_analysis_response(
    model: Analysis,
    findings: list[Finding] | None = None,
    files_changed: list[AnalysisFileData] | None = None,
    tool_runs: list[ToolRun] | None = None,
    review_output: StructuredReviewOutput | None = None,
) -> AnalysisResponse:
    findings_response = [] if findings is None else [_to_finding_response(item) for item in findings]
    security_findings = [item for item in findings_response if item.category == "security"]
    static_findings = [item for item in findings_response if item.source.startswith("STATIC_")]
    blocker_count = model.blocker_count
    warn_count = model.warn_count
    info_count = model.info_count
    findings_count = model.findings_count
    if findings is not None:
        blocker_count = sum(1 for item in findings_response if item.severity == "BLOCKER")
        warn_count = sum(1 for item in findings_response if item.severity == "WARN")
        info_count = sum(1 for item in findings_response if item.severity == "INFO")
        findings_count = len(findings_response)
    rag_chunks, rag_chunks_count, rag_mode = _extract_rag_context(model.metadata or {})
    return AnalysisResponse(
        analysis_id=model.id,
        project_id=model.project_id,
        status=model.status,
        stage=model.stage,
        progress=model.progress,
        nb_files_changed=model.nb_files_changed,
        additions_total=model.additions_total,
        deletions_total=model.deletions_total,
        repo=model.repo,
        provider=model.provider,
        pr_number=model.pr_number,
        commit_sha=model.commit_sha,
        source=model.source,
        created_at=model.created_at,
        updated_at=model.updated_at,
        diff_hash=model.diff_hash,
        summary=model.summary,
        diff_redacted=model.diff_redacted,
        has_secrets=model.has_secrets,
        redaction_stats=model.redaction_stats,
        static_stats=model.static_stats,
        change_type=model.change_type,
        change_type_confidence=model.change_type_confidence,
        change_type_source=model.change_type_source,
        change_type_signals=model.change_type_signals,
        error_code=model.error_code,
        error_message=model.error_message,
        metadata=model.metadata,
        findings_count=findings_count,
        blocker_count=blocker_count,
        warn_count=warn_count,
        info_count=info_count,
        findings=findings_response,
        security_findings=security_findings,
        static_findings=static_findings,
        tool_runs=[] if tool_runs is None else [_to_tool_run_response(item) for item in tool_runs],
        files_changed=[] if files_changed is None else [_to_file_response(item) for item in files_changed],
        review_output=review_output,
        rag_context=rag_chunks,
        rag_context_chunks_count=rag_chunks_count,
        rag_retrieval_mode=rag_mode,
    )


async def _load_structured_review_output(analysis_id: str) -> StructuredReviewOutput | None:
    stored = await asyncio.to_thread(ReviewOutputsRepo().get_by_analysis_id, analysis_id)
    if stored is None:
        return None
    try:
        return StructuredReviewOutput.model_validate(stored.payload)
    except ValidationError:
        return None


@router.post("/analyses", response_model=AnalyzeAcceptedResponse, status_code=202)
async def create_analysis(
    payload: AnalyzeRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.create")),
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalyzeAcceptedResponse:
    created: Analysis | None = None
    try:
        created = await service.create_analysis(
            CreateAnalysisCommand(
                source=payload.source,
                repo=payload.repo,
                pr_number=payload.pr_number,
                commit_sha=payload.commit_sha,
                diff_text=payload.diff_text,
                metadata=payload.metadata,
                project_id=payload.project_id,
            )
        )
        queued = await service.update_analysis_status(
            UpdateAnalysisStatusCommand(
                analysis_id=created.id,
                status="QUEUED",
                stage="QUEUED",
                progress=10,
                metadata_updates={"pipeline": {"queued": True}},
            )
        )
        enqueued = enqueue_analysis_job(created.id)
    except QueueUnavailableError as exc:
        if created is not None:
            try:
                await service.update_analysis_status(
                    UpdateAnalysisStatusCommand(
                        analysis_id=created.id,
                        status="FAILED",
                        stage="FAILED",
                        progress=100,
                        error_code="QUEUE_DOWN",
                        error_message="Unable to enqueue analysis job",
                        metadata_updates={"pipeline": {"queued": False}},
                    )
                )
            except ServiceError:
                pass
        raise ApiError(
            status_code=503,
            code="QUEUE_UNAVAILABLE",
            message="Queue unavailable while enqueuing analysis",
            details={"analysis_id": created.id if created is not None else None},
        ) from exc
    except ServiceError as exc:
        _raise_api_error(exc)

    return AnalyzeAcceptedResponse(analysis_id=queued.id, status="QUEUED", task_id=enqueued.task_id)


@router.post("/analyses/stream", response_model=AnalyzeAcceptedResponse, status_code=202)
async def create_analysis_stream(
    request: Request,
    source: Literal["github_actions", "github_webhook", "cli", "manual"] = Query(default="github_actions"),
    repo: str = Query(max_length=255),
    project_id: str = Query(min_length=1, max_length=255),
    pr_number: int | None = Query(default=None, ge=1),
    commit_sha: str | None = Query(default=None, min_length=6, max_length=64, pattern=r"^[0-9a-fA-F]+$"),
    metadata: str | None = Query(default=None),
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.create")),
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalyzeAcceptedResponse:
    created: Analysis | None = None
    try:
        created = await service.create_analysis_from_stream(
            source=source,
            repo=repo,
            pr_number=pr_number,
            commit_sha=commit_sha,
            metadata=_parse_metadata_query(metadata),
            diff_stream=request.stream(),
            project_id=project_id,
        )
        queued = await service.update_analysis_status(
            UpdateAnalysisStatusCommand(
                analysis_id=created.id,
                status="QUEUED",
                stage="QUEUED",
                progress=10,
                metadata_updates={"pipeline": {"queued": True}},
            )
        )
        enqueued = enqueue_analysis_job(created.id)
    except QueueUnavailableError as exc:
        if created is not None:
            try:
                await service.update_analysis_status(
                    UpdateAnalysisStatusCommand(
                        analysis_id=created.id,
                        status="FAILED",
                        stage="FAILED",
                        progress=100,
                        error_code="QUEUE_DOWN",
                        error_message="Unable to enqueue analysis job",
                        metadata_updates={"pipeline": {"queued": False}},
                    )
                )
            except ServiceError:
                pass
        raise ApiError(
            status_code=503,
            code="QUEUE_UNAVAILABLE",
            message="Queue unavailable while enqueuing analysis",
            details={"analysis_id": created.id if created is not None else None},
        ) from exc
    except ServiceError as exc:
        _raise_api_error(exc)

    return AnalyzeAcceptedResponse(analysis_id=queued.id, status="QUEUED", task_id=enqueued.task_id)


@router.get("/analyses/{analysis_id}", response_model=AnalysisResponse)
async def get_analysis(
    analysis_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalysisResponse:
    try:
        # Run all queries in parallel for better performance
        analysis, findings, files_changed, tool_runs, review_output = await asyncio.gather(
            service.get_analysis(analysis_id),
            service.list_findings(analysis_id),
            service.list_files_with_hunks(analysis_id),
            service.list_tool_runs(analysis_id),
            _load_structured_review_output(analysis_id),
        )
    except ServiceError as exc:
        _raise_api_error(exc)

    return _to_analysis_response(
        analysis,
        findings=findings,
        files_changed=files_changed,
        tool_runs=tool_runs,
        review_output=review_output,
    )


@router.delete("/analyses/{analysis_id}", response_model=DeleteAnalysisResponse)
async def delete_analysis(
    analysis_id: str,
    principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    service: AnalysisService = Depends(get_analysis_service),
) -> DeleteAnalysisResponse:
    if principal is None:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Missing authentication credentials",
        )

    try:
        analysis = await service.get_analysis(analysis_id)
        if _is_limited_to_own_analyses(principal):
            metadata = analysis.metadata
            if _has_owner_identity(metadata) and not _is_owned_by_principal(metadata, principal):
                raise ApiError(
                    status_code=404,
                    code="ANALYSIS_NOT_FOUND",
                    message="analysis_id not found",
                    details={"analysis_id": analysis_id},
                )
        await service.delete_analysis(analysis_id)
    except ServiceError as exc:
        _raise_api_error(exc)

    return DeleteAnalysisResponse(analysis_id=analysis_id, deleted=True)


@router.get("/analyses/{analysis_id}/review", response_model=StructuredReviewOutput)
async def get_analysis_review_output(
    analysis_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    service: AnalysisService = Depends(get_analysis_service),
) -> StructuredReviewOutput:
    try:
        await service.get_analysis(analysis_id)
    except ServiceError as exc:
        _raise_api_error(exc)

    review_output = await _load_structured_review_output(analysis_id)
    if review_output is None:
        raise ApiError(
            status_code=404,
            code="REVIEW_OUTPUT_NOT_FOUND",
            message="Structured review output not available for this analysis",
            details={"analysis_id": analysis_id},
        )
    return review_output


@router.get("/analyses", response_model=AnalysisListResponse)
async def list_analyses(
    page: int = Query(default=1, ge=1),
    size: int = Query(default=settings.API_DEFAULT_PAGE_SIZE, ge=1, le=settings.API_MAX_PAGE_SIZE),
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalysisListResponse:
    try:
        page_result = await service.list_analyses(page=page, size=size)
    except ServiceError as exc:
        _raise_api_error(exc)

    return AnalysisListResponse(
        items=[_to_analysis_response(item, findings=None, files_changed=None) for item in page_result.items],
        page=page_result.page,
        size=page_result.size,
        total=page_result.total,
        pages=page_result.pages,
    )


@router.post("/analyses/{analysis_id}/status", response_model=AnalysisResponse)
async def update_analysis_status(
    analysis_id: str,
    payload: UpdateStatusRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalysisResponse:
    try:
        updated = await service.update_analysis_status(
            UpdateAnalysisStatusCommand(
                analysis_id=analysis_id,
                status=payload.status,
                error_code=payload.error_code,
                error_message=payload.error_message,
                stage=payload.stage,
                progress=payload.progress,
            )
        )
        findings = await service.list_findings(analysis_id)
        files_changed = await service.list_files_with_hunks(analysis_id)
        tool_runs = await service.list_tool_runs(analysis_id)
    except ServiceError as exc:
        _raise_api_error(exc)

    return _to_analysis_response(updated, findings=findings, files_changed=files_changed, tool_runs=tool_runs)


@router.post("/analyses/{analysis_id}/decision", response_model=AnalysisResponse)
async def set_analysis_review_decision(
    analysis_id: str,
    payload: ReviewDecisionRequest,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
    service: AnalysisService = Depends(get_analysis_service),
) -> AnalysisResponse:
    if principal is None:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Missing authentication credentials",
        )

    decision_permissions = {
        "APPROVE": "reviews.approve",
        "WARN": "reviews.warn",
        "BLOCK": "reviews.block",
    }
    enforce_permission(principal, decision_permissions[payload.decision])

    decided_at = datetime.now(tz=timezone.utc).isoformat().replace("+00:00", "Z")

    try:
        current = await service.get_analysis(analysis_id)
        updated = await service.update_analysis_status(
            UpdateAnalysisStatusCommand(
                analysis_id=analysis_id,
                status=current.status,
                stage=current.stage,
                progress=current.progress,
                metadata_updates={
                    "review_decision": {
                        "value": payload.decision,
                        "comment": payload.comment,
                        "decided_at": decided_at,
                        "decided_by": principal.user_id,
                        "decider_roles": principal.roles,
                    }
                },
            )
        )
        findings = await service.list_findings(analysis_id)
        files_changed = await service.list_files_with_hunks(analysis_id)
        tool_runs = await service.list_tool_runs(analysis_id)
    except ServiceError as exc:
        _raise_api_error(exc)

    return _to_analysis_response(updated, findings=findings, files_changed=files_changed, tool_runs=tool_runs)


@router.post("/analyses/{analysis_id}/findings", response_model=FindingResponse, status_code=201)
async def create_analysis_finding(
    analysis_id: str,
    payload: CreateFindingRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
    service: AnalysisService = Depends(get_analysis_service),
) -> FindingResponse:
    try:
        finding = await service.create_finding(
            CreateFindingCommand(
                analysis_id=analysis_id,
                source=payload.source,
                file_path=payload.file_path,
                line_start=payload.line_start,
                line_end=payload.line_end,
                severity=payload.severity,
                category=payload.category,
                message=payload.message,
                suggestion=payload.suggestion,
                confidence=payload.confidence,
                issue_type=payload.issue_type,
                rule_id=payload.rule_id,
                evidence=payload.evidence,
            )
        )
    except ServiceError as exc:
        _raise_api_error(exc)

    return _to_finding_response(finding)


class PublishToGitHubRequest(BaseModel):
    """Request to publish analysis results to GitHub."""
    force: bool = Field(default=False, description="Force republish even if already published")


class PublishToGitHubResponse(BaseModel):
    """Response from GitHub publication attempt."""
    status: Literal["published", "already_published", "skipped", "disabled", "failed"]
    message: str
    published_at: str | None = None
    repo: str | None = None
    pr_number: int | None = None
    findings_count: int | None = None
    comment_id: str | None = None
    error: str | None = None


@router.post("/analyses/{analysis_id}/publish-github", response_model=PublishToGitHubResponse, status_code=200)
async def publish_analysis_to_github(
    analysis_id: str,
    payload: PublishToGitHubRequest = PublishToGitHubRequest(),
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    service: AnalysisService = Depends(get_analysis_service),
) -> PublishToGitHubResponse:
    """
    Publish analysis results as a GitHub PR comment.
    
    This endpoint manually triggers publication to GitHub for a completed analysis.
    Normally, publication happens automatically after analysis completion if
    GITHUB_PUBLISH_ON_ANALYSIS_COMPLETE is enabled.
    
    Requires:
    - Analysis must be in COMPLETED status
    - Analysis must have a pr_number
    - GITHUB_PUBLISH_ENABLED must be true
    - GitHub App credentials must be configured
    
    Returns:
    - status: published, already_published, skipped, disabled, or failed
    - Details about the publication including GitHub PR information
    """
    from app.services.github_publisher import GitHubPublisher
    
    try:
        # Verify analysis exists
        try:
            analysis = await service.get_analysis(analysis_id)
        except ServiceError as exc:
            if exc.code == "not_found":
                raise ApiError(status_code=404, code="ANALYSIS_NOT_FOUND", message=f"Analysis {analysis_id} not found")
            raise

        # Publish to GitHub
        publisher = GitHubPublisher()
        result = await publisher.publish_analysis_to_github(
            analysis_id=analysis_id,
            force=payload.force,
        )

        return PublishToGitHubResponse(
            status=result["status"],
            message=result.get("message", ""),
            published_at=result.get("published_at"),
            repo=result.get("repo"),
            pr_number=result.get("pr_number"),
            findings_count=result.get("findings_count"),
            comment_id=result.get("comment_id"),
        )

    except ValueError as exc:
        raise ApiError(status_code=400, code="INVALID_REQUEST", message=str(exc))
    except RuntimeError as exc:
        raise ApiError(status_code=500, code="GITHUB_PUBLISH_FAILED", message=str(exc))
    except Exception as exc:
        raise ApiError(
            status_code=500,
            code="INTERNAL_ERROR",
            message=f"Failed to publish analysis to GitHub: {exc}",
        )

from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, Path
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.deps import get_analysis_service
from app.api.errors import ApiError
from app.api.middleware.auth import AuthenticatedPrincipal, get_rbac_repo, require_auth
from app.core.services.analysis_service import (
    AnalysisService,
    CreateAnalysisCommand,
    ServiceError,
    UpdateAnalysisStatusCommand,
)
from app.data.database import get_engine
from app.data.models.analysis import Analysis
from app.settings import settings
from app.workers.queue import QueueUnavailableError, enqueue_analysis_job

router = APIRouter(prefix="/api/v1/reviews", tags=["vscode-reviews"])

_REPO_PATTERN = re.compile(r"^[^/\s]+/[^/\s]+$")
_HTTP_REPO_URL_PATTERN = re.compile(r"^https?://[^/]+/(?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$")
_SSH_REPO_URL_PATTERN = re.compile(r"^(?:ssh://)?git@[^:/]+[:/](?P<owner>[^/]+)/(?P<repo>[^/]+?)(?:\.git)?/?$")
_USER_EXTENSION_TOKEN_PREFIX = "dvt_"
_USER_EXTENSION_TOKEN_PREFIX_LENGTH = 14
_USER_EXTENSION_TOKEN_ID_PREFIX = "vst_"


class VSCodeReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repositoryUrl: str | None = Field(default=None, max_length=1024)
    repository: str | None = Field(default=None, max_length=255, description="owner/repo format")
    branch: str = Field(min_length=1, max_length=255)
    commitSha: str = Field(min_length=6, max_length=64, pattern=r"^[0-9a-fA-F]+$")
    projectId: str | None = Field(default=None, max_length=255)
    changedFiles: list[str] = Field(default_factory=list)
    diff: str | None = None
    source: Literal["vscode-extension", "vscode-extension-manual-analysis"] = "vscode-extension"
    metadata: dict[str, Any] = Field(default_factory=dict)


class VSCodeReviewAcceptedResponse(BaseModel):
    analysis_id: str
    status: Literal["QUEUED"]
    task_id: str | None = None
    project_id: str
    repo: str
    branch: str
    commit_sha: str


class VSCodeUserTokenCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    label: str | None = Field(default=None, max_length=120)


class VSCodeUserTokenInfo(BaseModel):
    id: str
    prefix: str
    label: str | None = None
    created_at: str | None = None
    last_used_at: str | None = None
    revoked_at: str | None = None


class VSCodeUserTokenListResponse(BaseModel):
    items: list[VSCodeUserTokenInfo]


class VSCodeUserTokenCreateResponse(BaseModel):
    token: str
    token_info: VSCodeUserTokenInfo


class VSCodeUserTokenRevokeResponse(BaseModel):
    revoked: bool
    id: str


class VSCodeAuthContext(BaseModel):
    auth_mode: Literal["none", "shared_token", "user_token"] = "none"
    user_id: str | None = None
    user_email: str | None = None
    token_id: str | None = None


def _as_iso_datetime(value: Any) -> str | None:
    if isinstance(value, datetime):
        candidate = value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        return candidate.isoformat().replace("+00:00", "Z")
    if value is None:
        return None
    text_value = str(value).strip()
    return text_value or None


def _hash_user_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _require_principal_or_raise(principal: AuthenticatedPrincipal | None) -> AuthenticatedPrincipal:
    if principal is None:
        raise ApiError(
            status_code=401,
            code="UNAUTHORIZED",
            message="Authentication required",
        )
    return principal


def _ensure_user_token_management_enabled() -> None:
    if settings.CLERK_AUTH_ENABLED or settings.RBAC_ENFORCEMENT_ENABLED:
        return
    raise ApiError(
        status_code=503,
        code="VSCODE_USER_TOKEN_AUTH_DISABLED",
        message="Enable CLERK_AUTH_ENABLED (recommended) or RBAC_ENFORCEMENT_ENABLED to manage personal VS Code tokens.",
    )


def _raise_api_error(exc: ServiceError) -> None:
    raise ApiError(
        status_code=exc.status_code,
        code=exc.code,
        message=exc.message,
        details=exc.details,
    ) from exc


def _normalize_repo(payload: VSCodeReviewRequest) -> str:
    if payload.repository and _REPO_PATTERN.match(payload.repository.strip()):
        return payload.repository.strip().lower()

    if payload.repositoryUrl:
        raw = payload.repositoryUrl.strip()
        http_match = _HTTP_REPO_URL_PATTERN.match(raw)
        if http_match:
            return f"{http_match.group('owner')}/{http_match.group('repo')}".lower()
        ssh_match = _SSH_REPO_URL_PATTERN.match(raw)
        if ssh_match:
            return f"{ssh_match.group('owner')}/{ssh_match.group('repo')}".lower()

    raise ApiError(
        status_code=422,
        code="INVALID_REPOSITORY",
        message="repository or repositoryUrl must resolve to owner/repo",
        details={"repository": payload.repository, "repositoryUrl": payload.repositoryUrl},
    )


def _resolve_project_id(explicit_project_id: str | None, repo_id: str) -> str:
    engine = get_engine()
    with engine.connect() as conn:
        if explicit_project_id and explicit_project_id.strip():
            normalized = explicit_project_id.strip()
            row = conn.execute(
                text("SELECT id FROM project_profiles WHERE id = :project_id LIMIT 1"),
                {"project_id": normalized},
            ).mappings().first()
            if row and row.get("id"):
                return str(row["id"])
            raise ApiError(
                status_code=404,
                code="PROJECT_NOT_FOUND",
                message=f"project_id '{normalized}' does not reference an existing project",
                details={"project_id": normalized},
            )

        row = conn.execute(
            text("SELECT id FROM project_profiles WHERE repo_id = :repo_id LIMIT 1"),
            {"repo_id": repo_id},
        ).mappings().first()
        if row and row.get("id"):
            return str(row["id"])

    raise ApiError(
        status_code=404,
        code="PROJECT_NOT_FOUND_FOR_REPO",
        message=f"No project registered for repository '{repo_id}'. Import or create the project first.",
        details={"repo_id": repo_id},
    )


def _authorize_shared_vscode_request(x_devora_token: str | None) -> VSCodeAuthContext:
    configured_token = (settings.VSCODE_EXTENSION_API_TOKEN or "").strip()
    if configured_token:
        provided = (x_devora_token or "").strip()
        if not provided or not hmac.compare_digest(provided, configured_token):
            raise ApiError(
                status_code=401,
                code="INVALID_VSCODE_TOKEN",
                message="Missing or invalid X-Devora-Token",
            )
        return VSCodeAuthContext(auth_mode="shared_token")

    if settings.RBAC_ENFORCEMENT_ENABLED or settings.CLERK_AUTH_ENABLED:
        raise ApiError(
            status_code=503,
            code="VSCODE_TOKEN_NOT_CONFIGURED",
            message="Set VSCODE_EXTENSION_API_TOKEN to enable VS Code extension ingestion in enforced auth mode",
        )
    return VSCodeAuthContext(auth_mode="none")


def _resolve_user_token_auth_context(x_devora_user_token: str) -> VSCodeAuthContext:
    token_value = x_devora_user_token.strip()
    if not token_value:
        raise ApiError(
            status_code=401,
            code="INVALID_VSCODE_USER_TOKEN",
            message="Missing or invalid X-Devora-User-Token",
        )

    engine = get_engine()
    token_hash = _hash_user_token(token_value)
    try:
        with engine.begin() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT
                        t.id AS token_id,
                        t.user_id AS user_id,
                        u.email AS user_email
                    FROM user_extension_tokens t
                    JOIN users u ON u.id = t.user_id
                    WHERE t.token_hash = :token_hash
                      AND t.revoked_at IS NULL
                      AND (t.expires_at IS NULL OR t.expires_at > NOW())
                      AND u.is_active = TRUE
                    LIMIT 1
                    """
                ),
                {"token_hash": token_hash},
            ).mappings().first()

            if row is None:
                raise ApiError(
                    status_code=401,
                    code="INVALID_VSCODE_USER_TOKEN",
                    message="Missing or invalid X-Devora-User-Token",
                )

            conn.execute(
                text("UPDATE user_extension_tokens SET last_used_at = NOW() WHERE id = :token_id"),
                {"token_id": str(row["token_id"])},
            )
    except SQLAlchemyError as exc:
        raise ApiError(
            status_code=503,
            code="VSCODE_USER_TOKEN_STORAGE_UNAVAILABLE",
            message="User token store is unavailable. Run database migrations and retry.",
        ) from exc

    return VSCodeAuthContext(
        auth_mode="user_token",
        user_id=str(row["user_id"]),
        user_email=str(row["user_email"]) if row.get("user_email") else None,
        token_id=str(row["token_id"]),
    )


def _authorize_vscode_request(
    x_devora_user_token: str | None,
    x_devora_token: str | None,
) -> VSCodeAuthContext:
    if x_devora_user_token and x_devora_user_token.strip():
        return _resolve_user_token_auth_context(x_devora_user_token)
    return _authorize_shared_vscode_request(x_devora_token)


def _enforce_user_project_access(user_id: str, project_id: str) -> None:
    if not (settings.RBAC_ENFORCEMENT_ENABLED or settings.CLERK_AUTH_ENABLED):
        return

    repo = get_rbac_repo()
    try:
        allowed = repo.check_user_has_permission_for_project(user_id, project_id, "analyses.create")
    except Exception as exc:
        raise ApiError(
            status_code=503,
            code="RBAC_UNAVAILABLE",
            message="Unable to validate project access for VS Code user token",
        ) from exc

    if not allowed:
        raise ApiError(
            status_code=403,
            code="PROJECT_ACCESS_DENIED",
            message="User token does not grant analyses.create permission for this project",
            details={"project_id": project_id, "user_id": user_id},
        )


def _list_user_vscode_tokens(user_id: str) -> list[VSCodeUserTokenInfo]:
    engine = get_engine()
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT id, token_prefix, label, created_at, last_used_at, revoked_at
                    FROM user_extension_tokens
                    WHERE user_id = :user_id
                    ORDER BY created_at DESC
                    """
                ),
                {"user_id": user_id},
            ).mappings().all()
    except SQLAlchemyError as exc:
        raise ApiError(
            status_code=503,
            code="VSCODE_USER_TOKEN_STORAGE_UNAVAILABLE",
            message="User token store is unavailable. Run database migrations and retry.",
        ) from exc

    return [
        VSCodeUserTokenInfo(
            id=str(row["id"]),
            prefix=str(row["token_prefix"]),
            label=str(row["label"]) if row.get("label") else None,
            created_at=_as_iso_datetime(row.get("created_at")),
            last_used_at=_as_iso_datetime(row.get("last_used_at")),
            revoked_at=_as_iso_datetime(row.get("revoked_at")),
        )
        for row in rows
    ]


def _create_user_vscode_token(principal: AuthenticatedPrincipal, label: str | None) -> VSCodeUserTokenCreateResponse:
    token_value = f"{_USER_EXTENSION_TOKEN_PREFIX}{secrets.token_urlsafe(36)}"
    token_hash = _hash_user_token(token_value)
    token_id = f"{_USER_EXTENSION_TOKEN_ID_PREFIX}{uuid.uuid4().hex}"
    token_prefix = token_value[:_USER_EXTENSION_TOKEN_PREFIX_LENGTH]

    engine = get_engine()
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO user_extension_tokens (
                        id,
                        user_id,
                        token_hash,
                        token_prefix,
                        label,
                        created_by
                    ) VALUES (
                        :id,
                        :user_id,
                        :token_hash,
                        :token_prefix,
                        :label,
                        :created_by
                    )
                    """
                ),
                {
                    "id": token_id,
                    "user_id": principal.user_id,
                    "token_hash": token_hash,
                    "token_prefix": token_prefix,
                    "label": label.strip() if isinstance(label, str) and label.strip() else None,
                    "created_by": principal.user_id,
                },
            )
    except SQLAlchemyError as exc:
        raise ApiError(
            status_code=503,
            code="VSCODE_USER_TOKEN_STORAGE_UNAVAILABLE",
            message="User token store is unavailable. Run database migrations and retry.",
        ) from exc

    token_info = VSCodeUserTokenInfo(
        id=token_id,
        prefix=token_prefix,
        label=label.strip() if isinstance(label, str) and label.strip() else None,
        created_at=_as_iso_datetime(datetime.now(timezone.utc)),
        last_used_at=None,
        revoked_at=None,
    )
    return VSCodeUserTokenCreateResponse(token=token_value, token_info=token_info)


def _revoke_user_vscode_token(user_id: str, token_id: str) -> VSCodeUserTokenRevokeResponse:
    engine = get_engine()
    try:
        with engine.begin() as conn:
            result = conn.execute(
                text(
                    """
                    UPDATE user_extension_tokens
                    SET revoked_at = NOW()
                    WHERE id = :token_id
                      AND user_id = :user_id
                      AND revoked_at IS NULL
                    """
                ),
                {"token_id": token_id, "user_id": user_id},
            )
            if result.rowcount == 0:
                existing = conn.execute(
                    text(
                        """
                        SELECT id
                        FROM user_extension_tokens
                        WHERE id = :token_id
                          AND user_id = :user_id
                        LIMIT 1
                        """
                    ),
                    {"token_id": token_id, "user_id": user_id},
                ).mappings().first()
                if existing is None:
                    raise ApiError(
                        status_code=404,
                        code="VSCODE_USER_TOKEN_NOT_FOUND",
                        message="VS Code user token not found",
                    )
    except SQLAlchemyError as exc:
        raise ApiError(
            status_code=503,
            code="VSCODE_USER_TOKEN_STORAGE_UNAVAILABLE",
            message="User token store is unavailable. Run database migrations and retry.",
        ) from exc

    return VSCodeUserTokenRevokeResponse(revoked=True, id=token_id)


@router.get("/vscode-tokens", response_model=VSCodeUserTokenListResponse)
async def list_vscode_user_tokens(
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
) -> VSCodeUserTokenListResponse:
    _ensure_user_token_management_enabled()
    actor = _require_principal_or_raise(principal)
    items = _list_user_vscode_tokens(actor.user_id)
    return VSCodeUserTokenListResponse(items=items)


@router.post("/vscode-tokens", response_model=VSCodeUserTokenCreateResponse, status_code=201)
async def create_vscode_user_token(
    payload: VSCodeUserTokenCreateRequest,
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
) -> VSCodeUserTokenCreateResponse:
    _ensure_user_token_management_enabled()
    actor = _require_principal_or_raise(principal)
    return _create_user_vscode_token(actor, payload.label)


@router.delete("/vscode-tokens/{token_id}", response_model=VSCodeUserTokenRevokeResponse)
async def revoke_vscode_user_token(
    token_id: str = Path(min_length=1, max_length=255),
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
) -> VSCodeUserTokenRevokeResponse:
    _ensure_user_token_management_enabled()
    actor = _require_principal_or_raise(principal)
    return _revoke_user_vscode_token(actor.user_id, token_id)


@router.post("/from-vscode", response_model=VSCodeReviewAcceptedResponse, status_code=202)
async def trigger_review_from_vscode(
    payload: VSCodeReviewRequest,
    x_devora_user_token: str | None = Header(default=None, alias="X-Devora-User-Token"),
    x_devora_token: str | None = Header(default=None, alias="X-Devora-Token"),
    service: AnalysisService = Depends(get_analysis_service),
) -> VSCodeReviewAcceptedResponse:
    auth_context = _authorize_vscode_request(x_devora_user_token, x_devora_token)

    repo = _normalize_repo(payload)
    project_id = _resolve_project_id(payload.projectId, repo)
    if auth_context.user_id:
        _enforce_user_project_access(auth_context.user_id, project_id)
    diff_text = (payload.diff or "").strip()
    if not diff_text:
        raise ApiError(
            status_code=422,
            code="DIFF_REQUIRED",
            message="diff is required for VS Code-triggered analyses",
        )

    metadata: dict[str, Any] = dict(payload.metadata or {})
    if auth_context.user_id:
        metadata["author_id"] = auth_context.user_id
        metadata["user_id"] = auth_context.user_id
        metadata["actor_id"] = auth_context.user_id
        metadata["clerk_user_id"] = auth_context.user_id
    if auth_context.user_email:
        metadata["author_email"] = auth_context.user_email
        metadata["user_email"] = auth_context.user_email
        metadata["actor_email"] = auth_context.user_email
    metadata["vscode"] = {
        "source": payload.source,
        "branch": payload.branch,
        "changed_files": payload.changedFiles,
        "repository_url": payload.repositoryUrl,
        "auth_mode": auth_context.auth_mode,
        "token_id": auth_context.token_id,
    }

    created: Analysis | None = None
    try:
        created = await service.create_analysis(
            CreateAnalysisCommand(
                source="manual",
                repo=repo,
                pr_number=None,
                commit_sha=payload.commitSha.lower(),
                diff_text=diff_text,
                metadata=metadata,
                project_id=project_id,
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

    return VSCodeReviewAcceptedResponse(
        analysis_id=queued.id,
        status="QUEUED",
        task_id=enqueued.task_id,
        project_id=project_id,
        repo=repo,
        branch=payload.branch,
        commit_sha=payload.commitSha.lower(),
    )

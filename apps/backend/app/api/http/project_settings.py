"""API endpoints for project settings management.

This module provides REST API endpoints for:
- Getting auto-analysis toggle state
- Updating auto-analysis toggle (RBAC protected)
- Temporarily disabling auto-analysis
- Viewing audit log for settings changes

Routes:
    GET  /api/v1/projects/{project_id}/settings/auto-analysis
    PUT  /api/v1/projects/{project_id}/settings/auto-analysis
    POST /api/v1/projects/{project_id}/settings/auto-analysis/temporary-disable
    DELETE /api/v1/projects/{project_id}/settings/auto-analysis/temporary-disable
    GET  /api/v1/projects/{project_id}/settings/auto-analysis/audit-log
"""

from __future__ import annotations

import logging
from functools import lru_cache
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.api.middleware.auth import (
    AuthenticatedPrincipal,
    get_current_principal,
    require_permission,
)
from app.data.models.project_settings import (
    AutoAnalysisStateResponse,
    TEMPORARY_DISABLE_PRESETS,
)
from app.data.repos.project_settings_repo import ProjectSettingsRepo

router = APIRouter()
logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Pydantic Models for API
# ─────────────────────────────────────────────────────────────────────────────


class UpdateAutoAnalysisRequest(BaseModel):
    """Request body for updating auto-analysis toggle."""

    enabled: bool = Field(..., description="Whether auto-analysis should be enabled")
    reason: str | None = Field(
        None,
        max_length=500,
        description="Optional reason for the change (required when disabling)",
    )


class TemporaryDisableRequest(BaseModel):
    """Request body for temporarily disabling auto-analysis."""

    duration_minutes: int = Field(
        ...,
        ge=1,
        le=1440,
        description="Duration in minutes (1-1440, i.e., up to 24 hours)",
    )
    reason: str | None = Field(
        None,
        max_length=500,
        description="Optional reason for temporary disable",
    )


class AutoAnalysisStateApiResponse(BaseModel):
    """API response for auto-analysis state."""

    project_id: str
    enabled: bool
    effective_state: str
    is_analysis_allowed: bool
    temporarily_disabled_until: str | None = None
    temporarily_disabled_reason: str | None = None
    temporary_disable_remaining_seconds: int | None = None
    last_changed_by: str | None = None
    last_changed_at: str | None = None
    can_modify: bool = False
    temporary_disable_presets: list[dict[str, Any]] = Field(
        default_factory=lambda: TEMPORARY_DISABLE_PRESETS
    )


class AuditLogEntry(BaseModel):
    """Single audit log entry for API response."""

    id: str
    user_email: str
    user_display_name: str | None = None
    action: str
    previous_state: dict[str, Any]
    new_state: dict[str, Any]
    reason: str | None = None
    created_at: str


class AuditLogResponse(BaseModel):
    """API response for audit log."""

    project_id: str
    entries: list[AuditLogEntry]
    total: int
    limit: int
    offset: int


# ─────────────────────────────────────────────────────────────────────────────
# Dependencies
# ─────────────────────────────────────────────────────────────────────────────


@lru_cache(maxsize=1)
def get_project_settings_repo() -> ProjectSettingsRepo:
    """Get singleton instance of ProjectSettingsRepo."""
    return ProjectSettingsRepo()


def _normalize_project_id(project_id: str) -> str:
    """Normalize project ID to lowercase."""
    return project_id.strip().lower()


def _can_modify_settings(principal: AuthenticatedPrincipal | None) -> bool:
    """Check if the principal can modify project settings."""
    if principal is None:
        return False
    return "project_settings.write" in principal.permissions


def _extract_client_info(request: Request) -> tuple[str | None, str | None]:
    """Extract IP address and user agent from request."""
    ip_address = request.headers.get("X-Forwarded-For")
    if ip_address:
        ip_address = ip_address.split(",")[0].strip()
    else:
        ip_address = request.client.host if request.client else None
    
    user_agent = request.headers.get("User-Agent")
    return ip_address, user_agent


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────


@router.get(
    "/projects/{project_id}/settings/auto-analysis",
    response_model=AutoAnalysisStateApiResponse,
    summary="Get auto-analysis toggle state",
    description="Get the current state of the auto-analysis toggle for a project. "
    "All authenticated users can view this, but only Admin and Tech Lead can modify.",
)
async def get_auto_analysis_state(
    project_id: str,
    principal: AuthenticatedPrincipal | None = Depends(
        require_permission("project_settings.read")
    ),
    repo: ProjectSettingsRepo = Depends(get_project_settings_repo),
) -> AutoAnalysisStateApiResponse:
    """Get the auto-analysis toggle state for a project."""
    normalized_id = _normalize_project_id(project_id)
    
    # Get or create settings (returns default if not exists)
    settings = repo.get_or_create_settings(
        project_id=normalized_id,
        organization_id=principal.org_id if principal else None,
    )
    
    can_modify = _can_modify_settings(principal)
    
    return AutoAnalysisStateApiResponse(
        project_id=settings.project_id,
        enabled=settings.auto_analysis_enabled,
        effective_state=settings.effective_state.value,
        is_analysis_allowed=settings.is_analysis_allowed,
        temporarily_disabled_until=(
            settings.auto_analysis_disabled_until.isoformat()
            if settings.auto_analysis_disabled_until
            else None
        ),
        temporarily_disabled_reason=settings.auto_analysis_disabled_reason,
        temporary_disable_remaining_seconds=settings.temporary_disable_remaining_seconds,
        last_changed_by=settings.auto_analysis_last_changed_by,
        last_changed_at=(
            settings.auto_analysis_last_changed_at.isoformat()
            if settings.auto_analysis_last_changed_at
            else None
        ),
        can_modify=can_modify,
        temporary_disable_presets=TEMPORARY_DISABLE_PRESETS,
    )


@router.put(
    "/projects/{project_id}/settings/auto-analysis",
    response_model=AutoAnalysisStateApiResponse,
    summary="Update auto-analysis toggle",
    description="Enable or disable automatic code analysis for a project. "
    "Only Admin and Tech Lead roles can modify this setting.",
)
async def update_auto_analysis_state(
    project_id: str,
    body: UpdateAutoAnalysisRequest,
    request: Request,
    principal: AuthenticatedPrincipal | None = Depends(
        require_permission("project_settings.write")
    ),
    repo: ProjectSettingsRepo = Depends(get_project_settings_repo),
) -> AutoAnalysisStateApiResponse:
    """Update the auto-analysis toggle for a project."""
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    
    normalized_id = _normalize_project_id(project_id)
    ip_address, user_agent = _extract_client_info(request)
    
    # Require reason when disabling
    if not body.enabled and not body.reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A reason is required when disabling auto-analysis",
        )
    
    logger.info(
        "User %s (%s) %s auto-analysis for project %s. Reason: %s",
        principal.user_id,
        principal.email,
        "enabling" if body.enabled else "disabling",
        normalized_id,
        body.reason or "N/A",
    )
    
    settings = repo.update_auto_analysis_enabled(
        project_id=normalized_id,
        enabled=body.enabled,
        user_id=principal.user_id,
        user_email=principal.email,
        user_display_name=principal.display_name,
        reason=body.reason,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    
    return AutoAnalysisStateApiResponse(
        project_id=settings.project_id,
        enabled=settings.auto_analysis_enabled,
        effective_state=settings.effective_state.value,
        is_analysis_allowed=settings.is_analysis_allowed,
        temporarily_disabled_until=None,
        temporarily_disabled_reason=settings.auto_analysis_disabled_reason,
        temporary_disable_remaining_seconds=None,
        last_changed_by=settings.auto_analysis_last_changed_by,
        last_changed_at=(
            settings.auto_analysis_last_changed_at.isoformat()
            if settings.auto_analysis_last_changed_at
            else None
        ),
        can_modify=True,
        temporary_disable_presets=TEMPORARY_DISABLE_PRESETS,
    )


@router.post(
    "/projects/{project_id}/settings/auto-analysis/temporary-disable",
    response_model=AutoAnalysisStateApiResponse,
    summary="Temporarily disable auto-analysis",
    description="Temporarily pause automatic code analysis for a specified duration. "
    "The toggle remains enabled but analysis is paused until expiration. "
    "Only Admin and Tech Lead roles can use this feature.",
)
async def temporary_disable_auto_analysis(
    project_id: str,
    body: TemporaryDisableRequest,
    request: Request,
    principal: AuthenticatedPrincipal | None = Depends(
        require_permission("project_settings.write")
    ),
    repo: ProjectSettingsRepo = Depends(get_project_settings_repo),
) -> AutoAnalysisStateApiResponse:
    """Temporarily disable auto-analysis for a project."""
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    
    normalized_id = _normalize_project_id(project_id)
    ip_address, user_agent = _extract_client_info(request)
    
    logger.info(
        "User %s (%s) temporarily disabling auto-analysis for project %s for %d minutes. Reason: %s",
        principal.user_id,
        principal.email,
        normalized_id,
        body.duration_minutes,
        body.reason or "N/A",
    )
    
    try:
        settings = repo.set_temporary_disable(
            project_id=normalized_id,
            duration_minutes=body.duration_minutes,
            user_id=principal.user_id,
            user_email=principal.email,
            user_display_name=principal.display_name,
            reason=body.reason,
            ip_address=ip_address,
            user_agent=user_agent,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    
    return AutoAnalysisStateApiResponse(
        project_id=settings.project_id,
        enabled=settings.auto_analysis_enabled,
        effective_state=settings.effective_state.value,
        is_analysis_allowed=settings.is_analysis_allowed,
        temporarily_disabled_until=(
            settings.auto_analysis_disabled_until.isoformat()
            if settings.auto_analysis_disabled_until
            else None
        ),
        temporarily_disabled_reason=settings.auto_analysis_disabled_reason,
        temporary_disable_remaining_seconds=settings.temporary_disable_remaining_seconds,
        last_changed_by=settings.auto_analysis_last_changed_by,
        last_changed_at=(
            settings.auto_analysis_last_changed_at.isoformat()
            if settings.auto_analysis_last_changed_at
            else None
        ),
        can_modify=True,
        temporary_disable_presets=TEMPORARY_DISABLE_PRESETS,
    )


@router.delete(
    "/projects/{project_id}/settings/auto-analysis/temporary-disable",
    response_model=AutoAnalysisStateApiResponse,
    summary="Clear temporary disable",
    description="Clear an active temporary disable, immediately re-enabling auto-analysis. "
    "Only Admin and Tech Lead roles can use this feature.",
)
async def clear_temporary_disable(
    project_id: str,
    request: Request,
    principal: AuthenticatedPrincipal | None = Depends(
        require_permission("project_settings.write")
    ),
    repo: ProjectSettingsRepo = Depends(get_project_settings_repo),
) -> AutoAnalysisStateApiResponse:
    """Clear temporary disable for a project."""
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    
    normalized_id = _normalize_project_id(project_id)
    
    logger.info(
        "User %s (%s) clearing temporary disable for project %s",
        principal.user_id,
        principal.email,
        normalized_id,
    )
    
    settings = repo.clear_temporary_disable(
        project_id=normalized_id,
        user_id=principal.user_id,
        user_email=principal.email,
        reason="Manually cleared by user",
    )
    
    if settings is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project settings not found",
        )
    
    return AutoAnalysisStateApiResponse(
        project_id=settings.project_id,
        enabled=settings.auto_analysis_enabled,
        effective_state=settings.effective_state.value,
        is_analysis_allowed=settings.is_analysis_allowed,
        temporarily_disabled_until=None,
        temporarily_disabled_reason=None,
        temporary_disable_remaining_seconds=None,
        last_changed_by=settings.auto_analysis_last_changed_by,
        last_changed_at=(
            settings.auto_analysis_last_changed_at.isoformat()
            if settings.auto_analysis_last_changed_at
            else None
        ),
        can_modify=True,
        temporary_disable_presets=TEMPORARY_DISABLE_PRESETS,
    )


@router.get(
    "/projects/{project_id}/settings/auto-analysis/audit-log",
    response_model=AuditLogResponse,
    summary="Get auto-analysis audit log",
    description="Get the audit log of all changes to the auto-analysis toggle. "
    "Only Admin and Tech Lead roles can view the audit log.",
)
async def get_auto_analysis_audit_log(
    project_id: str,
    limit: int = Query(default=50, ge=1, le=100, description="Maximum entries to return"),
    offset: int = Query(default=0, ge=0, description="Number of entries to skip"),
    principal: AuthenticatedPrincipal | None = Depends(
        require_permission("project_settings.audit")
    ),
    repo: ProjectSettingsRepo = Depends(get_project_settings_repo),
) -> AuditLogResponse:
    """Get the audit log for auto-analysis settings changes."""
    if principal is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    
    normalized_id = _normalize_project_id(project_id)
    
    entries = repo.get_audit_log(
        project_id=normalized_id,
        limit=limit,
        offset=offset,
    )
    
    return AuditLogResponse(
        project_id=normalized_id,
        entries=[
            AuditLogEntry(
                id=entry.id,
                user_email=entry.user_email,
                user_display_name=entry.user_display_name,
                action=entry.action.value,
                previous_state=entry.previous_state,
                new_state=entry.new_state,
                reason=entry.reason,
                created_at=entry.created_at.isoformat() if entry.created_at else "",
            )
            for entry in entries
        ],
        total=len(entries),  # Note: For full pagination, we'd need a count query
        limit=limit,
        offset=offset,
    )

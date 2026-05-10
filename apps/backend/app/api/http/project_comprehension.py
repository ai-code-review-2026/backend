"""Project Comprehension API endpoints.

Provides REST API for project analysis and understanding.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Path as PathParam, Query
from pydantic import BaseModel, Field

from app.core.context_management import ContextManager, StalenessChecker
from app.core.project_comprehension import ProjectComprehensionService
from app.integrations.graph_database.neo4j_client import get_neo4j_client
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])

_neo4j_client = None
_comprehension_service: ProjectComprehensionService | None = None
_context_manager: ContextManager | None = None
_staleness_checker = StalenessChecker()


def _project_services() -> tuple[Any, ProjectComprehensionService, ContextManager]:
    global _neo4j_client, _comprehension_service, _context_manager
    if not settings.NEO4J_ENABLED:
        raise HTTPException(status_code=503, detail="Neo4j is disabled")
    try:
        if _neo4j_client is None:
            _neo4j_client = get_neo4j_client()
        if _comprehension_service is None:
            _comprehension_service = ProjectComprehensionService(neo4j_client=_neo4j_client)
        if _context_manager is None:
            _context_manager = ContextManager(neo4j_client=_neo4j_client)
        return _neo4j_client, _comprehension_service, _context_manager
    except Exception as exc:
        logger.warning("Project comprehension services unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="Neo4j is unavailable") from exc


# Request/Response models

class AnalyzeRequest(BaseModel):
    repo_path: str = Field(..., description="Path to the repository")
    org_id: str | None = Field(None, description="Organization ID")
    force: bool = Field(False, description="Force re-analysis")


class ProfileResponse(BaseModel):
    repo_id: str
    org_id: str | None
    context_version: int
    structure: dict[str, Any] | None
    architecture: dict[str, Any] | None
    quality: dict[str, Any] | None
    dependencies: dict[str, Any] | None
    business_description: str | None
    technical_summary: str | None
    analysis_status: str
    created_at: str | None
    last_analyzed_at: str | None


class DescriptionResponse(BaseModel):
    repo_id: str
    business_description: str | None
    technical_summary: str | None


class ContextStatusResponse(BaseModel):
    repo_id: str
    context_version: int
    is_stale: bool
    staleness_status: str
    staleness_reason: str | None
    age_hours: float | None
    recommended_action: str


class ContextRefreshRequest(BaseModel):
    changed_files: list[str] = Field(default_factory=list)
    force_full: bool = Field(False)
    commit_sha: str | None = None


class ContextRefreshResponse(BaseModel):
    success: bool
    update_type: str
    old_version: int
    new_version: int
    chunks_updated: int
    duration_ms: int
    error: str | None = None


# Endpoints

@router.get("/{repo_id}/profile", response_model=ProfileResponse)
async def get_project_profile(
    repo_id: str = PathParam(..., description="Repository identifier"),
    org_id: str | None = Query(None, description="Organization ID"),
):
    """Get the comprehensive profile of a project.

    Returns structure, architecture, quality indicators, and descriptions.
    """
    try:
        _, comprehension_service, _ = _project_services()
        profile = await comprehension_service.get_profile(repo_id)

        if not profile:
            raise HTTPException(
                status_code=404,
                detail=f"Profile not found for repo: {repo_id}",
            )

        return ProfileResponse(
            repo_id=profile.repo_id,
            org_id=profile.org_id,
            context_version=profile.context_version,
            structure=profile._structure_to_dict() if profile.structure else None,
            architecture=profile._architecture_to_dict() if profile.architecture else None,
            quality=profile._quality_to_dict() if profile.quality else None,
            dependencies=profile._dependencies_to_dict() if profile.dependencies else None,
            business_description=profile.business_description,
            technical_summary=profile.technical_summary,
            analysis_status=profile.analysis_status,
            created_at=profile.created_at.isoformat() if profile.created_at else None,
            last_analyzed_at=profile.last_analyzed_at.isoformat() if profile.last_analyzed_at else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get profile for {repo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{repo_id}/analyze", response_model=ProfileResponse)
async def analyze_project(
    repo_id: str = PathParam(..., description="Repository identifier"),
    request: AnalyzeRequest = ...,
):
    """Trigger analysis of a project.

    This performs comprehensive project understanding analysis.
    """
    try:
        path = Path(request.repo_path)
        if not path.exists():
            raise HTTPException(
                status_code=400,
                detail=f"Repository path does not exist: {request.repo_path}",
            )

        # Get existing version if not forcing
        _, comprehension_service, _ = _project_services()
        existing_version = 0
        if not request.force:
            existing = await comprehension_service.get_profile(repo_id)
            if existing:
                existing_version = existing.context_version

        profile = await comprehension_service.analyze_repository(
            repo_path=path,
            repo_id=repo_id,
            org_id=request.org_id,
            existing_version=existing_version,
        )

        return ProfileResponse(
            repo_id=profile.repo_id,
            org_id=profile.org_id,
            context_version=profile.context_version,
            structure=profile._structure_to_dict() if profile.structure else None,
            architecture=profile._architecture_to_dict() if profile.architecture else None,
            quality=profile._quality_to_dict() if profile.quality else None,
            dependencies=profile._dependencies_to_dict() if profile.dependencies else None,
            business_description=profile.business_description,
            technical_summary=profile.technical_summary,
            analysis_status=profile.analysis_status,
            created_at=profile.created_at.isoformat() if profile.created_at else None,
            last_analyzed_at=profile.last_analyzed_at.isoformat() if profile.last_analyzed_at else None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze {repo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{repo_id}/description", response_model=DescriptionResponse)
async def get_project_description(
    repo_id: str = PathParam(..., description="Repository identifier"),
):
    """Get the non-technical description of a project.

    Returns a user-friendly description suitable for display in the UI.
    """
    try:
        _, comprehension_service, _ = _project_services()
        profile = await comprehension_service.get_profile(repo_id)

        if not profile:
            raise HTTPException(
                status_code=404,
                detail=f"Profile not found for repo: {repo_id}",
            )

        return DescriptionResponse(
            repo_id=profile.repo_id,
            business_description=profile.business_description,
            technical_summary=profile.technical_summary,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get description for {repo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{repo_id}/context/status", response_model=ContextStatusResponse)
async def get_context_status(
    repo_id: str = PathParam(..., description="Repository identifier"),
    org_id: str | None = Query(None, description="Organization ID"),
):
    """Get the status of project context.

    Returns staleness status and recommendations for refresh.
    """
    try:
        _, _, context_manager = _project_services()
        context = await context_manager.get_context(repo_id, org_id=org_id)

        staleness = _staleness_checker.check(
            last_updated=context.last_updated,
            current_version=context.context_version,
        )

        return ContextStatusResponse(
            repo_id=repo_id,
            context_version=context.context_version,
            is_stale=staleness.is_stale,
            staleness_status=staleness.status.value,
            staleness_reason=staleness.reason,
            age_hours=staleness.age_hours,
            recommended_action=staleness.recommended_action,
        )

    except Exception as e:
        logger.error(f"Failed to get context status for {repo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{repo_id}/context/refresh", response_model=ContextRefreshResponse)
async def refresh_context(
    repo_id: str = PathParam(..., description="Repository identifier"),
    request: ContextRefreshRequest = ...,
    org_id: str | None = Query(None, description="Organization ID"),
):
    """Refresh the project context.

    Can do incremental or full refresh based on parameters.
    """
    try:
        from app.core.context_management import IncrementalUpdater
        neo4j_client, _, context_manager = _project_services()

        updater = IncrementalUpdater(
            context_manager=context_manager,
            neo4j_client=neo4j_client,
        )

        result = await updater.update(
            repo_id=repo_id,
            changed_files=request.changed_files,
            org_id=org_id,
            commit_sha=request.commit_sha,
            force_full=request.force_full,
        )

        return ContextRefreshResponse(
            success=result.success,
            update_type=result.update_type.value,
            old_version=result.old_version,
            new_version=result.new_version,
            chunks_updated=result.chunks_updated,
            duration_ms=result.duration_ms,
            error=result.error,
        )

    except Exception as e:
        logger.error(f"Failed to refresh context for {repo_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

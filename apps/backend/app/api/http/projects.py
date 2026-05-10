"""
Projects API endpoints.

Provides comprehensive project management including creation, 
team assignment, and branch configuration.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal, enforce_permission
from app.data.database import get_engine
from app.data.repos.project_settings_repo import ProjectSettingsRepo
from app.data.repos.rbac_repo import RBACRepo
from app.data.repos.repo_profiles_repo import RepoProfilesRepo

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])
logger = logging.getLogger(__name__)


# ── Request/Response Models ─────────────────────────────────────────────────────

class ProjectMember(BaseModel):
    """Project team member."""
    user_id: str
    email: str | None = None
    display_name: str | None = None
    role: str  # developer, reviewer, admin, etc.


class BranchConfig(BaseModel):
    """Branch configuration for project."""
    name: str
    is_default: bool = False
    is_protected: bool = False
    require_reviews: int = 0  # Number of required reviews


class CreateProjectRequest(BaseModel):
    """Request model for creating a project."""
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=255, description="Project display name")
    full_name: str = Field(min_length=1, max_length=255, description="Full repo name (owner/repo)")
    description: str | None = Field(None, max_length=1000)
    
    # Repository settings
    language: str | None = None
    visibility: Literal["public", "private", "internal"] = "private"
    default_branch: str = "main"
    github_id: str | None = None
    
    # Team assignment
    team_id: str | None = Field(None, description="Organization/team ID to assign")
    members: list[ProjectMember] = Field(default_factory=list, description="Initial team members")
    
    # Branch configuration
    branches: list[BranchConfig] = Field(default_factory=list, description="Branch configurations")
    
    # Analysis settings
    auto_analysis_enabled: bool = True


class ProjectResponse(BaseModel):
    """Response model for a project."""
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    full_name: str
    description: str | None = None
    
    # Repository info
    language: str | None = None
    visibility: Literal["public", "private", "internal"] = "private"
    default_branch: str = "main"
    status: Literal["active", "maintenance", "archived"] = "active"
    
    # Team info
    team_id: str | None = None
    team_name: str | None = None
    member_count: int = 0
    members: list[ProjectMember] = []
    
    # Branch info
    branch_count: int = 0
    branches: list[BranchConfig] = []
    
    # Analysis settings
    auto_analysis_enabled: bool = True
    
    # Metrics
    health_score: int = 0
    analysis_count: int = 0
    last_analysis_at: str | None = None
    
    # Timestamps
    created_at: str
    updated_at: str


class ProjectListResponse(BaseModel):
    """Response model for project list."""
    items: list[ProjectResponse]
    total: int
    page: int
    limit: int


class UpdateProjectRequest(BaseModel):
    """Request model for updating a project."""
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=1000)
    visibility: Literal["public", "private", "internal"] | None = None
    default_branch: str | None = None
    status: Literal["active", "maintenance", "archived"] | None = None
    team_id: str | None = None
    auto_analysis_enabled: bool | None = None


class CreateProjectInvitationRequest(BaseModel):
    """Request model for creating a project invitation."""
    model_config = ConfigDict(extra="forbid")

    email: str = Field(min_length=3, max_length=320)
    github_login: str | None = Field(default=None, max_length=255)
    role_code: str = Field(default="developer", min_length=1, max_length=64)
    clerk_invitation_id: str | None = Field(default=None, max_length=255)


class UpdateProjectInvitationRequest(BaseModel):
    """Request model for updating invitation status."""
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending", "accepted", "revoked"] = "revoked"


class ProjectInvitationResponse(BaseModel):
    """Project invitation response model."""
    model_config = ConfigDict(extra="forbid")

    id: str
    project_id: str
    email: str
    github_login: str | None = None
    role_code: str
    invited_by: str | None = None
    status: Literal["pending", "accepted", "revoked"]
    clerk_invitation_id: str | None = None
    created_at: str | None = None
    accepted_at: str | None = None


class ProjectInvitationListResponse(BaseModel):
    """Project invitation list response model."""
    project_id: str
    items: list[ProjectInvitationResponse]
    total: int


# ── Helper Functions ────────────────────────────────────────────────────────────

def _get_project_stats(engine, project_id: str, repo_id: str | None = None) -> dict[str, Any]:
    """Get statistics for a project from analyses."""
    from sqlalchemy import text
    
    # If we have a UUID project_id, use it directly; otherwise use repo_id
    import uuid
    try:
        uuid.UUID(project_id)
        use_project_id = True
    except ValueError:
        use_project_id = False
    
    if use_project_id:
        # project_id is a UUID, query by project_id
        query = text("""
            SELECT 
                COUNT(*) as analysis_count,
                MAX(created_at) as last_analysis_at,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM findings f 
                    WHERE f.analysis_id IN (
                        SELECT id FROM analyses a2 WHERE a2.project_id = :project_id
                    )
                ), 0) as total_findings,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count
            FROM analyses
            WHERE project_id = :project_id
        """)
        params = {"project_id": project_id}
    else:
        # project_id is a repo_id, query by repo
        query = text("""
            SELECT 
                COUNT(*) as analysis_count,
                MAX(created_at) as last_analysis_at,
                COALESCE((
                    SELECT COUNT(*) 
                    FROM findings f 
                    WHERE f.analysis_id IN (
                        SELECT id FROM analyses a2 WHERE a2.repo = :repo_id
                    )
                ), 0) as total_findings,
                SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count
            FROM analyses
            WHERE repo = :repo_id
        """)
        params = {"repo_id": project_id}
    
    with engine.connect() as conn:
        result = conn.execute(query, params)
        row = result.mappings().first()
        
        if row and row.get("analysis_count"):
            analysis_count = row["analysis_count"] or 0
            completed = row.get("completed_count") or 0
            total_findings = row.get("total_findings") or 0
            
            # Calculate health score (0-100)
            if analysis_count > 0:
                success_rate = completed / analysis_count
                findings_penalty = min(total_findings / 100, 0.5)  # Max 50% penalty
                health_score = int((success_rate * 100) * (1 - findings_penalty))
            else:
                health_score = 0
            
            return {
                "analysis_count": analysis_count,
                "last_analysis_at": row["last_analysis_at"].isoformat() if row.get("last_analysis_at") else None,
                "health_score": health_score,
            }
    
    return {"analysis_count": 0, "last_analysis_at": None, "health_score": 0}


def _get_project_branches(engine, project_id: str) -> list[BranchConfig]:
    """Get branches for a project."""
    from sqlalchemy import text
    
    query = text("""
        SELECT 
            b.name,
            b.is_default,
            CASE WHEN bpr.id IS NOT NULL THEN TRUE ELSE FALSE END as is_protected,
            COALESCE(bpr.required_approvals, 0) as require_reviews
        FROM branches b
        LEFT JOIN branch_protection_rules bpr ON bpr.branch_id = b.id
        WHERE b.repo_id = :project_id
        ORDER BY b.is_default DESC, b.name
    """)
    
    branches = []
    try:
        with engine.connect() as conn:
            result = conn.execute(query, {"project_id": project_id})
            for row in result.mappings().all():
                branches.append(BranchConfig(
                    name=row["name"],
                    is_default=bool(row["is_default"]),
                    is_protected=bool(row["is_protected"]),
                    require_reviews=row["require_reviews"] or 0,
                ))
    except Exception:
        pass  # Table might not exist yet
    
    return branches


def _get_project_members(
    engine,
    project_id: str,
    rbac_repo: RBACRepo,
    fallback_project_id: str | None = None,
) -> list[ProjectMember]:
    """Get team members for a project."""
    members: list[ProjectMember] = []
    seen_user_ids: set[str] = set()
    project_keys: list[str] = [project_id]
    if fallback_project_id and fallback_project_id != project_id:
        project_keys.append(fallback_project_id)
    try:
        for key in project_keys:
            member_records = rbac_repo.get_project_members(key)
            for record in member_records:
                user_id = str(record.get("user_id", "")).strip()
                if not user_id or user_id in seen_user_ids:
                    continue
                seen_user_ids.add(user_id)
                members.append(ProjectMember(
                    user_id=user_id,
                    email=record.get("user_email"),
                    display_name=record.get("user_display_name"),
                    role=record.get("role_code", "developer"),
                ))
    except Exception:
        pass  # Table might not exist
    
    return members


def _to_invitation_response(row: dict[str, Any] | Any) -> ProjectInvitationResponse:
    status_value = str((row.get("status") if isinstance(row, dict) else row["status"]) or "pending")
    normalized_status: Literal["pending", "accepted", "revoked"] = "pending"
    if status_value in {"accepted", "revoked"}:
        normalized_status = status_value  # type: ignore[assignment]

    created_at = row.get("created_at") if isinstance(row, dict) else row["created_at"]
    accepted_at = row.get("accepted_at") if isinstance(row, dict) else row["accepted_at"]
    return ProjectInvitationResponse(
        id=str(row.get("id") if isinstance(row, dict) else row["id"]),
        project_id=str(row.get("project_id") if isinstance(row, dict) else row["project_id"]),
        email=str(row.get("email") if isinstance(row, dict) else row["email"]),
        github_login=(row.get("github_login") if isinstance(row, dict) else row["github_login"]),
        role_code=str(row.get("role_code") if isinstance(row, dict) else row["role_code"]),
        invited_by=(row.get("invited_by") if isinstance(row, dict) else row["invited_by"]),
        status=normalized_status,
        clerk_invitation_id=(row.get("clerk_invitation_id") if isinstance(row, dict) else row["clerk_invitation_id"]),
        created_at=created_at.isoformat() if created_at else None,
        accepted_at=accepted_at.isoformat() if accepted_at else None,
    )


def _get_team_info(engine, team_id: str | None) -> tuple[str | None, str | None]:
    """Get team name from organization ID."""
    if not team_id:
        return None, None
    
    from sqlalchemy import text
    
    query = text("""
        SELECT id, name FROM organizations WHERE id = :team_id LIMIT 1
    """)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(query, {"team_id": team_id})
            row = result.mappings().first()
            if row:
                return row["id"], row["name"]
    except Exception:
        pass
    
    return team_id, None


def _resolve_project_lookup_keys(engine, project_ref: str) -> tuple[str, str]:
    """Resolve both canonical project UUID and repo_id for a project reference."""
    from sqlalchemy import text
    import uuid

    normalized_ref = project_ref.strip()
    if not normalized_ref:
        raise HTTPException(status_code=422, detail="Project reference is required")

    try:
        uuid.UUID(normalized_ref)
        is_uuid = True
    except ValueError:
        is_uuid = False

    with engine.connect() as conn:
        if is_uuid:
            row = conn.execute(
                text("SELECT id, repo_id FROM project_profiles WHERE id = :project_id LIMIT 1"),
                {"project_id": normalized_ref},
            ).mappings().first()
            if row:
                return str(row["id"]), str(row["repo_id"])
            raise HTTPException(status_code=404, detail="Project not found")

        repo_id = normalized_ref.lower()
        row = conn.execute(
            text("SELECT id, repo_id FROM project_profiles WHERE repo_id = :repo_id LIMIT 1"),
            {"repo_id": repo_id},
        ).mappings().first()
        if row:
            return str(row["id"]), str(row["repo_id"])
        raise HTTPException(status_code=404, detail="Project not found")


def _ensure_project_profile(
    engine,
    *,
    repo_id: str,
    org_id: str | None = None,
    display_name: str | None = None,
    description: str | None = None,
    primary_language: str | None = None,
    visibility: str | None = None,
) -> str:
    """Return the canonical `project_profiles.id` (UUID) for the given repo_id.

    Creates the row on-demand if missing. This is the authoritative identifier
    that `AnalyzeRequest.project_id` must reference (enforced by the FK
    `analyses.project_id -> project_profiles.id`).
    """
    from sqlalchemy import text

    normalized_repo_id = repo_id.strip().lower()
    if not normalized_repo_id:
        raise HTTPException(status_code=422, detail="repo_id is required")

    # 1) Try to find an existing row.
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT id FROM project_profiles WHERE repo_id = :repo_id LIMIT 1"),
            {"repo_id": normalized_repo_id},
        ).mappings().first()
    if row and row.get("id"):
        return str(row["id"])

    # 2) Otherwise insert a minimal placeholder row. The comprehension service
    #    will populate the rest of the columns asynchronously.
    import json as _json

    new_id = str(uuid.uuid4())
    raw_metadata = {
        "display_name": display_name,
        "description": description,
        "primary_language": primary_language,
        "visibility": visibility,
    }
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO project_profiles (
                    id, repo_id, org_id, context_version,
                    main_languages, raw_metadata,
                    business_description, analysis_status,
                    created_at, last_analyzed_at
                ) VALUES (
                    :id, :repo_id, :org_id, 1,
                    CAST(:main_languages AS jsonb), CAST(:raw_metadata AS jsonb),
                    :description, 'pending',
                    now(), now()
                )
                ON CONFLICT (repo_id) DO UPDATE
                SET raw_metadata = COALESCE(project_profiles.raw_metadata, EXCLUDED.raw_metadata)
                RETURNING id
                """
            ),
            {
                "id": new_id,
                "repo_id": normalized_repo_id,
                "org_id": org_id,
                "main_languages": _json.dumps([primary_language] if primary_language else []),
                "raw_metadata": _json.dumps(raw_metadata),
                "description": description,
            },
        )
        # Read the final id (ON CONFLICT may have returned a different one).
        final_row = conn.execute(
            text("SELECT id FROM project_profiles WHERE repo_id = :repo_id LIMIT 1"),
            {"repo_id": normalized_repo_id},
        ).mappings().first()
    if not final_row or not final_row.get("id"):
        raise HTTPException(status_code=500, detail="Failed to create project profile")
    return str(final_row["id"])


def _create_branch(engine, project_id: str, branch_config: BranchConfig, org_id: str | None) -> None:
    """Create a branch record."""
    from sqlalchemy import text
    
    branch_id = f"br_{uuid.uuid4().hex[:16]}"
    now = datetime.now(timezone.utc)
    
    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO branches (id, repo_id, org_id, name, is_default, created_at, updated_at)
                    VALUES (:id, :repo_id, :org_id, :name, :is_default, :created_at, :updated_at)
                    ON CONFLICT (repo_id, name) DO UPDATE SET
                        is_default = EXCLUDED.is_default,
                        updated_at = EXCLUDED.updated_at
                """),
                {
                    "id": branch_id,
                    "repo_id": project_id,
                    "org_id": org_id,
                    "name": branch_config.name,
                    "is_default": branch_config.is_default,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            
            # Add protection rule if needed
            if branch_config.is_protected:
                rule_id = f"bpr_{uuid.uuid4().hex[:16]}"
                conn.execute(
                    text("""
                        INSERT INTO branch_protection_rules (id, branch_id, required_approvals, created_at, updated_at)
                        VALUES (:id, :branch_id, :required_approvals, :created_at, :updated_at)
                        ON CONFLICT (branch_id) DO UPDATE SET
                            required_approvals = EXCLUDED.required_approvals,
                            updated_at = EXCLUDED.updated_at
                    """),
                    {
                        "id": rule_id,
                        "branch_id": branch_id,
                        "required_approvals": branch_config.require_reviews,
                        "created_at": now,
                        "updated_at": now,
                    },
                )
    except Exception:
        pass  # Tables might not exist


# ── API Endpoints ───────────────────────────────────────────────────────────────

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    request: CreateProjectRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProjectResponse:
    """
    Create a new project with team and branch configuration.

    This endpoint creates:
    1. A canonical project_profiles row (UUID id — authoritative project identifier)
    2. A repository profile for tracking
    3. Project settings with auto-analysis config
    4. Team member assignments (if provided)
    5. Branch configurations (if provided)
    """
    enforce_permission(principal, "analyses.create")
    try:
        engine = get_engine()
        repo_profiles = RepoProfilesRepo()
        settings_repo = ProjectSettingsRepo()
        rbac_repo = RBACRepo()

        repo_id = request.full_name.strip().lower()
        now = datetime.now(timezone.utc)
        normalized_team_id = request.team_id.strip() if request.team_id and request.team_id.strip() else None

        # 1. Create canonical project_profiles row (authoritative id for analyses FK)
        #    This row's `id` is the UUID that AnalyzeRequest.project_id must reference.
        try:
            project_id = _ensure_project_profile(
                engine,
                repo_id=repo_id,
                org_id=normalized_team_id,
                display_name=request.name,
                description=request.description,
                primary_language=request.language,
                visibility=request.visibility,
            )
        except Exception:
            if normalized_team_id is not None:
                try:
                    # Some legacy schemas reject org/team ids in this table.
                    # Retry without org_id to preserve project creation.
                    project_id = _ensure_project_profile(
                        engine,
                        repo_id=repo_id,
                        org_id=None,
                        display_name=request.name,
                        description=request.description,
                        primary_language=request.language,
                        visibility=request.visibility,
                    )
                except Exception:
                    project_id = repo_id
            else:
                project_id = repo_id

        # 2. Create repository profile (legacy table, keyed by repo_id)
        try:
            repo_profiles.upsert_profile(
                repo_id=repo_id,
                repo_path=None,
                indexed_commit=None,
                default_branch=request.default_branch,
                profile={
                    "name": request.name,
                    "description": request.description,
                    "primary_language": request.language,
                    "github_id": request.github_id,
                    "visibility": request.visibility,
                },
            )
        except Exception:
            # Keep project creation available even when legacy profile tables are not yet migrated.
            pass
        
        # 3. Create project settings (keyed by legacy repo_id for backward compat)
        try:
            settings_repo.get_or_create_settings(
                project_id=repo_id,
                organization_id=normalized_team_id,
            )

            # Update auto-analysis if different from default
            if not request.auto_analysis_enabled:
                settings_repo.update_auto_analysis_enabled(
                    project_id=repo_id,
                    enabled=False,
                    user_id=principal.user_id,
                    user_email=principal.email or "unknown@example.local",
                    user_display_name=principal.display_name,
                    reason="Disabled on project creation",
                )
        except Exception:
            # Non-critical in bootstrap environments where project_settings tables are pending.
            pass

        # 4. Assign team members
        assigned_members: list[ProjectMember] = []

        # Always add the creator as admin
        try:
            rbac_repo.assign_project_role(
                user_id=principal.user_id,
                project_id=project_id,
                role_code="admin",
                assigned_by=principal.user_id,
                notes="Project creator",
            )
            assigned_members.append(ProjectMember(
                user_id=principal.user_id,
                email=principal.email,
                display_name=principal.display_name,
                role="admin",
            ))
        except Exception:
            pass

        # Add additional members
        for member in request.members:
            if member is not None and member.user_id != principal.user_id:  # Skip if already added
                try:
                    rbac_repo.assign_project_role(
                        user_id=member.user_id,
                        project_id=project_id,
                        role_code=member.role,
                        assigned_by=principal.user_id,
                    )
                    assigned_members.append(member)
                except Exception:
                    pass

        # 5. Create branches
        created_branches: list[BranchConfig] = []

        # Always create default branch
        default_branch_config = BranchConfig(
            name=request.default_branch,
            is_default=True,
            is_protected=True,
            require_reviews=1,
        )
        _create_branch(engine, repo_id, default_branch_config, request.team_id)
        created_branches.append(default_branch_config)

        # Create additional branches
        for branch in request.branches:
            if branch.name != request.default_branch:
                _create_branch(engine, repo_id, branch, request.team_id)
                created_branches.append(branch)

        # Get team info
        team_id, team_name = _get_team_info(engine, normalized_team_id)

        # IMPORTANT: the response `id` must be the project_profiles UUID so the
        # dashboard can pass it back as AnalyzeRequest.project_id.
        return ProjectResponse(
            id=project_id,
            name=request.name,
            full_name=repo_id,
            description=request.description,
            language=request.language,
            visibility=request.visibility,
            default_branch=request.default_branch,
            status="active",
            team_id=team_id,
            team_name=team_name,
            member_count=len(assigned_members),
            members=assigned_members,
            branch_count=len(created_branches),
            branches=created_branches,
            auto_analysis_enabled=request.auto_analysis_enabled,
            health_score=0,
            analysis_count=0,
            last_analysis_at=None,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Project creation failed for repo=%s", request.full_name)
        raise HTTPException(status_code=500, detail=f"Project creation failed: {exc}") from exc


@router.get("", response_model=ProjectListResponse)
async def list_projects(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    team_id: str | None = Query(None),
    status: str | None = Query(None),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProjectListResponse:
    """
    List all projects accessible to the current user.

    Canonical source of truth is the `project_profiles` table — the `id`
    column of every returned item is the project UUID that must be passed
    back as `AnalyzeRequest.project_id` (enforced by the FK
    `analyses.project_id -> project_profiles.id`).

    For backward compatibility we also backfill `project_profiles` for any
    legacy `analyses.repo` that doesn't yet have a matching profile so
    existing data remains analysable.
    """
    enforce_permission(principal, "analyses.read")

    engine = get_engine()
    repo_profiles = RepoProfilesRepo()
    rbac_repo = RBACRepo()
    settings_repo = ProjectSettingsRepo()

    from sqlalchemy import text

    # 0) Backfill: make sure every repo that has analyses has a matching
    #    project_profiles row. Without this, legacy analyses created before
    #    the project_id FK existed would be invisible in the project list.
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO project_profiles (id, repo_id, context_version, analysis_status)
                    SELECT gen_random_uuid()::text, lower(a.repo), 1, 'pending'
                    FROM (SELECT DISTINCT repo FROM analyses WHERE repo IS NOT NULL) a
                    WHERE lower(a.repo) NOT IN (SELECT repo_id FROM project_profiles)
                    ON CONFLICT (repo_id) DO NOTHING
                    """
                )
            )
            # Backfill analyses.project_id that are still NULL.
            conn.execute(
                text(
                    """
                    UPDATE analyses a
                    SET project_id = pp.id
                    FROM project_profiles pp
                    WHERE a.project_id IS NULL
                      AND lower(a.repo) = pp.repo_id
                    """
                )
            )
    except Exception:
        # Non-fatal: listing should still work if backfill fails.
        pass

    # 1) Build query conditions against project_profiles.
    conditions: list[str] = []
    params: dict[str, Any] = {"limit": limit, "offset": (page - 1) * limit}

    if search:
        conditions.append("(pp.repo_id ILIKE :search OR COALESCE(pp.raw_metadata->>'display_name','') ILIKE :search)")
        params["search"] = f"%{search}%"

    if team_id:
        conditions.append("pp.org_id = :team_id")
        params["team_id"] = team_id

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    query = text(
        f"""
        SELECT
            pp.id                           AS project_id,
            pp.repo_id                      AS repo_id,
            pp.org_id                       AS org_id,
            pp.raw_metadata                 AS raw_metadata,
            pp.business_description         AS business_description,
            pp.created_at                   AS created_at,
            pp.last_analyzed_at             AS last_analyzed_at,
            COALESCE(a.analysis_count, 0)   AS analysis_count,
            a.last_analysis_at              AS last_analysis_at
        FROM project_profiles pp
        LEFT JOIN (
            SELECT project_id, COUNT(*) AS analysis_count, MAX(created_at) AS last_analysis_at
            FROM analyses
            WHERE project_id IS NOT NULL
            GROUP BY project_id
        ) a ON a.project_id = pp.id
        {where_clause}
        ORDER BY COALESCE(a.last_analysis_at, pp.last_analyzed_at, pp.created_at) DESC NULLS LAST
        LIMIT :limit OFFSET :offset
        """
    )

    count_query = text(
        f"""
        SELECT COUNT(*) AS total
        FROM project_profiles pp
        {where_clause}
        """
    )

    items: list[ProjectResponse] = []
    total = 0

    with engine.connect() as conn:
        count_row = conn.execute(count_query, params).mappings().first()
        total = (count_row.get("total") if count_row else 0) or 0

        result = conn.execute(query, params)
        for row in result.mappings().all():
            project_id_uuid = str(row["project_id"])  # ← canonical UUID
            repo_id = str(row["repo_id"])

            # Legacy repo_profiles blob (display metadata)
            profile = repo_profiles.get_profile(repo_id)
            profile_data = profile.profile if profile else {}

            raw_meta_val = row.get("raw_metadata") or {}
            if isinstance(raw_meta_val, str):
                import json as _json
                try:
                    raw_meta = _json.loads(raw_meta_val)
                except Exception:
                    raw_meta = {}
            elif isinstance(raw_meta_val, dict):
                raw_meta = raw_meta_val
            else:
                raw_meta = {}

            # Settings / members / branches keyed by legacy repo_id
            settings = settings_repo.get_settings(repo_id)
            members = _get_project_members(engine, project_id_uuid, rbac_repo, fallback_project_id=repo_id)
            branches = _get_project_branches(engine, repo_id)

            # Stats: reuse helper keyed by repo_id for findings aggregation.
            stats = _get_project_stats(engine, repo_id)
            # Override analysis_count / last_analysis_at from the canonical
            # project_id join so we count rows tied to the real project FK.
            stats["analysis_count"] = int(row.get("analysis_count") or 0)
            last_analysis_at_val = row.get("last_analysis_at")
            stats["last_analysis_at"] = (
                last_analysis_at_val.isoformat() if last_analysis_at_val else None
            )

            # Team info
            org_id = row.get("org_id") or (settings.organization_id if settings else None)
            team_id_val, team_name = _get_team_info(engine, org_id)

            parts = repo_id.split("/")
            name = (
                raw_meta.get("display_name")
                or profile_data.get("name")
                or (parts[-1] if parts else repo_id)
            )
            description = (
                raw_meta.get("description")
                or row.get("business_description")
                or profile_data.get("description")
            )
            language = raw_meta.get("primary_language") or profile_data.get("primary_language")
            visibility = raw_meta.get("visibility") or profile_data.get("visibility") or "private"

            created_at_val = row.get("created_at")
            updated_at_val = row.get("last_analyzed_at") or row.get("last_analysis_at") or created_at_val

            items.append(
                ProjectResponse(
                    id=project_id_uuid,
                    name=name,
                    full_name=repo_id,
                    description=description,
                    language=language,
                    visibility=visibility,
                    default_branch=profile.default_branch if profile else "main",
                    status="active",
                    team_id=team_id_val,
                    team_name=team_name,
                    member_count=len(members),
                    members=members[:5],
                    branch_count=len(branches),
                    branches=branches[:5],
                    auto_analysis_enabled=settings.auto_analysis_enabled if settings else True,
                    health_score=stats["health_score"],
                    analysis_count=stats["analysis_count"],
                    last_analysis_at=stats["last_analysis_at"],
                    created_at=(
                        created_at_val.isoformat()
                        if created_at_val
                        else datetime.now(timezone.utc).isoformat()
                    ),
                    updated_at=(
                        updated_at_val.isoformat()
                        if updated_at_val
                        else datetime.now(timezone.utc).isoformat()
                    ),
                )
            )

    return ProjectListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
    )


# ── Temporary Fallback Endpoint ───────────────────────────────────────────────

# Legacy endpoint removed - now handled by main /api/v1/projects endpoint


@router.get("/{project_id:path}/details", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProjectResponse:
    """
    Get detailed project information.
    """
    enforce_permission(principal, "analyses.read")

    engine = get_engine()
    repo_profiles = RepoProfilesRepo()
    rbac_repo = RBACRepo()
    settings_repo = ProjectSettingsRepo()

    # Determine if project_id is a UUID or repo_id
    from sqlalchemy import text
    import uuid

    try:
        # Try to parse as UUID
        uuid.UUID(project_id)
        is_uuid = True
    except ValueError:
        is_uuid = False

    if is_uuid:
        # project_id is a UUID, get the corresponding repo_id from project_profiles
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT repo_id FROM project_profiles WHERE id = :project_id LIMIT 1"),
                {"project_id": project_id},
            ).mappings().first()
            if not row:
                raise HTTPException(status_code=404, detail="Project not found")
            repo_id = str(row["repo_id"])
    else:
        # project_id is already a repo_id
        repo_id = project_id

    # Get profile using repo_id
    profile = repo_profiles.get_profile(repo_id)
    
    # Get stats using project_id (UUID) if available, otherwise repo_id
    stats = _get_project_stats(engine, project_id, repo_id)
    
    if not profile and stats["analysis_count"] == 0:
        raise HTTPException(status_code=404, detail="Project not found")

    profile_data = profile.profile if profile else {}

    # Get settings using repo_id (for backward compatibility)
    settings = settings_repo.get_settings(repo_id)

    # Get members using repo_id
    members = _get_project_members(
        engine,
        project_id if is_uuid else repo_id,
        rbac_repo,
        fallback_project_id=repo_id if is_uuid else None,
    )

    # Get branches using repo_id
    branches = _get_project_branches(engine, repo_id)

    # Get team info
    org_id = settings.organization_id if settings else None
    team_id, team_name = _get_team_info(engine, org_id)

    # Parse name
    parts = repo_id.split("/")
    name = profile_data.get("name") or (parts[-1] if parts else repo_id)

    now = datetime.now(timezone.utc).isoformat()

    return ProjectResponse(
        id=project_id if is_uuid else repo_id,  # Return the original project_id format
        name=name,
        full_name=repo_id,
        description=profile_data.get("description"),
        language=profile_data.get("primary_language"),
        visibility=profile_data.get("visibility", "private"),
        default_branch=profile.default_branch if profile else "main",
        status="active",
        team_id=team_id,
        team_name=team_name,
        member_count=len(members),
        members=members,
        branch_count=len(branches),
        branches=branches,
        auto_analysis_enabled=settings.auto_analysis_enabled if settings else True,
        health_score=stats["health_score"],
        analysis_count=stats["analysis_count"],
        last_analysis_at=stats["last_analysis_at"],
        created_at=now,
        updated_at=now,
    )


@router.patch("/{project_id:path}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    request: UpdateProjectRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProjectResponse:
    """
    Update project settings.
    """
    enforce_permission(principal, "analyses.create")

    repo_profiles = RepoProfilesRepo()
    settings_repo = ProjectSettingsRepo()
    
    # Get existing profile
    profile = repo_profiles.get_profile(project_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Update profile
    profile_data = profile.profile or {}
    
    if request.name is not None:
        profile_data["name"] = request.name
    if request.description is not None:
        profile_data["description"] = request.description
    if request.visibility is not None:
        profile_data["visibility"] = request.visibility
    
    default_branch = request.default_branch or profile.default_branch
    
    repo_profiles.upsert_profile(
        repo_id=project_id,
        repo_path=profile.repo_path,
        indexed_commit=profile.indexed_commit,
        default_branch=default_branch,
        profile=profile_data,
    )
    
    # Update settings if needed
    if request.auto_analysis_enabled is not None:
        settings_repo.update_auto_analysis_enabled(
            project_id=project_id,
            enabled=request.auto_analysis_enabled,
            user_id=principal.user_id,
            user_email=principal.email or "unknown@example.local",
            user_display_name=principal.display_name,
            reason="Updated via API",
        )
    
    if request.team_id is not None:
        # Update organization_id in settings
        settings = settings_repo.get_or_create_settings(project_id, request.team_id)
    
    # Return updated project
    return await get_project(project_id, principal)


@router.get("/{project_id:path}/invitations", response_model=ProjectInvitationListResponse)
async def list_project_invitations(
    project_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProjectInvitationListResponse:
    """List pending/accepted/revoked invitations for a project."""
    enforce_permission(principal, "analyses.read")
    from sqlalchemy import text

    engine = get_engine()
    canonical_project_id, _repo_id = _resolve_project_lookup_keys(engine, project_id)

    with engine.connect() as conn:
        rows = (
            conn.execute(
                text(
                    """
                    SELECT
                        id,
                        project_id,
                        email,
                        github_login,
                        role_code,
                        invited_by,
                        status,
                        clerk_invitation_id,
                        created_at,
                        accepted_at
                    FROM pending_project_invitations
                    WHERE project_id = :project_id
                    ORDER BY created_at DESC
                    """
                ),
                {"project_id": canonical_project_id},
            )
            .mappings()
            .all()
        )

    items = [_to_invitation_response(dict(row)) for row in rows]
    return ProjectInvitationListResponse(
        project_id=canonical_project_id,
        items=items,
        total=len(items),
    )


@router.post("/{project_id:path}/invitations", response_model=ProjectInvitationResponse, status_code=status.HTTP_201_CREATED)
async def create_project_invitation(
    project_id: str,
    request: CreateProjectInvitationRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProjectInvitationResponse:
    """Create or refresh a pending invitation for a project collaborator."""
    enforce_permission(principal, "analyses.create")
    from sqlalchemy import text

    normalized_email = request.email.strip().lower()
    if "@" not in normalized_email:
        raise HTTPException(status_code=422, detail="Invalid email format")

    engine = get_engine()
    canonical_project_id, _repo_id = _resolve_project_lookup_keys(engine, project_id)
    invitation_id = f"inv_{uuid.uuid4().hex[:20]}"
    normalized_role = request.role_code.strip().lower() if request.role_code.strip() else "developer"
    normalized_github = request.github_login.strip().lower() if request.github_login and request.github_login.strip() else None
    clerk_invitation_id = (
        request.clerk_invitation_id.strip()
        if request.clerk_invitation_id and request.clerk_invitation_id.strip()
        else None
    )

    with engine.begin() as conn:
        existing = (
            conn.execute(
                text(
                    """
                    SELECT id
                    FROM pending_project_invitations
                    WHERE project_id = :project_id
                      AND email = :email
                      AND status = 'pending'
                    LIMIT 1
                    """
                ),
                {"project_id": canonical_project_id, "email": normalized_email},
            )
            .mappings()
            .first()
        )

        if existing:
            row = (
                conn.execute(
                    text(
                        """
                        UPDATE pending_project_invitations
                        SET
                            github_login = COALESCE(:github_login, github_login),
                            role_code = :role_code,
                            invited_by = :invited_by,
                            clerk_invitation_id = COALESCE(:clerk_invitation_id, clerk_invitation_id),
                            status = 'pending',
                            accepted_at = NULL
                        WHERE id = :id
                        RETURNING
                            id,
                            project_id,
                            email,
                            github_login,
                            role_code,
                            invited_by,
                            status,
                            clerk_invitation_id,
                            created_at,
                            accepted_at
                        """
                    ),
                    {
                        "id": str(existing["id"]),
                        "github_login": normalized_github,
                        "role_code": normalized_role,
                        "invited_by": principal.user_id,
                        "clerk_invitation_id": clerk_invitation_id,
                    },
                )
                .mappings()
                .first()
            )
            if not row:
                raise HTTPException(status_code=500, detail="Failed to update invitation")
            return _to_invitation_response(dict(row))

        row = (
            conn.execute(
                text(
                    """
                    INSERT INTO pending_project_invitations (
                        id,
                        project_id,
                        email,
                        github_login,
                        role_code,
                        invited_by,
                        status,
                        clerk_invitation_id
                    ) VALUES (
                        :id,
                        :project_id,
                        :email,
                        :github_login,
                        :role_code,
                        :invited_by,
                        'pending',
                        :clerk_invitation_id
                    )
                    RETURNING
                        id,
                        project_id,
                        email,
                        github_login,
                        role_code,
                        invited_by,
                        status,
                        clerk_invitation_id,
                        created_at,
                        accepted_at
                    """
                ),
                {
                    "id": invitation_id,
                    "project_id": canonical_project_id,
                    "email": normalized_email,
                    "github_login": normalized_github,
                    "role_code": normalized_role,
                    "invited_by": principal.user_id,
                    "clerk_invitation_id": clerk_invitation_id,
                },
            )
            .mappings()
            .first()
        )

    if not row:
        raise HTTPException(status_code=500, detail="Failed to create invitation")
    return _to_invitation_response(dict(row))


@router.patch("/{project_id:path}/invitations/{invitation_id}", response_model=ProjectInvitationResponse)
async def update_project_invitation(
    project_id: str,
    invitation_id: str,
    request: UpdateProjectInvitationRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProjectInvitationResponse:
    """Update invitation status (typically revoke)."""
    enforce_permission(principal, "analyses.create")
    from sqlalchemy import text

    engine = get_engine()
    canonical_project_id, _repo_id = _resolve_project_lookup_keys(engine, project_id)

    with engine.begin() as conn:
        row = (
            conn.execute(
                text(
                    """
                    UPDATE pending_project_invitations
                    SET
                        status = :status,
                        accepted_at = CASE
                            WHEN :status = 'accepted' THEN NOW()
                            ELSE accepted_at
                        END
                    WHERE id = :id
                      AND project_id = :project_id
                    RETURNING
                        id,
                        project_id,
                        email,
                        github_login,
                        role_code,
                        invited_by,
                        status,
                        clerk_invitation_id,
                        created_at,
                        accepted_at
                    """
                ),
                {
                    "id": invitation_id,
                    "project_id": canonical_project_id,
                    "status": request.status,
                },
            )
            .mappings()
            .first()
        )

    if not row:
        raise HTTPException(status_code=404, detail="Invitation not found")
    return _to_invitation_response(dict(row))

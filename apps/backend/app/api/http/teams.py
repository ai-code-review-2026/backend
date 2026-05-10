"""
Teams API endpoints.

Implements the Teams Hierarchy:
Organization → Project → Team → Repo → Branch → Commit

Role resolution order:
1. team_members.role (highest priority)
2. org_members.role (mid priority)
3. users.role (lowest priority)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, List, Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text

from app.api.middleware.auth import (
    AuthenticatedPrincipal,
    get_current_principal,
)
from app.data.database import get_engine
from app.data.models.team import TeamRole, TeamPermission
from app.data.repos.teams_repo import TeamsRepo

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/teams", tags=["teams"])


# ─────────────────────────────────────────────────────────────────────────────
# REQUEST/RESPONSE MODELS
# ─────────────────────────────────────────────────────────────────────────────


class TeamMemberResponse(BaseModel):
    """Team member response model."""
    model_config = ConfigDict(extra="forbid")

    id: str
    user_id: str
    email: str | None = None
    display_name: str | None = None
    role: Literal["admin", "reviewer", "developer"]
    permissions: List[str] = Field(default_factory=list)
    created_at: str | None = None
    updated_at: str | None = None


class TeamResponse(BaseModel):
    """Team response model."""
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    project_id: str
    project_name: str | None = None
    description: str | None = None
    is_active: bool = True
    member_count: int = 0
    repo_count: int = 0
    members: List[TeamMemberResponse] = Field(default_factory=list)
    
    # Stats
    admin_count: int = 0
    reviewer_count: int = 0
    developer_count: int = 0
    active_reviews: int = 0
    total_reviews: int = 0
    avg_review_time_hours: float = 0.0
    
    created_at: str | None = None
    updated_at: str | None = None


class TeamListResponse(BaseModel):
    """Response model for team list."""
    items: List[TeamResponse]
    total: int


class CreateTeamRequest(BaseModel):
    """Request to create a team under a project."""
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    project_id: str = Field(min_length=1, max_length=128)
    description: str | None = Field(None, max_length=500)


class UpdateTeamRequest(BaseModel):
    """Request to update a team."""
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    is_active: bool | None = None


class AddMemberRequest(BaseModel):
    """Request to add a team member."""
    model_config = ConfigDict(extra="forbid")

    user_id: str
    role: Literal["admin", "reviewer", "developer"] = "developer"
    permissions: List[str] = Field(default_factory=list)


class UpdateMemberRequest(BaseModel):
    """Request to update a team member's role or permissions."""
    model_config = ConfigDict(extra="forbid")

    role: Literal["admin", "reviewer", "developer"] | None = None
    permissions: List[str] | None = None


class UserProjectAccessResponse(BaseModel):
    """Response for user's resolved access in a project."""
    model_config = ConfigDict(extra="forbid")

    user_id: str
    project_id: str
    team_id: str | None = None
    team_name: str | None = None
    role: Literal["admin", "reviewer", "developer"]
    permissions: List[str] = Field(default_factory=list)
    source: Literal["team", "org", "platform", "none"]


# ─────────────────────────────────────────────────────────────────────────────
# HELPER FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────


def _serialize_datetime(value: Any) -> str | None:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value) if value else None


def _team_to_response(team, members=None, stats=None) -> TeamResponse:
    """Convert Team model to response."""
    member_responses = []
    if members:
        for m in members:
            member_responses.append(TeamMemberResponse(
                id=m.id,
                user_id=m.user_id,
                email=m.user_email,
                display_name=m.user_display_name,
                role=m.role.value,
                permissions=m.permissions or [],
                created_at=_serialize_datetime(m.created_at),
                updated_at=_serialize_datetime(m.updated_at),
            ))
    
    return TeamResponse(
        id=team.id,
        name=team.name,
        project_id=team.project_id,
        project_name=team.project_name,
        description=team.description,
        is_active=team.is_active,
        member_count=team.member_count if hasattr(team, 'member_count') else len(member_responses),
        repo_count=team.repo_count if hasattr(team, 'repo_count') else 0,
        members=member_responses,
        admin_count=stats.admin_count if stats else 0,
        reviewer_count=stats.reviewer_count if stats else 0,
        developer_count=stats.developer_count if stats else 0,
        active_reviews=stats.active_reviews if stats else 0,
        total_reviews=stats.total_reviews if stats else 0,
        avg_review_time_hours=stats.avg_review_time_hours if stats else 0.0,
        created_at=_serialize_datetime(team.created_at),
        updated_at=_serialize_datetime(team.updated_at),
    )


def _ensure_user_record(engine, principal: AuthenticatedPrincipal) -> None:
    """Ensure the user exists in the users table."""
    email = principal.email.strip() if isinstance(principal.email, str) and principal.email.strip() else None
    display_name = (
        principal.display_name.strip()
        if isinstance(principal.display_name, str) and principal.display_name.strip()
        else None
    )

    with engine.begin() as conn:
        conn.execute(
            text("""
                INSERT INTO users (id, email, display_name, is_active, created_at)
                VALUES (:id, :email, :display_name, true, :created_at)
                ON CONFLICT (id) DO UPDATE
                SET email = COALESCE(EXCLUDED.email, users.email),
                    display_name = COALESCE(EXCLUDED.display_name, users.display_name),
                    is_active = true
            """),
            {
                "id": principal.user_id,
                "email": email or f"{principal.user_id}@clerk.local",
                "display_name": display_name,
                "created_at": datetime.now(timezone.utc),
            },
        )


def _check_team_admin_access(
    engine,
    team_id: str,
    user_id: str,
    platform_role: str,
) -> bool:
    """Check if user has admin access to a team."""
    # Platform admins and tech leads always have access
    if platform_role in {"admin", "tech_lead"}:
        return True
    
    # Check team membership
    with engine.connect() as conn:
        row = conn.execute(
            text("""
                SELECT tm.role
                FROM team_members tm
                WHERE tm.team_id = :team_id AND tm.user_id = :user_id
            """),
            {"team_id": team_id, "user_id": user_id}
        ).mappings().first()
        
        if row and row["role"] == "admin":
            return True
        
        # Check org-level admin access
        org_row = conn.execute(
            text("""
                SELECT om.role
                FROM organization_memberships om
                JOIN project_profiles pp ON pp.organization_id = om.organization_id
                JOIN teams t ON t.project_id = pp.id
                WHERE t.id = :team_id AND om.user_id = :user_id AND om.status = 'active'
            """),
            {"team_id": team_id, "user_id": user_id}
        ).mappings().first()
        
        if org_row and org_row["role"] in ("owner", "admin"):
            return True
    
    return False


def _check_project_access(
    engine,
    project_id: str,
    user_id: str,
    platform_role: str,
) -> bool:
    """Check if user has access to create teams in a project."""
    if platform_role in {"admin", "tech_lead"}:
        return True
    
    with engine.connect() as conn:
        # Check team membership in the project
        team_row = conn.execute(
            text("""
                SELECT tm.role
                FROM team_members tm
                JOIN teams t ON t.id = tm.team_id
                WHERE t.project_id = :project_id AND tm.user_id = :user_id AND t.is_active = TRUE
            """),
            {"project_id": project_id, "user_id": user_id}
        ).mappings().first()
        
        if team_row and team_row["role"] == "admin":
            return True
        
        # Check org-level access
        org_row = conn.execute(
            text("""
                SELECT om.role
                FROM organization_memberships om
                JOIN project_profiles pp ON pp.organization_id = om.organization_id
                WHERE pp.id = :project_id AND om.user_id = :user_id AND om.status = 'active'
            """),
            {"project_id": project_id, "user_id": user_id}
        ).mappings().first()
        
        if org_row and org_row["role"] in ("owner", "admin"):
            return True
    
    return False


# ─────────────────────────────────────────────────────────────────────────────
# TEAM ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────


@router.get("", response_model=TeamListResponse)
async def list_teams(
    project_id: str | None = Query(None, description="Filter by project ID"),
    include_members: bool = Query(False, description="Include team members"),
    include_stats: bool = Query(False, description="Include team statistics"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """
    List teams. Optionally filter by project.
    
    If project_id is provided, returns teams for that project.
    Otherwise returns all teams the user has access to.
    """
    engine = get_engine()
    _ensure_user_record(engine, principal)
    repo = TeamsRepo(engine)
    
    if project_id:
        teams = repo.get_teams_by_project(project_id)
    else:
        # Get all teams user is a member of
        user_teams = repo.get_user_teams(principal.user_id)
        teams = [t[0] for t in user_teams]
    
    items = []
    for team in teams:
        members = repo.get_team_members(team.id) if include_members else None
        stats = repo.get_team_with_stats(team.id) if include_stats else None
        items.append(_team_to_response(team, members, stats))
    
    return TeamListResponse(items=items, total=len(items))


@router.get("/{team_id}", response_model=TeamResponse)
async def get_team(
    team_id: str,
    include_members: bool = Query(True, description="Include team members"),
    include_stats: bool = Query(True, description="Include team statistics"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """Get a specific team by ID with members and stats."""
    engine = get_engine()
    _ensure_user_record(engine, principal)
    repo = TeamsRepo(engine)
    
    team = repo.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    members = repo.get_team_members(team_id) if include_members else None
    stats = repo.get_team_with_stats(team_id) if include_stats else None
    
    return _team_to_response(team, members, stats)


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
async def create_team(
    request: CreateTeamRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """
    Create a new team under a project.
    
    Requires admin access to the project (via team or org membership).
    """
    engine = get_engine()
    _ensure_user_record(engine, principal)
    
    # Check project access
    if not _check_project_access(engine, request.project_id, principal.user_id, principal.role):
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to create teams in this project"
        )
    
    # Verify project exists
    with engine.connect() as conn:
        project = conn.execute(
            text("SELECT id, name FROM project_profiles WHERE id = :id"),
            {"id": request.project_id}
        ).mappings().first()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
    
    repo = TeamsRepo(engine)
    
    # Create team
    team = repo.create_team(
        name=request.name,
        project_id=request.project_id,
        description=request.description,
    )
    
    # Add creator as admin
    repo.add_member(
        team_id=team.id,
        user_id=principal.user_id,
        role=TeamRole.ADMIN,
    )
    
    # Refresh team data
    team = repo.get_team(team.id)
    members = repo.get_team_members(team.id)
    stats = repo.get_team_with_stats(team.id)
    
    return _team_to_response(team, members, stats)


@router.patch("/{team_id}", response_model=TeamResponse)
async def update_team(
    team_id: str,
    request: UpdateTeamRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """Update a team's details. Requires admin access."""
    engine = get_engine()
    _ensure_user_record(engine, principal)
    
    if not _check_team_admin_access(engine, team_id, principal.user_id, principal.role):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    repo = TeamsRepo(engine)
    
    team = repo.update_team(
        team_id=team_id,
        name=request.name,
        description=request.description,
        is_active=request.is_active,
    )
    
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    members = repo.get_team_members(team_id)
    stats = repo.get_team_with_stats(team_id)
    
    return _team_to_response(team, members, stats)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_team(
    team_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """Delete a team. Requires admin access."""
    engine = get_engine()
    _ensure_user_record(engine, principal)
    
    if not _check_team_admin_access(engine, team_id, principal.user_id, principal.role):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    repo = TeamsRepo(engine)
    
    if not repo.delete_team(team_id):
        raise HTTPException(status_code=404, detail="Team not found")


# ─────────────────────────────────────────────────────────────────────────────
# TEAM MEMBER ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{team_id}/members", response_model=List[TeamMemberResponse])
async def list_team_members(
    team_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """Get all members of a team."""
    engine = get_engine()
    _ensure_user_record(engine, principal)
    repo = TeamsRepo(engine)
    
    # Verify team exists
    team = repo.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    members = repo.get_team_members(team_id)
    
    return [
        TeamMemberResponse(
            id=m.id,
            user_id=m.user_id,
            email=m.user_email,
            display_name=m.user_display_name,
            role=m.role.value,
            permissions=m.permissions or [],
            created_at=_serialize_datetime(m.created_at),
            updated_at=_serialize_datetime(m.updated_at),
        )
        for m in members
    ]


@router.post("/{team_id}/members", response_model=TeamMemberResponse, status_code=status.HTTP_201_CREATED)
async def add_team_member(
    team_id: str,
    request: AddMemberRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """Add a member to a team. Requires admin access."""
    engine = get_engine()
    _ensure_user_record(engine, principal)
    
    if not _check_team_admin_access(engine, team_id, principal.user_id, principal.role):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    repo = TeamsRepo(engine)
    
    # Verify team exists
    team = repo.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Verify user exists
    with engine.connect() as conn:
        user = conn.execute(
            text("SELECT id FROM users WHERE id = :id"),
            {"id": request.user_id}
        ).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
    
    member = repo.add_member(
        team_id=team_id,
        user_id=request.user_id,
        role=TeamRole(request.role),
        permissions=request.permissions,
    )
    
    # Refresh to get user details
    member = repo.get_member(team_id, request.user_id)
    
    return TeamMemberResponse(
        id=member.id,
        user_id=member.user_id,
        email=member.user_email,
        display_name=member.user_display_name,
        role=member.role.value,
        permissions=member.permissions or [],
        created_at=_serialize_datetime(member.created_at),
        updated_at=_serialize_datetime(member.updated_at),
    )


@router.patch("/{team_id}/members/{user_id}", response_model=TeamMemberResponse)
async def update_team_member(
    team_id: str,
    user_id: str,
    request: UpdateMemberRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """
    Update a team member's role or permissions.
    
    Requires admin access to the team.
    """
    engine = get_engine()
    _ensure_user_record(engine, principal)
    
    if not _check_team_admin_access(engine, team_id, principal.user_id, principal.role):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    repo = TeamsRepo(engine)
    
    # Verify team exists
    team = repo.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    
    # Verify member exists
    existing = repo.get_member(team_id, user_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Team member not found")
    
    # Update member
    role = TeamRole(request.role) if request.role else None
    member = repo.update_member(
        team_id=team_id,
        user_id=user_id,
        role=role,
        permissions=request.permissions,
    )
    
    if not member:
        raise HTTPException(status_code=404, detail="Failed to update member")
    
    return TeamMemberResponse(
        id=member.id,
        user_id=member.user_id,
        email=member.user_email,
        display_name=member.user_display_name,
        role=member.role.value,
        permissions=member.permissions or [],
        created_at=_serialize_datetime(member.created_at),
        updated_at=_serialize_datetime(member.updated_at),
    )


@router.delete("/{team_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_team_member(
    team_id: str,
    user_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """Remove a member from a team. Requires admin access."""
    engine = get_engine()
    _ensure_user_record(engine, principal)
    
    if not _check_team_admin_access(engine, team_id, principal.user_id, principal.role):
        raise HTTPException(status_code=403, detail="Admin access required")
    
    repo = TeamsRepo(engine)
    
    if not repo.remove_member(team_id, user_id):
        raise HTTPException(status_code=404, detail="Team member not found")


# ─────────────────────────────────────────────────────────────────────────────
# PROJECT TEAM ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/project/{project_id}", response_model=TeamListResponse)
async def get_project_teams(
    project_id: str,
    include_members: bool = Query(True, description="Include team members"),
    include_stats: bool = Query(False, description="Include team statistics"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """
    Get all teams for a project.
    
    This is the main endpoint for the Project → Team hierarchy.
    """
    engine = get_engine()
    _ensure_user_record(engine, principal)
    repo = TeamsRepo(engine)
    
    # Verify project exists
    with engine.connect() as conn:
        project = conn.execute(
            text("SELECT id FROM project_profiles WHERE id = :id"),
            {"id": project_id}
        ).first()
        
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
    
    teams = repo.get_teams_by_project(project_id)
    
    items = []
    for team in teams:
        members = repo.get_team_members(team.id) if include_members else None
        stats = repo.get_team_with_stats(team.id) if include_stats else None
        items.append(_team_to_response(team, members, stats))
    
    return TeamListResponse(items=items, total=len(items))


# ─────────────────────────────────────────────────────────────────────────────
# USER ACCESS ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/access/project/{project_id}", response_model=UserProjectAccessResponse)
async def get_user_project_access(
    project_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """
    Get the current user's resolved access for a project.
    
    Role resolution order:
    1. team_members.role (highest priority)
    2. org_members.role (mid priority)
    3. users.role (lowest priority)
    """
    engine = get_engine()
    _ensure_user_record(engine, principal)
    repo = TeamsRepo(engine)
    
    access = repo.get_user_project_access(principal.user_id, project_id)
    
    return UserProjectAccessResponse(
        user_id=access.user_id,
        project_id=access.project_id,
        team_id=access.team_id,
        team_name=access.team_name,
        role=access.role.value,
        permissions=access.permissions,
        source=access.source,
    )


@router.get("/my-teams", response_model=TeamListResponse)
async def get_my_teams(
    include_stats: bool = Query(False, description="Include team statistics"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """Get all teams the current user is a member of."""
    engine = get_engine()
    _ensure_user_record(engine, principal)
    repo = TeamsRepo(engine)
    
    user_teams = repo.get_user_teams(principal.user_id)
    
    items = []
    for team, member in user_teams:
        stats = repo.get_team_with_stats(team.id) if include_stats else None
        response = _team_to_response(team, [member], stats)
        items.append(response)
    
    return TeamListResponse(items=items, total=len(items))


# ─────────────────────────────────────────────────────────────────────────────
# AVAILABLE PERMISSIONS ENDPOINT
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/permissions/available", response_model=List[dict])
async def get_available_permissions(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
):
    """Get list of available granular permissions for teams."""
    return [
        {"value": p.value, "label": p.value.replace("_", " ").title()}
        for p in TeamPermission
    ]

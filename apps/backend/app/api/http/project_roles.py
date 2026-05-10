"""
Project Roles API endpoints for managing user roles within specific projects.

Provides endpoints to assign, remove, and query project-specific roles.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.api.middleware.auth import (
    AuthenticatedPrincipal,
    get_rbac_repo,
    principal_has_role,
    require_auth,
    require_role,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/projects", tags=["project-roles"])


# ─── Request/Response Models ──────────────────────────────────────────────────

class AssignProjectRoleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    
    user_id: str
    role_code: str
    notes: str | None = None
    expires_at: str | None = None


class ProjectRoleResponse(BaseModel):
    id: str
    user_id: str
    project_id: str
    role_id: str
    role_code: str
    role_label: str | None = None
    user_email: str | None = None
    user_display_name: str | None = None
    assigned_by: str | None = None
    notes: str | None = None
    expires_at: str | None = None
    is_active: bool
    created_at: str | None = None


class ProjectMembersResponse(BaseModel):
    project_id: str
    members: list[ProjectRoleResponse]
    total: int


class UserProjectRolesResponse(BaseModel):
    user_id: str
    roles: list[ProjectRoleResponse]
    total: int


class ProjectPermissionsResponse(BaseModel):
    user_id: str
    project_id: str
    permissions: list[str]


class CheckPermissionResponse(BaseModel):
    user_id: str
    project_id: str
    permission_code: str
    has_permission: bool


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/{project_id}/members", response_model=ProjectMembersResponse)
async def get_project_members(
    project_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_role("admin", "tech_lead")),
):
    """Get all members with roles in a specific project."""
    repo = get_rbac_repo()
    members = repo.get_project_members(project_id)
    
    return ProjectMembersResponse(
        project_id=project_id,
        members=[
            ProjectRoleResponse(
                id=str(m.get("id", "")),
                user_id=str(m.get("user_id", "")),
                project_id=project_id,
                role_id=str(m.get("role_id", "")),
                role_code=str(m.get("role_code", "")),
                role_label=m.get("role_label"),
                user_email=m.get("user_email"),
                user_display_name=m.get("user_display_name"),
                assigned_by=m.get("assigned_by"),
                notes=m.get("notes"),
                expires_at=str(m.get("expires_at")) if m.get("expires_at") else None,
                is_active=bool(m.get("is_active", False)),
                created_at=str(m.get("created_at")) if m.get("created_at") else None,
            )
            for m in members
        ],
        total=len(members),
    )


@router.post("/{project_id}/roles", response_model=ProjectRoleResponse)
async def assign_project_role(
    project_id: str,
    request: AssignProjectRoleRequest,
    principal: AuthenticatedPrincipal | None = Depends(require_role("admin", "tech_lead")),
):
    """Assign a role to a user for a specific project.
    
    This allows users to have different roles in different projects.
    For example, a user might be a Developer in Project A but a Lead Reviewer in Project B.
    """
    repo = get_rbac_repo()
    
    assigned_by = principal.user_id if principal is not None else None
    
    result = repo.assign_project_role(
        user_id=request.user_id,
        project_id=project_id,
        role_code=request.role_code,
        assigned_by=assigned_by,
        notes=request.notes,
        expires_at=request.expires_at,
    )
    
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to assign role '{request.role_code}' to user. Role may not exist.",
        )
    
    return ProjectRoleResponse(
        id=result.get("id", ""),
        user_id=result.get("user_id", ""),
        project_id=project_id,
        role_id=result.get("role_id", ""),
        role_code=result.get("role_code", ""),
        assigned_by=result.get("assigned_by"),
        notes=result.get("notes"),
        expires_at=result.get("expires_at"),
        is_active=result.get("is_active", False),
        created_at=result.get("created_at"),
    )


@router.delete("/{project_id}/roles/{user_id}")
async def remove_project_role(
    project_id: str,
    user_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_role("admin", "tech_lead")),
):
    """Remove a user's role from a specific project."""
    repo = get_rbac_repo()
    success = repo.remove_project_role(user_id, project_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active role found for user {user_id} in project {project_id}",
        )
    
    return {"success": True, "message": "Role removed successfully"}


@router.get("/{project_id}/roles/{user_id}", response_model=ProjectRoleResponse)
async def get_user_project_role(
    project_id: str,
    user_id: str,
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
):
    """Get a specific user's role in a project."""
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if principal.user_id != user_id and not principal_has_role(principal, "admin", "tech_lead"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    repo = get_rbac_repo()
    role = repo.get_user_project_role(user_id, project_id)
    
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active role found for user {user_id} in project {project_id}",
        )
    
    return ProjectRoleResponse(
        id=str(role.get("id", "")),
        user_id=str(role.get("user_id", "")),
        project_id=project_id,
        role_id=str(role.get("role_id", "")),
        role_code=str(role.get("role_code", "")),
        role_label=role.get("role_label"),
        assigned_by=role.get("assigned_by"),
        notes=role.get("notes"),
        expires_at=str(role.get("expires_at")) if role.get("expires_at") else None,
        is_active=bool(role.get("is_active", False)),
        created_at=str(role.get("created_at")) if role.get("created_at") else None,
    )


@router.get("/{project_id}/permissions/{user_id}", response_model=ProjectPermissionsResponse)
async def get_user_permissions_for_project(
    project_id: str,
    user_id: str,
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
):
    """Get all permissions a user has for a specific project.
    
    This combines global permissions and project-specific role permissions.
    """
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if principal.user_id != user_id and not principal_has_role(principal, "admin", "tech_lead"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    repo = get_rbac_repo()
    permissions = repo.get_user_permissions_for_project(user_id, project_id)
    
    return ProjectPermissionsResponse(
        user_id=user_id,
        project_id=project_id,
        permissions=permissions,
    )


@router.get("/{project_id}/check-permission/{user_id}/{permission_code}", response_model=CheckPermissionResponse)
async def check_permission_for_project(
    project_id: str,
    user_id: str,
    permission_code: str,
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
):
    """Check if a user has a specific permission for a project."""
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if principal.user_id != user_id and not principal_has_role(principal, "admin", "tech_lead"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    repo = get_rbac_repo()
    has_permission = repo.check_user_has_permission_for_project(user_id, project_id, permission_code)
    
    return CheckPermissionResponse(
        user_id=user_id,
        project_id=project_id,
        permission_code=permission_code,
        has_permission=has_permission,
    )


# ─── User-centric Endpoints ───────────────────────────────────────────────────

@router.get("/users/{user_id}/project-roles", response_model=UserProjectRolesResponse)
async def get_user_all_project_roles(
    user_id: str,
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
):
    """Get all project-specific roles for a user."""
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if principal.user_id != user_id and not principal_has_role(principal, "admin", "tech_lead"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    repo = get_rbac_repo()
    roles = repo.get_user_project_roles(user_id)
    
    return UserProjectRolesResponse(
        user_id=user_id,
        roles=[
            ProjectRoleResponse(
                id=str(r.get("id", "")),
                user_id=user_id,
                project_id=str(r.get("project_id", "")),
                role_id=str(r.get("role_id", "")),
                role_code=str(r.get("role_code", "")),
                role_label=r.get("role_label"),
                assigned_by=r.get("assigned_by"),
                notes=r.get("notes"),
                expires_at=str(r.get("expires_at")) if r.get("expires_at") else None,
                is_active=bool(r.get("is_active", False)),
                created_at=str(r.get("created_at")) if r.get("created_at") else None,
            )
            for r in roles
        ],
        total=len(roles),
    )

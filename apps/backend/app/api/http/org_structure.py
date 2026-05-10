from __future__ import annotations

from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal, require_permission
from app.data.repos.org_structure_repo import (
    OrganizationStructureRepo,
    CreateTeamInput,
    UpdateTeamInput,
    CreateTeamMemberInput,
    CreateRepositoryInput,
    CreateBranchInput,
    CreateCommitInput
)

router = APIRouter(prefix="/api/v1/structure", tags=["organization-structure"])

# ===== MODELS PYDANTIC =====

class CreateTeamRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    project_id: Optional[str] = None
    team_lead_id: Optional[str] = None
    settings: dict = Field(default_factory=dict)

class UpdateTeamRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    team_lead_id: Optional[str] = None
    settings: Optional[dict] = None

class AddTeamMemberRequest(BaseModel):
    user_id: str = Field(..., min_length=1)
    role: str = Field(default="developer", pattern="^(admin|reviewer|developer)$")
    permissions: List[str] = Field(default_factory=list)

class CreateRepositoryRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    full_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    project_id: Optional[str] = None
    team_id: Optional[str] = None
    github_repo_id: Optional[int] = None
    github_url: Optional[str] = None
    default_branch: str = "main"
    is_private: bool = True
    language: Optional[str] = None
    settings: dict = Field(default_factory=dict)

class CreateBranchRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    commit_sha: Optional[str] = None
    is_default: bool = False
    is_protected: bool = False
    protection_rules: dict = Field(default_factory=dict)

class CreateCommitRequest(BaseModel):
    sha: str = Field(..., min_length=40, max_length=40)
    author_name: Optional[str] = None
    author_email: Optional[str] = None
    author_id: Optional[str] = None
    message: Optional[str] = None
    additions: int = 0
    deletions: int = 0
    changed_files: int = 0


# ===== ENDPOINTS =====

@router.get("/organizations/{organization_id}/hierarchy")
async def get_organization_hierarchy(
    organization_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("projects.read"))
) -> dict[str, Any]:
    """
    Récupérer la hiérarchie complète d'une organisation :
    Organization → Projects[] → Teams[] → Repositories[] → Branches[]
    """
    repo = OrganizationStructureRepo()
    try:
        return repo.get_organization_hierarchy(organization_id)
    except Exception as e:
        if "one()" in str(e):
            raise HTTPException(status_code=404, detail="Organization not found")
        raise HTTPException(status_code=500, detail=f"Failed to get hierarchy: {str(e)}")


@router.get("/projects/{project_id}/details")
async def get_project_details(
    project_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("projects.read"))
) -> dict[str, Any]:
    """
    Récupérer les détails complets d'un projet avec teams, repos, branches
    """
    repo = OrganizationStructureRepo()
    try:
        return repo.get_project_details(project_id)
    except Exception as e:
        if "one()" in str(e):
            raise HTTPException(status_code=404, detail="Project not found")
        raise HTTPException(status_code=500, detail=f"Failed to get project details: {str(e)}")


# ===== TEAMS =====

@router.post("/organizations/{organization_id}/teams")
async def create_team(
    organization_id: str,
    request: CreateTeamRequest,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.create"))
) -> dict[str, Any]:
    """Créer une nouvelle équipe dans une organisation"""
    repo = OrganizationStructureRepo()
    
    input_data = CreateTeamInput(
        name=request.name,
        organization_id=organization_id,
        description=request.description,
        project_id=request.project_id,
        team_lead_id=request.team_lead_id,
        settings=request.settings
    )
    
    try:
        return repo.create_team(input_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create team: {str(e)}")


@router.get("/organizations/{organization_id}/teams")
async def get_teams_by_organization(
    organization_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.read"))
) -> List[dict[str, Any]]:
    """Récupérer toutes les équipes d'une organisation"""
    repo = OrganizationStructureRepo()
    return repo.get_teams_by_organization(organization_id)


@router.get("/projects/{project_id}/teams")
async def get_teams_by_project(
    project_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.read"))
) -> List[dict[str, Any]]:
    """Récupérer toutes les équipes d'un projet"""
    repo = OrganizationStructureRepo()
    return repo.get_teams_by_project(project_id)


@router.get("/teams/{team_id}")
async def get_team_by_id(
    team_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.read"))
) -> dict[str, Any]:
    """Récupérer une équipe par ID"""
    repo = OrganizationStructureRepo()
    team = repo.get_team_by_id(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.patch("/teams/{team_id}")
async def update_team(
    team_id: str,
    request: UpdateTeamRequest,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.update"))
) -> dict[str, Any]:
    """Mettre à jour une équipe"""
    repo = OrganizationStructureRepo()
    
    input_data = UpdateTeamInput(
        name=request.name,
        description=request.description,
        team_lead_id=request.team_lead_id,
        settings=request.settings
    )
    
    team = repo.update_team(team_id, input_data)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.delete("/teams/{team_id}")
async def delete_team(
    team_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.delete"))
) -> dict[str, str]:
    """Supprimer une équipe"""
    repo = OrganizationStructureRepo()
    success = repo.delete_team(team_id)
    if not success:
        raise HTTPException(status_code=404, detail="Team not found")
    return {"message": "Team deleted successfully"}


# ===== TEAM MEMBERS =====

@router.post("/teams/{team_id}/members")
async def add_team_member(
    team_id: str,
    request: AddTeamMemberRequest,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.manage_members"))
) -> dict[str, Any]:
    """Ajouter un membre à une équipe"""
    repo = OrganizationStructureRepo()
    
    input_data = CreateTeamMemberInput(
        team_id=team_id,
        user_id=request.user_id,
        role=request.role,
        permissions=request.permissions,
        created_by=principal.user_id
    )
    
    try:
        return repo.add_team_member(input_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add team member: {str(e)}")


@router.get("/teams/{team_id}/members")
async def get_team_members(
    team_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.read"))
) -> List[dict[str, Any]]:
    """Récupérer tous les membres d'une équipe"""
    repo = OrganizationStructureRepo()
    return repo.get_team_members(team_id)


@router.delete("/teams/{team_id}/members/{user_id}")
async def remove_team_member(
    team_id: str,
    user_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.manage_members"))
) -> dict[str, str]:
    """Retirer un membre d'une équipe"""
    repo = OrganizationStructureRepo()
    success = repo.remove_team_member(team_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Team member not found")
    return {"message": "Team member removed successfully"}


@router.get("/users/{user_id}/teams")
async def get_user_teams(
    user_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("teams.read"))
) -> List[dict[str, Any]]:
    """Récupérer toutes les équipes d'un utilisateur"""
    # Vérifier que l'utilisateur peut voir ses propres équipes ou a la permission admin
    if user_id != principal.user_id and "teams.read_all" not in principal.permissions:
        raise HTTPException(status_code=403, detail="Cannot access other user's teams")
    
    repo = OrganizationStructureRepo()
    return repo.get_user_teams(user_id)


# ===== REPOSITORIES =====

@router.post("/organizations/{organization_id}/repositories")
async def create_repository(
    organization_id: str,
    request: CreateRepositoryRequest,
    principal: AuthenticatedPrincipal = Depends(require_permission("repositories.create"))
) -> dict[str, Any]:
    """Créer un nouveau repository dans une organisation"""
    repo = OrganizationStructureRepo()
    
    input_data = CreateRepositoryInput(
        name=request.name,
        full_name=request.full_name,
        organization_id=organization_id,
        description=request.description,
        project_id=request.project_id,
        team_id=request.team_id,
        github_repo_id=request.github_repo_id,
        github_url=request.github_url,
        default_branch=request.default_branch,
        is_private=request.is_private,
        language=request.language,
        settings=request.settings
    )
    
    try:
        return repo.create_repository(input_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create repository: {str(e)}")


@router.get("/organizations/{organization_id}/repositories")
async def get_repositories_by_organization(
    organization_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("repositories.read"))
) -> List[dict[str, Any]]:
    """Récupérer tous les repositories d'une organisation"""
    repo = OrganizationStructureRepo()
    return repo.get_repositories_by_organization(organization_id)


@router.get("/projects/{project_id}/repositories")
async def get_repositories_by_project(
    project_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("repositories.read"))
) -> List[dict[str, Any]]:
    """Récupérer tous les repositories d'un projet"""
    repo = OrganizationStructureRepo()
    return repo.get_repositories_by_project(project_id)


@router.get("/teams/{team_id}/repositories")
async def get_repositories_by_team(
    team_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("repositories.read"))
) -> List[dict[str, Any]]:
    """Récupérer tous les repositories d'une équipe"""
    repo = OrganizationStructureRepo()
    return repo.get_repositories_by_team(team_id)


# ===== BRANCHES =====

@router.post("/repositories/{repository_id}/branches")
async def create_branch(
    repository_id: str,
    request: CreateBranchRequest,
    principal: AuthenticatedPrincipal = Depends(require_permission("branches.create"))
) -> dict[str, Any]:
    """Créer une nouvelle branche dans un repository"""
    repo = OrganizationStructureRepo()
    
    input_data = CreateBranchInput(
        name=request.name,
        repository_id=repository_id,
        commit_sha=request.commit_sha,
        is_default=request.is_default,
        is_protected=request.is_protected,
        protection_rules=request.protection_rules
    )
    
    try:
        return repo.create_branch(input_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create branch: {str(e)}")


@router.get("/repositories/{repository_id}/branches")
async def get_branches_by_repository(
    repository_id: str,
    principal: AuthenticatedPrincipal = Depends(require_permission("branches.read"))
) -> List[dict[str, Any]]:
    """Récupérer toutes les branches d'un repository"""
    repo = OrganizationStructureRepo()
    return repo.get_branches_by_repository(repository_id)


# ===== COMMITS =====

@router.post("/branches/{branch_id}/commits")
async def create_commit(
    branch_id: str,
    repository_id: str = Query(..., description="Repository ID pour validation"),
    request: CreateCommitRequest = ...,
    principal: AuthenticatedPrincipal = Depends(require_permission("commits.create"))
) -> dict[str, Any]:
    """Créer un nouveau commit dans une branche"""
    repo = OrganizationStructureRepo()
    
    input_data = CreateCommitInput(
        sha=request.sha,
        branch_id=branch_id,
        repository_id=repository_id,
        author_name=request.author_name,
        author_email=request.author_email,
        author_id=request.author_id or principal.user_id,
        message=request.message,
        additions=request.additions,
        deletions=request.deletions,
        changed_files=request.changed_files
    )
    
    try:
        return repo.create_commit(input_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create commit: {str(e)}")


@router.get("/repositories/{repository_id}/commits")
async def get_commits_by_repository(
    repository_id: str,
    limit: int = Query(100, ge=1, le=1000, description="Number of commits to return"),
    principal: AuthenticatedPrincipal = Depends(require_permission("commits.read"))
) -> List[dict[str, Any]]:
    """Récupérer les commits récents d'un repository"""
    repo = OrganizationStructureRepo()
    return repo.get_commits_by_repository(repository_id, limit)


@router.get("/branches/{branch_id}/commits")
async def get_commits_by_branch(
    branch_id: str,
    limit: int = Query(100, ge=1, le=1000, description="Number of commits to return"),
    principal: AuthenticatedPrincipal = Depends(require_permission("commits.read"))
) -> List[dict[str, Any]]:
    """Récupérer les commits d'une branche"""
    repo = OrganizationStructureRepo()
    return repo.get_commits_by_branch(branch_id, limit)
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal
from app.data.repos.branch_policy_repo import BranchPolicyRepo
from app.data.repos.branch_protection_repo import BranchProtectionRepo
from app.data.repos.branch_repo import (
    BranchFilters,
    BranchRepo,
    CreateBranchInput,
    UpdateBranchInput,
)
from app.services.branch_policy_validator import BranchPolicyValidator
from app.services.branch_protection import BranchProtectionService

router = APIRouter(prefix="/v1/branches", tags=["branches"])


# ==================== Pydantic Models ====================


class CreateBranchRequest(BaseModel):
    """Request pour créer une branche."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(max_length=255)
    org_id: str | None = None
    branch_name: str = Field(min_length=1, max_length=255)
    branch_type: Literal["main", "develop", "feature", "hotfix", "release", "custom"]
    base_branch: str | None = None
    description: str | None = Field(default=None, max_length=1000)
    is_protected: bool = False
    is_default: bool = False


class UpdateBranchRequest(BaseModel):
    """Request pour mettre à jour une branche."""

    model_config = ConfigDict(extra="forbid")

    description: str | None = None
    is_protected: bool | None = None
    is_active: bool | None = None


class BranchResponse(BaseModel):
    """Response pour une branche."""

    id: str
    repo_id: str
    org_id: str | None
    branch_name: str
    branch_type: str
    branch_pattern: str | None
    last_commit_sha: str | None
    last_commit_author: str | None
    last_commit_message: str | None
    last_commit_at: str | None
    created_by: str | None
    created_at: str
    base_branch: str | None
    merged_into: str | None
    merge_status: str | None
    merged_at: str | None
    merged_by: str | None
    is_protected: bool
    is_default: bool
    is_active: bool
    ahead_count: int
    behind_count: int
    last_synced_at: str | None
    description: str | None
    metadata_json: dict[str, Any]
    updated_at: str


class BranchListResponse(BaseModel):
    """Response pour liste de branches."""

    branches: list[BranchResponse]
    total: int
    page: int
    limit: int


class ValidationErrorDetail(BaseModel):
    """Détail d'une erreur de validation."""

    field: str
    message: str
    violated_policies: list[str] | None = None


class CreateBranchResponse(BaseModel):
    """Response pour création de branche."""

    branch: BranchResponse
    validation_warnings: list[ValidationErrorDetail] | None = None


# ==================== Endpoints ====================


@router.post("", response_model=CreateBranchResponse, status_code=201)
async def create_branch(
    data: CreateBranchRequest,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> CreateBranchResponse:
    """
    Crée une nouvelle branche.

    Permissions requises: branches.create
    """
    # TODO: Vérifier les permissions branches.create basées sur branch_type

    branch_repo = BranchRepo()
    validator = BranchPolicyValidator()

    # Valider le nom de branche contre les politiques
    if data.org_id:
        name_validation = validator.validate_branch_name(
            branch_name=data.branch_name,
            branch_type=data.branch_type,
            org_id=data.org_id,
            repo_id=data.repo_id,
        )

        if not name_validation.valid:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "branch_name_invalid",
                    "message": name_validation.reason,
                    "violated_policies": name_validation.violated_policies,
                },
            )

        # Valider le workflow
        workflow_validation = validator.validate_workflow(
            operation="create",
            branch_name=data.branch_name,
            branch_type=data.branch_type,
            base_branch=data.base_branch,
            org_id=data.org_id,
            repo_id=data.repo_id,
        )

        if not workflow_validation.valid:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "workflow_invalid",
                    "message": workflow_validation.reason,
                    "violated_policies": workflow_validation.violated_policies,
                },
            )

    # Vérifier si la branche existe déjà
    existing = branch_repo.get_by_repo_and_name(data.repo_id, data.branch_name)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={"error": "branch_exists", "message": f"Branch '{data.branch_name}' already exists"},
        )

    # Créer la branche
    branch_id = f"branch_{uuid.uuid4().hex}"

    # Déterminer le pattern de branche
    branch_pattern = None
    if data.branch_type in ["feature", "hotfix", "release"]:
        branch_pattern = f"{data.branch_type}/*"

    create_input = CreateBranchInput(
        branch_id=branch_id,
        repo_id=data.repo_id,
        org_id=data.org_id,
        branch_name=data.branch_name,
        branch_type=data.branch_type,
        branch_pattern=branch_pattern,
        created_by=current_user.id,
        base_branch=data.base_branch,
        description=data.description,
        is_protected=data.is_protected,
        is_default=data.is_default,
    )

    branch = branch_repo.create(create_input)

    return CreateBranchResponse(
        branch=BranchResponse(**_serialize_branch(branch)),
        validation_warnings=None,
    )


@router.get("", response_model=BranchListResponse)
async def list_branches(
    repo_id: str | None = Query(None),
    org_id: str | None = Query(None),
    branch_type: str | None = Query(None),
    is_protected: bool | None = Query(None),
    is_active: bool | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> BranchListResponse:
    """
    Liste les branches avec filtres et pagination.

    Permissions requises: branches.view
    """
    branch_repo = BranchRepo()

    filters = BranchFilters(
        repo_id=repo_id,
        org_id=org_id,
        branch_type=branch_type,
        is_protected=is_protected,
        is_active=is_active,
    )

    offset = (page - 1) * limit
    branches, total = branch_repo.list_branches(filters, limit=limit, offset=offset)

    return BranchListResponse(
        branches=[BranchResponse(**_serialize_branch(b)) for b in branches],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{branch_id}", response_model=BranchResponse)
async def get_branch(
    branch_id: str,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> BranchResponse:
    """
    Récupère les détails d'une branche.

    Permissions requises: branches.view
    """
    branch_repo = BranchRepo()

    try:
        branch = branch_repo.get_by_id(branch_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": "branch_not_found", "message": "Branch not found"})

    return BranchResponse(**_serialize_branch(branch))


@router.patch("/{branch_id}", response_model=BranchResponse)
async def update_branch(
    branch_id: str,
    data: UpdateBranchRequest,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> BranchResponse:
    """
    Met à jour une branche.

    Permissions requises: branches.merge (ou admin)
    """
    # TODO: Vérifier les permissions

    branch_repo = BranchRepo()

    try:
        branch_repo.get_by_id(branch_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": "branch_not_found", "message": "Branch not found"})

    update_input = UpdateBranchInput(
        branch_id=branch_id,
        description=data.description,
        is_protected=data.is_protected,
        is_active=data.is_active,
    )

    updated_branch = branch_repo.update(update_input)

    return BranchResponse(**_serialize_branch(updated_branch))


@router.delete("/{branch_id}", status_code=204, response_model=None)
async def delete_branch(
    branch_id: str,
    force: bool = Query(False, description="Force delete even if protected"),
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> Response:
    """
    Supprime une branche.

    Permissions requises: branches.delete
    """
    # TODO: Vérifier les permissions

    branch_repo = BranchRepo()
    protection_service = BranchProtectionService()

    try:
        branch = branch_repo.get_by_id(branch_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": "branch_not_found", "message": "Branch not found"})

    # Vérifier si la branche est protégée
    if branch["is_protected"] and not force:
        raise HTTPException(
            status_code=403,
            detail={
                "error": "branch_protected",
                "message": "Cannot delete protected branch without force=true",
            },
        )

    # Vérifier les règles de protection si force n'est pas activé
    if not force and branch["org_id"]:
        validation = protection_service.can_perform_operation(
            operation="delete",
            branch_id=branch_id,
            user_role=current_user.roles[0] if current_user.roles else "developer",
            user_permissions=current_user.permissions,
            org_id=branch["org_id"],
            repo_id=branch["repo_id"],
        )

        if not validation.allowed:
            raise HTTPException(
                status_code=403,
                detail={
                    "error": "operation_not_allowed",
                    "message": validation.reason,
                },
            )

    branch_repo.delete(branch_id)
    return Response(status_code=204)


@router.post("/{branch_id}/set-default", response_model=BranchResponse)
async def set_default_branch(
    branch_id: str,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> BranchResponse:
    """
    Définit une branche comme branche par défaut.

    Permissions requises: branches.set_default
    """
    # TODO: Vérifier permission branches.set_default

    branch_repo = BranchRepo()

    try:
        branch = branch_repo.get_by_id(branch_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": "branch_not_found", "message": "Branch not found"})

    branch_repo.set_default_branch(branch["repo_id"], branch_id)

    updated_branch = branch_repo.get_by_id(branch_id)

    return BranchResponse(**_serialize_branch(updated_branch))


@router.get("/{branch_id}/compare/{target_branch_id}")
async def compare_branches(
    branch_id: str,
    target_branch_id: str,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> dict[str, Any]:
    """
    Compare deux branches (placeholder pour future implémentation).

    Permissions requises: branches.view
    """
    # TODO: Implémenter la comparaison avec GitHub API
    raise HTTPException(
        status_code=501,
        detail={"error": "not_implemented", "message": "Branch comparison not yet implemented"},
    )


# ==================== Helper Functions ====================


def _serialize_branch(branch: dict[str, Any]) -> dict[str, Any]:
    """Sérialise une branche pour la réponse API."""
    return {
        "id": branch["id"],
        "repo_id": branch["repo_id"],
        "org_id": branch.get("org_id"),
        "branch_name": branch["branch_name"],
        "branch_type": branch["branch_type"],
        "branch_pattern": branch.get("branch_pattern"),
        "last_commit_sha": branch.get("last_commit_sha"),
        "last_commit_author": branch.get("last_commit_author"),
        "last_commit_message": branch.get("last_commit_message"),
        "last_commit_at": branch["last_commit_at"].isoformat() if branch.get("last_commit_at") else None,
        "created_by": branch.get("created_by"),
        "created_at": branch["created_at"].isoformat() if isinstance(branch["created_at"], datetime) else str(branch["created_at"]),
        "base_branch": branch.get("base_branch"),
        "merged_into": branch.get("merged_into"),
        "merge_status": branch.get("merge_status"),
        "merged_at": branch["merged_at"].isoformat() if branch.get("merged_at") else None,
        "merged_by": branch.get("merged_by"),
        "is_protected": branch["is_protected"],
        "is_default": branch["is_default"],
        "is_active": branch["is_active"],
        "ahead_count": branch.get("ahead_count", 0),
        "behind_count": branch.get("behind_count", 0),
        "last_synced_at": branch["last_synced_at"].isoformat() if branch.get("last_synced_at") else None,
        "description": branch.get("description"),
        "metadata_json": branch.get("metadata_json", {}),
        "updated_at": branch["updated_at"].isoformat() if isinstance(branch["updated_at"], datetime) else str(branch["updated_at"]),
    }

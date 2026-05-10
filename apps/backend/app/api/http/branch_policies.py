"""API endpoints for branch policies."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal
from app.data.repos.branch_policy_repo import (
    BranchPolicyRepo,
    CreateBranchPolicyInput as CreatePolicyInput,
    UpdateBranchPolicyInput as UpdatePolicyInput,
)

router = APIRouter(prefix="/v1/branch-policies", tags=["branch-policies"])


# ==================== Pydantic Models ====================


class NamingPatternConfig(BaseModel):
    """Configuration de pattern de nommage par type de branche."""

    model_config = ConfigDict(extra="forbid")

    feature: str | None = Field(
        default=None,
        description="Regex pattern for feature branches",
        json_schema_extra={"example": "^feature/[A-Z]+-[0-9]+-.*$"},
    )
    hotfix: str | None = Field(
        default=None,
        description="Regex pattern for hotfix branches",
        json_schema_extra={"example": "^hotfix/v[0-9]+\\.[0-9]+\\.[0-9]+$"},
    )
    release: str | None = Field(
        default=None,
        description="Regex pattern for release branches",
        json_schema_extra={"example": "^release/v[0-9]+\\.[0-9]+$"},
    )


class CreatePolicyRequest(BaseModel):
    """Request pour créer une politique de branche.

    ---
    openapi_examples:
        naming_policy:
            summary: Naming Convention Policy
            value:
                org_id: "org_123"
                policy_name: "Feature Branch Naming"
                policy_type: "naming"
                branch_naming_patterns:
                    feature: "^feature/[A-Z]+-[0-9]+-.*$"
                    hotfix: "^hotfix/critical-.*$"
                enforce_naming: true
        workflow_policy:
            summary: Workflow Policy
            value:
                org_id: "org_123"
                policy_name: "Feature Workflow"
                policy_type: "workflow"
                require_base_branch: true
                allowed_base_branches: ["develop"]
                auto_delete_on_merge: true
    """

    model_config = ConfigDict(extra="forbid")

    org_id: str
    policy_name: str = Field(min_length=1, max_length=100)
    policy_type: Literal["naming", "workflow", "protection", "merge_strategy"]

    # Naming conventions
    branch_naming_patterns: dict[str, str] = Field(default_factory=dict)
    enforce_naming: bool = False

    # Workflow policies
    require_base_branch: bool = False
    allowed_base_branches: list[str] = Field(default_factory=list)
    auto_delete_on_merge: bool = False
    max_branch_age_days: int | None = Field(default=None, ge=1, le=365)

    # Merge strategies
    allowed_merge_methods: list[Literal["merge", "squash", "rebase"]] = Field(
        default=["merge", "squash", "rebase"]
    )
    default_merge_method: Literal["merge", "squash", "rebase"] = "merge"

    # Scope
    applies_to_repos: list[str] = Field(default_factory=list)

    description: str | None = Field(default=None, max_length=500)
    priority: int = Field(default=0, ge=0, le=100)


class UpdatePolicyRequest(BaseModel):
    """Request pour mettre à jour une politique."""

    model_config = ConfigDict(extra="forbid")

    policy_name: str | None = Field(default=None, min_length=1, max_length=100)
    branch_naming_patterns: dict[str, str] | None = None
    enforce_naming: bool | None = None
    require_base_branch: bool | None = None
    allowed_base_branches: list[str] | None = None
    auto_delete_on_merge: bool | None = None
    max_branch_age_days: int | None = Field(default=None, ge=1, le=365)
    allowed_merge_methods: list[Literal["merge", "squash", "rebase"]] | None = None
    default_merge_method: Literal["merge", "squash", "rebase"] | None = None
    applies_to_repos: list[str] | None = None
    description: str | None = Field(default=None, max_length=500)
    priority: int | None = Field(default=None, ge=0, le=100)
    is_active: bool | None = None


class PolicyResponse(BaseModel):
    """Response pour une politique de branche."""

    id: str
    org_id: str
    policy_name: str
    policy_type: str
    branch_naming_patterns: dict[str, str]
    enforce_naming: bool
    require_base_branch: bool
    allowed_base_branches: list[str]
    auto_delete_on_merge: bool
    max_branch_age_days: int | None
    allowed_merge_methods: list[str]
    default_merge_method: str
    applies_to_repos: list[str]
    is_active: bool
    priority: int
    description: str | None
    created_by: str | None
    created_at: str
    updated_at: str


class PolicyListResponse(BaseModel):
    """Response pour liste de politiques."""

    policies: list[PolicyResponse]
    total: int


class NamingValidationRequest(BaseModel):
    """Request pour valider un nom de branche."""

    org_id: str
    repo_id: str | None = None
    branch_name: str
    branch_type: Literal["main", "develop", "feature", "hotfix", "release", "custom"]


class NamingValidationResponse(BaseModel):
    """Response de validation de nommage."""

    valid: bool
    reason: str | None
    violated_policies: list[str] | None = None
    suggested_format: str | None = None


# ==================== Endpoints ====================


@router.post("", response_model=PolicyResponse, status_code=201)
async def create_policy(
    data: CreatePolicyRequest,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> PolicyResponse:
    """
    Crée une nouvelle politique de branche.

    Les politiques permettent de définir des règles organisationnelles pour:
    - Conventions de nommage (naming)
    - Workflows de développement (workflow)
    - Règles de protection (protection)
    - Stratégies de merge (merge_strategy)

    Permissions requises: policies.create
    """
    # TODO: Vérifier permission policies.create

    repo = BranchPolicyRepo()

    # Vérifier unicité du nom
    existing = repo.get_by_org_and_name(data.org_id, data.policy_name)
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "policy_exists",
                "message": f"A policy named '{data.policy_name}' already exists",
            },
        )

    policy_id = f"policy_{uuid.uuid4().hex}"

    create_input = CreatePolicyInput(
        policy_id=policy_id,
        org_id=data.org_id,
        policy_name=data.policy_name,
        policy_type=data.policy_type,
        branch_naming_patterns=data.branch_naming_patterns,
        enforce_naming=data.enforce_naming,
        require_base_branch=data.require_base_branch,
        allowed_base_branches=data.allowed_base_branches,
        auto_delete_on_merge=data.auto_delete_on_merge,
        max_branch_age_days=data.max_branch_age_days,
        allowed_merge_methods=data.allowed_merge_methods,
        default_merge_method=data.default_merge_method,
        applies_to_repos=data.applies_to_repos,
        priority=data.priority,
        description=data.description,
        created_by=current_user.id,
    )

    policy = repo.create(create_input)

    return PolicyResponse(**_serialize_policy(policy))


@router.get("", response_model=PolicyListResponse)
async def list_policies(
    org_id: str = Query(..., description="Organization ID"),
    policy_type: str | None = Query(None, description="Filter by policy type"),
    is_active: bool | None = Query(None, description="Filter by active status"),
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> PolicyListResponse:
    """
    Liste les politiques de branches pour une organisation.

    Permissions requises: policies.view
    """
    repo = BranchPolicyRepo()
    policies = repo.list_policies(org_id=org_id, policy_type=policy_type, is_active=is_active)

    return PolicyListResponse(
        policies=[PolicyResponse(**_serialize_policy(p)) for p in policies],
        total=len(policies),
    )


@router.get("/{policy_id}", response_model=PolicyResponse)
async def get_policy(
    policy_id: str,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> PolicyResponse:
    """
    Récupère les détails d'une politique.

    Permissions requises: policies.view
    """
    repo = BranchPolicyRepo()

    try:
        policy = repo.get_by_id(policy_id)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail={"error": "policy_not_found", "message": "Policy not found"},
        )

    return PolicyResponse(**_serialize_policy(policy))


@router.patch("/{policy_id}", response_model=PolicyResponse)
async def update_policy(
    policy_id: str,
    data: UpdatePolicyRequest,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> PolicyResponse:
    """
    Met à jour une politique de branche.

    Permissions requises: policies.modify
    """
    # TODO: Vérifier permission policies.modify

    repo = BranchPolicyRepo()

    try:
        repo.get_by_id(policy_id)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail={"error": "policy_not_found", "message": "Policy not found"},
        )

    update_input = UpdatePolicyInput(
        policy_id=policy_id,
        policy_name=data.policy_name,
        branch_naming_patterns=data.branch_naming_patterns,
        enforce_naming=data.enforce_naming,
        require_base_branch=data.require_base_branch,
        allowed_base_branches=data.allowed_base_branches,
        auto_delete_on_merge=data.auto_delete_on_merge,
        max_branch_age_days=data.max_branch_age_days,
        allowed_merge_methods=data.allowed_merge_methods,
        default_merge_method=data.default_merge_method,
        applies_to_repos=data.applies_to_repos,
        priority=data.priority,
        description=data.description,
        is_active=data.is_active,
    )

    updated_policy = repo.update(update_input)

    return PolicyResponse(**_serialize_policy(updated_policy))


@router.delete("/{policy_id}", status_code=204, response_model=None)
async def delete_policy(
    policy_id: str,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> Response:
    """
    Supprime une politique de branche.

    Permissions requises: policies.delete
    """
    # TODO: Vérifier permission policies.delete

    repo = BranchPolicyRepo()

    try:
        repo.get_by_id(policy_id)
    except ValueError:
        raise HTTPException(
            status_code=404,
            detail={"error": "policy_not_found", "message": "Policy not found"},
        )

    repo.delete(policy_id)
    return Response(status_code=204)


@router.post("/validate-naming", response_model=NamingValidationResponse)
async def validate_branch_naming(
    data: NamingValidationRequest,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> NamingValidationResponse:
    """
    Valide un nom de branche contre les politiques de nommage.

    Vérifie si le nom de branche respecte les conventions définies
    par les politiques de l'organisation.

    Permissions requises: branches.view
    """
    from app.services.branch_policy_validator import BranchPolicyValidator

    validator = BranchPolicyValidator()
    result = validator.validate_branch_name(
        branch_name=data.branch_name,
        branch_type=data.branch_type,
        org_id=data.org_id,
        repo_id=data.repo_id,
    )

    suggested_format = None
    if not result.valid and data.branch_type in ["feature", "hotfix", "release"]:
        # Suggérer un format basé sur le type
        suggestions = {
            "feature": "feature/TICKET-123-description",
            "hotfix": "hotfix/v1.0.1",
            "release": "release/v1.0.0",
        }
        suggested_format = suggestions.get(data.branch_type)

    return NamingValidationResponse(
        valid=result.valid,
        reason=result.reason if not result.valid else None,
        violated_policies=result.violated_policies if not result.valid else None,
        suggested_format=suggested_format,
    )


# ==================== Helper Functions ====================


def _serialize_policy(policy: dict[str, Any]) -> dict[str, Any]:
    """Sérialise une politique pour la réponse API."""
    return {
        "id": policy["id"],
        "org_id": policy["org_id"],
        "policy_name": policy["policy_name"],
        "policy_type": policy["policy_type"],
        "branch_naming_patterns": policy.get("branch_naming_patterns", {}),
        "enforce_naming": policy["enforce_naming"],
        "require_base_branch": policy["require_base_branch"],
        "allowed_base_branches": policy.get("allowed_base_branches", []),
        "auto_delete_on_merge": policy["auto_delete_on_merge"],
        "max_branch_age_days": policy.get("max_branch_age_days"),
        "allowed_merge_methods": policy.get("allowed_merge_methods", ["merge", "squash", "rebase"]),
        "default_merge_method": policy["default_merge_method"],
        "applies_to_repos": policy.get("applies_to_repos", []),
        "is_active": policy["is_active"],
        "priority": policy.get("priority", 0),
        "description": policy.get("description"),
        "created_by": policy.get("created_by"),
        "created_at": (
            policy["created_at"].isoformat()
            if isinstance(policy["created_at"], datetime)
            else str(policy["created_at"])
        ),
        "updated_at": (
            policy["updated_at"].isoformat()
            if isinstance(policy["updated_at"], datetime)
            else str(policy["updated_at"])
        ),
    }

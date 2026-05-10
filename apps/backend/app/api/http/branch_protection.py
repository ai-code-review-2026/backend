from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal
from app.data.repos.branch_protection_repo import (
    BranchProtectionRepo,
    CreateProtectionRuleInput,
    UpdateProtectionRuleInput,
)
from app.services.branch_protection import BranchProtectionService

router = APIRouter(prefix="/v1/branch-protection", tags=["branch-protection"])


# ==================== Pydantic Models ====================


class CreateProtectionRuleRequest(BaseModel):
    """Request pour créer une règle de protection."""

    model_config = ConfigDict(extra="forbid")

    org_id: str
    repo_id: str
    branch_id: str | None = None
    branch_pattern: str | None = None
    applies_to_type: Literal["main", "develop", "feature", "hotfix", "release", "all"] | None = None

    # Merge restrictions
    require_pull_request: bool = True
    required_approvals: int = Field(default=1, ge=0, le=10)
    require_code_owner_review: bool = False
    dismiss_stale_reviews: bool = False
    require_review_from_lead: bool = False

    # Commit restrictions
    block_direct_commits: bool = True
    allow_force_pushes: bool = False
    allow_deletions: bool = False

    # Status checks
    require_status_checks: bool = False
    required_status_checks: list[str] = Field(default_factory=list)
    require_branches_up_to_date: bool = False

    # Reviewer assignment
    auto_assign_reviewers: bool = False
    required_reviewer_roles: list[str] = Field(default_factory=list)

    # Role restrictions
    allowed_merge_roles: list[str] = Field(default_factory=list)
    allowed_push_roles: list[str] = Field(default_factory=list)
    bypass_roles: list[str] = Field(default_factory=list)

    # Enforcement
    enforcement_level: Literal["strict", "moderate", "advisory"] = "strict"


class UpdateProtectionRuleRequest(BaseModel):
    """Request pour mettre à jour une règle."""

    model_config = ConfigDict(extra="forbid")

    require_pull_request: bool | None = None
    required_approvals: int | None = Field(default=None, ge=0, le=10)
    require_code_owner_review: bool | None = None
    dismiss_stale_reviews: bool | None = None
    require_review_from_lead: bool | None = None
    block_direct_commits: bool | None = None
    allow_force_pushes: bool | None = None
    allow_deletions: bool | None = None
    require_status_checks: bool | None = None
    required_status_checks: list[str] | None = None
    require_branches_up_to_date: bool | None = None
    auto_assign_reviewers: bool | None = None
    required_reviewer_roles: list[str] | None = None
    allowed_merge_roles: list[str] | None = None
    allowed_push_roles: list[str] | None = None
    bypass_roles: list[str] | None = None
    enforcement_level: Literal["strict", "moderate", "advisory"] | None = None
    is_active: bool | None = None


class ProtectionRuleResponse(BaseModel):
    """Response pour une règle de protection."""

    id: str
    branch_id: str | None
    org_id: str
    repo_id: str
    branch_pattern: str | None
    applies_to_type: str | None
    require_pull_request: bool
    required_approvals: int
    require_code_owner_review: bool
    dismiss_stale_reviews: bool
    require_review_from_lead: bool
    block_direct_commits: bool
    allow_force_pushes: bool
    allow_deletions: bool
    require_status_checks: bool
    required_status_checks: list[str]
    require_branches_up_to_date: bool
    auto_assign_reviewers: bool
    required_reviewer_roles: list[str]
    allowed_merge_roles: list[str]
    allowed_push_roles: list[str]
    bypass_roles: list[str]
    is_active: bool
    enforcement_level: str
    created_by: str | None
    created_at: str
    updated_at: str


class ProtectionRuleListResponse(BaseModel):
    """Response pour liste de règles."""

    rules: list[ProtectionRuleResponse]
    total: int


class ValidateOperationRequest(BaseModel):
    """Request pour valider une opération."""

    operation: Literal["push", "force_push", "delete", "merge"]
    branch_id: str
    repo_id: str
    org_id: str


class ValidateOperationResponse(BaseModel):
    """Response de validation."""

    allowed: bool
    reason: str


# ==================== Endpoints ====================


@router.post("", response_model=ProtectionRuleResponse, status_code=201)
async def create_protection_rule(
    data: CreateProtectionRuleRequest,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProtectionRuleResponse:
    """
    Crée une nouvelle règle de protection.

    Permissions requises: protection.configure
    """
    # TODO: Vérifier permission protection.configure

    if not data.branch_id and not data.branch_pattern and not data.applies_to_type:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "invalid_target",
                "message": "Must specify either branch_id, branch_pattern, or applies_to_type",
            },
        )

    repo = BranchProtectionRepo()
    rule_id = f"rule_{uuid.uuid4().hex}"

    create_input = CreateProtectionRuleInput(
        rule_id=rule_id,
        org_id=data.org_id,
        repo_id=data.repo_id,
        branch_id=data.branch_id,
        branch_pattern=data.branch_pattern,
        applies_to_type=data.applies_to_type,
        require_pull_request=data.require_pull_request,
        required_approvals=data.required_approvals,
        require_code_owner_review=data.require_code_owner_review,
        dismiss_stale_reviews=data.dismiss_stale_reviews,
        require_review_from_lead=data.require_review_from_lead,
        block_direct_commits=data.block_direct_commits,
        allow_force_pushes=data.allow_force_pushes,
        allow_deletions=data.allow_deletions,
        require_status_checks=data.require_status_checks,
        required_status_checks=data.required_status_checks,
        require_branches_up_to_date=data.require_branches_up_to_date,
        auto_assign_reviewers=data.auto_assign_reviewers,
        required_reviewer_roles=data.required_reviewer_roles,
        allowed_merge_roles=data.allowed_merge_roles,
        allowed_push_roles=data.allowed_push_roles,
        bypass_roles=data.bypass_roles,
        enforcement_level=data.enforcement_level,
        created_by=current_user.id,
    )

    rule = repo.create(create_input)

    return ProtectionRuleResponse(**_serialize_rule(rule))


@router.get("", response_model=ProtectionRuleListResponse)
async def list_protection_rules(
    org_id: str = Query(...),
    repo_id: str | None = Query(None),
    is_active: bool | None = Query(None),
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProtectionRuleListResponse:
    """
    Liste les règles de protection.

    Permissions requises: protection.view
    """
    repo = BranchProtectionRepo()
    rules = repo.list_rules(org_id=org_id, repo_id=repo_id, is_active=is_active)

    return ProtectionRuleListResponse(
        rules=[ProtectionRuleResponse(**_serialize_rule(r)) for r in rules],
        total=len(rules),
    )


@router.get("/{rule_id}", response_model=ProtectionRuleResponse)
async def get_protection_rule(
    rule_id: str,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProtectionRuleResponse:
    """
    Récupère les détails d'une règle.

    Permissions requises: protection.view
    """
    repo = BranchProtectionRepo()

    try:
        rule = repo.get_by_id(rule_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": "rule_not_found", "message": "Protection rule not found"})

    return ProtectionRuleResponse(**_serialize_rule(rule))


@router.patch("/{rule_id}", response_model=ProtectionRuleResponse)
async def update_protection_rule(
    rule_id: str,
    data: UpdateProtectionRuleRequest,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ProtectionRuleResponse:
    """
    Met à jour une règle de protection.

    Permissions requises: protection.configure
    """
    # TODO: Vérifier permission protection.configure

    repo = BranchProtectionRepo()

    try:
        repo.get_by_id(rule_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": "rule_not_found", "message": "Protection rule not found"})

    update_input = UpdateProtectionRuleInput(
        rule_id=rule_id,
        require_pull_request=data.require_pull_request,
        required_approvals=data.required_approvals,
        require_code_owner_review=data.require_code_owner_review,
        dismiss_stale_reviews=data.dismiss_stale_reviews,
        require_review_from_lead=data.require_review_from_lead,
        block_direct_commits=data.block_direct_commits,
        allow_force_pushes=data.allow_force_pushes,
        allow_deletions=data.allow_deletions,
        require_status_checks=data.require_status_checks,
        required_status_checks=data.required_status_checks,
        require_branches_up_to_date=data.require_branches_up_to_date,
        auto_assign_reviewers=data.auto_assign_reviewers,
        required_reviewer_roles=data.required_reviewer_roles,
        allowed_merge_roles=data.allowed_merge_roles,
        allowed_push_roles=data.allowed_push_roles,
        bypass_roles=data.bypass_roles,
        is_active=data.is_active,
        enforcement_level=data.enforcement_level,
    )

    updated_rule = repo.update(update_input)

    return ProtectionRuleResponse(**_serialize_rule(updated_rule))


@router.delete("/{rule_id}", status_code=204, response_model=None)
async def delete_protection_rule(
    rule_id: str,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> Response:
    """
    Supprime une règle de protection.

    Permissions requises: protection.configure
    """
    # TODO: Vérifier permission protection.configure

    repo = BranchProtectionRepo()

    try:
        repo.get_by_id(rule_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"error": "rule_not_found", "message": "Protection rule not found"})

    repo.delete(rule_id)
    return Response(status_code=204)


@router.post("/validate", response_model=ValidateOperationResponse)
async def validate_operation(
    data: ValidateOperationRequest,
    current_user: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ValidateOperationResponse:
    """
    Valide si une opération est autorisée sur une branche.

    Permissions requises: branches.view
    """
    service = BranchProtectionService()

    validation = service.can_perform_operation(
        operation=data.operation,
        branch_id=data.branch_id,
        user_role=current_user.roles[0] if current_user.roles else "developer",
        user_permissions=current_user.permissions,
        org_id=data.org_id,
        repo_id=data.repo_id,
    )

    return ValidateOperationResponse(
        allowed=validation.allowed,
        reason=validation.reason,
    )


# ==================== Helper Functions ====================


def _serialize_rule(rule: dict[str, Any]) -> dict[str, Any]:
    """Sérialise une règle pour la réponse API."""
    return {
        "id": rule["id"],
        "branch_id": rule.get("branch_id"),
        "org_id": rule["org_id"],
        "repo_id": rule["repo_id"],
        "branch_pattern": rule.get("branch_pattern"),
        "applies_to_type": rule.get("applies_to_type"),
        "require_pull_request": rule["require_pull_request"],
        "required_approvals": rule["required_approvals"],
        "require_code_owner_review": rule["require_code_owner_review"],
        "dismiss_stale_reviews": rule["dismiss_stale_reviews"],
        "require_review_from_lead": rule["require_review_from_lead"],
        "block_direct_commits": rule["block_direct_commits"],
        "allow_force_pushes": rule["allow_force_pushes"],
        "allow_deletions": rule["allow_deletions"],
        "require_status_checks": rule["require_status_checks"],
        "required_status_checks": rule.get("required_status_checks", []),
        "require_branches_up_to_date": rule["require_branches_up_to_date"],
        "auto_assign_reviewers": rule["auto_assign_reviewers"],
        "required_reviewer_roles": rule.get("required_reviewer_roles", []),
        "allowed_merge_roles": rule.get("allowed_merge_roles", []),
        "allowed_push_roles": rule.get("allowed_push_roles", []),
        "bypass_roles": rule.get("bypass_roles", []),
        "is_active": rule["is_active"],
        "enforcement_level": rule["enforcement_level"],
        "created_by": rule.get("created_by"),
        "created_at": rule["created_at"].isoformat() if isinstance(rule["created_at"], datetime) else str(rule["created_at"]),
        "updated_at": rule["updated_at"].isoformat() if isinstance(rule["updated_at"], datetime) else str(rule["updated_at"]),
    }

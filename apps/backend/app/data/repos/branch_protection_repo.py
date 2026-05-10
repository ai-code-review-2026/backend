from __future__ import annotations

import json
from dataclasses import dataclass, field
from threading import Lock
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.data.database import get_engine


_REPO_LOCK = Lock()


@dataclass
class CreateProtectionRuleInput:
    """Input pour créer une règle de protection."""

    rule_id: str
    org_id: str
    repo_id: str
    branch_id: str | None = None
    branch_pattern: str | None = None
    applies_to_type: str | None = None
    require_pull_request: bool = True
    required_approvals: int = 1
    require_code_owner_review: bool = False
    dismiss_stale_reviews: bool = False
    require_review_from_lead: bool = False
    block_direct_commits: bool = True
    allow_force_pushes: bool = False
    allow_deletions: bool = False
    require_status_checks: bool = False
    required_status_checks: list[str] = field(default_factory=list)
    require_branches_up_to_date: bool = False
    auto_assign_reviewers: bool = False
    required_reviewer_roles: list[str] = field(default_factory=list)
    allowed_merge_roles: list[str] = field(default_factory=list)
    allowed_push_roles: list[str] = field(default_factory=list)
    bypass_roles: list[str] = field(default_factory=list)
    is_active: bool = True
    enforcement_level: str = "strict"
    created_by: str | None = None


@dataclass
class UpdateProtectionRuleInput:
    """Input pour mettre à jour une règle de protection."""

    rule_id: str
    require_pull_request: bool | None = None
    required_approvals: int | None = None
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
    is_active: bool | None = None
    enforcement_level: str | None = None


class BranchProtectionRepo:
    """Repository pour les règles de protection de branches."""

    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def create(self, payload: CreateProtectionRuleInput) -> dict[str, Any]:
        """Crée une nouvelle règle de protection."""
        with _REPO_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO branch_protection_rules (
                            id, branch_id, org_id, repo_id, branch_pattern, applies_to_type,
                            require_pull_request, required_approvals, require_code_owner_review,
                            dismiss_stale_reviews, require_review_from_lead, block_direct_commits,
                            allow_force_pushes, allow_deletions, require_status_checks,
                            required_status_checks, require_branches_up_to_date, auto_assign_reviewers,
                            required_reviewer_roles, allowed_merge_roles, allowed_push_roles,
                            bypass_roles, is_active, enforcement_level, created_by,
                            created_at, updated_at
                        )
                        VALUES (
                            :id, :branch_id, :org_id, :repo_id, :branch_pattern, :applies_to_type,
                            :require_pull_request, :required_approvals, :require_code_owner_review,
                            :dismiss_stale_reviews, :require_review_from_lead, :block_direct_commits,
                            :allow_force_pushes, :allow_deletions, :require_status_checks,
                            CAST(:required_status_checks AS jsonb), :require_branches_up_to_date,
                            :auto_assign_reviewers, CAST(:required_reviewer_roles AS jsonb),
                            CAST(:allowed_merge_roles AS jsonb), CAST(:allowed_push_roles AS jsonb),
                            CAST(:bypass_roles AS jsonb), :is_active, :enforcement_level, :created_by,
                            NOW(), NOW()
                        )
                        """
                    ),
                    {
                        "id": payload.rule_id,
                        "branch_id": payload.branch_id,
                        "org_id": payload.org_id,
                        "repo_id": payload.repo_id,
                        "branch_pattern": payload.branch_pattern,
                        "applies_to_type": payload.applies_to_type,
                        "require_pull_request": payload.require_pull_request,
                        "required_approvals": payload.required_approvals,
                        "require_code_owner_review": payload.require_code_owner_review,
                        "dismiss_stale_reviews": payload.dismiss_stale_reviews,
                        "require_review_from_lead": payload.require_review_from_lead,
                        "block_direct_commits": payload.block_direct_commits,
                        "allow_force_pushes": payload.allow_force_pushes,
                        "allow_deletions": payload.allow_deletions,
                        "require_status_checks": payload.require_status_checks,
                        "required_status_checks": json.dumps(payload.required_status_checks),
                        "require_branches_up_to_date": payload.require_branches_up_to_date,
                        "auto_assign_reviewers": payload.auto_assign_reviewers,
                        "required_reviewer_roles": json.dumps(payload.required_reviewer_roles),
                        "allowed_merge_roles": json.dumps(payload.allowed_merge_roles),
                        "allowed_push_roles": json.dumps(payload.allowed_push_roles),
                        "bypass_roles": json.dumps(payload.bypass_roles),
                        "is_active": payload.is_active,
                        "enforcement_level": payload.enforcement_level,
                        "created_by": payload.created_by,
                    },
                )

        return self.get_by_id(payload.rule_id)

    def get_by_id(self, rule_id: str) -> dict[str, Any]:
        """Récupère une règle par son ID."""
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text("SELECT * FROM branch_protection_rules WHERE id = :rule_id LIMIT 1"),
                    {"rule_id": rule_id},
                )
                .mappings()
                .first()
            )

        if row is None:
            raise ValueError(f"Protection rule not found: {rule_id}")

        return dict(row)

    def get_rules_for_branch(self, branch_id: str, org_id: str, repo_id: str) -> list[dict[str, Any]]:
        """Récupère toutes les règles applicables à une branche."""
        with self._engine.connect() as conn:
            # Règle spécifique à la branche
            rows = list(
                conn.execute(
                    text(
                        """
                        SELECT * FROM branch_protection_rules
                        WHERE (branch_id = :branch_id OR branch_id IS NULL)
                        AND org_id = :org_id
                        AND repo_id = :repo_id
                        AND is_active = true
                        ORDER BY
                            CASE WHEN branch_id IS NOT NULL THEN 1 ELSE 2 END,
                            created_at DESC
                        """
                    ),
                    {"branch_id": branch_id, "org_id": org_id, "repo_id": repo_id},
                )
                .mappings()
                .all()
            )

        return [dict(row) for row in rows]

    def get_rules_by_type(self, branch_type: str, org_id: str, repo_id: str) -> list[dict[str, Any]]:
        """Récupère les règles pour un type de branche."""
        with self._engine.connect() as conn:
            rows = list(
                conn.execute(
                    text(
                        """
                        SELECT * FROM branch_protection_rules
                        WHERE applies_to_type IN (:branch_type, 'all')
                        AND org_id = :org_id
                        AND repo_id = :repo_id
                        AND is_active = true
                        ORDER BY created_at DESC
                        """
                    ),
                    {"branch_type": branch_type, "org_id": org_id, "repo_id": repo_id},
                )
                .mappings()
                .all()
            )

        return [dict(row) for row in rows]

    def list_rules(self, org_id: str, repo_id: str | None = None, is_active: bool | None = None) -> list[dict[str, Any]]:
        """Liste toutes les règles avec filtres."""
        where_clauses = ["org_id = :org_id"]
        params: dict[str, Any] = {"org_id": org_id}

        if repo_id:
            where_clauses.append("repo_id = :repo_id")
            params["repo_id"] = repo_id

        if is_active is not None:
            where_clauses.append("is_active = :is_active")
            params["is_active"] = is_active

        where_sql = " AND ".join(where_clauses)

        with self._engine.connect() as conn:
            rows = list(
                conn.execute(
                    text(
                        f"""
                        SELECT * FROM branch_protection_rules
                        WHERE {where_sql}
                        ORDER BY created_at DESC
                        """
                    ),
                    params,
                )
                .mappings()
                .all()
            )

        return [dict(row) for row in rows]

    def update(self, payload: UpdateProtectionRuleInput) -> dict[str, Any]:
        """Met à jour une règle de protection."""
        update_fields = []
        params: dict[str, Any] = {"rule_id": payload.rule_id}

        if payload.require_pull_request is not None:
            update_fields.append("require_pull_request = :require_pull_request")
            params["require_pull_request"] = payload.require_pull_request

        if payload.required_approvals is not None:
            update_fields.append("required_approvals = :required_approvals")
            params["required_approvals"] = payload.required_approvals

        if payload.require_code_owner_review is not None:
            update_fields.append("require_code_owner_review = :require_code_owner_review")
            params["require_code_owner_review"] = payload.require_code_owner_review

        if payload.dismiss_stale_reviews is not None:
            update_fields.append("dismiss_stale_reviews = :dismiss_stale_reviews")
            params["dismiss_stale_reviews"] = payload.dismiss_stale_reviews

        if payload.require_review_from_lead is not None:
            update_fields.append("require_review_from_lead = :require_review_from_lead")
            params["require_review_from_lead"] = payload.require_review_from_lead

        if payload.block_direct_commits is not None:
            update_fields.append("block_direct_commits = :block_direct_commits")
            params["block_direct_commits"] = payload.block_direct_commits

        if payload.allow_force_pushes is not None:
            update_fields.append("allow_force_pushes = :allow_force_pushes")
            params["allow_force_pushes"] = payload.allow_force_pushes

        if payload.allow_deletions is not None:
            update_fields.append("allow_deletions = :allow_deletions")
            params["allow_deletions"] = payload.allow_deletions

        if payload.require_status_checks is not None:
            update_fields.append("require_status_checks = :require_status_checks")
            params["require_status_checks"] = payload.require_status_checks

        if payload.required_status_checks is not None:
            update_fields.append("required_status_checks = CAST(:required_status_checks AS jsonb)")
            params["required_status_checks"] = json.dumps(payload.required_status_checks)

        if payload.require_branches_up_to_date is not None:
            update_fields.append("require_branches_up_to_date = :require_branches_up_to_date")
            params["require_branches_up_to_date"] = payload.require_branches_up_to_date

        if payload.auto_assign_reviewers is not None:
            update_fields.append("auto_assign_reviewers = :auto_assign_reviewers")
            params["auto_assign_reviewers"] = payload.auto_assign_reviewers

        if payload.required_reviewer_roles is not None:
            update_fields.append("required_reviewer_roles = CAST(:required_reviewer_roles AS jsonb)")
            params["required_reviewer_roles"] = json.dumps(payload.required_reviewer_roles)

        if payload.allowed_merge_roles is not None:
            update_fields.append("allowed_merge_roles = CAST(:allowed_merge_roles AS jsonb)")
            params["allowed_merge_roles"] = json.dumps(payload.allowed_merge_roles)

        if payload.allowed_push_roles is not None:
            update_fields.append("allowed_push_roles = CAST(:allowed_push_roles AS jsonb)")
            params["allowed_push_roles"] = json.dumps(payload.allowed_push_roles)

        if payload.bypass_roles is not None:
            update_fields.append("bypass_roles = CAST(:bypass_roles AS jsonb)")
            params["bypass_roles"] = json.dumps(payload.bypass_roles)

        if payload.is_active is not None:
            update_fields.append("is_active = :is_active")
            params["is_active"] = payload.is_active

        if payload.enforcement_level is not None:
            update_fields.append("enforcement_level = :enforcement_level")
            params["enforcement_level"] = payload.enforcement_level

        if not update_fields:
            return self.get_by_id(payload.rule_id)

        update_fields.append("updated_at = NOW()")

        with _REPO_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        f"""
                        UPDATE branch_protection_rules
                        SET {", ".join(update_fields)}
                        WHERE id = :rule_id
                        """
                    ),
                    params,
                )

        return self.get_by_id(payload.rule_id)

    def delete(self, rule_id: str) -> None:
        """Supprime une règle de protection."""
        with _REPO_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM branch_protection_rules WHERE id = :rule_id"),
                    {"rule_id": rule_id},
                )

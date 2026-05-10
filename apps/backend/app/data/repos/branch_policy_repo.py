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
class CreateBranchPolicyInput:
    """Input pour créer une politique de branche."""

    policy_id: str
    org_id: str
    policy_name: str
    policy_type: str
    branch_naming_patterns: dict[str, str] = field(default_factory=dict)
    enforce_naming: bool = False
    require_base_branch: bool = False
    allowed_base_branches: list[str] = field(default_factory=list)
    auto_delete_on_merge: bool = False
    max_branch_age_days: int | None = None
    allowed_merge_methods: list[str] = field(default_factory=lambda: ["merge", "squash", "rebase"])
    default_merge_method: str = "merge"
    applies_to_repos: list[str] = field(default_factory=list)
    is_active: bool = True
    priority: int = 0
    description: str | None = None
    created_by: str | None = None


@dataclass
class UpdateBranchPolicyInput:
    """Input pour mettre à jour une politique."""

    policy_id: str
    policy_name: str | None = None
    branch_naming_patterns: dict[str, str] | None = None
    enforce_naming: bool | None = None
    require_base_branch: bool | None = None
    allowed_base_branches: list[str] | None = None
    auto_delete_on_merge: bool | None = None
    max_branch_age_days: int | None = None
    allowed_merge_methods: list[str] | None = None
    default_merge_method: str | None = None
    applies_to_repos: list[str] | None = None
    is_active: bool | None = None
    priority: int | None = None
    description: str | None = None


class BranchPolicyRepo:
    """Repository pour les politiques de branches."""

    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def create(self, payload: CreateBranchPolicyInput) -> dict[str, Any]:
        """Crée une nouvelle politique de branche."""
        with _REPO_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO branch_policies (
                            id, org_id, policy_name, policy_type, branch_naming_patterns,
                            enforce_naming, require_base_branch, allowed_base_branches,
                            auto_delete_on_merge, max_branch_age_days, allowed_merge_methods,
                            default_merge_method, applies_to_repos, is_active, priority,
                            description, created_by, created_at, updated_at
                        )
                        VALUES (
                            :id, :org_id, :policy_name, :policy_type,
                            CAST(:branch_naming_patterns AS jsonb), :enforce_naming,
                            :require_base_branch, CAST(:allowed_base_branches AS jsonb),
                            :auto_delete_on_merge, :max_branch_age_days,
                            CAST(:allowed_merge_methods AS jsonb), :default_merge_method,
                            CAST(:applies_to_repos AS jsonb), :is_active, :priority,
                            :description, :created_by, NOW(), NOW()
                        )
                        """
                    ),
                    {
                        "id": payload.policy_id,
                        "org_id": payload.org_id,
                        "policy_name": payload.policy_name,
                        "policy_type": payload.policy_type,
                        "branch_naming_patterns": json.dumps(payload.branch_naming_patterns),
                        "enforce_naming": payload.enforce_naming,
                        "require_base_branch": payload.require_base_branch,
                        "allowed_base_branches": json.dumps(payload.allowed_base_branches),
                        "auto_delete_on_merge": payload.auto_delete_on_merge,
                        "max_branch_age_days": payload.max_branch_age_days,
                        "allowed_merge_methods": json.dumps(payload.allowed_merge_methods),
                        "default_merge_method": payload.default_merge_method,
                        "applies_to_repos": json.dumps(payload.applies_to_repos),
                        "is_active": payload.is_active,
                        "priority": payload.priority,
                        "description": payload.description,
                        "created_by": payload.created_by,
                    },
                )

        return self.get_by_id(payload.policy_id)

    def get_by_id(self, policy_id: str) -> dict[str, Any]:
        """Récupère une politique par son ID."""
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text("SELECT * FROM branch_policies WHERE id = :policy_id LIMIT 1"),
                    {"policy_id": policy_id},
                )
                .mappings()
                .first()
            )

        if row is None:
            raise ValueError(f"Policy not found: {policy_id}")

        return dict(row)

    def get_by_name(self, org_id: str, policy_name: str) -> dict[str, Any] | None:
        """Récupère une politique par son nom dans une organisation."""
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text("SELECT * FROM branch_policies WHERE org_id = :org_id AND policy_name = :policy_name LIMIT 1"),
                    {"org_id": org_id, "policy_name": policy_name},
                )
                .mappings()
                .first()
            )

        return dict(row) if row else None

    def get_by_org_and_name(self, org_id: str, policy_name: str) -> dict[str, Any] | None:
        """Alias for get_by_name for API consistency."""
        return self.get_by_name(org_id, policy_name)

    def list_policies(
        self, org_id: str, policy_type: str | None = None, is_active: bool | None = None
    ) -> list[dict[str, Any]]:
        """Liste les politiques avec filtres."""
        where_clauses = ["org_id = :org_id"]
        params: dict[str, Any] = {"org_id": org_id}

        if policy_type:
            where_clauses.append("policy_type = :policy_type")
            params["policy_type"] = policy_type

        if is_active is not None:
            where_clauses.append("is_active = :is_active")
            params["is_active"] = is_active

        where_sql = " AND ".join(where_clauses)

        with self._engine.connect() as conn:
            rows = list(
                conn.execute(
                    text(
                        f"""
                        SELECT * FROM branch_policies
                        WHERE {where_sql}
                        ORDER BY priority DESC, created_at DESC
                        """
                    ),
                    params,
                )
                .mappings()
                .all()
            )

        return [dict(row) for row in rows]

    def get_policies_for_repo(self, org_id: str, repo_id: str) -> list[dict[str, Any]]:
        """Récupère les politiques applicables à un repo spécifique."""
        with self._engine.connect() as conn:
            # Vérifier si applies_to_repos est vide (= appliqué à tous) ou contient le repo_id
            rows = list(
                conn.execute(
                    text(
                        """
                        SELECT * FROM branch_policies
                        WHERE org_id = :org_id
                        AND is_active = true
                        AND (
                            applies_to_repos = '[]'::jsonb
                            OR applies_to_repos @> CAST(:repo_id_json AS jsonb)
                        )
                        ORDER BY priority DESC, created_at DESC
                        """
                    ),
                    {"org_id": org_id, "repo_id_json": json.dumps([repo_id])},
                )
                .mappings()
                .all()
            )

        return [dict(row) for row in rows]

    def get_naming_policies(self, org_id: str, repo_id: str) -> list[dict[str, Any]]:
        """Récupère les politiques de nommage pour un repo."""
        policies = self.get_policies_for_repo(org_id, repo_id)
        return [p for p in policies if p["policy_type"] == "naming"]

    def update(self, payload: UpdateBranchPolicyInput) -> dict[str, Any]:
        """Met à jour une politique."""
        update_fields = []
        params: dict[str, Any] = {"policy_id": payload.policy_id}

        if payload.policy_name is not None:
            update_fields.append("policy_name = :policy_name")
            params["policy_name"] = payload.policy_name

        if payload.branch_naming_patterns is not None:
            update_fields.append("branch_naming_patterns = CAST(:branch_naming_patterns AS jsonb)")
            params["branch_naming_patterns"] = json.dumps(payload.branch_naming_patterns)

        if payload.enforce_naming is not None:
            update_fields.append("enforce_naming = :enforce_naming")
            params["enforce_naming"] = payload.enforce_naming

        if payload.require_base_branch is not None:
            update_fields.append("require_base_branch = :require_base_branch")
            params["require_base_branch"] = payload.require_base_branch

        if payload.allowed_base_branches is not None:
            update_fields.append("allowed_base_branches = CAST(:allowed_base_branches AS jsonb)")
            params["allowed_base_branches"] = json.dumps(payload.allowed_base_branches)

        if payload.auto_delete_on_merge is not None:
            update_fields.append("auto_delete_on_merge = :auto_delete_on_merge")
            params["auto_delete_on_merge"] = payload.auto_delete_on_merge

        if payload.max_branch_age_days is not None:
            update_fields.append("max_branch_age_days = :max_branch_age_days")
            params["max_branch_age_days"] = payload.max_branch_age_days

        if payload.allowed_merge_methods is not None:
            update_fields.append("allowed_merge_methods = CAST(:allowed_merge_methods AS jsonb)")
            params["allowed_merge_methods"] = json.dumps(payload.allowed_merge_methods)

        if payload.default_merge_method is not None:
            update_fields.append("default_merge_method = :default_merge_method")
            params["default_merge_method"] = payload.default_merge_method

        if payload.applies_to_repos is not None:
            update_fields.append("applies_to_repos = CAST(:applies_to_repos AS jsonb)")
            params["applies_to_repos"] = json.dumps(payload.applies_to_repos)

        if payload.is_active is not None:
            update_fields.append("is_active = :is_active")
            params["is_active"] = payload.is_active

        if payload.priority is not None:
            update_fields.append("priority = :priority")
            params["priority"] = payload.priority

        if payload.description is not None:
            update_fields.append("description = :description")
            params["description"] = payload.description

        if not update_fields:
            return self.get_by_id(payload.policy_id)

        update_fields.append("updated_at = NOW()")

        with _REPO_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        f"""
                        UPDATE branch_policies
                        SET {", ".join(update_fields)}
                        WHERE id = :policy_id
                        """
                    ),
                    params,
                )

        return self.get_by_id(payload.policy_id)

    def delete(self, policy_id: str) -> None:
        """Supprime une politique."""
        with _REPO_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM branch_policies WHERE id = :policy_id"),
                    {"policy_id": policy_id},
                )

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from threading import Lock
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.data.database import get_engine


_REPO_LOCK = Lock()


@dataclass
class CreateBranchInput:
    """Input pour créer une branche."""

    branch_id: str
    repo_id: str
    org_id: str | None
    branch_name: str
    branch_type: str
    branch_pattern: str | None = None
    created_by: str | None = None
    base_branch: str | None = None
    description: str | None = None
    is_protected: bool = False
    is_default: bool = False
    is_active: bool = True
    metadata_json: dict[str, Any] = field(default_factory=dict)


@dataclass
class UpdateBranchInput:
    """Input pour mettre à jour une branche."""

    branch_id: str
    last_commit_sha: str | None = None
    last_commit_author: str | None = None
    last_commit_message: str | None = None
    last_commit_at: datetime | None = None
    merge_status: str | None = None
    merged_at: datetime | None = None
    merged_by: str | None = None
    merged_into: str | None = None
    is_protected: bool | None = None
    is_default: bool | None = None
    is_active: bool | None = None
    ahead_count: int | None = None
    behind_count: int | None = None
    last_synced_at: datetime | None = None
    description: str | None = None
    metadata_json: dict[str, Any] | None = None


@dataclass
class BranchFilters:
    """Filtres pour rechercher des branches."""

    repo_id: str | None = None
    org_id: str | None = None
    branch_type: str | None = None
    is_protected: bool | None = None
    is_active: bool | None = None
    merge_status: str | None = None


class BranchRepo:
    """Repository pour la gestion des branches."""

    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def create(self, payload: CreateBranchInput) -> dict[str, Any]:
        """Crée une nouvelle branche."""
        with _REPO_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO branches (
                            id, repo_id, org_id, branch_name, branch_type, branch_pattern,
                            created_by, base_branch, description, is_protected, is_default,
                            is_active, metadata_json, created_at, updated_at
                        )
                        VALUES (
                            :id, :repo_id, :org_id, :branch_name, :branch_type, :branch_pattern,
                            :created_by, :base_branch, :description, :is_protected, :is_default,
                            :is_active, CAST(:metadata_json AS jsonb), NOW(), NOW()
                        )
                        """
                    ),
                    {
                        "id": payload.branch_id,
                        "repo_id": payload.repo_id,
                        "org_id": payload.org_id,
                        "branch_name": payload.branch_name,
                        "branch_type": payload.branch_type,
                        "branch_pattern": payload.branch_pattern,
                        "created_by": payload.created_by,
                        "base_branch": payload.base_branch,
                        "description": payload.description,
                        "is_protected": payload.is_protected,
                        "is_default": payload.is_default,
                        "is_active": payload.is_active,
                        "metadata_json": payload.metadata_json or {},
                    },
                )

        return self.get_by_id(payload.branch_id)

    def get_by_id(self, branch_id: str) -> dict[str, Any]:
        """Récupère une branche par son ID."""
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text("SELECT * FROM branches WHERE id = :branch_id LIMIT 1"),
                    {"branch_id": branch_id},
                )
                .mappings()
                .first()
            )

        if row is None:
            raise ValueError(f"Branch not found: {branch_id}")

        return dict(row)

    def get_by_repo_and_name(self, repo_id: str, branch_name: str) -> dict[str, Any] | None:
        """Récupère une branche par repo et nom."""
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text("SELECT * FROM branches WHERE repo_id = :repo_id AND branch_name = :branch_name LIMIT 1"),
                    {"repo_id": repo_id, "branch_name": branch_name},
                )
                .mappings()
                .first()
            )

        return dict(row) if row else None

    def list_branches(
        self, filters: BranchFilters, limit: int = 50, offset: int = 0
    ) -> tuple[list[dict[str, Any]], int]:
        """Liste les branches avec filtres et pagination."""
        where_clauses = []
        params: dict[str, Any] = {"limit": limit, "offset": offset}

        if filters.repo_id:
            where_clauses.append("repo_id = :repo_id")
            params["repo_id"] = filters.repo_id

        if filters.org_id:
            where_clauses.append("org_id = :org_id")
            params["org_id"] = filters.org_id

        if filters.branch_type:
            where_clauses.append("branch_type = :branch_type")
            params["branch_type"] = filters.branch_type

        if filters.is_protected is not None:
            where_clauses.append("is_protected = :is_protected")
            params["is_protected"] = filters.is_protected

        if filters.is_active is not None:
            where_clauses.append("is_active = :is_active")
            params["is_active"] = filters.is_active

        if filters.merge_status:
            where_clauses.append("merge_status = :merge_status")
            params["merge_status"] = filters.merge_status

        where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

        with self._engine.connect() as conn:
            # Count total
            count_row = conn.execute(
                text(f"SELECT COUNT(*) as total FROM branches {where_sql}"),
                params,
            ).first()
            total = count_row[0] if count_row else 0

            # Get branches
            rows = (
                conn.execute(
                    text(
                        f"""
                        SELECT * FROM branches
                        {where_sql}
                        ORDER BY created_at DESC
                        LIMIT :limit OFFSET :offset
                        """
                    ),
                    params,
                )
                .mappings()
                .all()
            )

        return [dict(row) for row in rows], total

    def update(self, payload: UpdateBranchInput) -> dict[str, Any]:
        """Met à jour une branche."""
        update_fields = []
        params: dict[str, Any] = {"branch_id": payload.branch_id}

        if payload.last_commit_sha is not None:
            update_fields.append("last_commit_sha = :last_commit_sha")
            params["last_commit_sha"] = payload.last_commit_sha

        if payload.last_commit_author is not None:
            update_fields.append("last_commit_author = :last_commit_author")
            params["last_commit_author"] = payload.last_commit_author

        if payload.last_commit_message is not None:
            update_fields.append("last_commit_message = :last_commit_message")
            params["last_commit_message"] = payload.last_commit_message

        if payload.last_commit_at is not None:
            update_fields.append("last_commit_at = :last_commit_at")
            params["last_commit_at"] = payload.last_commit_at

        if payload.merge_status is not None:
            update_fields.append("merge_status = :merge_status")
            params["merge_status"] = payload.merge_status

        if payload.merged_at is not None:
            update_fields.append("merged_at = :merged_at")
            params["merged_at"] = payload.merged_at

        if payload.merged_by is not None:
            update_fields.append("merged_by = :merged_by")
            params["merged_by"] = payload.merged_by

        if payload.merged_into is not None:
            update_fields.append("merged_into = :merged_into")
            params["merged_into"] = payload.merged_into

        if payload.is_protected is not None:
            update_fields.append("is_protected = :is_protected")
            params["is_protected"] = payload.is_protected

        if payload.is_default is not None:
            update_fields.append("is_default = :is_default")
            params["is_default"] = payload.is_default

        if payload.is_active is not None:
            update_fields.append("is_active = :is_active")
            params["is_active"] = payload.is_active

        if payload.ahead_count is not None:
            update_fields.append("ahead_count = :ahead_count")
            params["ahead_count"] = payload.ahead_count

        if payload.behind_count is not None:
            update_fields.append("behind_count = :behind_count")
            params["behind_count"] = payload.behind_count

        if payload.last_synced_at is not None:
            update_fields.append("last_synced_at = :last_synced_at")
            params["last_synced_at"] = payload.last_synced_at

        if payload.description is not None:
            update_fields.append("description = :description")
            params["description"] = payload.description

        if payload.metadata_json is not None:
            update_fields.append("metadata_json = CAST(:metadata_json AS jsonb)")
            params["metadata_json"] = payload.metadata_json

        if not update_fields:
            return self.get_by_id(payload.branch_id)

        update_fields.append("updated_at = NOW()")

        with _REPO_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        f"""
                        UPDATE branches
                        SET {", ".join(update_fields)}
                        WHERE id = :branch_id
                        """
                    ),
                    params,
                )

        return self.get_by_id(payload.branch_id)

    def delete(self, branch_id: str) -> None:
        """Supprime une branche."""
        with _REPO_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM branches WHERE id = :branch_id"),
                    {"branch_id": branch_id},
                )

    def get_default_branch(self, repo_id: str) -> dict[str, Any] | None:
        """Récupère la branche par défaut d'un repo."""
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text("SELECT * FROM branches WHERE repo_id = :repo_id AND is_default = true LIMIT 1"),
                    {"repo_id": repo_id},
                )
                .mappings()
                .first()
            )

        return dict(row) if row else None

    def set_default_branch(self, repo_id: str, branch_id: str) -> None:
        """Définit une branche comme branche par défaut."""
        with _REPO_LOCK:
            with self._engine.begin() as conn:
                # Retirer le flag default des autres branches
                conn.execute(
                    text("UPDATE branches SET is_default = false WHERE repo_id = :repo_id"),
                    {"repo_id": repo_id},
                )

                # Définir la nouvelle branche par défaut
                conn.execute(
                    text("UPDATE branches SET is_default = true WHERE id = :branch_id"),
                    {"branch_id": branch_id},
                )

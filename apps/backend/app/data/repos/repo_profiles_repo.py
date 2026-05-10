from __future__ import annotations

import json
from threading import Lock
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine
from app.data.models.repo_profile import RepoProfile

_REPO_PROFILE_LOCK = Lock()


class RepoProfilesRepo:
    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def upsert_profile(
        self,
        *,
        repo_id: str,
        repo_path: str | None,
        indexed_commit: str | None,
        default_branch: str | None,
        profile: dict[str, Any],
        overview_context: str | None = None,
    ) -> RepoProfile:
        payload_json = json.dumps(profile or {})
        with _REPO_PROFILE_LOCK:
            with self._engine.begin() as conn:
                row = (
                    conn.execute(
                        text(
                            """
                            INSERT INTO repo_profiles (
                                repo_id, repo_path, indexed_commit, default_branch, profile_json, overview_context
                            )
                            VALUES (
                                :repo_id, :repo_path, :indexed_commit, :default_branch, CAST(:profile_json AS jsonb), :overview_context
                            )
                            ON CONFLICT (repo_id) DO UPDATE
                            SET repo_path = EXCLUDED.repo_path,
                                indexed_commit = EXCLUDED.indexed_commit,
                                default_branch = EXCLUDED.default_branch,
                                profile_json = EXCLUDED.profile_json,
                                overview_context = COALESCE(EXCLUDED.overview_context, repo_profiles.overview_context),
                                updated_at = NOW()
                            RETURNING *
                            """
                        ),
                        {
                            "repo_id": repo_id,
                            "repo_path": repo_path,
                            "indexed_commit": indexed_commit,
                            "default_branch": default_branch,
                            "profile_json": payload_json,
                            "overview_context": overview_context,
                        },
                    )
                    .mappings()
                    .first()
                )
        return _row_to_model(row)

    def get_profile(self, repo_id: str) -> RepoProfile | None:
        with _REPO_PROFILE_LOCK:
            with self._engine.connect() as conn:
                row = (
                    conn.execute(
                        text(
                            """
                            SELECT *
                            FROM repo_profiles
                            WHERE repo_id = :repo_id
                            LIMIT 1
                            """
                        ),
                        {"repo_id": repo_id},
                    )
                    .mappings()
                    .first()
                )
        if row is None:
            return None
        return _row_to_model(row)

    def list_profiles(self, limit: int = 50) -> list[RepoProfile]:
        safe_limit = min(max(int(limit), 1), 200)
        with _REPO_PROFILE_LOCK:
            with self._engine.connect() as conn:
                rows = (
                    conn.execute(
                        text(
                            """
                            SELECT *
                            FROM repo_profiles
                            ORDER BY updated_at DESC
                            LIMIT :limit
                            """
                        ),
                        {"limit": safe_limit},
                    )
                    .mappings()
                    .all()
                )
        return [_row_to_model(row) for row in rows]


def _row_to_model(row: RowMapping) -> RepoProfile:
    raw_profile = row.get("profile_json")
    profile: dict[str, Any]
    if isinstance(raw_profile, dict):
        profile = raw_profile
    elif isinstance(raw_profile, str):
        try:
            parsed = json.loads(raw_profile)
        except json.JSONDecodeError:
            profile = {}
        else:
            profile = parsed if isinstance(parsed, dict) else {}
    else:
        profile = {}

    return RepoProfile(
        repo_id=str(row["repo_id"]),
        repo_path=str(row["repo_path"]) if row.get("repo_path") else None,
        indexed_commit=str(row["indexed_commit"]) if row.get("indexed_commit") else None,
        default_branch=str(row["default_branch"]) if row.get("default_branch") else None,
        profile=profile,
        overview_context=str(row["overview_context"]) if row.get("overview_context") else None,
        updated_at=str(row["updated_at"]) if row.get("updated_at") else None,
    )

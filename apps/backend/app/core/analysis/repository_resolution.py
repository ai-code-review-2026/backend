from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping

from sqlalchemy import text

from app.core.knowledge_base.repo_path_resolver import resolve_repo_context_repo_path
from app.data.database import get_engine
from app.data.repos.project_settings_repo import ProjectSettingsRepo
from app.data.repos.repo_profiles_repo import RepoProfilesRepo


@dataclass(frozen=True)
class ResolvedRepositoryScope:
    project_id: str
    repository_id: str
    repo_id: str
    organization_id: str | None
    repo_path: str | None


def resolve_repository_scope(
    project_id: str,
    *,
    metadata: Mapping[str, Any] | None = None,
) -> ResolvedRepositoryScope | None:
    """Resolve the canonical project row to repo/org/path details.

    The current relational model has a canonical `project_profiles.id` UUID but no
    separate repository UUID table. Until that exists, GraphRAG uses the project
    UUID as the repository node/history identifier and the legacy `repo_id`
    (`owner/repo`) to resolve the local checkout path.
    """

    normalized_project_id = project_id.strip()
    if not normalized_project_id:
        return None

    engine = get_engine()
    with engine.connect() as conn:
        row = (
            conn.execute(
                text(
                    """
                    SELECT id, repo_id, org_id
                    FROM project_profiles
                    WHERE id = :project_id
                    LIMIT 1
                    """
                ),
                {"project_id": normalized_project_id},
            )
            .mappings()
            .first()
        )

    if row is None:
        return None

    repo_id = str(row["repo_id"]).strip().lower()
    organization_id = str(row["org_id"]).strip() if row.get("org_id") else None

    if organization_id is None:
        project_settings = ProjectSettingsRepo().get_settings(repo_id)
        if project_settings and project_settings.organization_id:
            organization_id = project_settings.organization_id.strip()

    repo_profile = RepoProfilesRepo().get_profile(repo_id)
    resolution_metadata: dict[str, Any] = dict(metadata or {})
    if repo_profile and repo_profile.repo_path and "repo_path" not in resolution_metadata:
        resolution_metadata["repo_path"] = repo_profile.repo_path

    repo_path = resolve_repo_context_repo_path(
        repo=repo_id,
        metadata=resolution_metadata or None,
    )

    return ResolvedRepositoryScope(
        project_id=normalized_project_id,
        repository_id=normalized_project_id,
        repo_id=repo_id,
        organization_id=organization_id,
        repo_path=repo_path,
    )

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from analysis.langGraph.context.ingestion_service import RepositoryIngestionService
from analysis.langGraph.models import GraphIndexSnapshot
from app.data.repos.repo_profiles_repo import RepoProfilesRepo

logger = logging.getLogger(__name__)


class RepoContextManager:
    """High-level orchestration for repository context lifecycle."""

    def __init__(
        self,
        *,
        ingestion_service: RepositoryIngestionService | None = None,
        profiles_repo: RepoProfilesRepo | None = None,
        history_limit: int = 40,
    ) -> None:
        self._ingestion = ingestion_service or RepositoryIngestionService()
        self._profiles_repo = profiles_repo or RepoProfilesRepo()
        self._history_limit = max(int(history_limit), 1)

    async def index_repository(
        self,
        *,
        repo_id: str,
        repo_path: str,
        base_ref: str | None = None,
        head_ref: str = "HEAD",
        force_full: bool = False,
    ) -> GraphIndexSnapshot:
        snapshot = await self._ingestion.ensure_index(
            repo_id=repo_id,
            repo_path=repo_path,
            base_ref=base_ref,
            head_ref=head_ref,
            force_full=force_full,
        )
        self._append_history(repo_id=repo_id, repo_path=repo_path, snapshot=snapshot)
        return snapshot

    def get_neighbors(self, *, repo_id: str, path: str, depth: int = 2, limit: int = 32) -> list[str]:
        return self._ingestion.neighbors(repo_id=repo_id, path=path, depth=depth, limit=limit)

    async def full_index(self, repo_id: str, repo_path: str) -> dict[str, Any]:
        snapshot = await self.index_repository(
            repo_id=repo_id,
            repo_path=repo_path,
            force_full=True,
        )
        return snapshot.to_dict()

    def incremental_update(self, repo_id: str, diff_files: list[str]) -> bool:
        _ = repo_id
        _ = diff_files
        return True

    def save_context(self, repo_id: str, context: dict[str, Any]) -> str:
        import json
        from pathlib import Path

        output_dir = Path("tmp/langgraph_context")
        output_dir.mkdir(parents=True, exist_ok=True)
        path = output_dir / f"{repo_id.replace('/', '_')}_context.json"
        path.write_text(json.dumps(context, ensure_ascii=True), encoding="utf-8")
        return str(path)

    def _append_history(self, *, repo_id: str, repo_path: str, snapshot: GraphIndexSnapshot) -> None:
        try:
            existing = self._profiles_repo.get_profile(repo_id)
            profile_payload: dict[str, Any] = {}
            if existing and isinstance(existing.profile, dict):
                profile_payload.update(existing.profile)

            history: list[dict[str, Any]] = []
            previous_history = profile_payload.get("langgraph_context_history")
            if isinstance(previous_history, list):
                history = [item for item in previous_history if isinstance(item, dict)]

            history.append(
                {
                    "at": datetime.now(UTC).isoformat(),
                    **snapshot.to_dict(),
                }
            )
            profile_payload["langgraph_context_history"] = history[-self._history_limit :]

            self._profiles_repo.upsert_profile(
                repo_id=repo_id,
                repo_path=repo_path,
                indexed_commit=snapshot.indexed_commit,
                default_branch=snapshot.default_branch,
                profile=profile_payload,
                overview_context=existing.overview_context if existing else None,
            )
        except Exception:
            logger.debug(
                "Unable to persist context history",
                extra={"repo_id": repo_id},
                exc_info=True,
            )

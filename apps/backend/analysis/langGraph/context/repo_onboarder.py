from __future__ import annotations

from analysis.langGraph.context.repo_context_manager import RepoContextManager
from analysis.langGraph.models import GraphIndexSnapshot


class RepoOnboarder:
    """Compatibility wrapper for explicit full repository onboarding."""

    def __init__(self, manager: RepoContextManager | None = None) -> None:
        self._manager = manager or RepoContextManager()

    async def onboard(self, *, repo_id: str, repo_path: str) -> GraphIndexSnapshot:
        return await self._manager.index_repository(
            repo_id=repo_id,
            repo_path=repo_path,
            force_full=True,
        )


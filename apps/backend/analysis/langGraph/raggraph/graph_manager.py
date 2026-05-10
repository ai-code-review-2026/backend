from __future__ import annotations

from analysis.langGraph.context.graph_manager import RepositoryGraphManager


class RagGraphManager:
    def __init__(self, manager: RepositoryGraphManager | None = None) -> None:
        self._manager = manager or RepositoryGraphManager()

    def get_neighbors(self, repo_id: str, path: str, depth: int = 2, limit: int = 32) -> list[str]:
        return self._manager.neighbors(repo_id=repo_id, path=path, depth=depth, limit=limit)


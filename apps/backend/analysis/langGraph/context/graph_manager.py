from __future__ import annotations

import asyncio
import logging
from collections import deque
from threading import Lock
from typing import Any

from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client
from app.settings import settings

logger = logging.getLogger(__name__)


class RepositoryGraphManager:
    """Graph operations backed by Neo4j with an in-memory adjacency cache."""

    def __init__(self, *, neo4j_client: Neo4jClient | None = None) -> None:
        self._adjacency: dict[str, dict[str, set[str]]] = {}
        self._reverse_adjacency: dict[str, dict[str, set[str]]] = {}
        self._cache_lock = Lock()
        self._neo4j = neo4j_client or get_neo4j_client()

    def refresh_graph(
        self,
        *,
        repo_id: str,
        changed_files: list[str] | None = None,
        indexed_commit: str | None = None,
    ) -> int:
        """Re-build the in-memory adjacency cache from Neo4j edges."""
        if not self._neo4j.enabled:
            return 0

        try:
            # Pull edges directly from Neo4j for this repo
            edges = self._load_edges_from_neo4j(repo_id=repo_id, changed_files=changed_files)
        except Exception as exc:
            logger.warning("Failed to load edges from Neo4j for repo %s: %s", repo_id, exc)
            edges = []

        adjacency: dict[str, set[str]] = {}
        reverse: dict[str, set[str]] = {}

        for edge in edges:
            source_path = str(edge.get("source_path") or "").strip()
            target_path = str(edge.get("target_path") or "").strip()
            if not source_path or not target_path:
                continue
            adjacency.setdefault(source_path, set()).add(target_path)
            reverse.setdefault(target_path, set()).add(source_path)

        with self._cache_lock:
            self._adjacency[repo_id] = adjacency
            self._reverse_adjacency[repo_id] = reverse

        logger.debug(
            "Repository graph refreshed",
            extra={"repo_id": repo_id, "edges": len(edges)},
        )
        return len(edges)

    def neighbors(
        self,
        *,
        repo_id: str,
        path: str,
        depth: int = 2,
        limit: int = 32,
    ) -> list[str]:
        """Return neighboring file paths up to `depth` hops away."""
        if not path.strip():
            return []

        # Try Neo4j direct traversal first (more accurate, supports full graph)
        if self._neo4j.enabled:
            try:
                return self._neo4j.get_neighbor_paths(
                    repo_id=repo_id,
                    path=path,
                    depth=depth,
                    limit=limit,
                )
            except Exception as exc:
                logger.debug("Neo4j neighbor lookup failed, falling back to cache: %s", exc)

        # Fall back to in-memory adjacency cache
        with self._cache_lock:
            adjacency = self._adjacency.get(repo_id)
            reverse = self._reverse_adjacency.get(repo_id)

        if adjacency is None or reverse is None:
            self.refresh_graph(repo_id=repo_id)
            with self._cache_lock:
                adjacency = self._adjacency.get(repo_id, {})
                reverse = self._reverse_adjacency.get(repo_id, {})

        visited: set[str] = {path}
        queue: deque[tuple[str, int]] = deque([(path, 0)])
        output: list[str] = []
        max_depth = max(int(depth), 1)
        max_items = max(int(limit), 1)

        while queue and len(output) < max_items:
            current, current_depth = queue.popleft()
            if current_depth >= max_depth:
                continue
            combined = adjacency.get(current, set()).union(reverse.get(current, set()))
            for candidate in combined:
                if candidate in visited:
                    continue
                visited.add(candidate)
                output.append(candidate)
                queue.append((candidate, current_depth + 1))
                if len(output) >= max_items:
                    break

        return output

    def _load_edges_from_neo4j(
        self,
        *,
        repo_id: str,
        changed_files: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Pull IMPORTS/DEPENDS_ON edges for a repo from Neo4j."""
        if changed_files:
            path_filter = " AND (f1.path IN $paths OR f2.path IN $paths)"
        else:
            path_filter = ""

        query = f"""
            MATCH (f1:File {{repo_id: $repo_id}})-[r]->(f2:File {{repo_id: $repo_id}})
            WHERE type(r) IN ['IMPORTS', 'DEPENDS_ON', 'RELATED_TO']
            {path_filter}
            RETURN f1.path AS source_path, f2.path AS target_path, type(r) AS edge_type
            LIMIT 5000
        """
        params: dict[str, Any] = {"repo_id": repo_id}
        if changed_files:
            params["paths"] = changed_files

        try:
            rows = self._neo4j.execute_query(query, params)
            return [dict(row) for row in rows]
        except Exception as exc:
            logger.warning("Neo4j edge query failed: %s", exc)
            return []


class ContextGraphManager:
    """Backward-compatible adapter."""

    def __init__(self, manager: RepositoryGraphManager | None = None) -> None:
        self.manager = manager or RepositoryGraphManager()

    def build_graph(self, repo_id: str, repo_path: str | None = None) -> int:
        _ = repo_path
        return self.manager.refresh_graph(repo_id=repo_id)

    def update_graph(self, repo_id: str, diff_files: list[str]) -> int:
        return self.manager.refresh_graph(repo_id=repo_id, changed_files=diff_files)

    def get_neighbors(self, repo_id: str, path: str, depth: int = 2) -> list[str]:
        return self.manager.neighbors(repo_id=repo_id, path=path, depth=depth)

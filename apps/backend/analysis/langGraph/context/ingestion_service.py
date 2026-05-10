"""
Repository Ingestion Service — Neo4j backend

Orchestrates repo onboarding + incremental index updates for GraphRAG.
Uses Neo4jRepoIngestor instead of the old Qdrant-backed RepoContextIngestor.
"""
from __future__ import annotations

import logging
from typing import Any

from analysis.langGraph.models import GraphIndexSnapshot
from app.core.knowledge_base.ingestor import Neo4jRepoIngestor, RepoIndexResult
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client

logger = logging.getLogger(__name__)


class RepositoryIngestionService:
    """Repository onboarding and incremental index updates for GraphRAG."""

    def __init__(
        self,
        *,
        neo4j_client: Neo4jClient | None = None,
        ingestor: Neo4jRepoIngestor | None = None,
        # Legacy params accepted but ignored for backward compat
        vector_store: Any = None,
        graph_manager: Any = None,
    ) -> None:
        self._neo4j = neo4j_client or get_neo4j_client()
        self._ingestor = ingestor
        # graph_manager kept as attribute for callers that access .neighbors()
        self._graph_manager = graph_manager

    async def ensure_index(
        self,
        *,
        repo_id: str,
        repo_path: str,
        base_ref: str | None = None,
        head_ref: str = "HEAD",
        force_full: bool = False,
    ) -> GraphIndexSnapshot:
        ingestor = self._get_ingestor()
        try:
            profile = await ingestor.get_repo_profile(repo_id)
        except Exception:
            profile = None

        try:
            if force_full or profile is None:
                result = await ingestor.onboard_repo(
                    repo_id=repo_id,
                    repo_path=repo_path,
                    source="langgraph_pipeline",
                    force_full=True,
                )
            else:
                result = await ingestor.update_repo_incremental(
                    repo_id=repo_id,
                    repo_path=repo_path,
                    base_ref=base_ref,
                    head_ref=head_ref,
                    source="langgraph_pipeline",
                )
        except Exception as exc:
            logger.exception("Repository index update failed for %s", repo_id)
            return GraphIndexSnapshot(
                status="failed",
                mode="unknown",
                indexed_commit=None,
                default_branch=None,
                files_seen=0,
                files_indexed=0,
                chunks_upserted=0,
                chunks_deleted=0,
                changed_files=[],
                started_at=None,
                completed_at=None,
                error=str(exc),
                graph_edges_count=0,
            )

        # Count graph edges from Neo4j
        try:
            stats = self._neo4j.get_repo_stats(repo_id)
            # edges are relationships in Neo4j; approximate from chunk count
            graph_edges_count = int(stats.get("chunk_count", 0))
        except Exception:
            graph_edges_count = result.chunks_upserted

        return _to_snapshot(result=result, graph_edges_count=graph_edges_count)

    def neighbors(
        self,
        *,
        repo_id: str,
        path: str,
        depth: int = 2,
        limit: int = 32,
    ) -> list[str]:
        """Get neighboring file paths via graph traversal."""
        try:
            return self._neo4j.get_neighbor_paths(
                repo_id=repo_id,
                path=path,
                depth=depth,
                limit=limit,
            )
        except Exception as exc:
            logger.debug("Neo4j neighbor lookup failed: %s", exc)
            return []

    def _get_ingestor(self) -> Neo4jRepoIngestor:
        if self._ingestor is None:
            self._ingestor = Neo4jRepoIngestor(neo4j_client=self._neo4j)
        return self._ingestor


def _to_snapshot(*, result: RepoIndexResult, graph_edges_count: int) -> GraphIndexSnapshot:
    mode = result.mode if result.mode in {"full", "incremental"} else "unknown"
    return GraphIndexSnapshot(
        status="completed",
        mode=mode,  # type: ignore[arg-type]
        indexed_commit=result.indexed_commit,
        default_branch=result.default_branch,
        files_seen=result.files_seen,
        files_indexed=result.files_indexed,
        chunks_upserted=result.chunks_upserted,
        chunks_deleted=result.chunks_deleted,
        changed_files=list(result.changed_files),
        started_at=result.started_at,
        completed_at=result.completed_at,
        error=None,
        graph_edges_count=graph_edges_count,
    )

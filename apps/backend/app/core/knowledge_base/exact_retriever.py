from __future__ import annotations

import logging
import re
from typing import Any

from app.core.knowledge_base.retrieval_models import RetrievalCandidate, RetrievedContextChunk
from app.data.repos.repo_context_chunks_repo import RepoContextChunkRow, RepoContextChunksRepo

logger = logging.getLogger(__name__)

_QUERY_PATH_PATTERN = re.compile(r"[\w./-]+\.(?:py|pyi|ts|tsx|js|jsx|go|java|kt|rs|rb|php|sql|md|mdx|ya?ml|json|toml)")
_QUERY_SYMBOL_PATTERN = re.compile(r"`([A-Za-z_][A-Za-z0-9_]*)`|\b([A-Za-z_][A-Za-z0-9_]*)\s*\(")


class ExactRetriever:
    def __init__(self, repo: RepoContextChunksRepo | None = None) -> None:
        self._repo = repo or RepoContextChunksRepo()

    def retrieve_file_chunks(self, *, repo_id: str, paths: list[str], per_file_limit: int) -> list[RetrievalCandidate]:
        candidates: list[RetrievalCandidate] = []
        for path in paths:
            for row in self._repo.list_by_path(repo_id=repo_id, path=path, limit=per_file_limit):
                candidates.append(_row_to_candidate(row, source="file_exact", score=1.0))
        return candidates

    def retrieve_symbol_chunks(
        self,
        *,
        repo_id: str,
        symbols: set[str],
        per_symbol_limit: int,
    ) -> list[RetrievalCandidate]:
        candidates: list[RetrievalCandidate] = []
        for symbol in symbols:
            for row in self._repo.list_by_symbol(repo_id=repo_id, symbol_name=symbol, limit=per_symbol_limit):
                candidates.append(_row_to_candidate(row, source="symbol_exact", score=0.95))
        return candidates

    def retrieve_related_tests(self, *, repo_id: str, changed_files: list[str], limit: int) -> list[RetrievalCandidate]:
        rows = self._repo.list_related_test_chunks(repo_id=repo_id, changed_files=changed_files, limit=limit)
        return [_row_to_candidate(row, source="test_related", score=0.9) for row in rows]

    def retrieve_query_hints(self, *, repo_id: str, query: str, limit: int = 8) -> list[RetrievalCandidate]:
        paths = sorted(set(match.group(0) for match in _QUERY_PATH_PATTERN.finditer(query)))
        symbols = sorted(
            {
                symbol
                for match in _QUERY_SYMBOL_PATTERN.finditer(query)
                for symbol in match.groups()
                if isinstance(symbol, str) and symbol.strip()
            }
        )
        candidates = [
            *self.retrieve_file_chunks(repo_id=repo_id, paths=paths[:limit], per_file_limit=max(limit, 2)),
            *self.retrieve_symbol_chunks(repo_id=repo_id, symbols=set(symbols[:limit]), per_symbol_limit=max(limit, 2)),
        ]
        return candidates

    def retrieve_connected_entities(
        self,
        *,
        repo_id: str,
        changed_files: list[str],
        changed_symbols: set[str] | None = None,
        max_hops: int = 1,
        limit: int = 8,
    ) -> list[RetrievalCandidate]:
        """Retrieve chunks for files that import/call/inherit from changed files.

        Uses the ``code_entity_edges`` table for a lightweight 1-hop graph
        traversal — files that depend on the changed files are likely relevant
        to the review.
        """
        connected_paths = _query_graph_edges(
            repo_id=repo_id,
            target_paths=changed_files,
            target_symbols=changed_symbols or set(),
            limit=limit * 2,
        )
        if not connected_paths:
            return []

        # Retrieve chunks for the connected files
        candidates: list[RetrievalCandidate] = []
        for path in connected_paths[:limit]:
            for row in self._repo.list_by_path(repo_id=repo_id, path=path, limit=2):
                candidates.append(_row_to_candidate(row, source="graph_connected", score=0.80))
        return candidates[:limit]


def _row_to_candidate(row: RepoContextChunkRow, *, source: str, score: float) -> RetrievalCandidate:
    metadata = dict(row.metadata or {})
    chunk = RetrievedContextChunk(
        score=score,
        path=row.path,
        chunk_index=row.chunk_index,
        language=row.language,
        content=row.content,
        token_count=max(1, len(row.content.split())),
        file_type=row.file_type,
        chunk_type=row.chunk_type,
        symbol_name=row.symbol_name,
        start_line=row.start_line,
        end_line=row.end_line,
        source=source,
        repo_id=row.repo_id,
        source_id=row.id,
        chunk_id=row.id,
        document_version=row.indexed_commit,
        section_title=str(metadata.get("section_title")) if metadata.get("section_title") else None,
        retrieval_reason=f"exact_match:{source}",
        retriever_channel=source,
        score_raw=score,
        score_final=score,
    )
    return RetrievalCandidate(chunk=chunk, channel=source, raw_score=score, score=score)


def _query_graph_edges(
    *,
    repo_id: str,
    target_paths: list[str],
    target_symbols: set[str],
    limit: int = 16,
) -> list[str]:
    """Return source_paths of files that import/call/inherit from *target_paths* or *target_symbols*."""
    if not target_paths and not target_symbols:
        return []
    try:
        from app.data.database import get_engine
        from sqlalchemy import text as sa_text

        engine = get_engine()
        if engine is None:
            return []

        results: set[str] = set()
        with engine.connect() as conn:
            # Files that import the changed files
            if target_paths:
                rows = conn.execute(
                    sa_text(
                        "SELECT DISTINCT source_path FROM code_entity_edges "
                        "WHERE repo_id = :repo_id AND target_path = ANY(:paths) "
                        "LIMIT :limit"
                    ),
                    {"repo_id": repo_id, "paths": target_paths, "limit": limit},
                ).fetchall()
                results.update(row[0] for row in rows)

            # Files that inherit from changed symbols
            if target_symbols and len(results) < limit:
                remaining = limit - len(results)
                rows = conn.execute(
                    sa_text(
                        "SELECT DISTINCT source_path FROM code_entity_edges "
                        "WHERE repo_id = :repo_id AND target_symbol = ANY(:symbols) "
                        "AND edge_type IN ('inherits', 'implements') "
                        "LIMIT :limit"
                    ),
                    {"repo_id": repo_id, "symbols": sorted(target_symbols), "limit": remaining},
                ).fetchall()
                results.update(row[0] for row in rows)

        # Exclude the changed files themselves
        target_set = set(target_paths)
        return sorted(results - target_set)[:limit]

    except Exception:
        logger.debug("Graph edge query failed", exc_info=True)
        return []

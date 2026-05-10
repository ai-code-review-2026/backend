from __future__ import annotations

import json
from dataclasses import dataclass
from threading import Lock
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine

_REPO_CONTEXT_CHUNKS_LOCK = Lock()


@dataclass(frozen=True)
class RepoContextChunkWrite:
    id: str
    repo_id: str
    path: str
    chunk_index: int
    content: str
    language: str
    file_type: str
    chunk_type: str
    symbol_name: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    indexed_commit: str | None = None
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class RepoContextChunkRow:
    id: str
    repo_id: str
    path: str
    chunk_index: int
    content: str
    language: str
    file_type: str
    chunk_type: str
    symbol_name: str | None
    start_line: int | None
    end_line: int | None
    indexed_commit: str | None
    metadata: dict[str, Any]
    lexical_score: float = 0.0


class RepoContextChunksRepo:
    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def delete_repo(self, repo_id: str) -> None:
        with _REPO_CONTEXT_CHUNKS_LOCK:
            with self._engine.begin() as conn:
                conn.execute(text("DELETE FROM repo_context_chunks WHERE repo_id = :repo_id"), {"repo_id": repo_id})

    def delete_repo_paths(self, repo_id: str, paths: Iterable[str]) -> None:
        normalized_paths = [path.strip() for path in paths if isinstance(path, str) and path.strip()]
        if not normalized_paths:
            return
        with _REPO_CONTEXT_CHUNKS_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM repo_context_chunks WHERE repo_id = :repo_id AND path = ANY(:paths)"),
                    {"repo_id": repo_id, "paths": normalized_paths},
                )

    def upsert_chunks(self, rows: Iterable[RepoContextChunkWrite]) -> None:
        payloads = [
            {
                "id": row.id,
                "repo_id": row.repo_id,
                "path": row.path,
                "chunk_index": row.chunk_index,
                "content": row.content,
                "language": row.language,
                "file_type": row.file_type,
                "chunk_type": row.chunk_type,
                "symbol_name": row.symbol_name,
                "start_line": row.start_line,
                "end_line": row.end_line,
                "indexed_commit": row.indexed_commit,
                "metadata_json": json.dumps(row.metadata or {}),
            }
            for row in rows
        ]
        if not payloads:
            return
        with _REPO_CONTEXT_CHUNKS_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO repo_context_chunks (
                            id, repo_id, path, chunk_index, content, language, file_type, chunk_type,
                            symbol_name, start_line, end_line, indexed_commit, metadata_json
                        )
                        VALUES (
                            :id, :repo_id, :path, :chunk_index, :content, :language, :file_type, :chunk_type,
                            :symbol_name, :start_line, :end_line, :indexed_commit, CAST(:metadata_json AS jsonb)
                        )
                        ON CONFLICT (id) DO UPDATE
                        SET repo_id = EXCLUDED.repo_id,
                            path = EXCLUDED.path,
                            chunk_index = EXCLUDED.chunk_index,
                            content = EXCLUDED.content,
                            language = EXCLUDED.language,
                            file_type = EXCLUDED.file_type,
                            chunk_type = EXCLUDED.chunk_type,
                            symbol_name = EXCLUDED.symbol_name,
                            start_line = EXCLUDED.start_line,
                            end_line = EXCLUDED.end_line,
                            indexed_commit = EXCLUDED.indexed_commit,
                            metadata_json = EXCLUDED.metadata_json,
                            updated_at = NOW()
                        """
                    ),
                    payloads,
                )

    def list_by_path(self, repo_id: str, path: str, limit: int = 8) -> list[RepoContextChunkRow]:
        with _REPO_CONTEXT_CHUNKS_LOCK:
            with self._engine.connect() as conn:
                rows = (
                    conn.execute(
                        text(
                            """
                            SELECT *
                            FROM repo_context_chunks
                            WHERE repo_id = :repo_id AND path = :path
                            ORDER BY chunk_index ASC
                            LIMIT :limit
                            """
                        ),
                        {"repo_id": repo_id, "path": path, "limit": max(int(limit), 1)},
                    )
                    .mappings()
                    .all()
                )
        return [_row_to_chunk(row) for row in rows]

    def list_by_symbol(self, repo_id: str, symbol_name: str, limit: int = 8) -> list[RepoContextChunkRow]:
        normalized_symbol = symbol_name.strip()
        if not normalized_symbol:
            return []
        with _REPO_CONTEXT_CHUNKS_LOCK:
            with self._engine.connect() as conn:
                rows = (
                    conn.execute(
                        text(
                            """
                            SELECT *
                            FROM repo_context_chunks
                            WHERE repo_id = :repo_id AND symbol_name = :symbol_name
                            ORDER BY updated_at DESC, chunk_index ASC
                            LIMIT :limit
                            """
                        ),
                        {"repo_id": repo_id, "symbol_name": normalized_symbol, "limit": max(int(limit), 1)},
                    )
                    .mappings()
                    .all()
                )
        return [_row_to_chunk(row) for row in rows]

    def search_lexical(self, repo_id: str, query: str, limit: int = 12) -> list[RepoContextChunkRow]:
        normalized_query = query.strip()
        if not normalized_query:
            return []
        safe_limit = max(int(limit), 1)
        with _REPO_CONTEXT_CHUNKS_LOCK:
            with self._engine.connect() as conn:
                rows = (
                    conn.execute(
                        text(
                            """
                            SELECT
                                *,
                                ts_rank_cd(
                                    to_tsvector('simple', content),
                                    plainto_tsquery('simple', :query)
                                ) AS lexical_score
                            FROM repo_context_chunks
                            WHERE repo_id = :repo_id
                              AND to_tsvector('simple', content) @@ plainto_tsquery('simple', :query)
                            ORDER BY lexical_score DESC, updated_at DESC
                            LIMIT :limit
                            """
                        ),
                        {"repo_id": repo_id, "query": normalized_query, "limit": safe_limit},
                    )
                    .mappings()
                    .all()
                )
        return [_row_to_chunk(row) for row in rows]

    def list_related_test_chunks(self, repo_id: str, changed_files: Iterable[str], limit: int = 8) -> list[RepoContextChunkRow]:
        stems = _derive_related_test_stems(changed_files)
        if not stems:
            return []

        with _REPO_CONTEXT_CHUNKS_LOCK:
            with self._engine.connect() as conn:
                rows = (
                    conn.execute(
                        text(
                            """
                            SELECT *
                            FROM repo_context_chunks
                            WHERE repo_id = :repo_id
                              AND file_type = 'test'
                            ORDER BY path ASC, chunk_index ASC
                            LIMIT :limit
                            """
                        ),
                        {"repo_id": repo_id, "limit": max(int(limit) * 12, 24)},
                    )
                    .mappings()
                    .all()
                )
        matches: list[RepoContextChunkRow] = []
        for row in rows:
            item = _row_to_chunk(row)
            haystack = f"{item.path} {item.symbol_name or ''}".lower()
            if any(stem in haystack for stem in stems):
                matches.append(item)
            if len(matches) >= limit:
                break
        return matches

    def list_repo_chunks(self, repo_id: str, limit: int = 5000) -> list[RepoContextChunkRow]:
        with _REPO_CONTEXT_CHUNKS_LOCK:
            with self._engine.connect() as conn:
                rows = (
                    conn.execute(
                        text(
                            """
                            SELECT *
                            FROM repo_context_chunks
                            WHERE repo_id = :repo_id
                            ORDER BY path ASC, chunk_index ASC
                            LIMIT :limit
                            """
                        ),
                        {"repo_id": repo_id, "limit": max(int(limit), 1)},
                    )
                    .mappings()
                    .all()
                )
        return [_row_to_chunk(row) for row in rows]


def _derive_related_test_stems(changed_files: Iterable[str]) -> list[str]:
    stems: list[str] = []
    for path in changed_files:
        if not isinstance(path, str):
            continue
        normalized = path.strip().lower()
        if not normalized:
            continue
        filename = normalized.rsplit("/", maxsplit=1)[-1]
        stem = filename.rsplit(".", maxsplit=1)[0]
        if stem.startswith("test_"):
            stem = stem.removeprefix("test_")
        if stem.endswith("_test"):
            stem = stem[: -len("_test")]
        for candidate in {normalized, filename, stem}:
            if candidate and candidate not in stems:
                stems.append(candidate)
    return stems


def _row_to_chunk(row: RowMapping) -> RepoContextChunkRow:
    raw_metadata = row.get("metadata_json")
    metadata: dict[str, Any]
    if isinstance(raw_metadata, dict):
        metadata = raw_metadata
    elif isinstance(raw_metadata, str):
        try:
            parsed = json.loads(raw_metadata)
        except json.JSONDecodeError:
            metadata = {}
        else:
            metadata = parsed if isinstance(parsed, dict) else {}
    else:
        metadata = {}

    return RepoContextChunkRow(
        id=str(row["id"]),
        repo_id=str(row["repo_id"]),
        path=str(row["path"]),
        chunk_index=int(row["chunk_index"]),
        content=str(row["content"]),
        language=str(row["language"]),
        file_type=str(row["file_type"]),
        chunk_type=str(row["chunk_type"]),
        symbol_name=str(row["symbol_name"]) if row.get("symbol_name") else None,
        start_line=int(row["start_line"]) if row.get("start_line") is not None else None,
        end_line=int(row["end_line"]) if row.get("end_line") is not None else None,
        indexed_commit=str(row["indexed_commit"]) if row.get("indexed_commit") else None,
        metadata=metadata,
        lexical_score=float(row.get("lexical_score") or 0.0),
    )

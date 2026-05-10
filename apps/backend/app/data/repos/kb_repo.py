from __future__ import annotations

import json
from dataclasses import dataclass
from threading import Lock
from typing import Any, Iterable

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine

_KB_REPO_LOCK = Lock()


@dataclass(frozen=True)
class KBDocumentChunkRow:
    doc_id: str
    title: str
    source_type: str
    path_or_url: str | None
    chunk_index: int
    content: str
    token_count: int
    tags: list[str]
    lexical_score: float = 0.0
    repo_id: str | None = None
    doc_version: str | None = None
    metadata: dict[str, Any] | None = None


class KBRepo:
    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def search_document_chunks(
        self,
        *,
        repo_id: str | None,
        query: str,
        limit: int = 8,
        source_type: str | None = None,
        tags: Iterable[str] | None = None,
    ) -> list[KBDocumentChunkRow]:
        normalized_query = query.strip()
        if not normalized_query:
            return []

        safe_limit = max(int(limit), 1)
        desired_tags = {tag.strip().lower() for tag in (tags or []) if isinstance(tag, str) and tag.strip()}

        with _KB_REPO_LOCK:
            with self._engine.connect() as conn:
                rows = (
                    conn.execute(
                        text(
                            """
                            SELECT
                                d.id AS doc_id,
                                d.title,
                                d.source_type,
                                d.path_or_url,
                                COALESCE(d.tags_json->>'repo_id', '') AS repo_id,
                                d.doc_version,
                                d.tags_json,
                                c.chunk_index,
                                COALESCE(c.content, c.text) AS content,
                                COALESCE(c.token_count, GREATEST(1, LENGTH(COALESCE(c.content, c.text, '')) / 4)) AS token_count,
                                c.metadata_json,
                                ts_rank_cd(
                                    to_tsvector('simple', COALESCE(c.content, c.text)),
                                    plainto_tsquery('simple', :query)
                                ) AS lexical_score
                            FROM kb_documents d
                            JOIN kb_chunks c ON c.doc_id = d.id
                            WHERE (CAST(:repo_id AS TEXT) IS NULL OR COALESCE(d.tags_json->>'repo_id', '') = CAST(:repo_id AS TEXT))
                              AND (CAST(:source_type AS TEXT) IS NULL OR d.source_type = CAST(:source_type AS TEXT))
                              AND to_tsvector('simple', COALESCE(c.content, c.text)) @@ plainto_tsquery('simple', :query)
                            ORDER BY lexical_score DESC, c.chunk_index ASC
                            LIMIT :limit
                            """
                        ),
                        {
                            "repo_id": repo_id,
                            "query": normalized_query,
                            "source_type": source_type,
                            "limit": max(safe_limit * 5, safe_limit),
                        },
                    )
                    .mappings()
                    .all()
                )

        results: list[KBDocumentChunkRow] = []
        for row in rows:
            item = _row_to_document_chunk(row)
            if desired_tags and not desired_tags.intersection({tag.lower() for tag in item.tags}):
                continue
            results.append(item)
            if len(results) >= safe_limit:
                break
        return results

    def search_global_document_chunks(
        self,
        *,
        query: str,
        limit: int = 8,
        source_type: str | None = None,
        tags: Iterable[str] | None = None,
    ) -> list[KBDocumentChunkRow]:
        return self.search_document_chunks(
            repo_id=None,
            query=query,
            limit=limit,
            source_type=source_type,
            tags=tags,
        )

    def list_document_chunks(self, *, repo_id: str | None, limit: int = 5000) -> list[KBDocumentChunkRow]:
        with _KB_REPO_LOCK:
            with self._engine.connect() as conn:
                rows = (
                    conn.execute(
                        text(
                            """
                            SELECT
                                d.id AS doc_id,
                                d.title,
                                d.source_type,
                                d.path_or_url,
                                COALESCE(d.tags_json->>'repo_id', '') AS repo_id,
                                d.doc_version,
                                d.tags_json,
                                c.chunk_index,
                                COALESCE(c.content, c.text) AS content,
                                COALESCE(c.token_count, GREATEST(1, LENGTH(COALESCE(c.content, c.text, '')) / 4)) AS token_count,
                                c.metadata_json
                            FROM kb_documents d
                            JOIN kb_chunks c ON c.doc_id = d.id
                            WHERE (:repo_id IS NULL OR COALESCE(d.tags_json->>'repo_id', '') = :repo_id)
                            ORDER BY d.id ASC, c.chunk_index ASC
                            LIMIT :limit
                            """
                        ),
                        {"repo_id": repo_id, "limit": max(int(limit), 1)},
                    )
                    .mappings()
                    .all()
                )
        return [_row_to_document_chunk(row) for row in rows]


def _row_to_document_chunk(row: RowMapping) -> KBDocumentChunkRow:
    raw_tags_json = row.get("tags_json")
    tags_payload: dict[str, Any]
    if isinstance(raw_tags_json, dict):
        tags_payload = raw_tags_json
    elif isinstance(raw_tags_json, str):
        try:
            parsed = json.loads(raw_tags_json)
        except json.JSONDecodeError:
            tags_payload = {}
        else:
            tags_payload = parsed if isinstance(parsed, dict) else {}
    else:
        tags_payload = {}

    raw_tags = tags_payload.get("tags")
    tags = [str(tag).strip() for tag in raw_tags if str(tag).strip()] if isinstance(raw_tags, list) else []
    raw_metadata_json = row.get("metadata_json")
    if isinstance(raw_metadata_json, dict):
        chunk_metadata = raw_metadata_json
    elif isinstance(raw_metadata_json, str):
        try:
            parsed_metadata = json.loads(raw_metadata_json)
        except json.JSONDecodeError:
            chunk_metadata = {}
        else:
            chunk_metadata = parsed_metadata if isinstance(parsed_metadata, dict) else {}
    else:
        chunk_metadata = {}

    return KBDocumentChunkRow(
        doc_id=str(row["doc_id"]),
        title=str(row["title"]),
        source_type=str(row["source_type"]),
        path_or_url=str(row["path_or_url"]) if row.get("path_or_url") else None,
        repo_id=str(row["repo_id"]).strip() if row.get("repo_id") else None,
        doc_version=str(row["doc_version"]) if row.get("doc_version") else None,
        chunk_index=int(row["chunk_index"]),
        content=str(row["content"]),
        token_count=int(row["token_count"]),
        tags=tags,
        lexical_score=float(row.get("lexical_score") or 0.0),
        metadata=chunk_metadata,
    )

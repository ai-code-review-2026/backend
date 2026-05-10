from __future__ import annotations

from app.core.knowledge_base.retrieval_models import RetrievalCandidate, RetrievedContextChunk
from app.data.repos.kb_repo import KBRepo
from app.data.repos.repo_context_chunks_repo import RepoContextChunksRepo


class LexicalRetriever:
    def __init__(
        self,
        *,
        code_repo: RepoContextChunksRepo | None = None,
        kb_repo: KBRepo | None = None,
    ) -> None:
        self._code_repo = code_repo or RepoContextChunksRepo()
        self._kb_repo = kb_repo or KBRepo()

    def retrieve_code(
        self,
        *,
        repo_id: str,
        query: str,
        limit: int,
        changed_files: set[str] | None = None,
    ) -> list[RetrievalCandidate]:
        rows = self._code_repo.search_lexical(repo_id=repo_id, query=query, limit=max(limit * 4, limit))
        if changed_files:
            filtered = [row for row in rows if row.path in changed_files]
            if filtered:
                rows = filtered

        candidates: list[RetrievalCandidate] = []
        for row in rows[:limit]:
            score = max(row.lexical_score, 0.1)
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
                source="lexical_code",
                repo_id=row.repo_id,
                source_id=row.id,
                chunk_id=row.id,
                document_version=row.indexed_commit,
                section_title=str(row.metadata.get("section_title")) if row.metadata.get("section_title") else None,
                retrieval_reason="lexical_match:code",
                retriever_channel="lexical_code",
                score_raw=score,
                score_final=score,
            )
            candidates.append(RetrievalCandidate(chunk=chunk, channel="lexical_code", raw_score=score, score=score))
        return candidates

    def retrieve_documents(
        self,
        *,
        repo_id: str,
        query: str,
        limit: int,
        source_type: str | None = None,
        tags: list[str] | None = None,
    ) -> list[RetrievalCandidate]:
        rows = self._kb_repo.search_document_chunks(
            repo_id=repo_id,
            query=query,
            limit=limit,
            source_type=source_type,
            tags=tags or [],
        )
        candidates: list[RetrievalCandidate] = []
        for row in rows:
            score = max(row.lexical_score, 0.1)
            metadata = dict(row.metadata or {})
            chunk = RetrievedContextChunk(
                score=score,
                path=row.path_or_url or row.title,
                chunk_index=row.chunk_index,
                language=row.source_type,
                content=row.content,
                token_count=row.token_count,
                file_type=row.source_type,
                chunk_type="document_chunk",
                source="lexical_document",
                source_type=row.source_type,
                tags=tuple(row.tags),
                document_id=row.doc_id,
                title=row.title,
                repo_id=row.repo_id or repo_id,
                source_id=row.doc_id,
                chunk_id=f"{row.doc_id}:{row.chunk_index}",
                document_version=row.doc_version,
                section_title=_as_optional_str(metadata.get("section_title")) or row.title,
                heading_path=_normalize_heading_path(metadata.get("heading_path")),
                page=_as_optional_int(metadata.get("page")),
                source_uri=_as_optional_str(metadata.get("source_uri")) or row.path_or_url,
                content_hash=_as_optional_str(metadata.get("content_hash")),
                version=_as_optional_str(metadata.get("version")) or row.doc_version,
                entity_type=_as_optional_str(metadata.get("entity_type")),
                entity_name=_as_optional_str(metadata.get("entity_name")),
                domain=_as_optional_str(metadata.get("domain")),
                crawl_timestamp=_as_optional_str(metadata.get("crawl_timestamp")),
                retrieval_reason="lexical_match:document",
                retriever_channel="lexical_document",
                score_raw=score,
                score_final=score,
            )
            candidates.append(RetrievalCandidate(chunk=chunk, channel="lexical_document", raw_score=score, score=score))
        return candidates

    def retrieve_global_documents(
        self,
        *,
        query: str,
        limit: int,
        source_type: str | None = None,
        tags: list[str] | None = None,
    ) -> list[RetrievalCandidate]:
        rows = self._kb_repo.search_global_document_chunks(
            query=query,
            limit=limit,
            source_type=source_type,
            tags=tags or [],
        )
        candidates: list[RetrievalCandidate] = []
        for row in rows:
            score = max(row.lexical_score, 0.1)
            metadata = dict(row.metadata or {})
            chunk = RetrievedContextChunk(
                score=score,
                path=row.path_or_url or row.title,
                chunk_index=row.chunk_index,
                language=row.source_type,
                content=row.content,
                token_count=row.token_count,
                file_type=row.source_type,
                chunk_type="document_chunk",
                source="lexical_global_document",
                source_type=row.source_type,
                tags=tuple(row.tags),
                document_id=row.doc_id,
                title=row.title,
                repo_id=row.repo_id,
                source_id=row.doc_id,
                chunk_id=f"{row.doc_id}:{row.chunk_index}",
                document_version=row.doc_version,
                section_title=_as_optional_str(metadata.get("section_title")) or row.title,
                heading_path=_normalize_heading_path(metadata.get("heading_path")),
                page=_as_optional_int(metadata.get("page")),
                source_uri=_as_optional_str(metadata.get("source_uri")) or row.path_or_url,
                content_hash=_as_optional_str(metadata.get("content_hash")),
                version=_as_optional_str(metadata.get("version")) or row.doc_version,
                entity_type=_as_optional_str(metadata.get("entity_type")),
                entity_name=_as_optional_str(metadata.get("entity_name")),
                domain=_as_optional_str(metadata.get("domain")),
                crawl_timestamp=_as_optional_str(metadata.get("crawl_timestamp")),
                retrieval_reason="lexical_match:global_document",
                retriever_channel="lexical_global_document",
                score_raw=score,
                score_final=score,
            )
            candidates.append(
                RetrievalCandidate(
                    chunk=chunk,
                    channel="lexical_global_document",
                    raw_score=score,
                    score=score,
                )
            )
        return candidates


def _as_optional_int(value: object) -> int | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _as_optional_str(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_heading_path(value: object) -> tuple[str, ...]:
    if isinstance(value, list):
        return tuple(str(item).strip() for item in value if str(item).strip())
    if isinstance(value, tuple):
        return tuple(str(item).strip() for item in value if str(item).strip())
    if isinstance(value, str):
        parts = [item.strip() for item in value.split(">") if item.strip()]
        return tuple(parts)
    return ()

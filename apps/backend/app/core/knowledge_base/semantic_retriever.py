from __future__ import annotations

from typing import Any

from app.core.knowledge_base.retrieval_models import RetrievalCandidate, RetrievedContextChunk
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client
from app.settings import settings


class SemanticRetriever:
    """Neo4j-backed semantic retriever using Neo4j vector indexes."""

    def __init__(
        self,
        neo4j_client: Neo4jClient | None = None,
    ) -> None:
        self._neo4j = neo4j_client or get_neo4j_client()

    async def retrieve_code(
        self,
        *,
        repo_id: str,
        query_text: str,
        limit: int,
        changed_files: set[str] | None = None,
    ) -> list[RetrievalCandidate]:
        hits = await self._vector_search_chunks(
            query_text=query_text,
            limit=limit,
            repo_id=repo_id,
        )
        candidates = _hits_to_candidates(hits, source="semantic_code")
        if changed_files:
            filtered = [c for c in candidates if c.chunk.path in changed_files]
            if filtered:
                return filtered[:limit]
        return candidates[:limit]

    async def retrieve_documents(
        self,
        *,
        repo_id: str,
        query_text: str,
        limit: int,
        source_type: str | None = None,
        tags: list[str] | None = None,
    ) -> list[RetrievalCandidate]:
        hits = await self._vector_search_kb(
            query_text=query_text,
            limit=max(limit * 4, limit),
            repo_id=repo_id,
            source_type=source_type,
        )
        candidates = _hits_to_candidates(hits, source="semantic_document")
        wanted_tags = {tag.strip().lower() for tag in (tags or []) if tag.strip()}
        if wanted_tags:
            candidates = [
                c for c in candidates
                if wanted_tags.intersection({t.lower() for t in c.chunk.tags})
            ]
        return candidates[:limit]

    async def retrieve_global_documents(
        self,
        *,
        query_text: str,
        limit: int,
        source_type: str | None = None,
        tags: list[str] | None = None,
    ) -> list[RetrievalCandidate]:
        hits = await self._vector_search_kb(
            query_text=query_text,
            limit=max(limit * 4, limit),
            repo_id=None,
            source_type=source_type,
        )
        candidates = _hits_to_candidates(hits, source="semantic_global_document")
        wanted_tags = {tag.strip().lower() for tag in (tags or []) if tag.strip()}
        if wanted_tags:
            candidates = [
                c for c in candidates
                if wanted_tags.intersection({t.lower() for t in c.chunk.tags})
            ]
        return candidates[:limit]

    async def retrieve_repo_bootstrap(self, *, repo_id: str, query_text: str, limit: int) -> list[RetrievalCandidate]:
        hits = await self._vector_search_chunks(
            query_text=query_text,
            limit=limit,
            repo_id=repo_id,
        )
        return _hits_to_candidates(hits, source="repo_bootstrap")

    # ── private helpers ────────────────────────────────────────────────────────

    async def _vector_search_chunks(
        self,
        *,
        query_text: str,
        limit: int,
        repo_id: str | None,
    ) -> list[dict[str, Any]]:
        """Search the Chunk vector index in Neo4j."""
        if not self._neo4j.enabled:
            return []
        import asyncio
        from app.core.knowledge_base.embedding_provider import get_embedding_provider
        provider = get_embedding_provider()
        vector = await provider.aembed(query_text)
        return await asyncio.to_thread(
            self._neo4j.vector_search_chunks,
            query_vector=vector,
            repo_id=repo_id,
            limit=limit,
        )

    async def _vector_search_kb(
        self,
        *,
        query_text: str,
        limit: int,
        repo_id: str | None,
        source_type: str | None,
    ) -> list[dict[str, Any]]:
        """Search the KnowledgeDocument vector index in Neo4j."""
        if not self._neo4j.enabled:
            return []
        import asyncio
        from app.core.knowledge_base.embedding_provider import get_embedding_provider
        provider = get_embedding_provider()
        vector = await provider.aembed(query_text)
        return await asyncio.to_thread(
            self._neo4j.vector_search_kb_docs,
            query_vector=vector,
            repo_id=repo_id,
            source_type=source_type,
            limit=limit,
        )


def _hits_to_candidates(hits: list[dict[str, Any]], *, source: str) -> list[RetrievalCandidate]:
    candidates: list[RetrievalCandidate] = []
    for hit in hits:
        path = str(hit.get("path") or hit.get("path_or_url") or hit.get("title") or hit.get("doc_id") or "")
        content = str(hit.get("content") or hit.get("text") or "")
        if not path or not content:
            continue
        score = float(hit.get("score", 0.0) or 0.0)
        tags = hit.get("tags")
        normalized_tags = tuple(str(t).strip() for t in tags if str(t).strip()) if isinstance(tags, list) else ()
        token_count = int(hit.get("token_count") or max(1, len(content.split())))
        chunk = RetrievedContextChunk(
            score=score,
            path=path,
            chunk_index=int(hit.get("chunk_index") or 0),
            language=str(hit.get("language") or hit.get("source_type") or "text"),
            content=content,
            token_count=token_count,
            file_type=str(hit.get("file_type") or hit.get("source_type") or "text"),
            chunk_type=str(hit.get("chunk_type") or "text_chunk"),
            symbol_name=str(hit.get("symbol_name")) if hit.get("symbol_name") else None,
            start_line=int(hit.get("start_line")) if hit.get("start_line") is not None else None,
            end_line=int(hit.get("end_line")) if hit.get("end_line") is not None else None,
            source=source,
            source_type=str(hit.get("source_type")) if hit.get("source_type") else None,
            tags=normalized_tags,
            document_id=str(hit.get("doc_id")) if hit.get("doc_id") else None,
            title=str(hit.get("title")) if hit.get("title") else None,
            repo_id=str(hit.get("repo_id")) if hit.get("repo_id") else None,
            source_id=str(hit.get("source_id")) if hit.get("source_id") else None,
            chunk_id=str(hit.get("chunk_id")) if hit.get("chunk_id") else None,
            document_version=str(hit.get("document_version")) if hit.get("document_version") else None,
            section_title=str(hit.get("section_title") or hit.get("title")) if (hit.get("section_title") or hit.get("title")) else None,
            heading_path=_normalize_heading_path(hit.get("heading_path")),
            page=_as_optional_int(hit.get("page")),
            source_uri=_as_optional_str(hit.get("source_uri") or hit.get("path_or_url")),
            content_hash=_as_optional_str(hit.get("content_hash")),
            version=_as_optional_str(hit.get("version") or hit.get("document_version")),
            entity_type=_as_optional_str(hit.get("entity_type")),
            entity_name=_as_optional_str(hit.get("entity_name")),
            domain=_as_optional_str(hit.get("domain")),
            crawl_timestamp=_as_optional_str(hit.get("crawl_timestamp")),
            retrieval_reason=f"semantic_match:{source}",
            retriever_channel=source,
            score_raw=score,
            score_final=score,
            collection_version=str(hit.get("collection_version")) if hit.get("collection_version") else None,
        )
        candidates.append(RetrievalCandidate(chunk=chunk, channel=source, raw_score=score, score=score))
    return candidates


def _as_optional_int(value: Any) -> int | None:
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


def _as_optional_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_heading_path(value: Any) -> tuple[str, ...]:
    if isinstance(value, list):
        return tuple(str(item).strip() for item in value if str(item).strip())
    if isinstance(value, tuple):
        return tuple(str(item).strip() for item in value if str(item).strip())
    if isinstance(value, str):
        return tuple(part.strip() for part in value.split(">") if part.strip())
    return ()

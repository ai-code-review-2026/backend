"""
GraphRAG Retriever — Neo4j Native

Full GraphRAG retrieval pipeline:
  1. Embed query with sentence-transformers
  2. Vector search over Chunk nodes (Neo4j native vector index)
  3. Symbol search for named identifiers in the diff
  4. Multi-hop graph traversal from hit file paths (IMPORTS edges)
  5. KB rule vector search (higher priority than repo context)
  6. KB document vector search
  7. Merge + deduplicate candidates
  8. Cross-encoder reranking
  9. Assemble final context with KB-first ordering
  10. Attach traceable evidence (file, line, symbol, graph depth, rule ref)

KB rules always have priority over raw repo context.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Any

from analysis.langGraph.models import RetrievalFilters, RetrievalResult, RetrievedContextReference
from app.core.knowledge_base.embedding_provider import embed_text, embed_texts
from app.core.knowledge_base.re_ranker import ReRanker
from app.core.knowledge_base.query_router import QueryRouter
from app.core.knowledge_base.retrieval_models import QueryRoute, RetrievalCandidate, RetrievedContextChunk
from app.core.knowledge_base.retriever import build_llm_context_with_chunks
from app.data.repos.repo_context_chunks_repo import RepoContextChunkRow, RepoContextChunksRepo
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client
from app.settings import settings

logger = logging.getLogger(__name__)

# Simple identifier pattern — used to detect symbol names in diffs
_SYMBOL_RE = re.compile(r"\b([A-Z][a-zA-Z0-9_]{2,}|[a-z_][a-zA-Z0-9_]{3,})\b")


@dataclass(frozen=True)
class RetrieverTrace:
    vector_hits: int
    graph_hits: int
    symbol_hits: int
    kb_rule_hits: int
    kb_doc_hits: int
    reranked_count: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "vector_hits": self.vector_hits,
            "graph_hits": self.graph_hits,
            "symbol_hits": self.symbol_hits,
            "kb_rule_hits": self.kb_rule_hits,
            "kb_doc_hits": self.kb_doc_hits,
            "reranked_count": self.reranked_count,
        }


class GraphRAGRetriever:
    """
    Full Neo4j-backed GraphRAG retriever.

    Replaces the old Qdrant-based RagGraphRetriever.
    All retrieval goes through Neo4j — no Qdrant dependency.
    """

    def __init__(
        self,
        *,
        neo4j_client: Neo4jClient | None = None,
        chunks_repo: RepoContextChunksRepo | None = None,
        reranker: ReRanker | None = None,
    ) -> None:
        self._neo4j = neo4j_client or get_neo4j_client()
        self._sql_chunks = chunks_repo or RepoContextChunksRepo()
        self._reranker = reranker or ReRanker()
        self._router = QueryRouter()

    # ── Public entry points ───────────────────────────────────────────────────

    async def retrieve_for_diff(
        self,
        *,
        repo_id: str,
        diff_text: str,
        changed_files: list[str],
        filters: RetrievalFilters | None = None,
        limit: int = 12,
    ) -> RetrievalResult:
        query_vec = embed_text(diff_text[:2000])

        vector_chunks = self._vector_search(repo_id=repo_id, query_vector=query_vec, top_k=max(limit, 20))
        symbol_chunks = self._symbol_search(repo_id=repo_id, text=diff_text, limit=limit)
        graph_chunks = self._graph_expand(repo_id=repo_id, seed_paths=changed_files, limit=limit)
        kb_rules = self._kb_rule_search(query_vector=query_vec, top_k=8)
        kb_docs = self._kb_doc_search(query_vector=query_vec, top_k=6, repo_id=repo_id)

        trace = RetrieverTrace(
            vector_hits=len(vector_chunks),
            graph_hits=len(graph_chunks),
            symbol_hits=len(symbol_chunks),
            kb_rule_hits=len(kb_rules),
            kb_doc_hits=len(kb_docs),
            reranked_count=0,
        )

        return self._build_result(
            query_text=diff_text,
            vector_chunks=vector_chunks,
            graph_chunks=graph_chunks,
            symbol_chunks=symbol_chunks,
            kb_rules=kb_rules,
            kb_docs=kb_docs,
            filters=filters or RetrievalFilters(),
            limit=limit,
            retrieval_mode="graphrag_diff",
            trace=trace,
        )

    async def retrieve_for_query(
        self,
        *,
        repo_id: str,
        query: str,
        changed_files: list[str] | None = None,
        filters: RetrievalFilters | None = None,
        limit: int = 8,
        route_hint: str = "auto",
    ) -> RetrievalResult:
        query_vec = embed_text(query)

        vector_chunks = self._vector_search(repo_id=repo_id, query_vector=query_vec, top_k=max(limit, 16))
        symbol_chunks = self._symbol_search(repo_id=repo_id, text=query, limit=limit)
        seed_paths = [c.path for c in vector_chunks[:6]] + (changed_files or [])
        graph_chunks = self._graph_expand(repo_id=repo_id, seed_paths=seed_paths, limit=limit)
        kb_rules = self._kb_rule_search(query_vector=query_vec, top_k=8)
        kb_docs = self._kb_doc_search(query_vector=query_vec, top_k=6, repo_id=repo_id)

        trace = RetrieverTrace(
            vector_hits=len(vector_chunks),
            graph_hits=len(graph_chunks),
            symbol_hits=len(symbol_chunks),
            kb_rule_hits=len(kb_rules),
            kb_doc_hits=len(kb_docs),
            reranked_count=0,
        )

        return self._build_result(
            query_text=query,
            vector_chunks=vector_chunks,
            graph_chunks=graph_chunks,
            symbol_chunks=symbol_chunks,
            kb_rules=kb_rules,
            kb_docs=kb_docs,
            filters=filters or RetrievalFilters(),
            limit=limit,
            retrieval_mode="graphrag_query",
            trace=trace,
        )

    async def retrieve_for_repo_bootstrap(
        self,
        *,
        repo_id: str,
        limit: int = 16,
    ) -> RetrievalResult:
        query_vec = embed_text(f"repository overview architecture {repo_id}")
        vector_chunks = self._vector_search(repo_id=repo_id, query_vector=query_vec, top_k=max(limit, 20))
        seed_paths = [c.path for c in vector_chunks[:8]]
        graph_chunks = self._graph_expand(repo_id=repo_id, seed_paths=seed_paths, limit=limit)
        kb_docs = self._kb_doc_search(query_vector=query_vec, top_k=6, repo_id=repo_id)

        trace = RetrieverTrace(
            vector_hits=len(vector_chunks),
            graph_hits=len(graph_chunks),
            symbol_hits=0,
            kb_rule_hits=0,
            kb_doc_hits=len(kb_docs),
            reranked_count=0,
        )

        return self._build_result(
            query_text=f"repository {repo_id} bootstrap",
            vector_chunks=vector_chunks,
            graph_chunks=graph_chunks,
            symbol_chunks=[],
            kb_rules=[],
            kb_docs=kb_docs,
            filters=RetrievalFilters(),
            limit=limit,
            retrieval_mode="graphrag_bootstrap",
            trace=trace,
        )

    # ── Internal retrieval steps ──────────────────────────────────────────────

    def _vector_search(
        self,
        *,
        repo_id: str,
        query_vector: list[float],
        top_k: int,
    ) -> list[RetrievedContextChunk]:
        hits = self._neo4j.vector_search_chunks(
            repo_id=repo_id,
            query_vector=query_vector,
            top_k=top_k,
            min_score=settings.RETRIEVAL_MIN_SIMILARITY_THRESHOLD,
        )
        return [_neo4j_chunk_to_context(h["chunk"], score=h["score"], source="vector") for h in hits if h.get("chunk")]

    def _symbol_search(
        self,
        *,
        repo_id: str,
        text: str,
        limit: int,
    ) -> list[RetrievedContextChunk]:
        """Find chunks by symbol names extracted from the diff/query text."""
        symbols = list({m.group(1) for m in _SYMBOL_RE.finditer(text[:3000])})[:10]
        chunks: list[RetrievedContextChunk] = []
        seen_uids: set[str] = set()
        for symbol in symbols:
            rows = self._neo4j.search_chunks_by_symbol(repo_id=repo_id, symbol_name=symbol, limit=3)
            for row in rows:
                uid = row.get("uid", "")
                if uid in seen_uids:
                    continue
                seen_uids.add(uid)
                chunk = _neo4j_chunk_to_context(row, score=0.72, source="symbol")
                if chunk:
                    chunks.append(chunk)
                    if len(chunks) >= limit:
                        return chunks
        return chunks

    def _graph_expand(
        self,
        *,
        repo_id: str,
        seed_paths: list[str],
        limit: int,
    ) -> list[RetrievedContextChunk]:
        """Multi-hop BFS from seed file paths via IMPORTS edges."""
        neighbor_paths: list[str] = []
        seen: set[str] = set(seed_paths)
        for path in seed_paths[:8]:
            try:
                neighbors = self._neo4j.get_neighbor_paths(
                    repo_id=repo_id,
                    path=path,
                    depth=settings.RETRIEVAL_GRAPH_MAX_DEPTH,
                    limit=max(limit, 8),
                )
                for n in neighbors:
                    if n not in seen:
                        neighbor_paths.append(n)
                        seen.add(n)
            except Exception as exc:
                logger.debug("Graph expand failed for %s: %s", path, exc)

        if not neighbor_paths:
            return []

        rows = self._neo4j.get_chunks_for_paths(
            repo_id=repo_id,
            paths=neighbor_paths[:limit],
            limit_per_path=3,
        )
        return [c for c in (_neo4j_chunk_to_context(r, score=0.65, source="graph") for r in rows) if c is not None]

    def _kb_rule_search(
        self,
        *,
        query_vector: list[float],
        top_k: int,
    ) -> list[RetrievedContextChunk]:
        hits = self._neo4j.vector_search_rules(
            query_vector=query_vector,
            top_k=top_k,
            min_score=settings.KB_PRIORITY_MIN_SCORE,
        )
        chunks: list[RetrievedContextChunk] = []
        for h in hits:
            rule = h.get("rule")
            if not rule:
                continue
            score = float(h.get("score", 0.0)) * settings.KB_PRIORITY_BOOST_FACTOR
            content_parts = [
                rule.get("title", ""),
                rule.get("description", ""),
            ]
            if rule.get("example_violation"):
                content_parts.append(f"Violation: {rule['example_violation']}")
            if rule.get("example_fix"):
                content_parts.append(f"Fix: {rule['example_fix']}")
            content = "\n".join(p for p in content_parts if p)
            if not content:
                continue
            chunks.append(RetrievedContextChunk(
                score=score,
                path=f"kb/rules/{rule.get('uid', 'unknown')}",
                chunk_index=0,
                language="text",
                content=content,
                token_count=len(content.split()),
                file_type="rule",
                chunk_type="rule",
                symbol_name=rule.get("title"),
                start_line=None,
                end_line=None,
                source="kb_rule",
                source_type="knowledge_base",
                tags=(rule.get("category", ""),),
                score_raw=float(h.get("score", 0.0)),
                score_final=score,
            ))
        return chunks

    def _kb_doc_search(
        self,
        *,
        query_vector: list[float],
        top_k: int,
        repo_id: str,
    ) -> list[RetrievedContextChunk]:
        hits = self._neo4j.vector_search_kb_docs(
            query_vector=query_vector,
            top_k=top_k,
            min_score=settings.ANTI_HALLUCINATION_MIN_RELEVANCE_SCORE,
        )
        chunks: list[RetrievedContextChunk] = []
        for h in hits:
            doc = h.get("doc")
            if not doc:
                continue
            score = float(h.get("score", 0.0)) * settings.KB_PRIORITY_BOOST_FACTOR
            content = doc.get("content", "").strip()
            if not content:
                continue
            chunks.append(RetrievedContextChunk(
                score=score,
                path=f"kb/docs/{doc.get('uid', 'unknown')}",
                chunk_index=0,
                language="text",
                content=content,
                token_count=len(content.split()),
                file_type="document",
                chunk_type="kb_document",
                symbol_name=doc.get("title"),
                start_line=None,
                end_line=None,
                source="kb_doc",
                source_type="knowledge_base",
                tags=(doc.get("category", ""),),
                score_raw=float(h.get("score", 0.0)),
                score_final=score,
            ))
        return chunks

    # ── Result assembly ───────────────────────────────────────────────────────

    def _build_result(
        self,
        *,
        query_text: str,
        vector_chunks: list[RetrievedContextChunk],
        graph_chunks: list[RetrievedContextChunk],
        symbol_chunks: list[RetrievedContextChunk],
        kb_rules: list[RetrievedContextChunk],
        kb_docs: list[RetrievedContextChunk],
        filters: RetrievalFilters,
        limit: int,
        retrieval_mode: str,
        trace: RetrieverTrace,
    ) -> RetrievalResult:
        # KB content first (highest priority), then code context
        candidates: list[RetrievalCandidate] = []
        for chunk in kb_rules:
            candidates.append(RetrievalCandidate(chunk=chunk, channel="kb_rule", raw_score=chunk.score, score=chunk.score))
        for chunk in kb_docs:
            candidates.append(RetrievalCandidate(chunk=chunk, channel="kb_doc", raw_score=chunk.score, score=chunk.score))
        for chunk in symbol_chunks:
            candidates.append(RetrievalCandidate(chunk=chunk, channel="symbol", raw_score=chunk.score, score=chunk.score))
        for chunk in vector_chunks:
            candidates.append(RetrievalCandidate(chunk=chunk, channel="vector", raw_score=chunk.score, score=chunk.score))
        for chunk in graph_chunks:
            candidates.append(RetrievalCandidate(chunk=chunk, channel="graph", raw_score=chunk.score, score=chunk.score))

        # Deduplicate by content hash
        seen_hashes: set[str] = set()
        deduped: list[RetrievalCandidate] = []
        for cand in candidates:
            h = _content_hash(cand.chunk.content)
            if h not in seen_hashes:
                seen_hashes.add(h)
                deduped.append(cand)

        # Filter
        filtered = _apply_filters(candidates=deduped, filters=filters)

        # Rerank
        route = self._router.route_query(query=query_text, route_hint="auto")
        ranked = self._reranker.rank(
            query=query_text[:3000],
            candidates=filtered,
            route=route,
            limit=max(limit * 2, 16),
        )

        selected = [item.chunk for item in ranked[:limit]]
        context_text, used_chunks = build_llm_context_with_chunks(selected, max_chars=settings.KB_CONTEXT_MAX_CHARS)
        if context_text == "[NO_CONTEXT_AVAILABLE]":
            context_text = None

        final_trace = RetrieverTrace(
            vector_hits=trace.vector_hits,
            graph_hits=trace.graph_hits,
            symbol_hits=trace.symbol_hits,
            kb_rule_hits=trace.kb_rule_hits,
            kb_doc_hits=trace.kb_doc_hits,
            reranked_count=len(ranked),
        )

        return RetrievalResult(
            context_text=context_text,
            references=[_to_reference(c) for c in used_chunks],
            vector_hits=final_trace.vector_hits,
            graph_hits=final_trace.graph_hits,
            hyde_hits=0,
            reranked_count=final_trace.reranked_count,
            retrieval_mode=retrieval_mode,
            retrieval_trace=final_trace.to_dict(),
        )


# ── Backward-compat alias ─────────────────────────────────────────────────────

class RagGraphRetriever(GraphRAGRetriever):
    """Drop-in replacement for old Qdrant-backed RagGraphRetriever."""

    def __init__(
        self,
        *,
        vector_store: Any = None,  # accepted but ignored
        repo_context_retriever: Any = None,  # accepted but ignored
        context_manager: Any = None,  # accepted but ignored
        chunks_repo: RepoContextChunksRepo | None = None,
        reranker: ReRanker | None = None,
    ) -> None:
        super().__init__(chunks_repo=chunks_repo, reranker=reranker)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _neo4j_chunk_to_context(
    row: dict[str, Any],
    *,
    score: float,
    source: str,
) -> RetrievedContextChunk | None:
    if not row:
        return None
    content = str(row.get("content") or "").strip()
    path = str(row.get("path") or "").strip()
    if not content or not path:
        return None
    return RetrievedContextChunk(
        score=score,
        path=path,
        chunk_index=int(row.get("chunk_index") or 0),
        language=str(row.get("language") or "text"),
        content=content,
        token_count=int(row.get("token_count") or len(content.split())),
        file_type=str(row.get("file_type") or "code"),
        chunk_type=str(row.get("chunk_type") or "code_block"),
        symbol_name=row.get("symbol_name"),
        start_line=row.get("start_line"),
        end_line=row.get("end_line"),
        source=source,
        source_type="code",
        tags=tuple(),
        score_raw=score,
        score_final=score,
    )


def _to_reference(chunk: RetrievedContextChunk) -> RetrievedContextReference:
    return RetrievedContextReference(
        path=chunk.path,
        source=chunk.source,
        source_type=chunk.source_type,
        chunk_type=chunk.chunk_type,
        symbol_name=chunk.symbol_name,
        line_start=chunk.start_line,
        line_end=chunk.end_line,
        score=chunk.score_final if chunk.score_final is not None else chunk.score,
        tags=tuple(chunk.tags),
        content=chunk.content,
        title=chunk.title,
        indexed_at=chunk.crawl_timestamp,
    )


def _apply_filters(
    *,
    candidates: list[RetrievalCandidate],
    filters: RetrievalFilters,
) -> list[RetrievalCandidate]:
    normalized_tags = filters.normalized_tags()
    out: list[RetrievalCandidate] = []
    for item in candidates:
        chunk = item.chunk
        if filters.language and chunk.language.lower() != filters.language.lower():
            continue
        if filters.module and not chunk.path.startswith(filters.module.strip("/")):
            continue
        if normalized_tags:
            chunk_tags = {t.lower() for t in chunk.tags}
            if not chunk_tags.intersection(normalized_tags):
                continue
        out.append(item)
    return out


def _content_hash(content: str) -> str:
    import hashlib
    return hashlib.md5(content[:500].encode("utf-8", errors="ignore")).hexdigest()

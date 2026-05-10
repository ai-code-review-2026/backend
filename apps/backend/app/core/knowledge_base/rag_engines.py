from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from typing import Any, Protocol

from analysis.langGraph.models import RetrievalResult, RetrievedContextReference
from analysis.langGraph.raggraph.retriever import RagGraphRetriever
from app.core.knowledge_base.retriever import build_llm_context_with_chunks
from app.core.knowledge_base.retrieval_models import RetrievedContextChunk
from app.data.repos.repo_profiles_repo import RepoProfilesRepo
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client
from app.settings import settings


@dataclass(frozen=True)
class RagEngineResult:
    stack: str
    mode: str
    chunks: list[RetrievedContextChunk]
    profile: dict[str, Any] | None
    context_text: str | None
    context_references: list[dict[str, Any]]
    grounded: bool
    neo4j_grounded: bool  # True when Neo4j context was used for this result
    rag_confidence_score: float
    trace: dict[str, Any]
    error: str | None = None


class RagEngine(Protocol):
    stack_name: str
    available: bool

    async def retrieve_for_diff(
        self,
        *,
        repo_id: str,
        diff_text: str,
        changed_files: list[str] | None = None,
        limit: int = 8,
    ) -> RagEngineResult: ...

    async def retrieve_for_query(
        self,
        *,
        repo_id: str,
        query: str,
        changed_files: list[str] | None = None,
        limit: int = 8,
        route_hint: str = "auto",
    ) -> RagEngineResult: ...

    async def retrieve_for_repo_bootstrap(
        self,
        *,
        repo_id: str,
        limit: int = 16,
    ) -> RagEngineResult: ...


class GraphRagEngine:
    stack_name = "graph_rag"

    def __init__(
        self,
        *,
        neo4j_client: Neo4jClient | None = None,
        retriever: RagGraphRetriever | None = None,
    ) -> None:
        self._neo4j = neo4j_client or get_neo4j_client()
        self._retriever = retriever or RagGraphRetriever(neo4j_client=self._neo4j)
        self._profiles_repo = RepoProfilesRepo()

    @property
    def available(self) -> bool:
        return self._neo4j.enabled

    async def retrieve_for_diff(
        self,
        *,
        repo_id: str,
        diff_text: str,
        changed_files: list[str] | None = None,
        limit: int = 8,
    ) -> RagEngineResult:
        started = time.perf_counter()
        retrieval = await self._retriever.retrieve_for_diff(
            repo_id=repo_id,
            diff_text=diff_text,
            changed_files=changed_files or [],
            limit=limit,
        )
        return await self._build_result(
            repo_id=repo_id,
            retrieval=retrieval,
            mode="graph_rag_diff",
            started=started,
        )

    async def retrieve_for_query(
        self,
        *,
        repo_id: str,
        query: str,
        changed_files: list[str] | None = None,
        limit: int = 8,
        route_hint: str = "auto",
    ) -> RagEngineResult:
        started = time.perf_counter()
        retrieval = await self._retriever.retrieve_for_query(
            repo_id=repo_id,
            query=query,
            changed_files=changed_files or [],
            limit=limit,
            route_hint=route_hint,
        )
        return await self._build_result(
            repo_id=repo_id,
            retrieval=retrieval,
            mode="graph_rag_query",
            started=started,
        )

    async def retrieve_for_repo_bootstrap(
        self,
        *,
        repo_id: str,
        limit: int = 16,
    ) -> RagEngineResult:
        started = time.perf_counter()
        retrieval = await self._retriever.retrieve_for_repo_bootstrap(repo_id=repo_id, limit=limit)
        return await self._build_result(
            repo_id=repo_id,
            retrieval=retrieval,
            mode="graph_rag_bootstrap",
            started=started,
        )

    async def _build_result(
        self,
        *,
        repo_id: str,
        retrieval: RetrievalResult,
        mode: str,
        started: float,
    ) -> RagEngineResult:
        chunks = [_reference_to_chunk(reference, repo_id=repo_id, chunk_index=index) for index, reference in enumerate(retrieval.references)]
        context_text = retrieval.context_text
        if not isinstance(context_text, str) or not context_text.strip():
            context_text, chunks = build_llm_context_with_chunks(chunks, max_chars=settings.KB_CONTEXT_MAX_CHARS)
            if context_text == "[NO_CONTEXT_AVAILABLE]":
                context_text = None

        profile_row = await asyncio.to_thread(self._profiles_repo.get_profile, repo_id)
        profile = dict(profile_row.profile) if profile_row and isinstance(profile_row.profile, dict) else None
        context_references = [reference.to_dict() for reference in retrieval.references]
        trace = {
            "stack": self.stack_name,
            "mode": mode,
            "retrieval": retrieval.to_dict(),
        }
        return RagEngineResult(
            stack=self.stack_name,
            mode=mode,
            chunks=chunks,
            profile=profile,
            context_text=context_text,
            context_references=context_references,
            grounded=bool(context_text and context_references),
            neo4j_grounded=bool(context_text and context_references),
            rag_confidence_score=_rag_confidence_score(chunks),
            trace=trace,
            error=None,
        )


def build_graph_rag_engine(
    *,
    neo4j_client: Neo4jClient | None = None,
    # legacy kwarg kept for call sites that still pass vector_store=
    vector_store: object | None = None,  # noqa: ARG001
) -> GraphRagEngine:
    return GraphRagEngine(neo4j_client=neo4j_client)


def _rag_confidence_score(chunks: list[RetrievedContextChunk]) -> float:
    if not chunks:
        return 0.0
    top_scores = [max(0.0, min(1.0, float(item.score))) for item in chunks[:4]]
    if not top_scores:
        return 0.0
    return round(sum(top_scores) / len(top_scores), 4)


def _reference_to_chunk(
    reference: RetrievedContextReference,
    *,
    repo_id: str,
    chunk_index: int,
) -> RetrievedContextChunk:
    content = reference.content or ""
    source_type = reference.source_type or "code"
    file_type = "text"
    if source_type in {"code", "semantic", "graph", "chunk"}:
        file_type = "code"
    elif source_type in {"pdf", "web", "markdown", "sql", "policy"}:
        file_type = source_type
    return RetrievedContextChunk(
        score=float(reference.score),
        path=reference.path,
        chunk_index=chunk_index,
        language="text",
        content=content,
        token_count=max(1, len(content.split())),
        file_type=file_type,
        chunk_type=reference.chunk_type or "context_chunk",
        symbol_name=reference.symbol_name,
        start_line=reference.line_start,
        end_line=reference.line_end,
        source=reference.source or "graph_rag",
        source_type=reference.source_type,
        tags=tuple(reference.tags),
        title=reference.title,
        repo_id=repo_id,
        crawl_timestamp=reference.indexed_at,
        score_raw=float(reference.score),
        score_final=float(reference.score),
    )

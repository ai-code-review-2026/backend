from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from analysis.langGraph.context.chunker import DiffChunker
from analysis.langGraph.context.repo_context_manager import RepoContextManager
from analysis.langGraph.models import (
    GraphIndexSnapshot,
    LangGraphAnalysisRequest,
    LangGraphAnalysisResult,
    LangGraphState,
    LLMOutput,
    RetrievalResult,
)
from analysis.langGraph.raggraph.hybrid_retriever import GraphRagRetriever
from analysis.langGraph.raggraph.llm_orchestrator import LLMOrchestrator
from analysis.langGraph.raggraph.redis_cache import RedisCache
from app.settings import settings

logger = logging.getLogger(__name__)

try:
    from langgraph.graph import END, START, StateGraph

    _HAS_LANGGRAPH = True
except Exception:  # pragma: no cover - runtime fallback
    END = "__end__"
    START = "__start__"
    StateGraph = None  # type: ignore[assignment]
    _HAS_LANGGRAPH = False


class LangGraphPipeline:
    """End-to-end GraphRAG analysis pipeline."""

    def __init__(
        self,
        *,
        context_manager: RepoContextManager | None = None,
        chunker: DiffChunker | None = None,
        retriever: GraphRagRetriever | None = None,
        llm_orchestrator: LLMOrchestrator | None = None,
        cache: RedisCache | None = None,
        user_id: str | None = None,
        project_id: str | None = None,
        analysis_id: str | None = None,
    ) -> None:
        self._context_manager = context_manager or RepoContextManager()
        self._chunker = chunker or DiffChunker()
        self._retriever = retriever or GraphRagRetriever()
        self._llm_orchestrator = llm_orchestrator or LLMOrchestrator(
            user_id=user_id,
            project_id=project_id,
            analysis_id=analysis_id,
        )
        self._cache = cache or RedisCache()
        self._runner = self._build_runner()

    async def run(self, request: LangGraphAnalysisRequest) -> LangGraphAnalysisResult:
        cache_key = RedisCache.build_pipeline_key(
            repo_id=request.repo_id,
            pr_number=request.pr_number,
            diff_text=request.diff_text,
        )
        cached_payload = self._cache.get(cache_key)
        if isinstance(cached_payload, dict):
            cached_result = _from_payload(payload=cached_payload)
            if cached_result is not None:
                return LangGraphAnalysisResult(
                    indexing=cached_result.indexing,
                    fragments=cached_result.fragments,
                    retrieval=cached_result.retrieval,
                    llm_output=cached_result.llm_output,
                    duration_ms=cached_result.duration_ms,
                    cached=True,
                    errors=cached_result.errors,
                )

        state: LangGraphState = {
            "request": request,
            "errors": [],
            "started_perf": time.perf_counter(),
        }
        final_state = await self._runner(state)
        result = _state_to_result(final_state)

        self._cache.set(
            cache_key,
            result.to_dict(),
            ex=settings.LANGGRAPH_CACHE_TTL_SECONDS,
        )
        return result

    def _build_runner(self):
        if _HAS_LANGGRAPH and settings.LANGGRAPH_USE_STATEGRAPH and StateGraph is not None:
            graph_builder: StateGraph[LangGraphState] = StateGraph(LangGraphState)  # type: ignore[valid-type]
            graph_builder.add_node("index", self._node_index)
            graph_builder.add_node("parse", self._node_parse)
            graph_builder.add_node("retrieve", self._node_retrieve)
            graph_builder.add_node("generate", self._node_generate)
            graph_builder.add_node("finalize", self._node_finalize)
            graph_builder.add_edge(START, "index")
            graph_builder.add_edge("index", "parse")
            graph_builder.add_edge("parse", "retrieve")
            graph_builder.add_edge("retrieve", "generate")
            graph_builder.add_edge("generate", "finalize")
            graph_builder.add_edge("finalize", END)
            compiled = graph_builder.compile()

            async def _invoke(state: LangGraphState) -> LangGraphState:
                return await compiled.ainvoke(state)  # type: ignore[no-any-return]

            return _invoke

        async def _fallback(state: LangGraphState) -> LangGraphState:
            state = await self._node_index(state)
            state = await self._node_parse(state)
            state = await self._node_retrieve(state)
            state = await self._node_generate(state)
            state = await self._node_finalize(state)
            return state

        return _fallback

    async def _node_index(self, state: LangGraphState) -> LangGraphState:
        request = state["request"]
        try:
            snapshot = await self._context_manager.index_repository(
                repo_id=request.repo_id,
                repo_path=request.repo_path,
                base_ref=request.base_ref,
                head_ref=request.head_ref or request.commit_sha or "HEAD",
                force_full=False,
            )
            state["indexing"] = snapshot
        except Exception as exc:
            state.setdefault("errors", []).append(f"indexing_failed:{exc}")
            state["indexing"] = GraphIndexSnapshot(
                status="failed",
                mode="unknown",
                indexed_commit=request.commit_sha,
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
        return state

    async def _node_parse(self, state: LangGraphState) -> LangGraphState:
        request = state["request"]
        try:
            state["fragments"] = self._chunker.parse_diff(
                diff_text=request.diff_text,
                changed_files_hint=request.changed_files,
            )
        except Exception as exc:
            state.setdefault("errors", []).append(f"diff_parse_failed:{exc}")
            state["fragments"] = []
        return state

    async def _node_retrieve(self, state: LangGraphState) -> LangGraphState:
        request = state["request"]
        try:
            state["retrieval"] = await self._retriever.retrieve(
                repo_id=request.repo_id,
                diff_text=request.diff_text,
                changed_files=request.changed_files,
                filters=request.filters,
                limit=settings.LANGGRAPH_RETRIEVAL_LIMIT,
            )
        except Exception as exc:
            state.setdefault("errors", []).append(f"retrieval_failed:{exc}")
            state["retrieval"] = RetrievalResult(
                context_text=None,
                references=[],
                vector_hits=0,
                graph_hits=0,
                hyde_hits=0,
                reranked_count=0,
                retrieval_mode="failed",
                retrieval_trace={"error": str(exc)},
            )
        return state

    async def _node_generate(self, state: LangGraphState) -> LangGraphState:
        request = state["request"]
        retrieval = state.get("retrieval")
        if retrieval is None:
            state["llm_output"] = LLMOutput(
                status="fallback",
                summary=None,
                findings=[],
                fallback_reason="retrieval_missing",
            )
            return state

        try:
            state["llm_output"] = await self._llm_orchestrator.generate_findings(
                repo_id=request.repo_id,
                pr_number=request.pr_number,
                diff_text=request.diff_text,
                fragments=state.get("fragments", []),
                retrieval=retrieval,
                changed_files=request.changed_files,
                max_findings=settings.LANGGRAPH_LLM_MAX_FINDINGS,
            )
        except Exception as exc:
            state.setdefault("errors", []).append(f"llm_failed:{exc}")
            state["llm_output"] = LLMOutput(
                status="failed",
                summary=None,
                findings=[],
                fallback_reason=str(exc),
            )
        return state

    async def _node_finalize(self, state: LangGraphState) -> LangGraphState:
        state["completed_perf"] = time.perf_counter()
        return state


def _state_to_result(state: LangGraphState) -> LangGraphAnalysisResult:
    started = float(state.get("started_perf") or 0.0)
    completed = float(state.get("completed_perf") or started)
    duration_ms = int(max(completed - started, 0.0) * 1000)
    return LangGraphAnalysisResult(
        indexing=state.get("indexing")
        or GraphIndexSnapshot(
            status="skipped",
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
            error=None,
            graph_edges_count=0,
        ),
        fragments=state.get("fragments", []),
        retrieval=state.get("retrieval")
        or RetrievalResult(
            context_text=None,
            references=[],
            vector_hits=0,
            graph_hits=0,
            hyde_hits=0,
            reranked_count=0,
            retrieval_mode="skipped",
            retrieval_trace={},
        ),
        llm_output=state.get("llm_output")
        or LLMOutput(
            status="skipped",
            summary=None,
            findings=[],
            fallback_reason="llm_not_run",
        ),
        duration_ms=duration_ms,
        errors=list(state.get("errors") or []),
    )


def _from_payload(payload: dict[str, Any]) -> LangGraphAnalysisResult | None:
    try:
        from analysis.langGraph.models import DiffCodeFragment, LLMGeneratedFinding, RetrievedContextReference

        indexing_raw = payload.get("indexing") or {}
        retrieval_raw = payload.get("retrieval") or {}
        llm_raw = payload.get("llm_output") or {}

        indexing = GraphIndexSnapshot(
            status=indexing_raw.get("status", "skipped"),
            mode=indexing_raw.get("mode", "unknown"),
            indexed_commit=indexing_raw.get("indexed_commit"),
            default_branch=indexing_raw.get("default_branch"),
            files_seen=int(indexing_raw.get("files_seen") or 0),
            files_indexed=int(indexing_raw.get("files_indexed") or 0),
            chunks_upserted=int(indexing_raw.get("chunks_upserted") or 0),
            chunks_deleted=int(indexing_raw.get("chunks_deleted") or 0),
            changed_files=list(indexing_raw.get("changed_files") or []),
            started_at=indexing_raw.get("started_at"),
            completed_at=indexing_raw.get("completed_at"),
            error=indexing_raw.get("error"),
            graph_edges_count=int(indexing_raw.get("graph_edges_count") or 0),
        )
        fragments = [
            DiffCodeFragment(
                file_path=item.get("file_path", ""),
                language=item.get("language", "text"),
                module=item.get("module"),
                function_name=item.get("function_name"),
                class_name=item.get("class_name"),
                start_line=item.get("start_line"),
                end_line=item.get("end_line"),
                added_lines=list(item.get("added_lines") or []),
                removed_lines=list(item.get("removed_lines") or []),
            )
            for item in payload.get("fragments", [])
            if isinstance(item, dict)
        ]
        retrieval = RetrievalResult(
            context_text=retrieval_raw.get("context_text"),
            references=[
                RetrievedContextReference(
                    path=item.get("path", ""),
                    source=item.get("source", "semantic"),
                    source_type=item.get("source_type"),
                    chunk_type=item.get("chunk_type"),
                    symbol_name=item.get("symbol_name"),
                    line_start=item.get("line_start"),
                    line_end=item.get("line_end"),
                    score=float(item.get("score") or 0.0),
                    tags=tuple(item.get("tags") or []),
                    content=item.get("content", ""),
                    title=item.get("title"),
                    indexed_at=item.get("indexed_at"),
                )
                for item in retrieval_raw.get("references", [])
                if isinstance(item, dict)
            ],
            vector_hits=int(retrieval_raw.get("vector_hits") or 0),
            graph_hits=int(retrieval_raw.get("graph_hits") or 0),
            hyde_hits=int(retrieval_raw.get("hyde_hits") or 0),
            reranked_count=int(retrieval_raw.get("reranked_count") or 0),
            retrieval_mode=str(retrieval_raw.get("retrieval_mode") or "cached"),
            retrieval_trace=dict(retrieval_raw.get("retrieval_trace") or {}),
        )
        llm_output = LLMOutput(
            status=llm_raw.get("status", "skipped"),
            summary=llm_raw.get("summary"),
            findings=[
                LLMGeneratedFinding(
                    severity=item.get("severity", "WARN"),
                    category=item.get("category", "quality"),
                    message=item.get("message", ""),
                    suggestion=item.get("suggestion"),
                    confidence=float(item.get("confidence") or 0.0),
                    file_path=item.get("file_path"),
                    line_start=item.get("line_start"),
                    line_end=item.get("line_end"),
                    references=tuple(item.get("references") or []),
                )
                for item in llm_raw.get("findings", [])
                if isinstance(item, dict)
            ],
            fallback_reason=llm_raw.get("fallback_reason"),
            prompt=llm_raw.get("prompt"),
            raw_response=llm_raw.get("raw_response"),
        )

        return LangGraphAnalysisResult(
            indexing=indexing,
            fragments=fragments,
            retrieval=retrieval,
            llm_output=llm_output,
            duration_ms=int(payload.get("duration_ms") or 0),
            cached=bool(payload.get("cached", False)),
            errors=list(payload.get("errors") or []),
        )
    except Exception:
        logger.debug("Unable to parse cached LangGraph payload", exc_info=True)
        return None


async def run_langgraph_analysis(
    request: LangGraphAnalysisRequest,
    *,
    pipeline: LangGraphPipeline | None = None,
) -> LangGraphAnalysisResult:
    """
    Run LangGraph analysis with gateway-powered LLM observability.
    
    If request contains user_id/project_id/analysis_id, the LLM gateway
    will be used for full observability (traces, metrics, Langfuse, OTEL).
    Otherwise, falls back to legacy direct providers.
    """
    selected_pipeline = pipeline or LangGraphPipeline(
        user_id=request.user_id,
        project_id=request.project_id,
        analysis_id=request.analysis_id,
    )
    return await selected_pipeline.run(request)


def run_langgraph_analysis_sync(
    request: LangGraphAnalysisRequest,
    *,
    pipeline: LangGraphPipeline | None = None,
) -> LangGraphAnalysisResult:
    return asyncio.run(run_langgraph_analysis(request=request, pipeline=pipeline))

from __future__ import annotations

import asyncio

from analysis.langGraph.models import (
    GraphIndexSnapshot,
    LangGraphAnalysisRequest,
    LLMOutput,
    RetrievalResult,
)
from analysis.langGraph.pipeline import LangGraphPipeline


def test_langgraph_pipeline_uses_cache(monkeypatch) -> None:
    pipeline = LangGraphPipeline()

    cached_payload = {
        "indexing": {
            "status": "completed",
            "mode": "full",
            "indexed_commit": "abc",
            "default_branch": "main",
            "files_seen": 5,
            "files_indexed": 5,
            "chunks_upserted": 20,
            "chunks_deleted": 0,
            "changed_files": [],
            "started_at": "2026-01-01T00:00:00Z",
            "completed_at": "2026-01-01T00:00:01Z",
            "error": None,
            "graph_edges_count": 8,
        },
        "fragments": [],
        "retrieval": {
            "context_text": "cached context",
            "references": [],
            "vector_hits": 3,
            "graph_hits": 1,
            "hyde_hits": 0,
            "reranked_count": 4,
            "retrieval_mode": "hybrid_graph_vector",
            "retrieval_trace": {},
        },
        "llm_output": {
            "status": "skipped",
            "summary": None,
            "findings": [],
            "fallback_reason": "cache",
            "prompt": None,
            "raw_response": None,
        },
        "duration_ms": 11,
        "cached": False,
        "errors": [],
    }
    monkeypatch.setattr(pipeline._cache, "get", lambda _key: cached_payload)

    request = LangGraphAnalysisRequest(
        analysis_id="analysis-1",
        repo_id="acme/repo",
        repo_path="/tmp/repo",
        diff_text="diff --git a/x b/x",
        changed_files=["x"],
    )
    result = asyncio.run(pipeline.run(request))

    assert result.cached is True
    assert result.retrieval.context_text == "cached context"


def test_langgraph_pipeline_handles_llm_unavailable(monkeypatch) -> None:
    pipeline = LangGraphPipeline()
    monkeypatch.setattr(pipeline._cache, "get", lambda _key: None)
    monkeypatch.setattr(pipeline._cache, "set", lambda *_args, **_kwargs: None)

    async def _fake_index(**_: object):
        return GraphIndexSnapshot(
            status="completed",
            mode="incremental",
            indexed_commit="abc",
            default_branch="main",
            files_seen=1,
            files_indexed=1,
            chunks_upserted=2,
            chunks_deleted=0,
            changed_files=["src/app.py"],
            started_at="2026-01-01T00:00:00Z",
            completed_at="2026-01-01T00:00:01Z",
            error=None,
            graph_edges_count=1,
        )

    async def _fake_retrieve(**_: object):
        return RetrievalResult(
            context_text="retrieved context",
            references=[],
            vector_hits=2,
            graph_hits=1,
            hyde_hits=0,
            reranked_count=2,
            retrieval_mode="hybrid_graph_vector",
            retrieval_trace={},
        )

    async def _fake_generate_findings(**_: object):
        return LLMOutput(
            status="unavailable",
            summary=None,
            findings=[],
            fallback_reason="llm_down",
        )

    monkeypatch.setattr(pipeline._context_manager, "index_repository", _fake_index)
    monkeypatch.setattr(pipeline._retriever, "retrieve", _fake_retrieve)
    monkeypatch.setattr(pipeline._llm_orchestrator, "generate_findings", _fake_generate_findings)

    request = LangGraphAnalysisRequest(
        analysis_id="analysis-2",
        repo_id="acme/repo",
        repo_path="/tmp/repo",
        diff_text="diff --git a/src/app.py b/src/app.py",
        changed_files=["src/app.py"],
    )
    result = asyncio.run(pipeline.run(request))

    assert result.indexing.status == "completed"
    assert result.llm_output.status == "unavailable"
    assert result.retrieval.retrieval_mode == "hybrid_graph_vector"

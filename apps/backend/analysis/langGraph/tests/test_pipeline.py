from __future__ import annotations

import pytest

from analysis.langGraph.models import (
    GraphIndexSnapshot,
    LangGraphAnalysisRequest,
    LLMOutput,
    RetrievalResult,
)
from analysis.langGraph.pipeline import LangGraphPipeline


@pytest.mark.asyncio
async def test_pipeline_returns_cached_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    pipeline = LangGraphPipeline()

    cached = {
        "indexing": {
            "status": "completed",
            "mode": "full",
            "indexed_commit": "abc",
            "default_branch": "main",
            "files_seen": 1,
            "files_indexed": 1,
            "chunks_upserted": 2,
            "chunks_deleted": 0,
            "changed_files": ["src/app.py"],
            "started_at": "2026-01-01T00:00:00Z",
            "completed_at": "2026-01-01T00:00:01Z",
            "error": None,
            "graph_edges_count": 1,
        },
        "fragments": [],
        "retrieval": {
            "context_text": "cached-context",
            "references": [],
            "vector_hits": 2,
            "graph_hits": 1,
            "hyde_hits": 0,
            "reranked_count": 3,
            "retrieval_mode": "hybrid_graph_vector",
            "retrieval_trace": {},
        },
        "llm_output": {"status": "skipped", "summary": None, "findings": [], "fallback_reason": "cache"},
        "duration_ms": 8,
        "cached": False,
        "errors": [],
    }

    monkeypatch.setattr(pipeline._cache, "get", lambda _key: cached)

    request = LangGraphAnalysisRequest(
        analysis_id="a1",
        repo_id="acme/repo",
        repo_path="/tmp/acme-repo",
        diff_text="diff --git a/a b/a",
        changed_files=["a"],
    )
    result = await pipeline.run(request)

    assert result.cached is True
    assert result.retrieval.context_text == "cached-context"


@pytest.mark.asyncio
async def test_pipeline_fallback_when_llm_is_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    pipeline = LangGraphPipeline()

    async def _fake_index_repository(**_: object):
        return GraphIndexSnapshot(
            status="completed",
            mode="incremental",
            indexed_commit="abc",
            default_branch="main",
            files_seen=1,
            files_indexed=1,
            chunks_upserted=1,
            chunks_deleted=0,
            changed_files=["src/a.py"],
            started_at="2026-01-01T00:00:00Z",
            completed_at="2026-01-01T00:00:01Z",
            error=None,
            graph_edges_count=2,
        )

    async def _fake_retrieve(**_: object):
        return RetrievalResult(
            context_text="ctx",
            references=[],
            vector_hits=1,
            graph_hits=1,
            hyde_hits=0,
            reranked_count=1,
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

    monkeypatch.setattr(pipeline._context_manager, "index_repository", _fake_index_repository)
    monkeypatch.setattr(pipeline._retriever, "retrieve", _fake_retrieve)
    monkeypatch.setattr(pipeline._llm_orchestrator, "generate_findings", _fake_generate_findings)
    monkeypatch.setattr(pipeline._cache, "get", lambda _key: None)
    monkeypatch.setattr(pipeline._cache, "set", lambda *_args, **_kwargs: None)

    request = LangGraphAnalysisRequest(
        analysis_id="a2",
        repo_id="acme/repo",
        repo_path="/tmp/acme-repo",
        diff_text="diff",
        changed_files=["src/a.py"],
    )
    result = await pipeline.run(request)

    assert result.indexing.mode == "incremental"
    assert result.llm_output.status == "unavailable"
    assert result.llm_output.findings == []


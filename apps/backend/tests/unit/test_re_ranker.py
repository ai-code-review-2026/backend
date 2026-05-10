from __future__ import annotations

from app.core.knowledge_base.re_ranker import ReRanker
from app.core.knowledge_base.retrieval_models import QueryRoute, RetrievalCandidate, RetrievedContextChunk


def _candidate(*, source: str, content: str, score: float, path: str = "apps/backend/app/main.py") -> RetrievalCandidate:
    chunk = RetrievedContextChunk(
        score=score,
        path=path,
        chunk_index=0,
        language="python",
        content=content,
        token_count=max(1, len(content.split())),
        file_type="code",
        chunk_type="function",
        symbol_name="login_user",
        source=source,
    )
    return RetrievalCandidate(chunk=chunk, channel=source, raw_score=score, score=score)


def test_re_ranker_heuristic_prefers_exact_and_overlap(monkeypatch) -> None:
    reranker = ReRanker()
    monkeypatch.setattr(reranker, "_get_model", lambda: None)

    ranked = reranker.rank(
        query="login_user path apps/backend/app/main.py",
        candidates=[
            _candidate(source="semantic_code", content="def other(): pass", score=0.7, path="apps/backend/app/other.py"),
            _candidate(source="file_exact", content="def login_user(payload): return payload", score=0.2),
        ],
        route=QueryRoute.REPO_QUERY,
        limit=4,
    )

    assert ranked[0].channel == "file_exact"


def test_re_ranker_dedups_candidates(monkeypatch) -> None:
    reranker = ReRanker()
    monkeypatch.setattr(reranker, "_get_model", lambda: None)

    candidate = _candidate(source="semantic_code", content="def login_user(payload): return payload", score=0.5)
    ranked = reranker.rank(
        query="login_user",
        candidates=[candidate, candidate],
        route=QueryRoute.REPO_QUERY,
        limit=4,
    )

    assert len(ranked) == 1


def test_re_ranker_dedups_same_chunk_across_channels(monkeypatch) -> None:
    reranker = ReRanker()
    monkeypatch.setattr(reranker, "_get_model", lambda: None)

    chunk = RetrievedContextChunk(
        score=0.5,
        path="docs/auth.md",
        chunk_index=0,
        language="markdown",
        content="Reset passwords from the account page.",
        token_count=6,
        file_type="markdown",
        chunk_type="document_chunk",
        source_type="markdown",
        chunk_id="doc-1:0",
        source_id="doc-1",
        source="semantic_document",
    )
    ranked = reranker.rank(
        query="reset passwords",
        candidates=[
            RetrievalCandidate(chunk=chunk, channel="semantic_document", raw_score=0.5, score=0.5),
            RetrievalCandidate(chunk=chunk, channel="lexical_document", raw_score=0.7, score=0.7),
        ],
        route=QueryRoute.MULTI_SOURCE_QUERY,
        limit=4,
    )

    assert len(ranked) == 1

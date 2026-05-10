from __future__ import annotations

from app.core.knowledge_base.context_packer import ContextPacker
from app.core.knowledge_base.retrieval_models import QueryRoute, RetrievalCandidate, RetrievedContextChunk


def test_context_packer_preserves_final_score_and_channel_metadata() -> None:
    packer = ContextPacker(max_chars=500, max_chunks=4)
    candidate = RetrievalCandidate(
        chunk=RetrievedContextChunk(
            score=0.2,
            path="src/auth.py",
            chunk_index=0,
            language="python",
            content="def login():\n    return True",
            token_count=8,
            file_type="code",
            chunk_type="function",
            source="semantic_code",
        ),
        channel="semantic_code",
        raw_score=0.2,
        score=0.91,
    )

    packed = packer.pack(candidates=[candidate], route=QueryRoute.DIFF_REVIEW, limit=1)

    assert len(packed) == 1
    assert packed[0].score == 0.91
    assert packed[0].score_raw == 0.2
    assert packed[0].score_final == 0.91
    assert packed[0].retriever_channel == "semantic_code"


def test_context_packer_balances_multi_source_candidates() -> None:
    packer = ContextPacker(max_chars=2000, max_chunks=4)

    def candidate(*, path: str, source_type: str | None, file_type: str, channel: str, score: float) -> RetrievalCandidate:
        return RetrievalCandidate(
            chunk=RetrievedContextChunk(
                score=score,
                path=path,
                chunk_index=0,
                language=file_type,
                content=f"content for {path}",
                token_count=8,
                file_type=file_type,
                chunk_type="document_chunk" if source_type else "function",
                source=channel,
                source_type=source_type,
            ),
            channel=channel,
            raw_score=score,
            score=score,
        )

    packed = packer.pack(
        candidates=[
            candidate(path="src/auth.py", source_type=None, file_type="code", channel="semantic_code", score=0.95),
            candidate(path="docs/guide.md", source_type="markdown", file_type="markdown", channel="semantic_document", score=0.92),
            candidate(path="https://docs.example.com/auth", source_type="web", file_type="web", channel="semantic_document", score=0.91),
            candidate(path="schema.sql", source_type="sql", file_type="sql", channel="semantic_document", score=0.90),
            candidate(path="design.pdf", source_type="pdf", file_type="pdf", channel="semantic_document", score=0.89),
        ],
        route=QueryRoute.MULTI_SOURCE_QUERY,
        limit=4,
    )

    packed_buckets = {item.source_type or item.file_type for item in packed}
    assert "code" in packed_buckets
    assert "markdown" in packed_buckets or "web" in packed_buckets or "sql" in packed_buckets or "pdf" in packed_buckets

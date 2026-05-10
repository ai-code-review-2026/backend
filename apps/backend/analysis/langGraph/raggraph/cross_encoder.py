from __future__ import annotations

from app.core.knowledge_base.re_ranker import ReRanker
from app.core.knowledge_base.retrieval_models import QueryRoute, RetrievalCandidate, RetrievedContextChunk


class CrossEncoderReranker:
    """Thin adapter around the platform reranker (cross-encoder included)."""

    def __init__(self, reranker: ReRanker | None = None) -> None:
        self._reranker = reranker or ReRanker()

    def rerank(
        self,
        *,
        query: str,
        chunks: list[RetrievedContextChunk],
        limit: int = 12,
        channel: str = "semantic_code",
    ) -> list[RetrievedContextChunk]:
        candidates = [
            RetrievalCandidate(
                chunk=item,
                channel=channel,
                raw_score=float(item.score),
                score=float(item.score),
            )
            for item in chunks
        ]
        ranked = self._reranker.rank(
            query=query,
            candidates=candidates,
            route=QueryRoute.DIFF_REVIEW,
            limit=max(limit, 8),
        )
        return [item.chunk for item in ranked[:limit]]


# Backward-compatible alias
ReRanker = CrossEncoderReranker

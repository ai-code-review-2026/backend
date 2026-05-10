from __future__ import annotations

from analysis.langGraph.models import RetrievalFilters, RetrievalResult
from analysis.langGraph.raggraph.retriever import RagGraphRetriever


class GraphRagRetriever:
    """Canonical GraphRAG wrapper used by the pipeline."""

    def __init__(self, retriever: RagGraphRetriever | None = None) -> None:
        self._retriever = retriever or RagGraphRetriever()

    async def retrieve(
        self,
        *,
        repo_id: str,
        diff_text: str,
        changed_files: list[str] | None = None,
        filters: RetrievalFilters | None = None,
        limit: int = 12,
    ) -> RetrievalResult:
        return await self._retriever.retrieve_for_diff(
            repo_id=repo_id,
            diff_text=diff_text,
            changed_files=changed_files or [],
            filters=filters,
            limit=limit,
        )


# Backward-compatible alias kept for imports that still reference the old name.
HybridRetriever = GraphRagRetriever

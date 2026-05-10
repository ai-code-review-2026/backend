from __future__ import annotations

from app.core.knowledge_base.hyde import HyDEExpander, build_hyde_expander


class HyDEQueryService:
    def __init__(self, expander: HyDEExpander | None = None) -> None:
        self._expander = expander or build_hyde_expander()

    @property
    def available(self) -> bool:
        return self._expander.available

    def expand(self, *, query: str, query_type: str = "code") -> list[float] | None:
        return self._expander.expand_query(query=query, query_type=query_type)


class HyDERetriever:
    """Backward-compatible adapter."""

    def __init__(self, service: HyDEQueryService | None = None) -> None:
        self._service = service or HyDEQueryService()

    async def hyde_query(self, repo_id: str, query: str, limit: int = 8) -> list[dict[str, object]]:
        _ = repo_id
        _ = limit
        vector = self._service.expand(query=query, query_type="code")
        if vector is None:
            return []
        return [{"vector": vector, "query": query}]

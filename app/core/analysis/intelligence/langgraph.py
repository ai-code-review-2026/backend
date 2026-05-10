from __future__ import annotations

import asyncio
import logging
from typing import Any

from analysis.langGraph.context.graph_manager import ContextGraphManager
from analysis.langGraph.context.repo_context_manager import RepoContextManager
from analysis.langGraph.models import LLMOutput, RetrievalResult
from analysis.langGraph.pipeline import (
    LangGraphPipeline,
    run_langgraph_analysis,
    run_langgraph_analysis_sync,
)
from analysis.langGraph.raggraph.retriever import RagGraphRetriever
from analysis.langGraph.raggraph.llm_service import RagGraphLLMService
from app.core.knowledge_base.retriever import build_llm_context_with_chunks

logger = logging.getLogger(__name__)


class GraphManager(ContextGraphManager):
    """Compatibility adapter over the canonical LangGraph graph manager."""


class LangGraphIngestor:
    """Compatibility entrypoint for repository context lifecycle."""

    def __init__(self, context_manager: RepoContextManager | None = None) -> None:
        self._context_manager = context_manager or RepoContextManager()

    async def onboard_repo(self, repo_id: str, repo_path: str, *, full_index: bool = True) -> Any:
        return await self._context_manager.index_repository(
            repo_id=repo_id,
            repo_path=repo_path,
            force_full=full_index,
        )

    async def update_repo_incremental(
        self,
        repo_id: str,
        repo_path: str,
        base_ref: str | None = None,
        head_ref: str = "HEAD",
    ) -> Any:
        return await self._context_manager.index_repository(
            repo_id=repo_id,
            repo_path=repo_path,
            base_ref=base_ref,
            head_ref=head_ref,
            force_full=False,
        )

    async def get_repo_profile(self, repo_id: str) -> dict[str, Any] | None:
        existing = self._context_manager._profiles_repo.get_profile(repo_id)  # noqa: SLF001 - compatibility shim
        if existing and isinstance(existing.profile, dict):
            return dict(existing.profile)
        return None


class LangGraphRetriever:
    """Compatibility adapter over the canonical GraphRAG retriever."""

    def __init__(self, retriever: RagGraphRetriever | None = None) -> None:
        self._retriever = retriever or RagGraphRetriever()

    async def retrieve_for_diff(
        self,
        *,
        repo_id: str,
        diff_text: str,
        changed_files: list[str] | None = None,
        limit: int = 8,
    ) -> RetrievalResult:
        return await self._retriever.retrieve_for_diff(
            repo_id=repo_id,
            diff_text=diff_text,
            changed_files=changed_files or [],
            limit=limit,
        )

    async def retrieve_for_repo_bootstrap(self, *, repo_id: str, limit: int = 12):
        return await self._retriever.retrieve_for_repo_bootstrap(repo_id=repo_id, limit=limit)


class LangGraphLLMService:
    """
    Compatibility adapter over the canonical LangGraph LLM service.
    Supports gateway-powered observability when context IDs are provided.
    """

    def __init__(
        self,
        llm_service: RagGraphLLMService | None = None,
        *,
        user_id: str | None = None,
        project_id: str | None = None,
        analysis_id: str | None = None,
    ) -> None:
        """
        Initialize LLM service with optional gateway context.
        
        Args:
            llm_service: Optional pre-initialized service
            user_id: User ID for gateway observability
            project_id: Project ID for gateway cost tracking
            analysis_id: Analysis ID for gateway trace correlation
        """
        self._llm_service = llm_service or RagGraphLLMService(
            user_id=user_id,
            project_id=project_id,
            analysis_id=analysis_id,
            use_gateway=True,  # Enable gateway by default for observability
        )

    def generate_findings(
        self,
        *,
        repo: str,
        pr_number: int | None,
        diff_redacted: str,
        files_changed: list[str],
        knowledge_base_context: str,
        max_findings: int = 6,
    ) -> LLMOutput:
        retrieval = RetrievalResult(
            context_text=knowledge_base_context,
            references=[],
            vector_hits=0,
            graph_hits=0,
            hyde_hits=0,
            reranked_count=0,
            retrieval_mode="compatibility",
            retrieval_trace={},
        )

        async def _generate() -> LLMOutput:
            return await self._llm_service.generate(
                repo_id=repo,
                pr_number=pr_number,
                diff_text=diff_redacted,
                fragments=[],
                retrieval=retrieval,
                changed_files=files_changed,
                max_findings=max_findings,
            )

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(_generate())

        try:
            logger.debug("LangGraph LLM sync adapter called inside an active event loop")
            return LLMOutput(
                status="fallback",
                summary=None,
                findings=[],
                fallback_reason="active_event_loop",
            )
        except Exception:
            logger.debug("LangGraph LLM sync adapter failed", exc_info=True)
            return LLMOutput(
                status="failed",
                summary=None,
                findings=[],
                fallback_reason="sync_adapter_failed",
            )


__all__ = [
    "GraphManager",
    "LangGraphIngestor",
    "LangGraphLLMService",
    "LangGraphPipeline",
    "LangGraphRetriever",
    "build_llm_context_with_chunks",
    "run_langgraph_analysis",
    "run_langgraph_analysis_sync",
]

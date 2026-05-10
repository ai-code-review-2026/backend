from __future__ import annotations

from typing import Any

__all__ = [
    "CrossEncoderReranker",
    "HybridRetriever",
    "LLMOrchestrator",
    "RagGraphLLMService",
    "RagGraphRetriever",
    "RedisCache",
]


def __getattr__(name: str) -> Any:
    if name == "CrossEncoderReranker":
        from analysis.langGraph.raggraph.cross_encoder import CrossEncoderReranker

        return CrossEncoderReranker
    if name == "HybridRetriever":
        from analysis.langGraph.raggraph.hybrid_retriever import HybridRetriever

        return HybridRetriever
    if name == "LLMOrchestrator":
        from analysis.langGraph.raggraph.llm_orchestrator import LLMOrchestrator

        return LLMOrchestrator
    if name == "RagGraphLLMService":
        from analysis.langGraph.raggraph.llm_service import RagGraphLLMService

        return RagGraphLLMService
    if name == "RagGraphRetriever":
        from analysis.langGraph.raggraph.retriever import RagGraphRetriever

        return RagGraphRetriever
    if name == "RedisCache":
        from analysis.langGraph.raggraph.redis_cache import RedisCache

        return RedisCache
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

from __future__ import annotations

from typing import Any

__all__ = [
    "DiffChunker",
    "RepoContextManager",
    "RepoOnboarder",
    "RepositoryGraphManager",
    "RepositoryIngestionService",
]


def __getattr__(name: str) -> Any:
    if name == "DiffChunker":
        from analysis.langGraph.context.chunker import DiffChunker

        return DiffChunker
    if name == "RepoContextManager":
        from analysis.langGraph.context.repo_context_manager import RepoContextManager

        return RepoContextManager
    if name == "RepoOnboarder":
        from analysis.langGraph.context.repo_onboarder import RepoOnboarder

        return RepoOnboarder
    if name == "RepositoryGraphManager":
        from analysis.langGraph.context.graph_manager import RepositoryGraphManager

        return RepositoryGraphManager
    if name == "RepositoryIngestionService":
        from analysis.langGraph.context.ingestion_service import RepositoryIngestionService

        return RepositoryIngestionService
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")

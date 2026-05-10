from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import Any

from app.core.analysis.knowledge_base import KnowledgeBaseIngestionService

from app.core.knowledge_base.ingestor import RepoContextIngestor
from app.core.knowledge_base.document_lifecycle import resync_document_source, run_due_document_maintenance
from app.core.knowledge_base.rag_engines import build_graph_rag_engine
from app.core.knowledge_base.retriever import build_llm_context
from app.core.project_comprehension.service import ProjectComprehensionService
from app.core.summarization import SummaryService
from app.data.repos.repo_profiles_repo import RepoProfilesRepo
from app.integrations.llm_providers.ollama_client import OllamaClient
from app.integrations.graph_database.neo4j_client import get_neo4j_client
from app.settings import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

_SUMMARY_SERVICE = SummaryService(
    llm_client=OllamaClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
    )
)


@celery_app.task(name="kb.onboard_repo", bind=True)
def run_repo_onboarding(self, repo_id: str, repo_path: str, source: str = "event") -> dict[str, Any]:
    return asyncio.run(_run_repo_onboarding_async(repo_id=repo_id, repo_path=repo_path, source=source))


@celery_app.task(name="kb.process_diff", bind=True)
def run_repo_diff_processing(
    self,
    repo_id: str,
    repo_path: str,
    diff_text: str = "",
    base_ref: str | None = None,
    head_ref: str = "HEAD",
    source: str = "event",
) -> dict[str, Any]:
    return asyncio.run(
        _run_repo_diff_processing_async(
            repo_id=repo_id,
            repo_path=repo_path,
            diff_text=diff_text,
            base_ref=base_ref,
            head_ref=head_ref,
            source=source,
        )
    )


@celery_app.task(name="kb.resync_document", bind=True)
def run_document_resync(self, doc_id: str, reason: str = "manual") -> dict[str, Any]:
    _ = self
    return asyncio.run(_run_document_resync_async(doc_id=doc_id, reason=reason))


@celery_app.task(name="kb.maintain_documents", bind=True)
def run_document_maintenance(
    self,
    repo_id: str | None = None,
    source_type: str | None = None,
    limit: int = 100,
    reason: str = "scheduled",
) -> dict[str, Any]:
    _ = self
    return asyncio.run(
        _run_document_maintenance_async(
            repo_id=repo_id,
            source_type=source_type,
            limit=limit,
            reason=reason,
        )
    )


async def _run_repo_onboarding_async(*, repo_id: str, repo_path: str, source: str) -> dict[str, Any]:
    repo_path = repo_path.strip('"')
    neo4j_client = get_neo4j_client()

    if Path(repo_path).is_file():
        # Treat as document ingestion
        kb_service = KnowledgeBaseIngestionService(neo4j_client=neo4j_client)
        result = await kb_service.ingest_document(
            title=repo_id,
            path_or_url=repo_path,
            source_type="file",
            tags={},
        )
        return {
            "status": "ok",
            "mode": "document",
            "doc_id": result.document_id,
            "title": repo_id,
            "path": repo_path,
            "chunks_upserted": result.chunks_upserted,
        }

    # Repo onboarding
    ingestor = RepoContextIngestor(neo4j_client=neo4j_client)
    rag_engine = build_graph_rag_engine(neo4j_client=neo4j_client)

    index_result = await ingestor.onboard_repo(repo_id=repo_id, repo_path=repo_path, source=source, force_full=True)

    # Run project comprehension analysis
    comprehension_service = ProjectComprehensionService(neo4j_client=neo4j_client)
    comprehension_profile = None
    comprehension_error = None
    try:
        comprehension_profile = await comprehension_service.analyze_repository(
            repo_path=repo_path,
            repo_id=repo_id,
        )
        # Store profile in Neo4j
        await comprehension_service.store_profile(comprehension_profile)
        logger.info(f"Project comprehension completed for {repo_id}: status={comprehension_profile.analysis_status}")
    except Exception as e:
        comprehension_error = str(e)
        logger.warning(f"Project comprehension failed for {repo_id}: {e}")

    bootstrap_result = await rag_engine.retrieve_for_repo_bootstrap(repo_id=repo_id, limit=16)
    overview_chunks = bootstrap_result.chunks
    profile = bootstrap_result.profile
    overview_context = bootstrap_result.context_text or build_llm_context(overview_chunks)
    overview_summary: str | None = None
    overview_highlights: list[str] = []
    summary_source = "none"
    summary_fallback = False

    if profile:
        try:
            generated = _SUMMARY_SERVICE.generate_repo_overview(
                repo_id=repo_id,
                repo_profile=profile,
                context_excerpt=overview_context,
            )
            overview_summary = generated.summary
            overview_highlights = generated.highlights
            summary_source = "graph_rag"
        except Exception:
            fallback = SummaryService.fallback_repo_overview(repo_id=repo_id, repo_profile=profile)
            overview_summary = fallback.summary
            overview_highlights = fallback.highlights
            summary_source = "heuristic"
            summary_fallback = True

    if profile:
        enriched_profile = dict(profile)
        enriched_profile["llm_overview"] = {
            "summary": overview_summary,
            "highlights": overview_highlights,
            "source": summary_source,
            "fallback_used": summary_fallback,
            "model": settings.OLLAMA_MODEL,
        }
        RepoProfilesRepo().upsert_profile(
            repo_id=repo_id,
            repo_path=repo_path,
            indexed_commit=_as_optional_str(profile.get("indexed_commit")),
            default_branch=_as_optional_str(profile.get("default_branch")),
            profile=enriched_profile,
            overview_context=overview_context,
        )

    return {
        "status": "ok",
        "mode": "onboarding",
        "repo_id": repo_id,
        "repo_path": repo_path,
        "chunks_upserted": index_result.chunks_upserted,
        "files_indexed": index_result.files_indexed,
        "overview_chunks": len(overview_chunks),
        "overview_summary": overview_summary,
        "summary_source": summary_source,
        "summary_fallback": summary_fallback,
        "comprehension": {
            "status": comprehension_profile.analysis_status if comprehension_profile else "skipped",
            "error": comprehension_error,
            "context_version": comprehension_profile.context_version if comprehension_profile else None,
            "architecture": comprehension_profile.architecture.pattern.value if comprehension_profile and comprehension_profile.architecture else None,
            "languages": comprehension_profile.structure.main_languages if comprehension_profile and comprehension_profile.structure else [],
            "frameworks": comprehension_profile.structure.frameworks_detected if comprehension_profile and comprehension_profile.structure else [],
        },
    }


async def _run_repo_diff_processing_async(
    *,
    repo_id: str,
    repo_path: str,
    diff_text: str,
    base_ref: str | None,
    head_ref: str,
    source: str,
) -> dict[str, Any]:
    neo4j_client = get_neo4j_client()
    ingestor = RepoContextIngestor(neo4j_client=neo4j_client)
    rag_engine = build_graph_rag_engine(neo4j_client=neo4j_client)

    update_result = await ingestor.update_repo_incremental(
        repo_id=repo_id,
        repo_path=repo_path,
        base_ref=base_ref,
        head_ref=head_ref,
        source=source,
    )
    if diff_text.strip():
        diff_result = await rag_engine.retrieve_for_diff(repo_id=repo_id, diff_text=diff_text, limit=12)
        diff_chunks = diff_result.chunks
        profile = diff_result.profile
        llm_context = diff_result.context_text or build_llm_context(diff_chunks)
    else:
        diff_chunks = []
        profile = await ingestor.get_repo_profile(repo_id)
        llm_context = None

    if profile:
        existing_profile = RepoProfilesRepo().get_profile(repo_id)
        enriched_profile = dict(profile)
        if existing_profile and isinstance(existing_profile.profile, dict):
            previous_overview = existing_profile.profile.get("llm_overview")
            if isinstance(previous_overview, dict):
                enriched_profile["llm_overview"] = previous_overview

        RepoProfilesRepo().upsert_profile(
            repo_id=repo_id,
            repo_path=repo_path,
            indexed_commit=_as_optional_str(profile.get("indexed_commit")),
            default_branch=_as_optional_str(profile.get("default_branch")),
            profile=enriched_profile,
            overview_context=llm_context,
        )

    return {
        "status": "ok",
        "mode": "diff",
        "repo_id": repo_id,
        "repo_path": repo_path,
        "files_indexed": update_result.files_indexed,
        "chunks_upserted": update_result.chunks_upserted,
        "changed_files": update_result.changed_files,
        "context_chunks": len(diff_chunks),
    }


def _as_optional_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


async def _run_document_resync_async(*, doc_id: str, reason: str) -> dict[str, Any]:
    return await resync_document_source(doc_id=doc_id, reason=reason)


async def _run_document_maintenance_async(
    *,
    repo_id: str | None,
    source_type: str | None,
    limit: int,
    reason: str,
) -> dict[str, Any]:
    return await run_due_document_maintenance(
        repo_id=repo_id,
        source_type=source_type,
        limit=limit,
        reason=reason,
    )

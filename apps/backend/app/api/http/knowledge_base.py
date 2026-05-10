from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, Path
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import get_neo4j_graph_client
from app.api.errors import ApiError
from app.api.middleware.auth import AuthenticatedPrincipal, require_permission
from app.data.database import get_engine
from app.core.knowledge_base.ingestor import RepoContextIngestor, RepoIndexResult
from app.core.knowledge_base.rag_engines import GraphRagEngine, build_graph_rag_engine
from app.core.knowledge_base.retriever import RepoContextRetriever, RetrievedContextChunk, build_llm_context
from app.core.summarization import SummaryService
from app.integrations.graph_database.neo4j_client import Neo4jClient
from app.integrations.llm_providers.ollama_client import OllamaClient
from app.data.repos.repo_profiles_repo import RepoProfilesRepo
from app.data.repos.repo_context_chunks_repo import RepoContextChunksRepo
from app.settings import settings
from app.core.knowledge_base.document_ingestion import (
    DocumentSectionInput,
    build_document_ingestion_result,
    chunk_metadata_for_storage,
    utc_iso_now,
)
from app.core.knowledge_base.document_lifecycle import (
    build_document_tags_payload,
    list_document_sources,
    persist_document_ingestion,
    source_observability_summary,
)
from sqlalchemy import text
from app.workers.tasks.ingest_kb import (
    run_document_maintenance,
    run_document_resync,
    run_repo_diff_processing,
    run_repo_onboarding,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/kb", tags=["knowledge-base"])

_SUMMARY_SERVICE = SummaryService(
    llm_client=OllamaClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
    )
)
class RepoOnboardRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(min_length=1, max_length=255)
    repo_path: str = Field(min_length=1, max_length=4096)
    source: str = Field(default="manual", min_length=1, max_length=64)
    force_full: bool = False


class RepoUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(min_length=1, max_length=255)
    repo_path: str = Field(min_length=1, max_length=4096)
    base_ref: str | None = Field(default=None, max_length=255)
    head_ref: str = Field(default="HEAD", min_length=1, max_length=255)
    source: str = Field(default="manual", min_length=1, max_length=64)


class ContextByDiffRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(min_length=1, max_length=255)
    diff_text: str = Field(min_length=1)
    changed_files: list[str] = Field(default_factory=list, max_length=200)
    limit: int = Field(default=8, ge=1, le=30)


class ContextByQueryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(min_length=1, max_length=255)
    query: str = Field(min_length=1)
    changed_files: list[str] = Field(default_factory=list, max_length=200)
    limit: int = Field(default=8, ge=1, le=30)
    route_hint: Literal[
        "auto",
        "repo_query",
        "code_query",
        "policy_query",
        "document_query",
        "pdf_query",
        "web_query",
        "markdown_query",
        "sql_query",
        "multi_source_query",
    ] = "auto"


class RepoBootstrapContextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(min_length=1, max_length=255)
    limit: int = Field(default=16, ge=1, le=40)


class RepoIndexResponse(BaseModel):
    repo_id: str
    repo_path: str
    mode: str
    indexed_commit: str | None
    default_branch: str | None
    files_seen: int
    files_indexed: int
    chunks_upserted: int
    chunks_deleted: int
    changed_files: list[str]
    started_at: str
    completed_at: str


class ContextChunkResponse(BaseModel):
    score: float
    path: str
    chunk_index: int
    language: str
    content: str
    token_count: int
    file_type: str | None = None
    chunk_type: str | None = None
    symbol_name: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    source: str | None = None
    title: str | None = None
    source_type: str | None = None
    source_uri: str | None = None
    page: int | None = None
    section_title: str | None = None
    heading_path: list[str] = Field(default_factory=list)
    entity_type: str | None = None
    entity_name: str | None = None
    domain: str | None = None
    document_version: str | None = None
    crawl_timestamp: str | None = None
    tags: list[str] = Field(default_factory=list)


class ContextResponse(BaseModel):
    repo_id: str
    chunks: list[ContextChunkResponse]
    profile: dict[str, Any] | None = None


class RepoProfileResponse(BaseModel):
    repo_id: str
    profile: dict[str, Any] | None = None
    sql_profile: dict[str, Any] | None = None
    overview_context: str | None = None


class AutomationOnboardRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(min_length=1, max_length=255)
    repo_path: str = Field(min_length=1, max_length=4096)
    source: str = Field(default="manual", min_length=1, max_length=64)


class AutomationDiffRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(min_length=1, max_length=255)
    repo_path: str = Field(min_length=1, max_length=4096)
    diff_text: str = Field(default="")
    base_ref: str | None = Field(default=None, max_length=255)
    head_ref: str = Field(default="HEAD", min_length=1, max_length=255)
    source: str = Field(default="manual", min_length=1, max_length=64)


class AutomationTaskResponse(BaseModel):
    task_name: str
    task_id: str
    status: str = "QUEUED"


class RepoProfileListItemResponse(BaseModel):
    repo_id: str
    repo_path: str | None = None
    indexed_commit: str | None = None
    default_branch: str | None = None
    profile: dict[str, Any] = Field(default_factory=dict)
    overview_context: str | None = None
    updated_at: str | None = None


class RepoProfileListResponse(BaseModel):
    items: list[RepoProfileListItemResponse]


class KnowledgeBaseReindexRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repoId: str = Field(min_length=1, max_length=255)
    repoPath: str | None = Field(default=None, max_length=4096)


class KnowledgeBaseReindexResponse(BaseModel):
    repoId: str
    repoPath: str
    taskId: str
    status: str = "QUEUED"


class KnowledgeBaseDeleteResponse(BaseModel):
    repoId: str
    deleted: bool


class DocumentIngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(min_length=1, max_length=255)
    title: str = Field(min_length=1, max_length=500)
    source_type: str = Field(default="markdown", min_length=1, max_length=64)
    path_or_url: str | None = Field(default=None, max_length=4096)
    content: str = Field(default="", max_length=2_000_000)
    tags: list[str] = Field(default_factory=list, max_length=64)
    doc_version: int = Field(default=1, ge=1, le=10_000)
    source_uri: str | None = Field(default=None, max_length=4096)
    content_hash: str | None = Field(default=None, max_length=256)
    version: str | None = Field(default=None, max_length=255)
    pages: list[str] = Field(default_factory=list, max_length=5000)
    sections: list["DocumentSectionRequest"] = Field(default_factory=list, max_length=5000)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentSectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    content: str = Field(min_length=1, max_length=200_000)
    section_title: str | None = Field(default=None, max_length=500)
    heading_path: list[str] = Field(default_factory=list, max_length=16)
    page: int | None = Field(default=None, ge=1, le=100_000)
    entity_type: str | None = Field(default=None, max_length=64)
    entity_name: str | None = Field(default=None, max_length=255)
    line_start: int | None = Field(default=None, ge=1)
    line_end: int | None = Field(default=None, ge=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentIngestResponse(BaseModel):
    doc_id: str
    repo_id: str
    title: str
    chunks: int
    source_type: str


class DocumentSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str = Field(min_length=1, max_length=255)
    query: str = Field(min_length=1, max_length=4000)
    source_type: str | None = Field(default=None, max_length=64)
    tags: list[str] = Field(default_factory=list, max_length=32)
    limit: int = Field(default=8, ge=1, le=30)


class CitationResponse(BaseModel):
    doc_id: str
    title: str
    source_type: str
    excerpt: str
    score: float
    path_or_url: str | None = None
    chunk_index: int
    source_uri: str | None = None
    page: int | None = None
    section_title: str | None = None
    heading_path: list[str] = Field(default_factory=list)
    entity_type: str | None = None
    entity_name: str | None = None
    line_start: int | None = None
    line_end: int | None = None
    domain: str | None = None
    document_version: str | None = None
    crawl_timestamp: str | None = None
    tags: list[str] = Field(default_factory=list)


class DocumentSearchResponse(BaseModel):
    repo_id: str
    citations: list[CitationResponse]


class DocumentMaintenanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo_id: str | None = Field(default=None, max_length=255)
    source_type: str | None = Field(default=None, max_length=64)
    only_due: bool = True
    limit: int = Field(default=100, ge=1, le=1000)


class DocumentResyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    doc_id: str | None = Field(default=None, max_length=255)
    repo_id: str | None = Field(default=None, max_length=255)
    source_type: str | None = Field(default=None, max_length=64)
    only_due: bool = False
    limit: int = Field(default=50, ge=1, le=500)


class DocumentSourceResponse(BaseModel):
    doc_id: str
    repo_id: str | None = None
    title: str
    source_type: str
    path_or_url: str | None = None
    source_uri: str | None = None
    doc_version: int
    tags: list[str] = Field(default_factory=list)
    resync_supported: bool = False
    next_recrawl_at: str | None = None
    last_sync_at: str | None = None
    last_sync_status: str | None = None
    last_sync_error: str | None = None


class DocumentSourcesResponse(BaseModel):
    items: list[DocumentSourceResponse]
    observability: dict[str, Any]


class DocumentAutomationResponse(BaseModel):
    task_name: str
    queued: int = 0
    doc_ids: list[str] = Field(default_factory=list)
    status: str = "QUEUED"


DocumentIngestRequest.model_rebuild()


def _chunk_text(content: str, *, chunk_size: int = 2400, overlap: int = 250) -> list[str]:
    clean = content.strip()
    if not clean:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(clean):
        end = min(len(clean), start + chunk_size)
        part = clean[start:end].strip()
        if part:
            chunks.append(part)
        if end >= len(clean):
            break
        start = max(0, end - overlap)
    return chunks


def _coerce_non_negative_int(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return max(value, 0)
    if isinstance(value, float):
        return max(int(value), 0)
    if isinstance(value, str):
        try:
            return max(int(value.strip()), 0)
        except ValueError:
            return 0
    return 0


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    results: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        normalized = item.strip()
        if normalized and normalized not in results:
            results.append(normalized)
    return results


def _normalize_source_type(value: str) -> str:
    normalized = value.strip().lower()
    aliases = {
        "md": "markdown",
        "mdx": "markdown",
        "doc": "markdown",
        "docs": "markdown",
        "url": "web",
        "website": "web",
        "rule": "policy",
        "rules": "policy",
    }
    return aliases.get(normalized, normalized or "markdown")


def _insert_kb_document(
    *,
    repo_id: str,
    doc_id: str,
    title: str,
    source_type: str,
    path_or_url: str | None,
    tags: list[str],
    doc_version: int,
    chunks: list[dict[str, Any]],
    source_uri: str | None,
    content_hash: str | None,
    version: str | None,
    domain: str | None,
) -> None:
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO kb_documents (id, title, source_type, path_or_url, tags_json, doc_version)
                VALUES (:id, :title, :source_type, :path_or_url, CAST(:tags_json AS jsonb), :doc_version)
                ON CONFLICT (id) DO UPDATE
                SET title = EXCLUDED.title,
                    source_type = EXCLUDED.source_type,
                    path_or_url = EXCLUDED.path_or_url,
                    tags_json = EXCLUDED.tags_json,
                    doc_version = EXCLUDED.doc_version
                """
            ),
            {
                "id": doc_id,
                "title": title,
                "source_type": source_type,
                "path_or_url": path_or_url,
                "tags_json": json.dumps(
                    {
                        "repo_id": repo_id,
                        "source_type": source_type,
                        "path_or_url": path_or_url,
                        "source_uri": source_uri,
                        "content_hash": content_hash,
                        "version": version,
                        "domain": domain,
                        "tags": tags,
                    }
                ),
                "doc_version": doc_version,
            },
        )
        conn.execute(text("DELETE FROM kb_chunks WHERE doc_id = :doc_id"), {"doc_id": doc_id})
        for index, chunk in enumerate(chunks):
            content = str(chunk.get("content") or "")
            metadata = chunk_metadata_for_storage(dict(chunk.get("metadata") or {}))
            conn.execute(
                text(
                    """
                    INSERT INTO kb_chunks (id, doc_id, chunk_index, text, content, token_count, metadata_json)
                    VALUES (:id, :doc_id, :chunk_index, :text, :content, :token_count, CAST(:metadata_json AS jsonb))
                    """
                ),
                {
                    "id": f"kbc_{uuid.uuid4().hex}",
                    "doc_id": doc_id,
                    "chunk_index": index,
                    "text": content,
                    "content": content,
                    "token_count": max(1, len(content) // 4),
                    "metadata_json": json.dumps(metadata),
                },
            )


def _map_index_result(result: RepoIndexResult) -> RepoIndexResponse:
    return RepoIndexResponse(
        repo_id=result.repo_id,
        repo_path=result.repo_path,
        mode=result.mode,
        indexed_commit=result.indexed_commit,
        default_branch=result.default_branch,
        files_seen=result.files_seen,
        files_indexed=result.files_indexed,
        chunks_upserted=result.chunks_upserted,
        chunks_deleted=result.chunks_deleted,
        changed_files=result.changed_files,
        started_at=result.started_at,
        completed_at=result.completed_at,
    )


def _map_chunk(item: RetrievedContextChunk) -> ContextChunkResponse:
    return ContextChunkResponse(
        score=item.score,
        path=item.path,
        chunk_index=item.chunk_index,
        language=item.language,
        content=item.content,
        token_count=item.token_count,
        file_type=item.file_type,
        chunk_type=item.chunk_type,
        symbol_name=item.symbol_name,
        start_line=item.start_line,
        end_line=item.end_line,
        source=item.source,
        title=item.title,
        source_type=item.source_type,
        source_uri=item.source_uri,
        page=item.page,
        section_title=item.section_title,
        heading_path=list(item.heading_path),
        entity_type=item.entity_type,
        entity_name=item.entity_name,
        domain=item.domain,
        document_version=item.document_version or item.version,
        crawl_timestamp=item.crawl_timestamp,
        tags=list(item.tags),
    )


def _resolve_repo_path_for_reindex(repo_id: str, repo_path: str | None) -> str:
    normalized = (repo_path or "").strip()
    if normalized:
        return normalized

    profile = RepoProfilesRepo().get_profile(repo_id)
    candidate = str(profile.repo_path or "").strip() if profile else ""
    if candidate:
        return candidate

    # If no profile or no repo_path, use repo_id as fallback
    return repo_id


def _delete_repo_profile(repo_id: str) -> bool:
    engine = get_engine()
    with engine.begin() as conn:
        existing = (
            conn.execute(
                text("SELECT repo_id FROM repo_profiles WHERE repo_id = :repo_id LIMIT 1"),
                {"repo_id": repo_id},
            )
            .mappings()
            .first()
        )
        if existing is None:
            raise ApiError(
                status_code=404,
                code="REPO_PROFILE_NOT_FOUND",
                message="Repo profile not found",
                details={"repoId": repo_id},
            )
        conn.execute(text("DELETE FROM repo_profiles WHERE repo_id = :repo_id"), {"repo_id": repo_id})
    return True


def _to_api_error(exc: Exception) -> ApiError:
    if isinstance(exc, ValueError):
        return ApiError(status_code=400, code="INVALID_REQUEST", message=str(exc))
    if isinstance(exc, RuntimeError):
        return ApiError(status_code=400, code="FEATURE_NOT_AVAILABLE", message=str(exc))
    logger.exception("Knowledge-base operation failed")
    return ApiError(status_code=500, code="KB_INTERNAL_ERROR", message="Knowledge-base operation failed")


@router.post("/onboard", response_model=RepoIndexResponse)
async def onboard_repo(
    payload: RepoOnboardRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
) -> RepoIndexResponse:
    ingestor = RepoContextIngestor(neo4j_client=neo4j_client)
    try:
        result = await ingestor.onboard_repo(
            repo_id=payload.repo_id,
            repo_path=payload.repo_path,
            source=payload.source,
            force_full=payload.force_full,
        )
        # Auto-bootstrap retrieval for a newly indexed repo.
        rag_engine = build_graph_rag_engine(neo4j_client=neo4j_client)
        bootstrap_result = await rag_engine.retrieve_for_repo_bootstrap(repo_id=payload.repo_id, limit=16)
        bootstrap_chunks = bootstrap_result.chunks
        profile = bootstrap_result.profile
        if profile:
            overview_context = bootstrap_result.context_text or build_llm_context(bootstrap_chunks)
            try:
                generated = _SUMMARY_SERVICE.generate_repo_overview(
                    repo_id=payload.repo_id,
                    repo_profile=profile,
                    context_excerpt=overview_context,
                )
                llm_summary = generated.summary
                llm_highlights = generated.highlights
                llm_source = "graph_rag"
                llm_fallback = False
            except Exception:
                fallback = SummaryService.fallback_repo_overview(repo_id=payload.repo_id, repo_profile=profile)
                llm_summary = fallback.summary
                llm_highlights = fallback.highlights
                llm_source = "heuristic"
                llm_fallback = True

            enriched_profile = dict(profile)
            enriched_profile["llm_overview"] = {
                "summary": llm_summary,
                "highlights": llm_highlights,
                "source": llm_source,
                "fallback_used": llm_fallback,
                "model": settings.OLLAMA_MODEL,
            }
            await asyncio.to_thread(
                RepoProfilesRepo().upsert_profile,
                repo_id=payload.repo_id,
                repo_path=payload.repo_path,
                indexed_commit=str(profile.get("indexed_commit") or "") or None,
                default_branch=str(profile.get("default_branch") or "") or None,
                profile=enriched_profile,
                overview_context=overview_context,
            )
        return _map_index_result(result)
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.post("/update", response_model=RepoIndexResponse)
async def update_repo(
    payload: RepoUpdateRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
) -> RepoIndexResponse:
    ingestor = RepoContextIngestor(neo4j_client=neo4j_client)
    try:
        result = await ingestor.update_repo_incremental(
            repo_id=payload.repo_id,
            repo_path=payload.repo_path,
            base_ref=payload.base_ref,
            head_ref=payload.head_ref,
            source=payload.source,
        )
        return _map_index_result(result)
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.post("/reindex", response_model=KnowledgeBaseReindexResponse)
async def reindex_repo(
    payload: KnowledgeBaseReindexRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
) -> KnowledgeBaseReindexResponse:
    try:
        resolved_repo_path = await asyncio.to_thread(_resolve_repo_path_for_reindex, payload.repoId, payload.repoPath)
        async_result = run_repo_onboarding.apply_async(
            args=[payload.repoId, resolved_repo_path, "dashboard_manual"],
            queue=settings.ANALYSIS_QUEUE_NAME,
        )
        return KnowledgeBaseReindexResponse(
            repoId=payload.repoId,
            repoPath=resolved_repo_path,
            taskId=str(async_result.id or ""),
            status="QUEUED",
        )
    except ApiError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.get("/repos/{repo_id}/profile", response_model=RepoProfileResponse)
async def get_repo_profile(
    repo_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
) -> RepoProfileResponse:
    retriever = RepoContextRetriever(neo4j_client=neo4j_client)
    try:
        profile = await retriever.get_repo_profile(repo_id)
        sql_profile = await asyncio.to_thread(RepoProfilesRepo().get_profile, repo_id)
        return RepoProfileResponse(
            repo_id=repo_id,
            profile=profile,
            sql_profile=sql_profile.profile if sql_profile else None,
            overview_context=sql_profile.overview_context if sql_profile else None,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.delete("/repos/{repo_id}", response_model=KnowledgeBaseDeleteResponse)
async def delete_repo(
    repo_id: str = Path(min_length=1, max_length=255),
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
) -> KnowledgeBaseDeleteResponse:
    try:
        deleted = await asyncio.to_thread(_delete_repo_profile, repo_id)
        if neo4j_client.enabled:
            await asyncio.to_thread(neo4j_client.delete_repo_chunks, repo_id=repo_id)
        return KnowledgeBaseDeleteResponse(repoId=repo_id, deleted=deleted)
    except ApiError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.get("/repos/profiles", response_model=RepoProfileListResponse)
async def list_repo_profiles(
    limit: int = 50,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
) -> RepoProfileListResponse:
    try:
        safe_limit = min(max(limit, 1), 200)
        profiles = await asyncio.to_thread(RepoProfilesRepo().list_profiles, safe_limit)
        return RepoProfileListResponse(
            items=[
                RepoProfileListItemResponse(
                    repo_id=item.repo_id,
                    repo_path=item.repo_path,
                    indexed_commit=item.indexed_commit,
                    default_branch=item.default_branch,
                    profile=item.profile,
                    overview_context=item.overview_context,
                    updated_at=item.updated_at,
                )
                for item in profiles
            ]
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.post("/context/query", response_model=ContextResponse)
async def get_context_for_query(
    payload: ContextByQueryRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
) -> ContextResponse:
    rag_engine = build_graph_rag_engine(neo4j_client=neo4j_client)
    try:
        result = await rag_engine.retrieve_for_query(
            repo_id=payload.repo_id,
            query=payload.query,
            changed_files=payload.changed_files or None,
            limit=payload.limit,
            route_hint=payload.route_hint,
        )
        return ContextResponse(
            repo_id=payload.repo_id,
            chunks=[_map_chunk(item) for item in result.chunks],
            profile=result.profile,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.post("/context/diff", response_model=ContextResponse)
async def get_context_for_diff(
    payload: ContextByDiffRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
) -> ContextResponse:
    rag_engine = build_graph_rag_engine(neo4j_client=neo4j_client)
    try:
        result = await rag_engine.retrieve_for_diff(
            repo_id=payload.repo_id,
            diff_text=payload.diff_text,
            changed_files=payload.changed_files or None,
            limit=payload.limit,
        )
        return ContextResponse(
            repo_id=payload.repo_id,
            chunks=[_map_chunk(item) for item in result.chunks],
            profile=result.profile,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.post("/context/bootstrap", response_model=ContextResponse)
async def get_bootstrap_context_for_repo(
    payload: RepoBootstrapContextRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
) -> ContextResponse:
    rag_engine = build_graph_rag_engine(neo4j_client=neo4j_client)
    try:
        result = await rag_engine.retrieve_for_repo_bootstrap(
            repo_id=payload.repo_id,
            limit=payload.limit,
        )
        return ContextResponse(
            repo_id=payload.repo_id,
            chunks=[_map_chunk(item) for item in result.chunks],
            profile=result.profile,
        )
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.post("/ingest", response_model=DocumentIngestResponse)
async def ingest_document(
    payload: DocumentIngestRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
) -> DocumentIngestResponse:
    normalized_source_type = _normalize_source_type(payload.source_type)
    normalized_tags = _normalize_string_list(payload.tags)
    if normalized_source_type == "policy" and "policy" not in normalized_tags:
        normalized_tags.append("policy")

    normalized_metadata = dict(payload.metadata or {})
    if normalized_source_type == "web" and not normalized_metadata.get("crawl_timestamp"):
        normalized_metadata["crawl_timestamp"] = utc_iso_now()
    sections = [
        DocumentSectionInput(
            content=item.content,
            section_title=item.section_title,
            heading_path=tuple(_normalize_string_list(item.heading_path)),
            page=item.page,
            entity_type=item.entity_type,
            entity_name=item.entity_name,
            line_start=item.line_start,
            line_end=item.line_end,
            metadata=dict(item.metadata or {}),
        )
        for item in payload.sections
    ]
    ingestion_result = build_document_ingestion_result(
        title=payload.title,
        source_type=normalized_source_type,
        content=payload.content,
        path_or_url=payload.path_or_url,
        source_uri=payload.source_uri,
        content_hash=payload.content_hash,
        version=payload.version,
        doc_version=payload.doc_version,
        tags=normalized_tags,
        metadata=normalized_metadata,
        pages=payload.pages or None,
        sections=sections or None,
    )
    if not ingestion_result.chunks:
        raise ApiError(status_code=400, code="INVALID_REQUEST", message="Document content is empty after cleaning")

    doc_id = f"doc_{uuid.uuid4().hex}"
    await persist_document_ingestion(
        doc_id=doc_id,
        repo_id=payload.repo_id,
        title=payload.title,
        source_type=normalized_source_type,
        path_or_url=payload.path_or_url,
        tags=normalized_tags,
        doc_version=payload.doc_version,
        ingestion_result=ingestion_result,
        vector_store=None,  # Qdrant removed; SQL rows still persisted by _upsert_document_rows
        existing_tags_payload=build_document_tags_payload(
            repo_id=payload.repo_id,
            source_type=normalized_source_type,
            path_or_url=payload.path_or_url,
            source_uri=ingestion_result.source_uri,
            tags=normalized_tags,
            content_hash=ingestion_result.content_hash,
            version=ingestion_result.version or str(payload.doc_version),
            sync={"last_sync_reason": "ingest"},
        ),
        sync_update={"last_sync_reason": "ingest"},
    )

    repo_profiles = RepoProfilesRepo()
    existing_profile = await asyncio.to_thread(repo_profiles.get_profile, payload.repo_id)
    profile_payload = dict(existing_profile.profile) if existing_profile and isinstance(existing_profile.profile, dict) else {}
    source_kinds = _normalize_string_list(profile_payload.get("source_kinds"))
    if normalized_source_type not in source_kinds:
        source_kinds.append(normalized_source_type)

    profile_payload.update(
        {
            "source_kind": "document",
            "source_type": normalized_source_type,
            "source_kinds": source_kinds,
            "files_indexed": _coerce_non_negative_int(profile_payload.get("files_indexed")) + 1,
            "documents_count": _coerce_non_negative_int(profile_payload.get("documents_count")) + 1,
            "chunks_indexed": _coerce_non_negative_int(profile_payload.get("chunks_indexed")) + len(ingestion_result.chunks),
            "last_document_title": payload.title,
        }
    )
    await asyncio.to_thread(
        repo_profiles.upsert_profile,
        repo_id=payload.repo_id,
        repo_path=payload.path_or_url or (existing_profile.repo_path if existing_profile else None),
        indexed_commit=existing_profile.indexed_commit if existing_profile else None,
        default_branch=existing_profile.default_branch if existing_profile else None,
        profile=profile_payload,
        overview_context=existing_profile.overview_context if existing_profile else None,
    )

    # Also ingest into Neo4j knowledge graph
    try:
        from app.core.knowledge_base.neo4j_kb_ingestion import get_kb_ingestion_service
        kb_service = get_kb_ingestion_service()
        await asyncio.to_thread(
            kb_service.ingest_document,
            doc_id=doc_id,
            title=payload.title,
            content=payload.content,
            source_type=normalized_source_type,
            repo_id=payload.repo_id,
            path_or_url=payload.path_or_url,
            tags=normalized_tags,
        )
    except Exception:
        logger.warning("Neo4j KB ingestion failed for doc_id=%s (non-fatal)", doc_id, exc_info=True)

    return DocumentIngestResponse(
        doc_id=doc_id,
        repo_id=payload.repo_id,
        title=payload.title,
        chunks=len(ingestion_result.chunks),
        source_type=normalized_source_type,
    )


@router.post("/search", response_model=DocumentSearchResponse)
async def search_documents(
    payload: DocumentSearchRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
) -> DocumentSearchResponse:
    retriever = RepoContextRetriever(neo4j_client=neo4j_client)
    chunks = await retriever.retrieve_document_chunks(
        repo_id=payload.repo_id,
        query=payload.query,
        source_type=_normalize_source_type(payload.source_type) if payload.source_type else None,
        tags=payload.tags,
        limit=payload.limit,
    )

    citations = [
        CitationResponse(
            doc_id=item.document_id or f"{payload.repo_id}:{item.path}:{item.chunk_index}",
            title=item.title or (item.path.rsplit("/", maxsplit=1)[-1] if "/" in item.path else item.path),
            source_type=item.source_type or item.file_type or "unknown",
            excerpt=item.content,
            score=item.score,
            path_or_url=item.path,
            chunk_index=item.chunk_index,
            source_uri=item.source_uri,
            page=item.page,
            section_title=item.section_title,
            heading_path=list(item.heading_path),
            entity_type=item.entity_type,
            entity_name=item.entity_name,
            line_start=item.start_line,
            line_end=item.end_line,
            domain=item.domain,
            document_version=item.document_version or item.version,
            crawl_timestamp=item.crawl_timestamp,
            tags=list(item.tags),
        )
        for item in chunks
    ]
    return DocumentSearchResponse(repo_id=payload.repo_id, citations=citations)


@router.get("/sources", response_model=DocumentSourcesResponse)
async def list_sources(
    repo_id: str | None = None,
    source_type: str | None = None,
    limit: int = 200,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
) -> DocumentSourcesResponse:
    normalized_source_type = _normalize_source_type(source_type) if source_type else None
    items = await asyncio.to_thread(list_document_sources, repo_id=repo_id, source_type=normalized_source_type, limit=limit)
    return DocumentSourcesResponse(
        items=[
            DocumentSourceResponse(
                doc_id=item.doc_id,
                repo_id=item.repo_id,
                title=item.title,
                source_type=item.source_type,
                path_or_url=item.path_or_url,
                source_uri=item.source_uri,
                doc_version=item.doc_version,
                tags=item.tags,
                resync_supported=bool(item.sync.get("resync_supported", False)),
                next_recrawl_at=str(item.sync.get("next_recrawl_at")) if item.sync.get("next_recrawl_at") else None,
                last_sync_at=str(item.sync.get("last_sync_at")) if item.sync.get("last_sync_at") else None,
                last_sync_status=str(item.sync.get("last_sync_status")) if item.sync.get("last_sync_status") else None,
                last_sync_error=str(item.sync.get("last_sync_error")) if item.sync.get("last_sync_error") else None,
            )
            for item in items
        ],
        observability=await asyncio.to_thread(source_observability_summary, repo_id=repo_id),
    )


class GraphNode(BaseModel):
    id: str
    label: str
    type: str  # 'file', 'function', 'class', 'module'
    path: str | None = None
    size: int = 1


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str  # 'imports', 'calls', 'extends', 'references'
    weight: float = 1.0


class KnowledgeGraphResponse(BaseModel):
    repo_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    total_nodes: int
    total_edges: int


@router.get("/repos/{repo_id}/graph", response_model=KnowledgeGraphResponse)
async def get_knowledge_graph(
    repo_id: str = Path(min_length=1, max_length=255),
    limit: int = 100,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
) -> KnowledgeGraphResponse:
    """
    Get the knowledge graph for a repository showing relationships between code entities.
    Returns nodes (files, functions, classes) and edges (imports, calls, references).
    """
    chunks_repo = RepoContextChunksRepo()
    
    # Get all chunks for the repo (limited)
    chunks = await asyncio.to_thread(
        chunks_repo.list_repo_chunks,
        repo_id=repo_id,
        limit=limit,
    )
    
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []
    node_ids = set()
    
    # Build nodes from chunks
    for chunk in chunks:
        # Extract metadata
        metadata = chunk.metadata or {}
        path = chunk.path or metadata.get("file_path", "unknown")
        chunk_type = metadata.get("chunk_type", "file")
        
        # Create node ID
        node_id = f"{path}::{chunk.id}"
        if node_id not in node_ids:
            node_ids.add(node_id)
            nodes.append(
                GraphNode(
                    id=node_id,
                    label=path.split("/")[-1] if "/" in path else path,
                    type=chunk_type,
                    path=path,
                    size=len(chunk.content) if chunk.content else 1,
                )
            )
        
        # Extract references from metadata to build edges
        refs = metadata.get("references", [])
        imports = metadata.get("imports", [])
        
        for ref in refs:
            target_id = f"{ref}::{chunk.id}"
            if target_id not in node_ids:
                node_ids.add(target_id)
                nodes.append(
                    GraphNode(
                        id=target_id,
                        label=ref.split("/")[-1] if "/" in ref else ref,
                        type="file",
                        path=ref,
                        size=1,
                    )
                )
            edges.append(
                GraphEdge(
                    source=node_id,
                    target=target_id,
                    type="references",
                    weight=1.0,
                )
            )
        
        for imp in imports:
            target_id = f"{imp}::import"
            if target_id not in node_ids:
                node_ids.add(target_id)
                nodes.append(
                    GraphNode(
                        id=target_id,
                        label=imp.split("/")[-1] if "/" in imp else imp,
                        type="module",
                        path=imp,
                        size=1,
                    )
                )
            edges.append(
                GraphEdge(
                    source=node_id,
                    target=target_id,
                    type="imports",
                    weight=0.5,
                )
            )
    
    return KnowledgeGraphResponse(
        repo_id=repo_id,
        nodes=nodes,
        edges=edges,
        total_nodes=len(nodes),
        total_edges=len(edges),
    )


@router.post("/automation/onboard", response_model=AutomationTaskResponse)
async def automate_onboard_repo(
    payload: AutomationOnboardRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
) -> AutomationTaskResponse:
    try:
        async_result = run_repo_onboarding.apply_async(
            args=[payload.repo_id, payload.repo_path, payload.source],
            queue=settings.ANALYSIS_QUEUE_NAME,
        )
        return AutomationTaskResponse(task_name="kb.onboard_repo", task_id=str(async_result.id or ""))
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.post("/automation/diff", response_model=AutomationTaskResponse)
async def automate_process_diff(
    payload: AutomationDiffRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
) -> AutomationTaskResponse:
    try:
        async_result = run_repo_diff_processing.apply_async(
            args=[
                payload.repo_id,
                payload.repo_path,
                payload.diff_text,
                payload.base_ref,
                payload.head_ref,
                payload.source,
            ],
            queue=settings.ANALYSIS_QUEUE_NAME,
        )
        return AutomationTaskResponse(task_name="kb.process_diff", task_id=str(async_result.id or ""))
    except Exception as exc:  # noqa: BLE001
        raise _to_api_error(exc) from exc


@router.post("/automation/documents/resync", response_model=DocumentAutomationResponse)
async def automate_document_resync(
    payload: DocumentResyncRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
) -> DocumentAutomationResponse:
    normalized_source_type = _normalize_source_type(payload.source_type) if payload.source_type else None
    if payload.doc_id:
        async_result = run_document_resync.apply_async(
            args=[payload.doc_id, "manual"],
            queue=settings.ANALYSIS_QUEUE_NAME,
        )
        return DocumentAutomationResponse(
            task_name="kb.resync_document",
            queued=1,
            doc_ids=[payload.doc_id],
            status=str(async_result.status or "QUEUED"),
        )

    sources = await asyncio.to_thread(
        list_document_sources,
        repo_id=payload.repo_id,
        source_type=normalized_source_type,
        only_due=payload.only_due,
        limit=payload.limit,
    )
    for item in sources:
        run_document_resync.apply_async(
            args=[item.doc_id, "manual_batch"],
            queue=settings.ANALYSIS_QUEUE_NAME,
        )
    return DocumentAutomationResponse(
        task_name="kb.resync_document",
        queued=len(sources),
        doc_ids=[item.doc_id for item in sources],
    )


@router.post("/automation/documents/maintenance", response_model=DocumentAutomationResponse)
async def automate_document_maintenance(
    payload: DocumentMaintenanceRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
) -> DocumentAutomationResponse:
    normalized_source_type = _normalize_source_type(payload.source_type) if payload.source_type else None
    async_result = run_document_maintenance.apply_async(
        args=[payload.repo_id, normalized_source_type, payload.limit, "scheduled"],
        queue=settings.ANALYSIS_QUEUE_NAME,
    )
    return DocumentAutomationResponse(
        task_name="kb.maintain_documents",
        queued=1,
        doc_ids=[],
        status=str(async_result.status or "QUEUED"),
    )

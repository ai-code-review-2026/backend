from __future__ import annotations

import asyncio
import io
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import requests
from sqlalchemy import text

from app.core.knowledge_base.document_ingestion import (
    DocumentIngestionResult,
    build_document_ingestion_result,
    chunk_metadata_for_storage,
    utc_iso_now,
)
from app.core.knowledge_base.embeddings import hash_embed_text
from app.data.database import get_engine
from app.data.repos.kb_repo import KBDocumentChunkRow
from app.data.repos.repo_profiles_repo import RepoProfilesRepo
from app.integrations.graph_database.neo4j_client import get_neo4j_client
from app.settings import settings

logger = logging.getLogger(__name__)

_DEFAULT_RECRAWL_INTERVAL_MINUTES = {
    "web": 24 * 60,
    "markdown": 12 * 60,
    "sql": 12 * 60,
    "pdf": 7 * 24 * 60,
}


@dataclass(frozen=True)
class DocumentSourceRecord:
    doc_id: str
    title: str
    source_type: str
    path_or_url: str | None
    repo_id: str | None
    doc_version: int
    tags: list[str]
    tags_payload: dict[str, Any]
    created_at: str | None

    @property
    def source_uri(self) -> str | None:
        return _as_optional_str(self.tags_payload.get("source_uri")) or self.path_or_url

    @property
    def sync(self) -> dict[str, Any]:
        raw = self.tags_payload.get("sync")
        return raw if isinstance(raw, dict) else {}


def build_document_tags_payload(
    *,
    repo_id: str,
    source_type: str,
    path_or_url: str | None,
    source_uri: str | None,
    tags: list[str],
    content_hash: str | None,
    version: str | None,
    sync: dict[str, Any] | None = None,
    existing: dict[str, Any] | None = None,
) -> dict[str, Any]:
    payload = dict(existing or {})
    payload.update(
        {
            "repo_id": repo_id,
            "source_type": source_type,
            "path_or_url": path_or_url,
            "source_uri": source_uri,
            "tags": list(tags),
            "content_hash": content_hash,
            "version": version,
        }
    )
    payload["sync"] = _build_sync_payload(
        source_type=source_type,
        path_or_url=path_or_url,
        source_uri=source_uri,
        existing=payload.get("sync") if isinstance(payload.get("sync"), dict) else None,
        update=sync,
    )
    return payload


def list_document_sources(
    *,
    repo_id: str | None = None,
    source_type: str | None = None,
    only_due: bool = False,
    limit: int = 200,
) -> list[DocumentSourceRecord]:
    engine = get_engine()
    safe_limit = min(max(int(limit), 1), 2000)
    with engine.connect() as conn:
        rows = (
            conn.execute(
                text(
                    """
                    SELECT id, title, source_type, path_or_url, tags_json, doc_version, created_at
                    FROM kb_documents
                    WHERE (CAST(:repo_id AS TEXT) IS NULL OR COALESCE(tags_json->>'repo_id', '') = CAST(:repo_id AS TEXT))
                      AND (CAST(:source_type AS TEXT) IS NULL OR source_type = CAST(:source_type AS TEXT))
                    ORDER BY created_at DESC
                    LIMIT :limit
                    """
                ),
                {"repo_id": repo_id, "source_type": source_type, "limit": safe_limit},
            )
            .mappings()
            .all()
        )
    items = [_row_to_document_source(row) for row in rows]
    if only_due:
        items = [item for item in items if is_document_due_for_resync(item)]
    return items


def get_document_source(doc_id: str) -> DocumentSourceRecord | None:
    engine = get_engine()
    with engine.connect() as conn:
        row = (
            conn.execute(
                text(
                    """
                    SELECT id, title, source_type, path_or_url, tags_json, doc_version, created_at
                    FROM kb_documents
                    WHERE id = :doc_id
                    LIMIT 1
                    """
                ),
                {"doc_id": doc_id},
            )
            .mappings()
            .first()
        )
    return _row_to_document_source(row) if row is not None else None


def is_document_due_for_resync(item: DocumentSourceRecord, *, now: datetime | None = None) -> bool:
    sync = item.sync
    if not bool(sync.get("resync_supported", False)):
        return False
    next_recrawl_at = _parse_iso(sync.get("next_recrawl_at"))
    if next_recrawl_at is None:
        return True
    current = now or datetime.now(timezone.utc)
    return next_recrawl_at <= current


async def resync_document_source(
    *,
    doc_id: str,
    reason: str = "manual",
) -> dict[str, Any]:
    source = get_document_source(doc_id)
    if source is None:
        raise ValueError(f"Document source not found: {doc_id}")

    fetched = await asyncio.to_thread(_fetch_document_source_material, source)
    result = build_document_ingestion_result(
        title=source.title,
        source_type=source.source_type,
        content=fetched["content"],
        path_or_url=source.path_or_url,
        source_uri=fetched.get("source_uri") or source.source_uri,
        content_hash=fetched.get("content_hash"),
        version=fetched.get("version") or str(source.doc_version + 1),
        doc_version=source.doc_version + 1,
        tags=source.tags,
        metadata=fetched.get("metadata") if isinstance(fetched.get("metadata"), dict) else {},
        pages=fetched.get("pages") if isinstance(fetched.get("pages"), list) else None,
    )
    await persist_document_ingestion(
        doc_id=source.doc_id,
        repo_id=str(source.repo_id or ""),
        title=source.title,
        source_type=source.source_type,
        path_or_url=source.path_or_url,
        tags=source.tags,
        doc_version=source.doc_version + 1,
        ingestion_result=result,
        existing_tags_payload=source.tags_payload,
        sync_update={
            "last_sync_at": utc_iso_now(),
            "last_sync_status": "ok",
            "last_sync_error": None,
            "last_sync_reason": reason,
        },
    )
    return {
        "doc_id": source.doc_id,
        "repo_id": source.repo_id,
        "source_type": source.source_type,
        "chunks": len(result.chunks),
        "status": "ok",
        "reason": reason,
    }


async def persist_document_ingestion(
    *,
    doc_id: str,
    repo_id: str,
    title: str,
    source_type: str,
    path_or_url: str | None,
    tags: list[str],
    doc_version: int,
    ingestion_result: DocumentIngestionResult,
    existing_tags_payload: dict[str, Any] | None = None,
    sync_update: dict[str, Any] | None = None,
) -> None:
    tags_payload = build_document_tags_payload(
        repo_id=repo_id,
        source_type=source_type,
        path_or_url=path_or_url,
        source_uri=ingestion_result.source_uri,
        tags=tags,
        content_hash=ingestion_result.content_hash,
        version=ingestion_result.version or str(doc_version),
        existing=existing_tags_payload,
        sync=sync_update,
    )
    await asyncio.to_thread(
        _upsert_document_rows,
        doc_id=doc_id,
        title=title,
        source_type=source_type,
        path_or_url=path_or_url,
        doc_version=doc_version,
        tags_payload=tags_payload,
        chunks=[{"content": item.content, "metadata": item.metadata} for item in ingestion_result.chunks],
    )
    # Store in Neo4j
    neo4j_client = get_neo4j_client()
    for index, chunk in enumerate(ingestion_result.chunks):
        metadata = chunk_metadata_for_storage(dict(chunk.metadata))
        await asyncio.to_thread(
            neo4j_client.upsert_kb_document,
            doc_id=doc_id,
            repo_id=repo_id,
            title=title,
            source_type=source_type,
            path_or_url=path_or_url,
            chunk_index=index,
            content=chunk.content,
            embedding_text=chunk.embedding_text,
            metadata={
                **metadata,
                "tags": list(tags),
                "doc_version": doc_version,
                "content_hash": ingestion_result.content_hash,
                "version": ingestion_result.version or str(doc_version),
                "source_uri": ingestion_result.source_uri,
            },
        )
    await asyncio.to_thread(_refresh_repo_profile_document_observability, repo_id)


async def run_due_document_maintenance(
    *,
    repo_id: str | None = None,
    source_type: str | None = None,
    limit: int = 100,
    reason: str = "scheduled",
) -> dict[str, Any]:
    due_sources = list_document_sources(repo_id=repo_id, source_type=source_type, only_due=True, limit=limit)
    completed = 0
    failed: list[dict[str, Any]] = []
    for source in due_sources:
        try:
            await resync_document_source(doc_id=source.doc_id, reason=reason)
            completed += 1
        except Exception as exc:  # noqa: BLE001
            failed.append({"doc_id": source.doc_id, "error": str(exc)})
            await asyncio.to_thread(
                _mark_document_sync_failed,
                source.doc_id,
                source.tags_payload,
                str(exc),
                reason,
            )
    return {
        "repo_id": repo_id,
        "source_type": source_type,
        "due": len(due_sources),
        "completed": completed,
        "failed": failed,
    }


def source_observability_summary(*, repo_id: str | None = None) -> dict[str, Any]:
    items = list_document_sources(repo_id=repo_id, limit=5000)
    current = datetime.now(timezone.utc)
    by_source: dict[str, dict[str, Any]] = {}
    for item in items:
        bucket = by_source.setdefault(
            item.source_type,
            {
                "count": 0,
                "due": 0,
                "failed": 0,
                "supported": 0,
                "latestSyncAt": None,
            },
        )
        bucket["count"] += 1
        sync = item.sync
        if bool(sync.get("resync_supported", False)):
            bucket["supported"] += 1
        if is_document_due_for_resync(item, now=current):
            bucket["due"] += 1
        if str(sync.get("last_sync_status") or "").lower() == "failed":
            bucket["failed"] += 1
        last_sync_at = _as_optional_str(sync.get("last_sync_at"))
        if last_sync_at and (bucket["latestSyncAt"] is None or last_sync_at > bucket["latestSyncAt"]):
            bucket["latestSyncAt"] = last_sync_at
    return {"total": len(items), "bySourceType": by_source}


def _upsert_document_rows(
    *,
    doc_id: str,
    title: str,
    source_type: str,
    path_or_url: str | None,
    doc_version: int,
    tags_payload: dict[str, Any],
    chunks: list[dict[str, Any]],
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
                "tags_json": json.dumps(tags_payload),
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


def _fetch_document_source_material(source: DocumentSourceRecord) -> dict[str, Any]:
    location = _as_optional_str(source.path_or_url) or _as_optional_str(source.source_uri)
    if not location:
        raise RuntimeError("Document source does not define a path or URL for resync.")

    parsed = urlparse(location)
    if parsed.scheme in {"http", "https"}:
        return _fetch_remote_source(source, location)

    path = Path(location)
    if not path.exists() or not path.is_file():
        raise RuntimeError(f"Document source path not found: {location}")
    if source.source_type == "pdf":
        pages = _extract_pdf_pages(path.read_bytes())
        return {
            "content": "\f".join(pages),
            "pages": pages,
            "source_uri": location,
            "version": str(source.doc_version + 1),
            "metadata": {},
        }
    return {
        "content": path.read_text(encoding="utf-8"),
        "source_uri": location,
        "version": str(source.doc_version + 1),
        "metadata": {},
    }


def _fetch_remote_source(source: DocumentSourceRecord, url: str) -> dict[str, Any]:
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "").lower()
    if source.source_type == "pdf" or "application/pdf" in content_type:
        pages = _extract_pdf_pages(response.content)
        return {
            "content": "\f".join(pages),
            "pages": pages,
            "source_uri": url,
            "version": str(source.doc_version + 1),
            "metadata": {},
        }
    return {
        "content": response.text,
        "source_uri": url,
        "version": str(source.doc_version + 1),
        "metadata": {"crawl_timestamp": utc_iso_now()},
    }


def _extract_pdf_pages(data: bytes) -> list[str]:
    try:
        from pypdf import PdfReader  # type: ignore[import]
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError("PDF resync requires the optional 'pypdf' dependency to be installed.") from exc
    reader = PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for page in reader.pages:
        extracted = (page.extract_text() or "").strip()
        if extracted:
            pages.append(extracted)
    if not pages:
        raise RuntimeError("PDF resync extracted no text from the source document.")
    return pages


def _refresh_repo_profile_document_observability(repo_id: str) -> None:
    repo_profiles = RepoProfilesRepo()
    existing = repo_profiles.get_profile(repo_id)
    profile_payload = dict(existing.profile) if existing and isinstance(existing.profile, dict) else {}
    summary = source_observability_summary(repo_id=repo_id)
    profile_payload["source_observability"] = summary
    repo_profiles.upsert_profile(
        repo_id=repo_id,
        repo_path=existing.repo_path if existing else None,
        indexed_commit=existing.indexed_commit if existing else None,
        default_branch=existing.default_branch if existing else None,
        profile=profile_payload,
        overview_context=existing.overview_context if existing else None,
    )


def _mark_document_sync_failed(doc_id: str, tags_payload: dict[str, Any], error: str, reason: str) -> None:
    sync = _build_sync_payload(
        source_type=_as_optional_str(tags_payload.get("source_type")) or "markdown",
        path_or_url=_as_optional_str(tags_payload.get("path_or_url")),
        source_uri=_as_optional_str(tags_payload.get("source_uri")),
        existing=tags_payload.get("sync") if isinstance(tags_payload.get("sync"), dict) else None,
        update={
            "last_sync_at": utc_iso_now(),
            "last_sync_status": "failed",
            "last_sync_error": error[:2000],
            "last_sync_reason": reason,
        },
    )
    updated_payload = dict(tags_payload)
    updated_payload["sync"] = sync
    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE kb_documents SET tags_json = CAST(:tags_json AS jsonb) WHERE id = :doc_id"),
            {"doc_id": doc_id, "tags_json": json.dumps(updated_payload)},
        )
    repo_id = _as_optional_str(tags_payload.get("repo_id"))
    if repo_id:
        _refresh_repo_profile_document_observability(repo_id)


def _build_sync_payload(
    *,
    source_type: str,
    path_or_url: str | None,
    source_uri: str | None,
    existing: dict[str, Any] | None,
    update: dict[str, Any] | None,
) -> dict[str, Any]:
    payload = dict(existing or {})
    now = utc_iso_now()
    interval_minutes = int(payload.get("recrawl_interval_minutes") or _DEFAULT_RECRAWL_INTERVAL_MINUTES.get(source_type, 0))
    resync_supported = _compute_resync_supported(source_type=source_type, path_or_url=path_or_url, source_uri=source_uri)
    next_recrawl_at = None
    if resync_supported and interval_minutes > 0:
        next_recrawl_at = (
            datetime.now(timezone.utc) + timedelta(minutes=interval_minutes)
        ).isoformat().replace("+00:00", "Z")
    payload.update(
        {
            "resync_supported": resync_supported,
            "recrawl_interval_minutes": interval_minutes,
            "last_indexed_at": now,
            "last_sync_at": now,
            "last_sync_status": "ok",
            "last_sync_error": None,
            "next_recrawl_at": next_recrawl_at,
        }
    )
    if update:
        payload.update(update)
        if resync_supported and interval_minutes > 0 and not payload.get("next_recrawl_at"):
            payload["next_recrawl_at"] = next_recrawl_at
    return payload


def _compute_resync_supported(*, source_type: str, path_or_url: str | None, source_uri: str | None) -> bool:
    location = _as_optional_str(path_or_url) or _as_optional_str(source_uri)
    if not location:
        return False
    if source_type == "web":
        return location.startswith("http://") or location.startswith("https://")
    if source_type in {"markdown", "sql"}:
        return True
    if source_type == "pdf":
        return True
    return False


def _row_to_document_source(row: Any) -> DocumentSourceRecord:
    raw_tags = row.get("tags_json")
    if isinstance(raw_tags, dict):
        tags_payload = raw_tags
    elif isinstance(raw_tags, str):
        try:
            parsed = json.loads(raw_tags)
        except json.JSONDecodeError:
            tags_payload = {}
        else:
            tags_payload = parsed if isinstance(parsed, dict) else {}
    else:
        tags_payload = {}
    raw_items = tags_payload.get("tags")
    tags = [str(tag).strip() for tag in raw_items if str(tag).strip()] if isinstance(raw_items, list) else []
    return DocumentSourceRecord(
        doc_id=str(row["id"]),
        title=str(row["title"]),
        source_type=str(row["source_type"]),
        path_or_url=_as_optional_str(row.get("path_or_url")),
        repo_id=_as_optional_str(tags_payload.get("repo_id")),
        doc_version=int(row.get("doc_version") or 1),
        tags=tags,
        tags_payload=tags_payload,
        created_at=_as_optional_str(row.get("created_at")),
    )


def _parse_iso(value: Any) -> datetime | None:
    raw = _as_optional_str(value)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _as_optional_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None

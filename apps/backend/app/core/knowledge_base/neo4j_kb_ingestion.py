"""
Neo4j Knowledge Base Ingestion Service

Ingests KB documents (rules, guidelines, design patterns, API docs, tickets)
into Neo4j as KnowledgeDocument and Rule nodes with real semantic embeddings.

Replaces the Qdrant-backed KB ingestion pipeline.

Priority: KB content retrieved in GraphRAG ranks HIGHER than raw repo context
(enforced by KB_PRIORITY_BOOST_FACTOR in retriever).
"""
from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.core.knowledge_base.document_ingestion import build_document_ingestion_result
from app.core.knowledge_base.embedding_provider import embed_text, embed_texts
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client
from app.settings import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class KBIngestionResult:
    source_uri: str | None
    doc_uid: str
    chunks_written: int
    rules_written: int
    skipped: bool
    reason: str | None = None


class Neo4jKBIngestionService:
    """
    Ingests knowledge base content into Neo4j.

    Supported content types:
    - Documents (markdown, PDF text, API docs) → KnowledgeDocument nodes
    - Rules (lint rules, security rules, coding guidelines) → Rule nodes
    - Design patterns → KnowledgeDocument nodes tagged as 'pattern'
    - Tickets → KnowledgeDocument nodes tagged as 'ticket'
    """

    def __init__(self, neo4j_client: Neo4jClient | None = None) -> None:
        self._neo4j = neo4j_client or get_neo4j_client()

    # ── Document ingestion ────────────────────────────────────────────────────

    async def ingest_document(
        self,
        *,
        title: str,
        content: str,
        category: str = "general",
        doc_type: str = "document",
        project_id: str | None = None,
        org_id: str | None = None,
        source_uri: str | None = None,
        source_type: str = "markdown",
        version: str | None = None,
        force_update: bool = False,
    ) -> KBIngestionResult:
        content_hash = _sha1(content)
        uid = f"kb_doc_{_sha1(title + (source_uri or '') + (project_id or ''))}"

        # Check if unchanged
        if not force_update:
            existing = self._get_doc_hash(uid)
            if existing == content_hash:
                return KBIngestionResult(
                    source_uri=source_uri, doc_uid=uid,
                    chunks_written=0, rules_written=0,
                    skipped=True, reason="content_unchanged",
                )

        # Build ingestion result (chunking + metadata)
        try:
            ingestion = build_document_ingestion_result(
                title=title,
                source_type=source_type,
                content=content,
                source_uri=source_uri,
                version=version,
            )
        except Exception as exc:
            logger.warning("Document ingestion build failed for '%s': %s", title, exc)
            # Fallback: store the whole doc as one node
            ingestion = None

        chunks_written = 0

        if ingestion and ingestion.chunks:
            # Embed all chunk texts in one batch
            embed_texts_list = [c.embedding_text or c.content for c in ingestion.chunks]
            embeddings = embed_texts(embed_texts_list)

            for chunk, embedding in zip(ingestion.chunks, embeddings):
                chunk_uid = f"{uid}_chunk_{_sha1(chunk.content[:200])}"
                combined_content = chunk.content.strip()
                if not combined_content:
                    continue
                self._neo4j.upsert_kb_document(
                    uid=chunk_uid,
                    title=f"{title} — {chunk.metadata.get('section_title', 'section')}",
                    content=combined_content,
                    embedding=embedding,
                    category=category,
                    doc_type=doc_type,
                    project_id=project_id,
                    org_id=org_id,
                    source_url=source_uri,
                    metadata={
                        "parent_uid": uid,
                        "content_hash": content_hash,
                        "version": version,
                        **{k: v for k, v in (chunk.metadata or {}).items() if isinstance(v, (str, int, float, bool))},
                    },
                )
                chunks_written += 1
        else:
            # Single-node fallback
            embedding = embed_text(f"{title}\n{content[:1000]}")
            self._neo4j.upsert_kb_document(
                uid=uid,
                title=title,
                content=content[:4000],
                embedding=embedding,
                category=category,
                doc_type=doc_type,
                project_id=project_id,
                org_id=org_id,
                source_url=source_uri,
                metadata={"content_hash": content_hash, "version": version},
            )
            chunks_written = 1

        return KBIngestionResult(
            source_uri=source_uri, doc_uid=uid,
            chunks_written=chunks_written, rules_written=0,
            skipped=False,
        )

    # ── Rule ingestion ────────────────────────────────────────────────────────

    async def ingest_rule(
        self,
        *,
        title: str,
        description: str,
        category: str = "quality",
        severity: str = "WARN",
        pattern: str | None = None,
        example_violation: str | None = None,
        example_fix: str | None = None,
        project_id: str | None = None,
        org_id: str | None = None,
        force_update: bool = False,
    ) -> KBIngestionResult:
        uid = f"rule_{_sha1(title + category + (project_id or '') + (org_id or ''))}"

        if not force_update:
            existing = self._get_rule_hash(uid)
            content_hash = _sha1(description)
            if existing == content_hash:
                return KBIngestionResult(
                    source_uri=None, doc_uid=uid,
                    chunks_written=0, rules_written=0,
                    skipped=True, reason="content_unchanged",
                )

        embed_input = f"{title}\n{description}"
        if example_violation:
            embed_input += f"\nViolation: {example_violation}"
        if example_fix:
            embed_input += f"\nFix: {example_fix}"

        embedding = embed_text(embed_input)
        self._neo4j.upsert_rule(
            uid=uid,
            title=title,
            description=description,
            embedding=embedding,
            category=category,
            severity=severity,
            pattern=pattern,
            example_violation=example_violation,
            example_fix=example_fix,
            project_id=project_id,
            org_id=org_id,
        )
        return KBIngestionResult(
            source_uri=None, doc_uid=uid,
            chunks_written=0, rules_written=1,
            skipped=False,
        )

    # ── Bulk ingestion ────────────────────────────────────────────────────────

    async def ingest_rules_batch(
        self,
        rules: list[dict[str, Any]],
        *,
        project_id: str | None = None,
        org_id: str | None = None,
    ) -> int:
        """Ingest a list of rule dicts. Returns count of rules written."""
        written = 0
        for rule in rules:
            try:
                result = await self.ingest_rule(
                    title=rule.get("title", "Unnamed Rule"),
                    description=rule.get("description", ""),
                    category=rule.get("category", "quality"),
                    severity=rule.get("severity", "WARN"),
                    pattern=rule.get("pattern"),
                    example_violation=rule.get("example_violation"),
                    example_fix=rule.get("example_fix"),
                    project_id=project_id or rule.get("project_id"),
                    org_id=org_id or rule.get("org_id"),
                )
                if not result.skipped:
                    written += 1
            except Exception as exc:
                logger.warning("Failed to ingest rule '%s': %s", rule.get("title"), exc)
        return written

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _get_doc_hash(self, uid: str) -> str | None:
        try:
            result = self._neo4j.execute_query(
                "MATCH (k:KnowledgeDocument {uid: $uid}) RETURN k.metadata AS m LIMIT 1",
                {"uid": uid},
            )
            if result:
                meta = result[0].get("m")
                if isinstance(meta, dict):
                    return meta.get("content_hash")
        except Exception:
            pass
        return None

    def _get_rule_hash(self, uid: str) -> str | None:
        try:
            result = self._neo4j.execute_query(
                "MATCH (r:Rule {uid: $uid}) RETURN r.description AS d LIMIT 1",
                {"uid": uid},
            )
            if result:
                d = result[0].get("d", "")
                return _sha1(d) if d else None
        except Exception:
            pass
        return None


def _sha1(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", errors="ignore")).hexdigest()


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


# ── Module-level singleton ────────────────────────────────────────────────────

_SERVICE_INSTANCE: Neo4jKBIngestionService | None = None


def get_kb_ingestion_service() -> Neo4jKBIngestionService:
    global _SERVICE_INSTANCE  # noqa: PLW0603
    if _SERVICE_INSTANCE is None:
        _SERVICE_INSTANCE = Neo4jKBIngestionService()
    return _SERVICE_INSTANCE

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.core.knowledge_base.document_lifecycle import (
    DocumentSourceRecord,
    build_document_tags_payload,
    is_document_due_for_resync,
)


def test_build_document_tags_payload_sets_sync_schedule() -> None:
    payload = build_document_tags_payload(
        repo_id="repo",
        source_type="web",
        path_or_url="https://docs.example.com/auth",
        source_uri="https://docs.example.com/auth",
        tags=["web"],
        content_hash="abc",
        version="v1",
        sync={"last_sync_reason": "ingest"},
    )

    sync = payload["sync"]
    assert sync["resync_supported"] is True
    assert int(sync["recrawl_interval_minutes"]) > 0
    assert isinstance(sync["next_recrawl_at"], str)


def test_due_for_resync_uses_next_recrawl_at() -> None:
    now = datetime.now(timezone.utc)
    source = DocumentSourceRecord(
        doc_id="doc-1",
        title="Auth",
        source_type="web",
        path_or_url="https://docs.example.com/auth",
        repo_id="repo",
        doc_version=1,
        tags=["web"],
        tags_payload={
            "repo_id": "repo",
            "sync": {
                "resync_supported": True,
                "next_recrawl_at": (now - timedelta(minutes=5)).isoformat().replace("+00:00", "Z"),
            },
        },
        created_at=now.isoformat(),
    )

    assert is_document_due_for_resync(source, now=now) is True

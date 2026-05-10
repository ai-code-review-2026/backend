from __future__ import annotations

import uuid

from app.core.knowledge_base.qdrant_ids import (
    build_document_chunk_point_id,
    build_repo_chunk_point_id,
    build_repo_profile_point_id,
)


def test_document_chunk_point_id_is_valid_uuid_and_stable() -> None:
    point_id = build_document_chunk_point_id(repo_id="org/repo", doc_id="doc_123", chunk_index=7)

    assert point_id == build_document_chunk_point_id(repo_id="org/repo", doc_id="doc_123", chunk_index=7)
    assert uuid.UUID(point_id).version == 5


def test_repo_chunk_point_id_changes_when_chunk_identity_changes() -> None:
    first = build_repo_chunk_point_id(
        repo_id="org/repo",
        relative_path="src/main.py",
        chunk_index=0,
        chunk_type="function",
        symbol_name="login_user",
    )
    second = build_repo_chunk_point_id(
        repo_id="org/repo",
        relative_path="src/main.py",
        chunk_index=1,
        chunk_type="function",
        symbol_name="login_user",
    )

    assert first != second
    assert uuid.UUID(first).version == 5
    assert uuid.UUID(second).version == 5


def test_repo_profile_point_id_is_valid_uuid_and_stable() -> None:
    point_id = build_repo_profile_point_id(repo_id="org/repo")

    assert point_id == build_repo_profile_point_id(repo_id="org/repo")
    assert uuid.UUID(point_id).version == 5

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.core.knowledge_base.semantic_retriever import SemanticRetriever


class _FakeVectorStore:
    def __init__(self) -> None:
        self.enabled = True
        self.filters: list[dict[str, str]] = []

    async def ensure_collection(self, *, collection_name: str, vector_size: int | None = None) -> None:  # noqa: ARG002
        return None

    async def search(self, *, collection_name: str, query_vector: list[float], filter_payload: dict[str, str], limit: int) -> list[SimpleNamespace]:  # noqa: ARG002
        self.filters.append(filter_payload)
        if filter_payload.get("type") == "kb_document_chunk":
            return [
                SimpleNamespace(
                    score=0.88,
                    payload={
                        "repo_id": "repo",
                        "type": "kb_document_chunk",
                        "doc_id": "doc_1",
                        "title": "Policy",
                        "source_type": "policy",
                        "path_or_url": "policy/security.md",
                        "chunk_index": 0,
                        "content": "Never expose secrets in logs.",
                        "file_type": "policy",
                        "chunk_type": "document_chunk",
                        "tags": ["policy", "security"],
                    },
                )
            ][:limit]
        return [
            SimpleNamespace(
                score=0.91,
                payload={
                    "repo_id": "repo",
                    "type": "chunk",
                    "path": "apps/backend/app/main.py",
                    "chunk_index": 1,
                    "content": "def login_user(payload): return payload",
                    "language": "python",
                    "file_type": "code",
                    "chunk_type": "function",
                    "symbol_name": "login_user",
                },
            )
        ][:limit]


@pytest.mark.anyio
async def test_semantic_retriever_maps_code_results() -> None:
    retriever = SemanticRetriever(vector_store=_FakeVectorStore())  # type: ignore[arg-type]
    candidates = await retriever.retrieve_code(repo_id="repo", query_text="login_user", limit=4)

    assert len(candidates) == 1
    assert candidates[0].chunk.symbol_name == "login_user"
    assert candidates[0].channel == "semantic_code"


@pytest.mark.anyio
async def test_semantic_retriever_filters_document_tags() -> None:
    retriever = SemanticRetriever(vector_store=_FakeVectorStore())  # type: ignore[arg-type]
    candidates = await retriever.retrieve_documents(
        repo_id="repo",
        query_text="security secrets",
        limit=4,
        tags=["policy"],
    )

    assert len(candidates) == 1
    assert candidates[0].chunk.document_id == "doc_1"


@pytest.mark.anyio
async def test_semantic_retriever_maps_global_document_results() -> None:
    retriever = SemanticRetriever(vector_store=_FakeVectorStore())  # type: ignore[arg-type]
    candidates = await retriever.retrieve_global_documents(
        query_text="security guardrails",
        limit=4,
    )

    assert len(candidates) == 1
    assert candidates[0].chunk.document_id == "doc_1"
    assert candidates[0].channel == "semantic_global_document"

from __future__ import annotations

import pytest

from app.integrations.vector_store.qdrant_client import QdrantClient, QdrantPoint


@pytest.mark.anyio
async def test_qdrant_client_disables_itself_when_initialization_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    client = QdrantClient()
    client._enabled = True  # type: ignore[attr-defined]

    def _boom() -> object:
        raise TypeError("unsupported operand type(s) for |: 'EnumTypeWrapper' and 'NoneType'")

    monkeypatch.setattr(client, "_get_client", _boom)

    await client.ensure_collection(collection_name="repo_context")

    assert client.enabled is False


@pytest.mark.anyio
async def test_qdrant_search_returns_empty_results_after_runtime_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    client = QdrantClient()
    client._enabled = True  # type: ignore[attr-defined]

    def _boom() -> object:
        raise TypeError("unsupported operand type(s) for |: 'EnumTypeWrapper' and 'NoneType'")

    monkeypatch.setattr(client, "_get_client", _boom)

    results = await client.search(
        collection_name="repo_context",
        query_vector=[0.1, 0.2, 0.3],
        limit=5,
        filter_payload={"repo_id": "demo"},
    )

    assert results == []
    assert client.enabled is False


@pytest.mark.anyio
async def test_qdrant_upsert_becomes_noop_after_runtime_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    client = QdrantClient()
    client._enabled = True  # type: ignore[attr-defined]

    def _boom() -> object:
        raise TypeError("unsupported operand type(s) for |: 'EnumTypeWrapper' and 'NoneType'")

    monkeypatch.setattr(client, "_get_client", _boom)

    await client.upsert_points(
        collection_name="repo_context",
        points=[QdrantPoint(id="p1", vector=[0.1, 0.2], payload={"repo_id": "demo"})],
    )

    assert client.enabled is False

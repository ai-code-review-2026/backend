from __future__ import annotations

import uuid
from pathlib import Path

import pytest

from app.core.knowledge_base.ingestor import RepoContextIngestor


class _FakeVectorStore:
    def __init__(self) -> None:
        self.enabled = True
        self.upsert_calls: list[list[object]] = []

    def ensure_enabled(self) -> None:
        return None

    async def ensure_collection(self, *, collection_name: str, vector_size: int | None = None) -> None:  # noqa: ARG002
        return None

    async def delete_by_filter(self, *, collection_name: str, filter_payload: dict[str, str]) -> None:  # noqa: ARG002
        return None

    async def upsert_points(self, *, collection_name: str, points: list[object]) -> None:  # noqa: ARG002
        self.upsert_calls.append(points)

    async def scroll(self, *, collection_name: str, limit: int = 100, filter_payload: dict[str, str] | None = None) -> list[object]:  # noqa: ARG002
        return []


class _FakeRepoContextChunksRepo:
    def __init__(self) -> None:
        self.deleted_repo_ids: list[str] = []
        self.upserted_rows: list[object] = []

    def delete_repo(self, repo_id: str) -> None:
        self.deleted_repo_ids.append(repo_id)

    def delete_repo_paths(self, repo_id: str, paths: list[str]) -> None:  # noqa: ARG002
        return None

    def upsert_chunks(self, rows) -> None:
        self.upserted_rows.extend(list(rows))


@pytest.mark.anyio
async def test_ingestor_onboard_repo_dual_writes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    repo_root = tmp_path / "repo"
    repo_root.mkdir()
    (repo_root / "main.py").write_text("def login_user(payload):\n    return payload\n", encoding="utf-8")

    fake_repo = _FakeRepoContextChunksRepo()
    monkeypatch.setattr("app.core.knowledge_base.ingestor.RepoContextChunksRepo", lambda: fake_repo)

    ingestor = RepoContextIngestor(vector_store=_FakeVectorStore())  # type: ignore[arg-type]
    result = await ingestor.onboard_repo(repo_id="repo", repo_path=str(repo_root), source="manual", force_full=True)

    assert result.files_indexed >= 1
    assert fake_repo.deleted_repo_ids == ["repo"]
    assert len(fake_repo.upserted_rows) >= 1
    first_batch = ingestor._vector_store.upsert_calls[0]  # type: ignore[attr-defined]
    assert first_batch
    uuid.UUID(str(first_batch[0].id))
    uuid.UUID(str(fake_repo.upserted_rows[0].id))

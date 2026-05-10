from __future__ import annotations

from pathlib import Path

import pytest

from app.core.knowledge_base.guardrails import iter_repo_files, resolve_repo_path, validate_allowed_roots
from app.settings import settings


def test_iter_repo_files_filters_ignored_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path
    (root / "app.py").write_text("print('ok')", encoding="utf-8")
    (root / ".env").write_text("SECRET=1", encoding="utf-8")
    (root / "node_modules").mkdir()
    (root / "node_modules" / "index.js").write_text("console.log('x')", encoding="utf-8")
    (root / "README.md").write_text("# title", encoding="utf-8")

    monkeypatch.setattr(settings, "REPO_CONTEXT_MAX_FILES_PER_RUN", 100)
    monkeypatch.setattr(settings, "REPO_CONTEXT_MAX_FILE_BYTES", 100_000)

    files = iter_repo_files(root)
    rel_paths = {item.relative_to(root).as_posix() for item in files}

    assert "app.py" in rel_paths
    assert "README.md" in rel_paths
    assert ".env" not in rel_paths
    assert "node_modules/index.js" not in rel_paths


def test_validate_allowed_roots_enforced(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = tmp_path / "allowed"
    root.mkdir(parents=True, exist_ok=True)
    inside = root / "repo"
    inside.mkdir(parents=True, exist_ok=True)
    outside = tmp_path / "outside"
    outside.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "REPO_CONTEXT_ALLOWED_ROOTS", str(root))
    validate_allowed_roots(inside)

    with pytest.raises(ValueError):
        validate_allowed_roots(outside)


def test_resolve_repo_path_requires_existing_directory(tmp_path: Path) -> None:
    root = tmp_path / "repo"
    root.mkdir(parents=True, exist_ok=True)
    resolved = resolve_repo_path(str(root))
    assert resolved == root.resolve()

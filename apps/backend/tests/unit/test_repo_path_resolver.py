from __future__ import annotations

from pathlib import Path

from app.core.knowledge_base import repo_path_resolver
from app.data.models.repo_profile import RepoProfile
from app.settings import settings


def test_resolver_uses_metadata_repo_path_first(tmp_path: Path, monkeypatch) -> None:
    repo_dir = tmp_path / "metadata-repo"
    repo_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "REPO_CONTEXT_ALLOWED_ROOTS", str(tmp_path))
    monkeypatch.setattr(settings, "REPO_CONTEXT_REPO_PATH_MAP", None)

    resolved = repo_path_resolver.resolve_repo_context_repo_path(
        repo="acme/demo",
        metadata={"repo_path": str(repo_dir)},
    )

    assert resolved == str(repo_dir.resolve())


def test_resolver_uses_repo_profile_path_when_available(tmp_path: Path, monkeypatch) -> None:
    profile_repo = tmp_path / "profile-repo"
    profile_repo.mkdir(parents=True, exist_ok=True)

    class _FakeProfilesRepo:
        def get_profile(self, repo_id: str) -> RepoProfile | None:
            if repo_id.lower() != "acme/demo":
                return None
            return RepoProfile(
                repo_id="Acme/Demo",
                repo_path=str(profile_repo),
                indexed_commit=None,
                default_branch=None,
                profile={},
            )

    monkeypatch.setattr(repo_path_resolver, "RepoProfilesRepo", lambda: _FakeProfilesRepo())
    monkeypatch.setattr(settings, "REPO_CONTEXT_ALLOWED_ROOTS", str(tmp_path))
    monkeypatch.setattr(settings, "REPO_CONTEXT_REPO_PATH_MAP", None)

    resolved = repo_path_resolver.resolve_repo_context_repo_path(repo="Acme/Demo", metadata={})
    assert resolved == str(profile_repo.resolve())


def test_resolver_discovers_github_repo_from_origin_remote(tmp_path: Path, monkeypatch) -> None:
    root = tmp_path / "repos"
    root.mkdir(parents=True, exist_ok=True)
    candidate = root / "demo"
    candidate.mkdir(parents=True, exist_ok=True)

    def _fake_origin(repo_dir: Path) -> str | None:
        if repo_dir == candidate.resolve():
            return "https://github.com/acme/demo.git"
        return None

    class _NoProfileRepo:
        def get_profile(self, repo_id: str) -> RepoProfile | None:  # noqa: ARG002
            return None

    monkeypatch.setattr(repo_path_resolver, "_read_origin_remote_url", _fake_origin)
    monkeypatch.setattr(repo_path_resolver, "RepoProfilesRepo", lambda: _NoProfileRepo())
    monkeypatch.setattr(settings, "REPO_CONTEXT_ALLOWED_ROOTS", str(root))
    monkeypatch.setattr(settings, "REPO_CONTEXT_REPO_PATH_MAP", None)

    resolved = repo_path_resolver.resolve_repo_context_repo_path(repo="acme/demo", metadata={})
    assert resolved == str(candidate.resolve())


def test_resolver_discovers_local_repo_by_directory_name(tmp_path: Path, monkeypatch) -> None:
    root = tmp_path / "repos"
    root.mkdir(parents=True, exist_ok=True)
    candidate = root / "my-local-repo"
    candidate.mkdir(parents=True, exist_ok=True)

    class _NoProfileRepo:
        def get_profile(self, repo_id: str) -> RepoProfile | None:  # noqa: ARG002
            return None

    monkeypatch.setattr(repo_path_resolver, "_read_origin_remote_url", lambda _: None)
    monkeypatch.setattr(repo_path_resolver, "RepoProfilesRepo", lambda: _NoProfileRepo())
    monkeypatch.setattr(settings, "REPO_CONTEXT_ALLOWED_ROOTS", str(root))
    monkeypatch.setattr(settings, "REPO_CONTEXT_REPO_PATH_MAP", None)

    resolved = repo_path_resolver.resolve_repo_context_repo_path(repo="local/my-local-repo", metadata={})
    assert resolved == str(candidate.resolve())

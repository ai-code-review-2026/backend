from __future__ import annotations

import subprocess
from pathlib import Path
from urllib.parse import urlparse
from typing import Any, Iterable, Mapping

from app.core.knowledge_base.guardrails import validate_allowed_roots
from app.data.repos.repo_profiles_repo import RepoProfilesRepo
from app.settings import settings

_MAX_CHILDREN_PER_ROOT = 400


def resolve_repo_context_repo_path(*, repo: str, metadata: Mapping[str, Any] | None = None) -> str | None:
    repo_raw = repo.strip()
    if not repo_raw:
        return None
    repo_key = repo_raw.lower()

    metadata_path = _extract_metadata_repo_path(metadata)
    for raw_path in (
        metadata_path,
        settings.repo_context_repo_path_map.get(repo_key),
        _lookup_profile_repo_path(repo_raw),
        _discover_repo_path(repo_key=repo_key),
    ):
        validated = _validated_existing_dir(raw_path)
        if validated is not None:
            return str(validated)

    return None


def _extract_metadata_repo_path(metadata: Mapping[str, Any] | None) -> str | None:
    if not isinstance(metadata, Mapping):
        return None
    candidate = metadata.get("repo_path")
    if isinstance(candidate, str) and candidate.strip():
        return candidate.strip()
    return None


def _lookup_profile_repo_path(repo_raw: str) -> str | None:
    try:
        repo_profiles = RepoProfilesRepo()
    except Exception:
        return None

    candidates: list[str] = [repo_raw]
    lowered = repo_raw.lower()
    if lowered != repo_raw:
        candidates.append(lowered)

    for candidate in candidates:
        try:
            profile = repo_profiles.get_profile(candidate)
        except Exception:
            continue
        if profile and isinstance(profile.repo_path, str) and profile.repo_path.strip():
            return profile.repo_path.strip()
    return None


def _discover_repo_path(*, repo_key: str) -> str | None:
    slug = repo_key.split("/")[-1].strip().lower()
    if not slug:
        return None

    weak_name_matches: list[Path] = []
    for candidate in _iter_search_candidates(slug):
        if candidate.name.lower() != slug:
            continue

        if _remote_repo_matches(candidate, repo_key):
            return str(candidate)
        weak_name_matches.append(candidate)

    if weak_name_matches:
        return str(weak_name_matches[0])
    return None


def _iter_search_candidates(slug: str) -> Iterable[Path]:
    seen: set[Path] = set()
    for root in _discovery_roots():
        for candidate in _candidate_paths_for_root(root, slug):
            resolved = candidate.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            if resolved.is_dir():
                yield resolved


def _discovery_roots() -> list[Path]:
    candidates: list[Path] = []
    candidates.extend(settings.repo_context_allowed_roots)

    raw_workspace_path = (settings.STATIC_ANALYSIS_WORKSPACE_PATH or "").strip()
    if raw_workspace_path:
        workspace_root = Path(raw_workspace_path).expanduser().resolve()
        candidates.extend(_with_parents(workspace_root, levels=3))

    cwd = Path.cwd().resolve()
    candidates.extend(_with_parents(cwd, levels=3))

    roots: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        try:
            resolved = candidate.expanduser().resolve()
        except Exception:
            continue
        if resolved in seen or not resolved.exists() or not resolved.is_dir():
            continue
        seen.add(resolved)
        roots.append(resolved)
    return roots


def _with_parents(root: Path, *, levels: int) -> list[Path]:
    nodes: list[Path] = []
    current = root
    for _ in range(max(levels, 1)):
        nodes.append(current)
        if current.parent == current:
            break
        current = current.parent
    return nodes


def _candidate_paths_for_root(root: Path, slug: str) -> Iterable[Path]:
    yielded: set[Path] = set()

    for candidate in (root, root / slug):
        if candidate not in yielded:
            yielded.add(candidate)
            yield candidate

    children_count = 0
    try:
        iterator = root.iterdir()
    except OSError:
        return

    for child in iterator:
        if children_count >= _MAX_CHILDREN_PER_ROOT:
            break
        children_count += 1
        if not child.is_dir():
            continue
        for candidate in (child, child / slug):
            if candidate not in yielded:
                yielded.add(candidate)
                yield candidate


def _remote_repo_matches(candidate: Path, repo_key: str) -> bool:
    if repo_key.startswith("local/"):
        return False

    remote_url = _read_origin_remote_url(candidate)
    if remote_url is None:
        return False

    remote_repo = _extract_repo_full_name_from_remote(remote_url)
    return remote_repo == repo_key


def _read_origin_remote_url(repo_path: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_path), "remote", "get-url", "origin"],
            capture_output=True,
            text=True,
            check=False,
            timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if result.returncode != 0:
        return None

    output = result.stdout.strip()
    return output or None


def _extract_repo_full_name_from_remote(remote_url: str) -> str | None:
    raw = remote_url.strip()
    if not raw:
        return None

    if "://" in raw:
        parsed = urlparse(raw)
        raw_path = parsed.path
    elif ":" in raw and "@" in raw.split(":", maxsplit=1)[0]:
        raw_path = raw.split(":", maxsplit=1)[1]
    else:
        raw_path = raw

    parts = [part for part in raw_path.strip("/").split("/") if part]
    if len(parts) < 2:
        return None

    owner = parts[-2].strip()
    repo_name = parts[-1].strip()
    if repo_name.lower().endswith(".git"):
        repo_name = repo_name[:-4]
    if not owner or not repo_name:
        return None
    return f"{owner}/{repo_name}".lower()


def _validated_existing_dir(raw_path: str | None) -> Path | None:
    if raw_path is None:
        return None

    cleaned = raw_path.strip()
    if not cleaned:
        return None

    try:
        candidate = Path(cleaned).expanduser().resolve()
    except Exception:
        return None

    if not candidate.exists() or not candidate.is_dir():
        return None

    try:
        validate_allowed_roots(candidate)
    except ValueError:
        return None

    return candidate

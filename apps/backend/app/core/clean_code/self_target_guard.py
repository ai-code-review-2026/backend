from __future__ import annotations

from pathlib import Path
from typing import Any


def _normalize_repo_token(value: str) -> str:
    return value.strip().lower().replace("\\", "/").removesuffix(".git").strip("/")


def should_skip_clean_code_analysis(
    *,
    repo: str | None,
    metadata: dict[str, Any] | None,
    workspace: str,
    excluded_repos: set[str],
) -> tuple[bool, dict[str, str]]:
    candidates: set[str] = set()
    if repo:
        candidates.add(_normalize_repo_token(repo))

    if isinstance(metadata, dict):
        for key in (
            "github_repo",
            "selected_github_repo",
            "original_repo_input",
            "repo_normalized",
            "imported_folder_name",
        ):
            raw = metadata.get(key)
            if isinstance(raw, str) and raw.strip():
                candidates.add(_normalize_repo_token(raw))

    workspace_name = _normalize_repo_token(Path(workspace).resolve().name)
    if workspace_name:
        candidates.add(workspace_name)

    normalized_excluded = {_normalize_repo_token(item) for item in excluded_repos if item.strip()}
    excluded_segments = {item.split("/")[-1] for item in normalized_excluded}

    for candidate in candidates:
        if not candidate:
            continue
        if candidate in normalized_excluded or candidate.split("/")[-1] in excluded_segments:
            return True, {"reason": "excluded_repo", "matched": candidate}
    return False, {}

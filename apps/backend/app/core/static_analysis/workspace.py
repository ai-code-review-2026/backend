from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote

from app.core.review_engine.diff_engine import FileDiff, ParsedDiff


@dataclass
class PreparedWorkspace:
    path: str
    source: str
    warnings: list[str]
    _cleanup_root: str | None = None

    def cleanup(self) -> None:
        if self._cleanup_root:
            shutil.rmtree(self._cleanup_root, ignore_errors=True)


def _build_https_remote(repo: str, host: str, token: str | None) -> str:
    normalized_repo = repo.strip().removesuffix(".git")
    normalized_host = host.strip().strip("/")
    if not token:
        return f"https://{normalized_host}/{normalized_repo}.git"
    safe_token = quote(token, safe="")
    return f"https://x-access-token:{safe_token}@{normalized_host}/{normalized_repo}.git"


def _run_git(args: list[str], *, timeout_seconds: int, cwd: str | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
        check=False,
    )


def _is_snapshot_workspace(metadata: dict[str, Any] | None) -> bool:
    if not metadata:
        return False
    return str(metadata.get("workspace_source") or "").strip().lower() == "imported_folder_snapshot"


def _sanitize_snapshot_relative_path(raw_path: str) -> Path | None:
    normalized = raw_path.strip().replace("\\", "/").lstrip("/")
    if not normalized:
        return None
    posix_path = PurePosixPath(normalized)
    if posix_path.is_absolute():
        return None
    if any(part in {"", ".", ".."} for part in posix_path.parts):
        return None
    return Path(*posix_path.parts)


def _render_snapshot_file(file_item: FileDiff) -> str:
    lines_by_number: dict[int, str] = {}
    max_line_number = 0
    for hunk in file_item.hunks:
        for line in hunk.lines:
            if line.line_type not in {"context", "add"} or line.new_line_no is None:
                continue
            lines_by_number[line.new_line_no] = line.content
            max_line_number = max(max_line_number, line.new_line_no)
    if max_line_number <= 0:
        return ""
    return "\n".join(lines_by_number.get(index, "") for index in range(1, max_line_number + 1))


def _prepare_snapshot_workspace(parsed: ParsedDiff) -> PreparedWorkspace:
    temp_root = tempfile.mkdtemp(prefix="analysis-snapshot-")
    repo_dir = Path(temp_root) / "repo"
    repo_dir.mkdir(parents=True, exist_ok=True)
    warnings: list[str] = []

    for file_item in parsed.files:
        if file_item.is_binary or file_item.change_type == "deleted":
            continue

        safe_relative_path = _sanitize_snapshot_relative_path(file_item.path_new)
        if safe_relative_path is None:
            warnings.append(f"snapshot skipped invalid path: {file_item.path_new}")
            continue

        target_path = repo_dir / safe_relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        target_path.write_text(_render_snapshot_file(file_item), encoding="utf-8")

    return PreparedWorkspace(path=str(repo_dir), source="snapshot", warnings=warnings, _cleanup_root=temp_root)


def prepare_workspace(
    *,
    repo: str,
    commit_sha: str | None,
    default_workspace_path: str,
    auto_checkout_enabled: bool,
    git_host: str,
    git_token: str | None,
    checkout_timeout_seconds: int,
    checkout_base_path: str | None,
    parsed: ParsedDiff | None = None,
    metadata: dict[str, Any] | None = None,
) -> PreparedWorkspace:
    if parsed is not None and _is_snapshot_workspace(metadata):
        return _prepare_snapshot_workspace(parsed)

    default_path = str(Path(default_workspace_path).resolve())
    warnings: list[str] = []

    if not auto_checkout_enabled:
        return PreparedWorkspace(path=default_path, source="local", warnings=warnings)

    if not repo.strip():
        warnings.append("static checkout skipped: missing repo")
        return PreparedWorkspace(path=default_path, source="local", warnings=warnings)

    normalized_commit_sha = (commit_sha or "").strip()
    if not normalized_commit_sha:
        warnings.append("static checkout skipped: missing commit_sha")
        return PreparedWorkspace(path=default_path, source="local", warnings=warnings)
    if len(normalized_commit_sha) < 12:
        warnings.append("static checkout skipped: commit_sha too short")
        return PreparedWorkspace(path=default_path, source="local", warnings=warnings)

    parent_dir = None
    if checkout_base_path:
        base_path = Path(checkout_base_path).resolve()
        base_path.mkdir(parents=True, exist_ok=True)
        parent_dir = str(base_path)

    temp_root = tempfile.mkdtemp(prefix="analysis-workspace-", dir=parent_dir)
    repo_dir = str(Path(temp_root) / "repo")
    remote = _build_https_remote(repo=repo, host=git_host, token=git_token)

    clone = _run_git(["git", "clone", "--no-checkout", "--filter=blob:none", "--depth", "1", remote, repo_dir], timeout_seconds=checkout_timeout_seconds)
    if clone.returncode != 0:
        shutil.rmtree(temp_root, ignore_errors=True)
        warnings.append("static checkout failed: git clone")
        return PreparedWorkspace(path=default_path, source="local", warnings=warnings)

    if normalized_commit_sha:
        fetch = _run_git(
            ["git", "fetch", "--depth", "1", "origin", normalized_commit_sha],
            cwd=repo_dir,
            timeout_seconds=checkout_timeout_seconds,
        )
        if fetch.returncode != 0:
            shutil.rmtree(temp_root, ignore_errors=True)
            warnings.append("static checkout failed: git fetch commit")
            return PreparedWorkspace(path=default_path, source="local", warnings=warnings)

        checkout = _run_git(
            ["git", "checkout", "--force", normalized_commit_sha],
            cwd=repo_dir,
            timeout_seconds=checkout_timeout_seconds,
        )
        if checkout.returncode != 0:
            shutil.rmtree(temp_root, ignore_errors=True)
            warnings.append("static checkout failed: git checkout commit")
            return PreparedWorkspace(path=default_path, source="local", warnings=warnings)

    return PreparedWorkspace(path=repo_dir, source="checkout", warnings=warnings, _cleanup_root=temp_root)

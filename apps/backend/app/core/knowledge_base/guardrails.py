from __future__ import annotations

from pathlib import Path

from app.settings import settings

_EXCLUDED_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".next",
    "node_modules",
    "dist",
    "build",
    "coverage",
    ".venv",
    "venv",
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
}

_ALLOWED_SUFFIXES = {
    ".py",
    ".pyi",
    ".scala",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".vue",
    ".svelte",
    ".go",
    ".java",
    ".kt",
    ".rs",
    ".rb",
    ".php",
    ".c",
    ".h",
    ".cpp",
    ".hpp",
    ".cs",
    ".swift",
    ".m",
    ".mm",
    ".dart",
    ".md",
    ".mdx",
    ".rst",
    ".txt",
    ".yaml",
    ".yml",
    ".json",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".env.example",
    "dockerfile",
    ".tf",
    ".hcl",
    ".sql",
    ".sh",
    ".ps1",
    ".bat",
    ".html",
    ".css",
    ".scss",
    ".xml",
    ".feature",
    ".patch",
    ".diff",
    "go.mod",
    "go.sum",
    "yarn.lock",
    "pnpm-lock.yaml",
    "package-lock.json",
    ".gitlab-ci.yml",
    "azure-pipelines.yml",
    "azure-pipelines.yaml",
    "circle.yml",
    ".dockerignore",
    ".editorconfig",
}


def resolve_repo_path(repo_path: str) -> Path:
    candidate = Path(repo_path).expanduser().resolve()
    if not candidate.exists():
        raise ValueError(f"Repository path does not exist: {candidate}")
    if not candidate.is_dir():
        raise ValueError(f"Repository path must be a directory: {candidate}")
    return candidate


def validate_allowed_roots(repo_path: Path) -> None:
    allowed_roots = settings.repo_context_allowed_roots
    if not allowed_roots:
        return

    for root in allowed_roots:
        try:
            repo_path.relative_to(root)
            return
        except ValueError:
            continue

    raise ValueError(
        f"Repository path '{repo_path}' is outside REPO_CONTEXT_ALLOWED_ROOTS: "
        + ", ".join(str(root) for root in allowed_roots)
    )


def normalize_repo_id(repo_id: str) -> str:
    value = repo_id.strip()
    if not value:
        raise ValueError("repo_id is required")
    return value


def to_posix_relative(repo_path: Path, file_path: Path) -> str:
    rel = file_path.resolve().relative_to(repo_path.resolve())
    return rel.as_posix()


def should_index_path(file_path: Path) -> bool:
    name = file_path.name.lower()
    suffix = file_path.suffix.lower()
    if name in {".env", ".env.local", ".env.production"}:
        return False
    if suffix in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".pdf", ".zip", ".gz", ".woff", ".woff2"}:
        return False
    return suffix in _ALLOWED_SUFFIXES or name in _ALLOWED_SUFFIXES


def iter_repo_files(repo_path: Path) -> list[Path]:
    max_files = settings.REPO_CONTEXT_MAX_FILES_PER_RUN
    max_file_bytes = settings.REPO_CONTEXT_MAX_FILE_BYTES
    results: list[Path] = []

    for path in repo_path.rglob("*"):
        if len(results) >= max_files:
            break
        if not path.is_file():
            continue

        relative_parts = path.relative_to(repo_path).parts
        if any(part in _EXCLUDED_DIRS for part in relative_parts):
            continue
        if any(part.startswith(".") and part not in {".github"} for part in relative_parts):
            continue
        if not should_index_path(path):
            continue
        if path.stat().st_size > max_file_bytes:
            continue

        results.append(path)

    return results

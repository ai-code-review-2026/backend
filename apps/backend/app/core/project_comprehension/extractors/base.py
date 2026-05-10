"""Base extractor class for project comprehension."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Generic, TypeVar

T = TypeVar("T")


@dataclass
class ExtractionResult(Generic[T]):
    """Result of an extraction operation."""

    success: bool
    data: T | None = None
    error: str | None = None
    warnings: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseExtractor(ABC, Generic[T]):
    """Base class for all project extractors.

    Each extractor is responsible for extracting a specific aspect of the
    project structure (languages, frameworks, architecture, etc.).
    """

    def __init__(self, repo_path: Path):
        self.repo_path = repo_path
        self._file_cache: dict[str, str] = {}
        self._dir_cache: list[Path] | None = None

    @abstractmethod
    def extract(self) -> ExtractionResult[T]:
        """Extract information from the repository.

        Returns:
            ExtractionResult containing the extracted data or error information.
        """
        pass

    def _get_all_files(self, extensions: tuple[str, ...] | None = None) -> list[Path]:
        """Get all files in the repository, optionally filtered by extension."""
        if self._dir_cache is None:
            self._dir_cache = list(self._iter_files())

        if extensions is None:
            return self._dir_cache

        return [f for f in self._dir_cache if f.suffix.lower() in extensions]

    def _iter_files(self) -> list[Path]:
        """Iterate over all files in the repository, excluding common ignore patterns."""
        ignore_dirs = {
            ".git",
            ".svn",
            ".hg",
            "node_modules",
            "__pycache__",
            ".pytest_cache",
            ".mypy_cache",
            ".ruff_cache",
            ".tox",
            ".nox",
            "venv",
            ".venv",
            "env",
            ".env",
            "dist",
            "build",
            ".next",
            ".nuxt",
            "target",
            "vendor",
            ".cargo",
            "coverage",
            ".coverage",
            "htmlcov",
        }

        ignore_files = {
            ".DS_Store",
            "Thumbs.db",
            ".gitignore",
            ".gitattributes",
        }

        files: list[Path] = []

        def walk(path: Path) -> None:
            try:
                for item in path.iterdir():
                    if item.name in ignore_dirs or item.name in ignore_files:
                        continue
                    if item.is_dir():
                        walk(item)
                    elif item.is_file():
                        files.append(item)
            except PermissionError:
                pass

        walk(self.repo_path)
        return files

    def _read_file(self, path: Path, max_size: int = 500_000) -> str | None:
        """Read file content with caching and size limit."""
        str_path = str(path)
        if str_path in self._file_cache:
            return self._file_cache[str_path]

        try:
            if path.stat().st_size > max_size:
                return None

            content = path.read_text(encoding="utf-8", errors="ignore")
            self._file_cache[str_path] = content
            return content
        except (OSError, UnicodeDecodeError):
            return None

    def _file_exists(self, *relative_paths: str) -> bool:
        """Check if any of the given relative paths exist."""
        for rel_path in relative_paths:
            if (self.repo_path / rel_path).exists():
                return True
        return False

    def _find_files(self, pattern: str) -> list[Path]:
        """Find files matching a glob pattern."""
        return list(self.repo_path.glob(pattern))

    def _get_relative_path(self, path: Path) -> str:
        """Get path relative to repo root."""
        try:
            return str(path.relative_to(self.repo_path))
        except ValueError:
            return str(path)

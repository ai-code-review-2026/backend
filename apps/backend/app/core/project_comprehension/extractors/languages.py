"""Language extractor for project comprehension."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
from typing import NamedTuple

from app.core.project_comprehension.extractors.base import BaseExtractor, ExtractionResult


class LanguageStats(NamedTuple):
    """Statistics about a detected language."""

    name: str
    file_count: int
    line_count: int
    percentage: float


class LanguageExtraction(NamedTuple):
    """Result of language extraction."""

    primary_language: str | None
    languages: tuple[LanguageStats, ...]
    total_code_files: int
    total_lines: int


# Language detection by file extension
LANGUAGE_EXTENSIONS: dict[str, str] = {
    ".py": "python",
    ".pyi": "python",
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".scala": "scala",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".cs": "csharp",
    ".swift": "swift",
    ".m": "objective-c",
    ".mm": "objective-cpp",
    ".dart": "dart",
    ".lua": "lua",
    ".r": "r",
    ".R": "r",
    ".jl": "julia",
    ".ex": "elixir",
    ".exs": "elixir",
    ".erl": "erlang",
    ".hrl": "erlang",
    ".clj": "clojure",
    ".cljs": "clojure",
    ".vue": "vue",
    ".svelte": "svelte",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
    ".ps1": "powershell",
    ".psm1": "powershell",
}


class LanguageExtractor(BaseExtractor[LanguageExtraction]):
    """Extracts detailed language statistics from the repository."""

    def extract(self) -> ExtractionResult[LanguageExtraction]:
        """Extract language information from the repository."""
        try:
            all_files = self._get_all_files()

            language_files: dict[str, list[Path]] = {}
            language_lines: Counter[str] = Counter()

            for f in all_files:
                suffix = f.suffix.lower()
                if suffix not in LANGUAGE_EXTENSIONS:
                    continue

                lang = LANGUAGE_EXTENSIONS[suffix]
                if lang not in language_files:
                    language_files[lang] = []
                language_files[lang].append(f)

                # Count lines (estimate for large files)
                lines = self._count_lines(f)
                language_lines[lang] += lines

            # Calculate statistics
            total_files = sum(len(files) for files in language_files.values())
            total_lines = sum(language_lines.values())

            if total_files == 0:
                return ExtractionResult(
                    success=True,
                    data=LanguageExtraction(
                        primary_language=None,
                        languages=(),
                        total_code_files=0,
                        total_lines=0,
                    ),
                )

            # Build language stats
            stats: list[LanguageStats] = []
            for lang, files in language_files.items():
                file_count = len(files)
                line_count = language_lines[lang]
                percentage = (line_count / total_lines * 100) if total_lines > 0 else 0
                stats.append(LanguageStats(
                    name=lang,
                    file_count=file_count,
                    line_count=line_count,
                    percentage=round(percentage, 2),
                ))

            # Sort by line count (descending)
            stats.sort(key=lambda s: s.line_count, reverse=True)

            primary_language = stats[0].name if stats else None

            return ExtractionResult(
                success=True,
                data=LanguageExtraction(
                    primary_language=primary_language,
                    languages=tuple(stats),
                    total_code_files=total_files,
                    total_lines=total_lines,
                ),
            )

        except Exception as e:
            return ExtractionResult(
                success=False,
                error=f"Failed to extract languages: {e}",
            )

    def _count_lines(self, path: Path, max_size: int = 100_000) -> int:
        """Count lines in a file, with size limit."""
        try:
            size = path.stat().st_size
            if size > max_size:
                # Estimate based on average line length
                return size // 50  # Assume avg 50 chars per line

            content = self._read_file(path)
            if content is None:
                return 0
            return content.count("\n") + 1
        except (OSError, UnicodeDecodeError):
            return 0

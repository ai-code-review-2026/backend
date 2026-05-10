from __future__ import annotations

import re
from pathlib import Path

from app.core.review_engine.diff_engine import DiffParseError, parse_unified_diff

from analysis.langGraph.models import DiffCodeFragment

_PY_FUNC_RE = re.compile(r"^\s*def\s+([A-Za-z_]\w*)\s*\(")
_PY_CLASS_RE = re.compile(r"^\s*class\s+([A-Za-z_]\w*)\s*(?:\(|:)")
_JS_FUNC_RE = re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\(")
_JS_CLASS_RE = re.compile(r"^\s*(?:export\s+)?class\s+([A-Za-z_]\w*)\s*(?:\{|extends|\n)")
_TS_FUNC_RE = _JS_FUNC_RE
_TS_CLASS_RE = _JS_CLASS_RE

_LANGUAGE_BY_SUFFIX: dict[str, str] = {
    ".py": "python",
    ".pyi": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".rb": "ruby",
    ".rs": "rust",
    ".php": "php",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".md": "markdown",
    ".sql": "sql",
    ".yml": "yaml",
    ".yaml": "yaml",
    ".json": "json",
    ".toml": "toml",
}


class DiffChunker:
    """Parse a unified diff and derive structured fragments for LLM prompts."""

    def parse_diff(
        self,
        *,
        diff_text: str,
        changed_files_hint: list[str] | None = None,
    ) -> list[DiffCodeFragment]:
        try:
            parsed = parse_unified_diff(diff_text)
        except DiffParseError:
            return self._fallback_parse(diff_text=diff_text, changed_files_hint=changed_files_hint)

        fragments: list[DiffCodeFragment] = []
        for file_item in parsed.files:
            path = file_item.path_new or file_item.path_old
            if not path:
                continue
            language = self._guess_language(path)
            module = self._module_from_path(path)
            added_lines: list[str] = []
            removed_lines: list[str] = []
            start_line: int | None = None
            end_line: int | None = None
            function_name: str | None = None
            class_name: str | None = None

            for hunk in file_item.hunks:
                for line in hunk.lines:
                    if line.line_type == "add":
                        if start_line is None:
                            start_line = line.new_line_no
                        end_line = line.new_line_no
                        added_lines.append(line.content)
                        if function_name is None:
                            function_name = self._extract_function_name(line.content, language)
                        if class_name is None:
                            class_name = self._extract_class_name(line.content, language)
                    elif line.line_type == "remove":
                        removed_lines.append(line.content)

            if not added_lines and not removed_lines:
                continue

            fragments.append(
                DiffCodeFragment(
                    file_path=path,
                    language=language,
                    module=module,
                    function_name=function_name,
                    class_name=class_name,
                    start_line=start_line,
                    end_line=end_line,
                    added_lines=added_lines[:120],
                    removed_lines=removed_lines[:120],
                )
            )
        return fragments

    def _fallback_parse(
        self,
        *,
        diff_text: str,
        changed_files_hint: list[str] | None = None,
    ) -> list[DiffCodeFragment]:
        changed_files = changed_files_hint or []
        if not changed_files:
            changed_files = self._extract_paths(diff_text)

        fallback: list[DiffCodeFragment] = []
        added_lines = [line[1:] for line in diff_text.splitlines() if line.startswith("+") and not line.startswith("+++")]
        removed_lines = [line[1:] for line in diff_text.splitlines() if line.startswith("-") and not line.startswith("---")]
        for file_path in changed_files:
            language = self._guess_language(file_path)
            fallback.append(
                DiffCodeFragment(
                    file_path=file_path,
                    language=language,
                    module=self._module_from_path(file_path),
                    function_name=None,
                    class_name=None,
                    start_line=None,
                    end_line=None,
                    added_lines=added_lines[:80],
                    removed_lines=removed_lines[:80],
                )
            )
        return fallback

    @staticmethod
    def _extract_paths(diff_text: str) -> list[str]:
        paths: list[str] = []
        for line in diff_text.splitlines():
            if not line.startswith("diff --git a/"):
                continue
            parts = line.split(" b/", maxsplit=1)
            if len(parts) != 2:
                continue
            path = parts[1].strip()
            if path:
                paths.append(path)
        return sorted(set(paths))

    def _guess_language(self, path: str) -> str:
        suffix = Path(path).suffix.lower()
        return _LANGUAGE_BY_SUFFIX.get(suffix, "text")

    @staticmethod
    def _module_from_path(path: str) -> str | None:
        parts = path.split("/")
        if len(parts) <= 1:
            return None
        return parts[0]

    @staticmethod
    def _extract_function_name(line: str, language: str) -> str | None:
        regex = {
            "python": _PY_FUNC_RE,
            "javascript": _JS_FUNC_RE,
            "typescript": _TS_FUNC_RE,
        }.get(language)
        if regex is None:
            return None
        match = regex.match(line.strip())
        if not match:
            return None
        return match.group(1)

    @staticmethod
    def _extract_class_name(line: str, language: str) -> str | None:
        regex = {
            "python": _PY_CLASS_RE,
            "javascript": _JS_CLASS_RE,
            "typescript": _TS_CLASS_RE,
        }.get(language)
        if regex is None:
            return None
        match = regex.match(line.strip())
        if not match:
            return None
        return match.group(1)


class Chunker(DiffChunker):
    """Backward-compatible alias."""


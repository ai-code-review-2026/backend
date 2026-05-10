"""Per-hunk query generation from unified diffs.

Instead of generating a single query for the entire diff, this module produces
targeted queries for each hunk — enabling more precise retrieval for both the
Repository Context RAG and the Knowledge Base RAG.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Sequence

_SECURITY_KEYWORDS = frozenset({
    "password", "secret", "token", "api_key", "apikey", "auth",
    "credential", "private_key", "encrypt", "decrypt", "hash",
    "jwt", "oauth", "session", "cookie", "csrf", "xss", "sql",
    "injection", "sanitize", "validate", "escape", "exec", "eval",
    "subprocess", "shell", "chmod", "sudo",
})

_SYMBOL_RE = re.compile(r"(?:def|function|fn|func|class|interface|struct|type)\s+([A-Za-z_]\w*)")
_IMPORT_RE = re.compile(r"(?:import|from|require|include)\s+[\"']?([A-Za-z_][\w./]*)")
_PATH_RE = re.compile(r"^\+\+\+ b/(.+)$", re.MULTILINE)
_HUNK_HEADER_RE = re.compile(r"^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$", re.MULTILINE)


@dataclass(frozen=True)
class GeneratedQuery:
    text: str
    route_hint: str
    source: str
    hunk_index: int | None = None


@dataclass(frozen=True)
class DiffHunk:
    file_path: str
    start_line: int
    line_count: int
    header_context: str
    added_lines: list[str]
    removed_lines: list[str]


class DiffQueryGenerator:
    """Generate multiple targeted queries from a unified diff."""

    def __init__(self, *, max_hunks: int = 5, max_queries: int = 15) -> None:
        self._max_hunks = max_hunks
        self._max_queries = max_queries

    def generate_queries(self, diff_text: str) -> list[GeneratedQuery]:
        hunks = self._parse_hunks(diff_text)
        queries: list[GeneratedQuery] = []
        seen_texts: set[str] = set()

        for idx, hunk in enumerate(hunks[: self._max_hunks]):
            for query in self._queries_for_hunk(hunk, idx):
                key = query.text.strip().lower()
                if key not in seen_texts and len(queries) < self._max_queries:
                    seen_texts.add(key)
                    queries.append(query)

        # Always include a global diff query
        global_query = self._global_diff_query(diff_text, hunks)
        if global_query.text.strip().lower() not in seen_texts:
            queries.append(global_query)

        return queries

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _parse_hunks(self, diff_text: str) -> list[DiffHunk]:
        paths = _PATH_RE.findall(diff_text)
        current_path = paths[0] if paths else "unknown"

        hunks: list[DiffHunk] = []
        for match in _HUNK_HEADER_RE.finditer(diff_text):
            start_line = int(match.group(1))
            line_count = int(match.group(2)) if match.group(2) else 1
            header_context = (match.group(3) or "").strip()

            # Collect lines until next hunk or file header
            block_start = match.end()
            block_end = len(diff_text)
            next_hunk = _HUNK_HEADER_RE.search(diff_text, block_start)
            if next_hunk:
                block_end = next_hunk.start()
            block = diff_text[block_start:block_end]

            added = [line[1:] for line in block.splitlines() if line.startswith("+")]
            removed = [line[1:] for line in block.splitlines() if line.startswith("-")]

            # Update current path from +++ headers before this hunk
            for path in _PATH_RE.findall(diff_text[:match.start()]):
                current_path = path

            hunks.append(DiffHunk(
                file_path=current_path,
                start_line=start_line,
                line_count=line_count,
                header_context=header_context,
                added_lines=added,
                removed_lines=removed,
            ))
        return hunks

    def _queries_for_hunk(self, hunk: DiffHunk, index: int) -> list[GeneratedQuery]:
        queries: list[GeneratedQuery] = []
        all_lines = "\n".join(hunk.added_lines + hunk.removed_lines)

        # 1. Code query — symbols + path
        symbols = _SYMBOL_RE.findall(all_lines)
        imports = _IMPORT_RE.findall(all_lines)
        code_parts = [hunk.file_path]
        if symbols:
            code_parts.extend(symbols[:3])
        if imports:
            code_parts.extend(imports[:2])
        if hunk.header_context:
            code_parts.append(hunk.header_context)
        queries.append(GeneratedQuery(
            text=" ".join(code_parts),
            route_hint="code_query",
            source="hunk_code",
            hunk_index=index,
        ))

        # 2. Policy query — only if security signals found
        lower_lines = all_lines.lower()
        security_hits = [kw for kw in _SECURITY_KEYWORDS if kw in lower_lines]
        if security_hits:
            queries.append(GeneratedQuery(
                text=f"{hunk.file_path} {' '.join(security_hits[:5])} security best practices",
                route_hint="policy_query",
                source="hunk_policy",
                hunk_index=index,
            ))

        return queries

    def _global_diff_query(self, diff_text: str, hunks: Sequence[DiffHunk]) -> GeneratedQuery:
        paths = sorted({h.file_path for h in hunks})[:5]
        symbols = set()
        for hunk in hunks:
            all_lines = "\n".join(hunk.added_lines)
            symbols.update(_SYMBOL_RE.findall(all_lines))
        parts = paths + sorted(symbols)[:5]
        return GeneratedQuery(
            text=" ".join(parts) if parts else "code change review",
            route_hint="auto",
            source="diff_global",
        )

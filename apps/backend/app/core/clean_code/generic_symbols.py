from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from app.core.clean_code.language_profiles import comment_prefixes_for_language


@dataclass(frozen=True)
class GenericVariableCandidate:
    name: str
    line_no: int
    is_constant: bool


@dataclass(frozen=True)
class GenericSymbol:
    kind: str
    name: str
    start_line: int
    end_line: int
    logical_lines: int
    complexity: int
    dependencies: tuple[str, ...]
    snippet: str
    is_constant: bool = False


_CLASS_PATTERNS = (
    re.compile(r"^\s*(?:export\s+)?class\s+([A-Za-z_]\w*)"),
    re.compile(r"^\s*class\s+([A-Za-z_]\w*)"),
)
_FUNCTION_PATTERNS = (
    re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\("),
    re.compile(r"^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_]\w*)\s*=>"),
    re.compile(r"^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\("),
    re.compile(r"^\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)\s*\("),
    re.compile(r"^\s*(?:public|private|protected|internal|static|final|override|virtual|\s)+[A-Za-z_<>\[\]?]+\s+([A-Za-z_]\w*)\s*\("),
)
_CONSTANT_PATTERNS = (
    re.compile(r"^\s*(?:export\s+)?const\s+([A-Za-z_]\w*)\s*="),
    re.compile(r"^\s*(?:public|private|protected|static|final|\s)+[A-Za-z_<>\[\]?]+\s+([A-Za-z_]\w*)\s*="),
)
_VARIABLE_PATTERNS = (
    re.compile(r"^\s*(?:const|let|var)\s+([A-Za-z_]\w*)\s*="),
    re.compile(r"^\s*(?:public|private|protected|static|final|\s)+[A-Za-z_<>\[\]?]+\s+([A-Za-z_]\w*)\s*="),
    re.compile(r"^\s*(?:val|var)\s+([A-Za-z_]\w*)\s*="),
)
_COMPLEXITY_TOKENS = (" if ", " for ", " while ", " catch ", " case ", "&&", "||", "?", " when ")
_DEPENDENCY_PATTERNS = {
    "io": re.compile(r"\b(open|readFile|writeFile|FileReader|fs\.)\b"),
    "network": re.compile(r"\b(fetch|axios|requests|http\.|https\.|socket|urllib)\b"),
    "subprocess": re.compile(r"\b(exec|spawn|subprocess|system\(|Runtime\.getRuntime)\b"),
    "env": re.compile(r"\b(process\.env|os\.environ|System\.getenv)\b"),
}


def _logical_line_count(lines: list[str], *, comment_prefixes: tuple[str, ...]) -> int:
    count = 0
    for raw_line in lines:
        stripped = raw_line.strip()
        if not stripped:
            continue
        if any(stripped.startswith(prefix) for prefix in comment_prefixes):
            continue
        if stripped in {"{", "}", "};"}:
            continue
        count += 1
    return count


def _complexity_for_snippet(snippet: str) -> int:
    lowered = f" {snippet.lower()} "
    complexity = 1
    for token in _COMPLEXITY_TOKENS:
        complexity += lowered.count(token)
    return complexity


def _dependencies_for_snippet(snippet: str) -> tuple[str, ...]:
    lowered = snippet.lower()
    matches = [name for name, pattern in _DEPENDENCY_PATTERNS.items() if pattern.search(lowered)]
    return tuple(matches)


def extract_generic_variable_candidates(text: str) -> list[GenericVariableCandidate]:
    candidates: list[GenericVariableCandidate] = []
    for line_no, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue
        for pattern in _VARIABLE_PATTERNS:
            match = pattern.match(line)
            if not match:
                continue
            name = match.group(1)
            candidates.append(
                GenericVariableCandidate(
                    name=name,
                    line_no=line_no,
                    is_constant=name.isupper(),
                )
            )
            break
    return candidates


def extract_generic_symbols(*, text: str, relative_path: str, language: str) -> list[GenericSymbol]:
    lines = text.splitlines()
    headers: list[tuple[int, str, str, bool]] = []
    for line_no, raw_line in enumerate(lines, start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue
        for pattern in _CLASS_PATTERNS:
            match = pattern.match(stripped)
            if match:
                headers.append((line_no, "class", match.group(1), False))
                break
        else:
            for pattern in _FUNCTION_PATTERNS:
                match = pattern.match(stripped)
                if match:
                    name = match.group(1)
                    kind = "component" if Path(relative_path).suffix.lower() in {".tsx", ".jsx"} and name[:1].isupper() else "function"
                    headers.append((line_no, kind, name, False))
                    break
            else:
                for pattern in _CONSTANT_PATTERNS:
                    match = pattern.match(stripped)
                    if match:
                        headers.append((line_no, "constant", match.group(1), True))
                        break

    if not headers:
        return []

    comment_prefixes = comment_prefixes_for_language(language)
    symbols: list[GenericSymbol] = []
    for index, (start_line, kind, name, is_constant) in enumerate(headers):
        next_line = headers[index + 1][0] if index + 1 < len(headers) else len(lines) + 1
        end_line = start_line if kind == "constant" else max(start_line, next_line - 1)
        snippet_lines = lines[start_line - 1 : end_line]
        snippet = "\n".join(snippet_lines).strip()
        if not snippet:
            continue
        symbols.append(
            GenericSymbol(
                kind=kind,
                name=name,
                start_line=start_line,
                end_line=end_line,
                logical_lines=_logical_line_count(snippet_lines, comment_prefixes=comment_prefixes),
                complexity=_complexity_for_snippet(snippet),
                dependencies=_dependencies_for_snippet(snippet),
                snippet=snippet,
                is_constant=is_constant,
            )
        )
    return symbols

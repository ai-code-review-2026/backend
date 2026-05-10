from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

from app.core.clean_code.language_profiles import comment_prefixes_for_language, is_test_path


_STOP_WORDS = {"a", "an", "and", "the", "to", "of", "for", "into", "from", "this", "that", "with", "on"}
_NUMBER_RE = re.compile(r"(?<![A-Za-z_])(-?\d+(?:\.\d+)?)(?![A-Za-z_])")
_CONSTANT_LINE_RE = re.compile(
    r"^\s*(?:const|final|static\s+final|public\s+static\s+final|private\s+static\s+final)\s+[A-Z0-9_<>\[\]\s,?]*\s*([A-Z][A-Z0-9_]*)?\s*="
)
_UPPER_ASSIGN_RE = re.compile(r"^\s*[A-Z][A-Z0-9_]*\s*=")
_GENERIC_CATCH_PATTERNS = (
    (re.compile(r"catch\s*\([^)]*\)\s*\{\s*\}"), "empty_handler"),
    (re.compile(r"catch\s*\([^)]*\)\s*\{\s*return\s*(?:null)?\s*;?\s*\}"), "return_only"),
    (re.compile(r"catch\s*\([^)]*\)\s*\{\s*(?:console\.(?:log|warn|error)\([^)]*\);?\s*)+\}"), "log_only"),
)
_CRITICAL_PATH_TOKENS = (
    "auth",
    "security",
    "permission",
    "token",
    "payment",
    "billing",
    "api",
    "route",
    "controller",
    "db",
    "migration",
    "config",
)


@dataclass(frozen=True)
class CleanCodeFinding:
    rule_id: str
    file_path: str
    line_start: int | None
    line_end: int | None
    severity: str
    category: str
    message: str
    suggestion: str | None = None
    evidence: dict[str, object] = field(default_factory=dict)


def build_finding(
    *,
    rule_id: str,
    file_path: str,
    line_start: int | None,
    line_end: int | None,
    severity: str,
    category: str,
    message: str,
    suggestion: str | None,
    evidence: dict[str, object] | None = None,
) -> CleanCodeFinding:
    payload = dict(evidence or {})
    payload.setdefault("severity", severity)
    payload.setdefault("category", category)
    payload.setdefault("confidence", 0.78 if severity == "WARN" else 0.68)
    return CleanCodeFinding(
        rule_id=rule_id,
        file_path=file_path,
        line_start=line_start,
        line_end=line_end,
        severity=severity,
        category=category,
        message=message,
        suggestion=suggestion,
        evidence=payload,
    )


def detect_redundant_comments(*, text: str, relative_path: str, language: str) -> list[CleanCodeFinding]:
    prefixes = comment_prefixes_for_language(language)
    lines = text.splitlines()
    findings: list[CleanCodeFinding] = []
    for index, raw_line in enumerate(lines):
        stripped = raw_line.strip()
        if not stripped or stripped.startswith(("/*", "/**", "*", "*/", "///")):
            continue
        prefix = next((item for item in prefixes if stripped.startswith(item)), None)
        if prefix is None:
            continue
        comment_text = stripped[len(prefix) :].strip(" :\t")
        if len(comment_text) < 6 or len(comment_text) > 80:
            continue
        next_code_line = _next_significant_code_line(lines=lines, start_index=index + 1, prefixes=prefixes)
        if not next_code_line:
            continue
        if _looks_like_redundant_comment(comment_text=comment_text, code_line=next_code_line):
            findings.append(
                build_finding(
                    rule_id="comment.redundant",
                    file_path=relative_path,
                    line_start=index + 1,
                    line_end=index + 1,
                    severity="INFO",
                    category="style",
                    message="Commentary appears to restate the code instead of explaining intent.",
                    suggestion="Remove the redundant comment or replace it with the reason behind this logic.",
                    evidence={"language": language},
                )
            )
    return findings


def detect_magic_numbers_text(*, text: str, relative_path: str, language: str) -> list[CleanCodeFinding]:
    if is_test_path(relative_path):
        return []
    findings: list[CleanCodeFinding] = []
    prefixes = comment_prefixes_for_language(language)
    for line_no, raw_line in enumerate(text.splitlines(), start=1):
        stripped = raw_line.strip()
        if not stripped:
            continue
        if any(stripped.startswith(prefix) for prefix in prefixes):
            continue
        lowered = stripped.lower()
        if lowered.startswith(("import ", "from ", "package ", "using ", "#include")) or " enum " in f" {lowered} ":
            continue
        if _looks_like_constant_line(stripped):
            continue
        for match in _NUMBER_RE.finditer(stripped):
            value = match.group(1)
            if value in {"-1", "0", "1", "2", "0.0", "1.0", "2.0"}:
                continue
            findings.append(
                build_finding(
                    rule_id="magic_number.detected",
                    file_path=relative_path,
                    line_start=line_no,
                    line_end=line_no,
                    severity="INFO",
                    category="quality",
                    message=f"Magic number detected ({value}). Replace it with a named constant.",
                    suggestion=f"Extract {value} into a constant that explains its role.",
                    evidence={"language": language},
                )
            )
            break
    return findings


def detect_generic_ignored_errors(*, text: str, relative_path: str, language: str) -> list[CleanCodeFinding]:
    findings: list[CleanCodeFinding] = []
    for line_no, raw_line in enumerate(text.splitlines(), start=1):
        stripped = raw_line.strip()
        if "catch" not in stripped:
            continue
        for pattern, reason in _GENERIC_CATCH_PATTERNS:
            if pattern.search(stripped):
                findings.append(
                    build_finding(
                        rule_id="error_handling.ignored",
                        file_path=relative_path,
                        line_start=line_no,
                        line_end=line_no,
                        severity="WARN",
                        category="quality",
                        message="Caught errors are ignored instead of being handled or propagated.",
                        suggestion="Handle the failure explicitly or rethrow a meaningful error.",
                        evidence={"language": language, "reason": reason},
                    )
                )
                break
    return findings


def detect_hard_to_test_generic(
    *,
    relative_path: str,
    language: str,
    symbol_name: str,
    line_start: int,
    line_end: int,
    dependencies: tuple[str, ...],
) -> CleanCodeFinding | None:
    if not dependencies:
        return None
    reasons = ", ".join(sorted(dependencies))
    return build_finding(
        rule_id="testing.hard_to_test",
        file_path=relative_path,
        line_start=line_start,
        line_end=line_end,
        severity="WARN",
        category="maintainability",
        message=f"{symbol_name} mixes complex logic with direct {reasons} dependencies, which makes isolated tests harder.",
        suggestion="Split the logic from IO-bound behavior and inject the dependency behind a seam.",
        evidence={"language": language, "dependencies": list(dependencies)},
    )


def is_critical_module(*, relative_path: str, changed_lines: int) -> bool:
    lowered = relative_path.replace("\\", "/").lower()
    if changed_lines > 120:
        return True
    return any(token in lowered for token in _CRITICAL_PATH_TOKENS)


def has_companion_test(*, relative_path: str, known_test_paths: set[str]) -> bool:
    normalized = relative_path.replace("\\", "/")
    base = Path(normalized)
    stem = base.stem.lower()
    parts = [part.lower() for part in base.parts]
    parent = "/".join(parts[:-1])
    for candidate in known_test_paths:
        candidate_lower = candidate.lower()
        candidate_name = candidate_lower.split("/")[-1]
        if stem in candidate_name:
            return True
        if parent and parent in candidate_lower and stem in candidate_lower:
            return True
    return False


def build_testing_gap_finding(*, relative_path: str) -> CleanCodeFinding:
    return build_finding(
        rule_id="testing.missing_for_critical_module",
        file_path=relative_path,
        line_start=1,
        line_end=1,
        severity="WARN",
        category="quality",
        message="Critical module changed without a nearby companion test in the repository.",
        suggestion="Add focused regression coverage for this module before merging further changes.",
        evidence={"scope": "file"},
    )


def build_large_file_finding(*, relative_path: str, logical_lines: int, symbol_count: int) -> CleanCodeFinding:
    details = []
    if logical_lines:
        details.append(f"{logical_lines} logical lines")
    if symbol_count:
        details.append(f"{symbol_count} top-level symbols")
    detail_text = ", ".join(details) or "high file complexity"
    return build_finding(
        rule_id="organization.large_file",
        file_path=relative_path,
        line_start=1,
        line_end=1,
        severity="WARN",
        category="maintainability",
        message=f"File packs too many responsibilities ({detail_text}).",
        suggestion="Split the module into smaller units with clearer responsibilities.",
        evidence={"scope": "file", "logical_lines": logical_lines, "top_level_symbols": symbol_count},
    )


def _looks_like_redundant_comment(*, comment_text: str, code_line: str) -> bool:
    comment_tokens = _normalize_words(comment_text)
    code_tokens = _normalize_words(code_line)
    if len(comment_tokens) < 2 or not code_tokens:
        return False
    overlap = [token for token in comment_tokens if token in code_tokens]
    return len(overlap) >= max(2, len(comment_tokens) - 1)


def _normalize_words(text: str) -> list[str]:
    normalized = re.sub(r"[^A-Za-z0-9]+", " ", text).lower().strip()
    return [token for token in normalized.split() if token and token not in _STOP_WORDS]


def _next_significant_code_line(*, lines: list[str], start_index: int, prefixes: tuple[str, ...]) -> str | None:
    for raw_line in lines[start_index:]:
        stripped = raw_line.strip()
        if not stripped:
            continue
        if any(stripped.startswith(prefix) for prefix in prefixes):
            continue
        return stripped
    return None


def _looks_like_constant_line(line: str) -> bool:
    if _UPPER_ASSIGN_RE.match(line):
        return True
    return bool(_CONSTANT_LINE_RE.match(line))

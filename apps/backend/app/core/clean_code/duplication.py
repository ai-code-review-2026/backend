from __future__ import annotations

import re
from dataclasses import dataclass

from app.core.clean_code.language_profiles import comment_prefixes_for_language


@dataclass(frozen=True)
class DuplicateOccurrence:
    file_path: str
    start_line: int
    end_line: int


@dataclass(frozen=True)
class DuplicateGroup:
    signature: str
    occurrences: tuple[DuplicateOccurrence, ...]


_STRING_RE = re.compile(r"(\"[^\"]*\"|'[^']*')")
_NUMBER_RE = re.compile(r"\b\d+(?:\.\d+)?\b")


def _normalize_line(line: str, *, comment_prefixes: tuple[str, ...]) -> str:
    normalized = line.strip()
    if not normalized:
        return ""
    for prefix in comment_prefixes:
        if normalized.startswith(prefix):
            return ""
        if prefix in normalized:
            normalized = normalized.split(prefix, maxsplit=1)[0].strip()
    normalized = _STRING_RE.sub('"str"', normalized)
    normalized = _NUMBER_RE.sub("N", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    if normalized in {"{", "}", "(", ")", "[", "]"}:
        return ""
    return normalized


def detect_duplicate_groups(
    *,
    files: list[tuple[str, str, str]],
    min_lines: int,
) -> list[DuplicateGroup]:
    windows: dict[str, list[DuplicateOccurrence]] = {}
    for relative_path, language, text in files:
        comment_prefixes = comment_prefixes_for_language(language)
        normalized_lines: list[tuple[int, str]] = []
        for line_no, raw_line in enumerate(text.splitlines(), start=1):
            normalized = _normalize_line(raw_line, comment_prefixes=comment_prefixes)
            if normalized:
                normalized_lines.append((line_no, normalized))
        if len(normalized_lines) < min_lines:
            continue
        for start_index in range(0, len(normalized_lines) - min_lines + 1):
            window = normalized_lines[start_index : start_index + min_lines]
            signature = "\n".join(item[1] for item in window)
            occurrence = DuplicateOccurrence(
                file_path=relative_path,
                start_line=window[0][0],
                end_line=window[-1][0],
            )
            windows.setdefault(signature, []).append(occurrence)

    groups: list[DuplicateGroup] = []
    seen: set[tuple[str, tuple[tuple[str, int, int], ...]]] = set()
    for signature, occurrences in windows.items():
        unique: list[DuplicateOccurrence] = []
        occurrence_keys = set()
        for occurrence in occurrences:
            key = (occurrence.file_path, occurrence.start_line, occurrence.end_line)
            if key in occurrence_keys:
                continue
            occurrence_keys.add(key)
            unique.append(occurrence)
        if len(unique) < 2:
            continue
        group_key = (signature, tuple((item.file_path, item.start_line, item.end_line) for item in unique[:4]))
        if group_key in seen:
            continue
        seen.add(group_key)
        groups.append(DuplicateGroup(signature=signature, occurrences=tuple(unique)))
    return groups[:24]

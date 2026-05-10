from __future__ import annotations

from pathlib import Path

from app.core.review_engine.diff_engine import ParsedDiff
from app.core.static_analysis.base import StaticFinding


def normalize_diff_path(path: str) -> str:
    return Path(path.strip()).as_posix().lstrip("./")


def build_changed_lines_map(parsed: ParsedDiff) -> dict[str, set[int]]:
    result: dict[str, set[int]] = {}
    for file_item in parsed.files:
        key = normalize_diff_path(file_item.path_new)
        lines = result.setdefault(key, set())
        for hunk in file_item.hunks:
            for line in hunk.lines:
                if line.line_type == "add" and line.new_line_no is not None:
                    lines.add(line.new_line_no)
    return result


def _intersects_changed_lines(finding: StaticFinding, changed_lines: set[int]) -> bool:
    if finding.evidence.get("scope") == "file":
        return True
    if finding.line_start is None and finding.line_end is None:
        return False
    start = finding.line_start if finding.line_start is not None else finding.line_end
    end = finding.line_end if finding.line_end is not None else finding.line_start
    if start is None or end is None:
        return False
    if end < start:
        start, end = end, start
    for line in range(start, end + 1):
        if line in changed_lines:
            return True
    return False


def filter_findings_to_changed_lines(
    findings: list[StaticFinding],
    changed_lines_map: dict[str, set[int]],
) -> tuple[list[StaticFinding], int]:
    filtered: list[StaticFinding] = []
    filtered_out = 0
    for finding in findings:
        normalized_path = normalize_diff_path(finding.file_path)
        changed_lines = changed_lines_map.get(normalized_path)
        if not changed_lines:
            filtered_out += 1
            continue
        if _intersects_changed_lines(finding, changed_lines):
            filtered.append(finding)
        else:
            filtered_out += 1
    return filtered, filtered_out

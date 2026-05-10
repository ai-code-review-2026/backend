from __future__ import annotations

import re

from app.core.review_engine.diff_engine.dtos import FileDiff, Hunk, HunkLine, ParsedDiff

_DIFF_HEADER_RE = re.compile(r"^diff --git a/(.+?) b/(.+)$")
_HUNK_HEADER_RE = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$")


class DiffParseError(ValueError):
    pass


def _normalize_diff_path(raw: str) -> str | None:
    value = raw.strip()
    if value in {"/dev/null", "dev/null"}:
        return None
    if value.startswith("a/") or value.startswith("b/"):
        return value[2:]
    return value


def _safe_count(raw: str | None) -> int:
    if raw is None or raw == "":
        return 1
    return int(raw)


def parse_unified_diff(diff_text: str) -> ParsedDiff:
    if not diff_text.strip():
        raise DiffParseError("diff_text is empty")

    lines = diff_text.splitlines()
    files: list[FileDiff] = []
    current_file: FileDiff | None = None
    has_any_diff_header = False
    idx = 0

    while idx < len(lines):
        line = lines[idx]

        header_match = _DIFF_HEADER_RE.match(line)
        if header_match:
            has_any_diff_header = True
            if current_file is not None:
                files.append(current_file)

            old_path, new_path = header_match.groups()
            current_file = FileDiff(
                path_old=old_path,
                path_new=new_path,
                change_type="modified",
                is_binary=False,
                additions_count=0,
                deletions_count=0,
                hunks=[],
            )
            idx += 1
            continue

        if current_file is None:
            idx += 1
            continue

        if line.startswith("rename from "):
            current_file.path_old = line.removeprefix("rename from ").strip() or current_file.path_old
            current_file.change_type = "renamed"
            idx += 1
            continue

        if line.startswith("rename to "):
            current_file.path_new = line.removeprefix("rename to ").strip() or current_file.path_new
            current_file.change_type = "renamed"
            idx += 1
            continue

        if line.startswith("new file mode "):
            current_file.change_type = "added"
            idx += 1
            continue

        if line.startswith("deleted file mode "):
            current_file.change_type = "deleted"
            idx += 1
            continue

        if line.startswith("--- "):
            parsed_old = _normalize_diff_path(line.removeprefix("--- "))
            current_file.path_old = parsed_old
            idx += 1
            continue

        if line.startswith("+++ "):
            parsed_new = _normalize_diff_path(line.removeprefix("+++ "))
            if parsed_new is not None:
                current_file.path_new = parsed_new
            idx += 1
            continue

        if line == "GIT binary patch" or (line.startswith("Binary files ") and line.endswith(" differ")):
            current_file.is_binary = True
            idx += 1
            continue

        hunk_match = _HUNK_HEADER_RE.match(line)
        if hunk_match:
            old_start = int(hunk_match.group(1))
            old_lines = _safe_count(hunk_match.group(2))
            new_start = int(hunk_match.group(3))
            new_lines = _safe_count(hunk_match.group(4))
            header = (hunk_match.group(5) or "").strip() or None

            old_line = old_start
            new_line = new_start
            hunk_lines: list[HunkLine] = []
            raw_hunk_lines: list[str] = [line]
            idx += 1

            while idx < len(lines):
                hunk_line_raw = lines[idx]

                if _DIFF_HEADER_RE.match(hunk_line_raw) or _HUNK_HEADER_RE.match(hunk_line_raw):
                    break

                raw_hunk_lines.append(hunk_line_raw)

                if hunk_line_raw.startswith("\\ No newline at end of file"):
                    idx += 1
                    continue

                if hunk_line_raw.startswith("+") and not hunk_line_raw.startswith("+++ "):
                    hunk_lines.append(
                        HunkLine(
                            line_type="add",
                            content=hunk_line_raw[1:],
                            old_line_no=None,
                            new_line_no=new_line,
                        )
                    )
                    current_file.additions_count += 1
                    new_line += 1
                    idx += 1
                    continue

                if hunk_line_raw.startswith("-") and not hunk_line_raw.startswith("--- "):
                    hunk_lines.append(
                        HunkLine(
                            line_type="remove",
                            content=hunk_line_raw[1:],
                            old_line_no=old_line,
                            new_line_no=None,
                        )
                    )
                    current_file.deletions_count += 1
                    old_line += 1
                    idx += 1
                    continue

                if hunk_line_raw.startswith(" "):
                    hunk_lines.append(
                        HunkLine(
                            line_type="context",
                            content=hunk_line_raw[1:],
                            old_line_no=old_line,
                            new_line_no=new_line,
                        )
                    )
                    old_line += 1
                    new_line += 1
                    idx += 1
                    continue

                # Non-standard hunk line, keep parsing resilient.
                idx += 1

            current_file.hunks.append(
                Hunk(
                    old_start=old_start,
                    old_lines=old_lines,
                    new_start=new_start,
                    new_lines=new_lines,
                    header=header,
                    raw_text="\n".join(raw_hunk_lines),
                    lines=hunk_lines,
                )
            )
            continue

        idx += 1

    if current_file is not None:
        files.append(current_file)

    # Normalize paths at end.
    for file_diff in files:
        file_diff.path_old = _normalize_diff_path(file_diff.path_old or "") if file_diff.path_old else None
        normalized_new = _normalize_diff_path(file_diff.path_new)
        if normalized_new is None:
            # Deleted files can still be referenced by old path for downstream consumers.
            if file_diff.path_old:
                normalized_new = file_diff.path_old
            else:
                raise DiffParseError("Unable to resolve path_new for parsed file")
        file_diff.path_new = normalized_new

    if not has_any_diff_header and not any(file_diff.hunks for file_diff in files):
        raise DiffParseError("Invalid unified diff format")

    return ParsedDiff(files=files)

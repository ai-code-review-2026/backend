from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class AnalysisHunkLineData:
    id: str
    hunk_id: str
    line_type: str
    content: str
    old_line_no: int | None
    new_line_no: int | None


@dataclass(frozen=True)
class AnalysisHunkData:
    id: str
    analysis_file_id: str
    old_start: int
    old_lines: int
    new_start: int
    new_lines: int
    header: str | None
    raw_text: str | None
    lines: list[AnalysisHunkLineData] = field(default_factory=list)


@dataclass(frozen=True)
class AnalysisFileData:
    id: str
    analysis_id: str
    path_old: str | None
    path_new: str
    change_type: str
    is_binary: bool
    additions_count: int
    deletions_count: int
    hunks: list[AnalysisHunkData] = field(default_factory=list)

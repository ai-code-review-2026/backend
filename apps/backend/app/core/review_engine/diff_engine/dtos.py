from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class HunkLine(BaseModel):
    model_config = ConfigDict(extra="forbid")

    line_type: Literal["context", "add", "remove"]
    content: str
    old_line_no: int | None = None
    new_line_no: int | None = None


class Hunk(BaseModel):
    model_config = ConfigDict(extra="forbid")

    old_start: int = Field(ge=0)
    old_lines: int = Field(ge=0)
    new_start: int = Field(ge=0)
    new_lines: int = Field(ge=0)
    header: str | None = None
    raw_text: str | None = None
    lines: list[HunkLine] = Field(default_factory=list)


class FileDiff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    path_old: str | None = None
    path_new: str
    change_type: Literal["added", "modified", "deleted", "renamed"] = "modified"
    is_binary: bool = False
    additions_count: int = Field(default=0, ge=0)
    deletions_count: int = Field(default=0, ge=0)
    hunks: list[Hunk] = Field(default_factory=list)


class ParsedDiff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    files: list[FileDiff] = Field(default_factory=list)

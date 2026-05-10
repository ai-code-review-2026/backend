from __future__ import annotations


from dataclasses import dataclass


@dataclass(frozen=True)
class ToolRun:
    id: str
    analysis_id: str
    tool_name: str
    status: str
    started_at: str
    finished_at: str | None
    duration_ms: int
    exit_code: int | None
    findings_count: int
    scanned_files: int
    version: str | None
    warning: str | None
    command: str | None
    workspace_path: str | None
    stdout_snippet: str | None
    stderr_snippet: str | None
    created_at: str

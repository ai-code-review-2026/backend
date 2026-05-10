from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Protocol


StaticSeverity = Literal["INFO", "WARN", "BLOCKER"]
StaticCategory = Literal["security", "quality", "style", "perf", "maintainability", "other"]
StaticToolName = str  # e.g. "ruff", "semgrep", "clean_code", "eslint", "rubocop", ...
StaticSourceName = str  # e.g. "STATIC_RUFF", "STATIC_ESLINT", ...


@dataclass(frozen=True)
class StaticRawFinding:
    tool: str
    rule_id: str
    file_path: str
    line_start: int | None
    line_end: int | None
    severity: str
    message: str
    suggestion: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class StaticFinding:
    source: StaticSourceName
    rule_id: str
    file_path: str
    line_start: int | None
    line_end: int | None
    severity: StaticSeverity
    category: StaticCategory
    message: str
    suggestion: str | None
    confidence: float
    evidence: dict[str, Any]


@dataclass(frozen=True)
class StaticToolResult:
    tool: str
    findings: list[StaticRawFinding]
    duration_ms: int
    scanned_files: int
    version: str | None
    status: Literal["SUCCESS", "FAILED", "SKIPPED"] = "SUCCESS"
    started_at: str | None = None
    finished_at: str | None = None
    exit_code: int | None = None
    command: list[str] = field(default_factory=list)
    workspace_path: str | None = None
    stdout_snippet: str | None = None
    stderr_snippet: str | None = None
    warning: str | None = None
    stats: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class StaticAnalysisResult:
    findings: list[StaticFinding]
    stats: dict[str, Any]
    warnings: list[str]
    tool_runs: list[StaticToolResult] = field(default_factory=list)


class StaticToolAnalyzer(Protocol):
    tool_name: str

    def run(
        self,
        *,
        paths: list[str],
        workspace: str,
        timeout_seconds: int,
        parsed: Any | None = None,
        repo: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> StaticToolResult: ...

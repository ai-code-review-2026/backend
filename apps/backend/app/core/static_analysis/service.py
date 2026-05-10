from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import Iterable

from app.core.review_engine.diff_engine import ParsedDiff
from app.core.static_analysis.base import (
    StaticAnalysisResult,
    StaticFinding,
    StaticRawFinding,
    StaticToolResult,
    StaticToolAnalyzer,
)
from app.core.static_analysis.filtering import (
    build_changed_lines_map,
    filter_findings_to_changed_lines,
    normalize_diff_path,
)
from app.core.static_analysis.normalizer import normalize_raw_finding


_IGNORED_PATH_PARTS = {
    ".git",
    ".venv",
    "venv",
    "node_modules",
    "site-packages",
    "__pycache__",
    ".mypy_cache",
    ".ruff_cache",
    ".pytest_cache",
    ".next",
    "dist",
    "build",
    "vendor",
}


def _is_scannable_diff_path(path: str) -> bool:
    normalized = normalize_diff_path(path)
    if not normalized:
        return False
    parts = [part.strip().lower() for part in Path(normalized).parts if part and part.strip()]
    if not parts:
        return False
    return not any(part in _IGNORED_PATH_PARTS for part in parts)


def _normalize_tool_path(path: str, workspace: Path) -> str:
    raw = path.strip()
    if not raw:
        return ""
    raw_path = Path(raw)
    if not raw_path.is_absolute():
        return normalize_diff_path(raw)
    try:
        return raw_path.resolve().relative_to(workspace.resolve()).as_posix()
    except Exception:
        return raw_path.as_posix()


def _dedupe_findings(findings: Iterable[StaticFinding]) -> list[StaticFinding]:
    dedup: OrderedDict[tuple[str, str, str, int | None, str], StaticFinding] = OrderedDict()
    for finding in findings:
        key = (finding.source, finding.rule_id, finding.file_path, finding.line_start, finding.message)
        dedup.setdefault(key, finding)
    return list(dedup.values())


class StaticAnalysisService:
    def __init__(self, analyzers: list[StaticToolAnalyzer]) -> None:
        self._analyzers = analyzers

    def run(
        self,
        *,
        parsed: ParsedDiff,
        workspace_path: str,
        timeout_seconds: int,
        max_files: int,
        max_findings: int,
        filter_changed_lines: bool,
        repo: str | None = None,
        metadata: dict[str, object] | None = None,
    ) -> StaticAnalysisResult:
        workspace = Path(workspace_path).resolve()
        target_rel_paths: list[str] = []
        seen: set[str] = set()
        for file_item in parsed.files:
            if file_item.is_binary:
                continue
            rel = normalize_diff_path(file_item.path_new)
            if not _is_scannable_diff_path(rel):
                continue
            if not rel or rel in seen:
                continue
            seen.add(rel)
            target_rel_paths.append(rel)
            if len(target_rel_paths) >= max_files:
                break

        existing_abs_paths: list[str] = []
        missing_paths: list[str] = []
        for rel in target_rel_paths:
            abs_path = (workspace / rel).resolve()
            if abs_path.exists() and abs_path.is_file():
                existing_abs_paths.append(str(abs_path))
            else:
                missing_paths.append(rel)

        warnings: list[str] = []
        tools_stats: dict[str, dict[str, object]] = {}
        engine_stats: dict[str, object] = {}
        normalized_findings: list[StaticFinding] = []
        tool_runs: list[StaticToolResult] = []

        for analyzer in self._analyzers:
            result = analyzer.run(
                paths=existing_abs_paths,
                workspace=str(workspace),
                timeout_seconds=timeout_seconds,
                parsed=parsed,
                repo=repo,
                metadata=metadata,
            )
            tool_runs.append(result)
            if result.warning:
                warnings.append(f"{result.tool}: {result.warning}")

            tools_stats[result.tool] = {
                "count": len(result.findings),
                "duration_ms": result.duration_ms,
                "version": result.version,
                "scanned_files": result.scanned_files,
                "warning": result.warning,
                "status": result.status,
                "exit_code": result.exit_code,
            }
            if result.stats:
                engine_stats[result.tool] = result.stats

            for raw in result.findings:
                normalized_path = _normalize_tool_path(raw.file_path, workspace)
                if not normalized_path:
                    continue
                normalized_raw = StaticRawFinding(
                    tool=raw.tool,
                    rule_id=raw.rule_id,
                    file_path=normalized_path,
                    line_start=raw.line_start,
                    line_end=raw.line_end,
                    severity=raw.severity,
                    message=raw.message,
                    suggestion=raw.suggestion,
                    evidence=raw.evidence,
                )
                normalized_findings.append(normalize_raw_finding(normalized_raw))

        deduped = _dedupe_findings(normalized_findings)
        filtered_out = 0
        if filter_changed_lines:
            changed_lines_map = build_changed_lines_map(parsed)
            deduped, filtered_out = filter_findings_to_changed_lines(deduped, changed_lines_map)

        if len(deduped) > max_findings:
            filtered_out += len(deduped) - max_findings
            deduped = deduped[:max_findings]

        stats = {
            "scanned_files": len(existing_abs_paths),
            "missing_files": missing_paths,
            "filtered_out": filtered_out,
            "findings_count": len(deduped),
            "tools": tools_stats,
        }
        stats.update(engine_stats)
        return StaticAnalysisResult(findings=deduped, stats=stats, warnings=warnings, tool_runs=tool_runs)

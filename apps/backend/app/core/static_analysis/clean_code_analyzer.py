from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any, Literal

from app.core.clean_code import CleanCodeRuleEngine
from app.core.static_analysis.base import StaticRawFinding, StaticToolResult
from app.settings import settings


class CleanCodeAnalyzer:
    tool_name = "clean_code"

    def __init__(self, engine: CleanCodeRuleEngine | None = None) -> None:
        self._engine = engine or CleanCodeRuleEngine()

    def run(
        self,
        *,
        paths: list[str],
        workspace: str,
        timeout_seconds: int,
        parsed: Any | None = None,
        repo: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> StaticToolResult:
        _ = timeout_seconds
        started = time.perf_counter()
        started_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        command = ["internal:clean_code_rule_engine"]

        if not settings.CLEAN_CODE_RULE_ENGINE_ENABLED:
            return StaticToolResult(
                tool="clean_code",
                findings=[],
                duration_ms=0,
                scanned_files=0,
                version="rule-engine-v1",
                status="SKIPPED",
                started_at=started_at,
                finished_at=started_at,
                command=command,
                workspace_path=workspace,
                warning="clean code rule engine disabled",
                stats={"enabled": False, "mode": "rule_engine", "files_scanned": 0, "findings_count": 0},
            )

        warning: str | None = None
        status: Literal["SUCCESS", "FAILED", "SKIPPED"] = "SUCCESS"
        raw_findings: list[StaticRawFinding] = []
        stats: dict[str, Any] = {}
        try:
            result = self._engine.analyze(
                paths=paths,
                workspace=workspace,
                parsed=parsed,
                repo=repo,
                metadata=metadata,
            )
            stats = result.stats
            if result.warnings:
                warning = "; ".join(result.warnings[:3])
            if result.self_repo_skipped:
                status = "SKIPPED"
            raw_findings = [
                StaticRawFinding(
                    tool="clean_code",
                    rule_id=item.rule_id,
                    file_path=item.file_path,
                    line_start=item.line_start,
                    line_end=item.line_end,
                    severity=item.severity,
                    message=item.message,
                    suggestion=item.suggestion,
                    evidence=item.evidence,
                )
                for item in result.findings
            ]
        except Exception:
            status = "FAILED"
            warning = "clean code rule engine failed"
            stats = {"enabled": True, "mode": "rule_engine", "files_scanned": 0, "findings_count": 0, "scan_failed": True}

        duration_ms = int((time.perf_counter() - started) * 1000)
        finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return StaticToolResult(
            tool="clean_code",
            findings=raw_findings,
            duration_ms=duration_ms,
            scanned_files=int(stats.get("files_scanned", len(paths))),
            version="rule-engine-v1",
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            exit_code=None,
            command=command,
            workspace_path=workspace,
            warning=warning,
            stats=stats,
        )

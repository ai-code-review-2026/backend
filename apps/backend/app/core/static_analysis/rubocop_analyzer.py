from __future__ import annotations

import json
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from app.core.static_analysis.base import StaticRawFinding, StaticToolResult
from app.core.static_analysis.cli_utils import chunk_paths_for_command


_RUBY_EXTENSIONS = frozenset({".rb", ".rake"})

# RuboCop severity → StaticSeverity mapping
_SEVERITY_MAP: dict[str, str] = {
    "convention": "INFO",
    "refactor": "INFO",
    "warning": "WARN",
    "error": "BLOCKER",
    "fatal": "BLOCKER",
}


def _parse_rubocop_output(stdout: str) -> list[StaticRawFinding]:
    text = stdout.strip()
    if not text:
        return []

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return []

    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []

    findings: list[StaticRawFinding] = []
    for file_result in data.get("files") or []:
        if not isinstance(file_result, dict):
            continue
        file_path = str(file_result.get("path") or "")
        for offense in file_result.get("offenses") or []:
            if not isinstance(offense, dict):
                continue
            cop_name = str(offense.get("cop_name") or "rubocop")
            message = str(offense.get("message") or "RuboCop finding")
            location = offense.get("location") or {}
            line_start = location.get("start_line") or location.get("line")
            line_end = location.get("last_line", line_start)
            raw_severity = str(offense.get("severity") or "warning").lower()
            severity = _SEVERITY_MAP.get(raw_severity, "WARN")
            findings.append(
                StaticRawFinding(
                    tool="rubocop",
                    rule_id=cop_name,
                    file_path=file_path,
                    line_start=int(line_start) if isinstance(line_start, int) else None,
                    line_end=int(line_end) if isinstance(line_end, int) else None,
                    severity=severity,
                    message=message,
                    suggestion=None,
                    evidence={"tool": "rubocop", "raw_severity": raw_severity},
                )
            )
    return findings


class RubocopAnalyzer:
    tool_name = "rubocop"

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
        _ = parsed, repo, metadata
        started = time.perf_counter()
        started_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

        ruby_paths = [p for p in paths if Path(p).suffix.lower() in _RUBY_EXTENSIONS]
        if not ruby_paths:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="rubocop",
                findings=[],
                duration_ms=0,
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="rubocop skipped: no Ruby files to scan",
            )

        rubocop_bin = shutil.which("rubocop")
        if not rubocop_bin:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="rubocop",
                findings=[],
                duration_ms=int((time.perf_counter() - started) * 1000),
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="rubocop is not installed",
            )

        warnings: list[str] = []
        findings: list[StaticRawFinding] = []
        version: str | None = None
        exit_code: int | None = None
        stdout_snippet: str | None = None
        stderr_snippet: str | None = None
        status: Literal["SUCCESS", "FAILED", "SKIPPED"] = "SUCCESS"

        try:
            version_run = subprocess.run(
                [rubocop_bin, "--version"],
                cwd=workspace,
                capture_output=True,
                text=True,
                timeout=max(5, timeout_seconds // 4),
                check=False,
            )
            if version_run.returncode == 0:
                version = version_run.stdout.strip() or None
        except Exception:
            pass

        command_prefix = [rubocop_bin, "--format", "json", "--no-color"]
        path_batches = chunk_paths_for_command(base_command=command_prefix, paths=ruby_paths)
        if not path_batches:
            path_batches = [[]]

        failed_batches = 0
        try:
            for batch_index, batch_paths in enumerate(path_batches, start=1):
                batch_command = [*command_prefix, *batch_paths]
                completed = subprocess.run(
                    batch_command,
                    cwd=workspace,
                    capture_output=True,
                    text=True,
                    timeout=timeout_seconds,
                    check=False,
                )
                exit_code = completed.returncode
                if stdout_snippet is None and completed.stdout:
                    stdout_snippet = completed.stdout[:2000]
                if stderr_snippet is None and completed.stderr:
                    stderr_snippet = completed.stderr[:2000]

                # RuboCop exits 0 (no offenses), 1 (offenses found), 2 (fatal)
                if completed.returncode == 2:
                    failed_batches += 1
                    warnings.append(f"rubocop batch {batch_index} fatal error")

                if completed.stdout.strip():
                    try:
                        batch_findings = _parse_rubocop_output(completed.stdout)
                        findings.extend(batch_findings)
                    except Exception:
                        warnings.append(f"rubocop output parsing failed for batch {batch_index}")

        except FileNotFoundError:
            warnings.append("rubocop is not installed")
            status = "SKIPPED"
        except subprocess.TimeoutExpired:
            warnings.append("rubocop command timed out")
            status = "FAILED"
        except Exception as exc:
            warnings.append(f"rubocop execution failed: {exc}")
            status = "FAILED"

        if failed_batches > 0 and status == "SUCCESS":
            status = "FAILED"

        duration_ms = int((time.perf_counter() - started) * 1000)
        finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return StaticToolResult(
            tool="rubocop",
            findings=findings,
            duration_ms=duration_ms,
            scanned_files=len(ruby_paths),
            version=version,
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            exit_code=exit_code,
            command=[*command_prefix, f"<batched:{len(path_batches)}>"],
            workspace_path=workspace,
            stdout_snippet=stdout_snippet,
            stderr_snippet=stderr_snippet,
            warning="; ".join(warnings) if warnings else None,
            stats={"targets": len(ruby_paths), "failed_batches": failed_batches},
        )

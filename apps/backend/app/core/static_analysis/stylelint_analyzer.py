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


_CSS_EXTENSIONS = frozenset({".css", ".scss", ".sass", ".less"})


def _parse_stylelint_output(stdout: str) -> list[StaticRawFinding]:
    text = stdout.strip()
    if not text:
        return []

    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1:
        return []

    try:
        data = json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return []

    findings: list[StaticRawFinding] = []
    for file_result in data:
        if not isinstance(file_result, dict):
            continue
        file_path = str(file_result.get("source") or "")
        for warning in file_result.get("warnings") or []:
            if not isinstance(warning, dict):
                continue
            rule_id = str(warning.get("rule") or "stylelint")
            message = str(warning.get("text") or "Stylelint finding")
            line_start = warning.get("line")
            line_end = warning.get("endLine", line_start)
            raw_severity = str(warning.get("severity") or "warning")
            severity = "BLOCKER" if raw_severity == "error" else "WARN"
            findings.append(
                StaticRawFinding(
                    tool="stylelint",
                    rule_id=rule_id,
                    file_path=file_path,
                    line_start=int(line_start) if isinstance(line_start, int) else None,
                    line_end=int(line_end) if isinstance(line_end, int) else None,
                    severity=severity,
                    message=message,
                    suggestion=None,
                    evidence={"tool": "stylelint"},
                )
            )
    return findings


class StylelintAnalyzer:
    tool_name = "stylelint"

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

        css_paths = [p for p in paths if Path(p).suffix.lower() in _CSS_EXTENSIONS]
        if not css_paths:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="stylelint",
                findings=[],
                duration_ms=0,
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="stylelint skipped: no CSS/SCSS files to scan",
            )

        stylelint_bin = shutil.which("stylelint")
        if not stylelint_bin:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="stylelint",
                findings=[],
                duration_ms=int((time.perf_counter() - started) * 1000),
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="stylelint is not installed",
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
                [stylelint_bin, "--version"],
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

        command_prefix = [stylelint_bin, "--formatter", "json"]
        path_batches = chunk_paths_for_command(base_command=command_prefix, paths=css_paths)
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

                # stylelint exits 0 (no issues), 1 (lint issues), 2 (fatal)
                if completed.returncode == 2:
                    failed_batches += 1
                    warnings.append(f"stylelint batch {batch_index} fatal error")

                if completed.stdout.strip():
                    try:
                        batch_findings = _parse_stylelint_output(completed.stdout)
                        findings.extend(batch_findings)
                    except Exception:
                        warnings.append(f"stylelint output parsing failed for batch {batch_index}")

        except FileNotFoundError:
            warnings.append("stylelint is not installed")
            status = "SKIPPED"
        except subprocess.TimeoutExpired:
            warnings.append("stylelint command timed out")
            status = "FAILED"
        except Exception as exc:
            warnings.append(f"stylelint execution failed: {exc}")
            status = "FAILED"

        if failed_batches > 0 and status == "SUCCESS":
            status = "FAILED"

        duration_ms = int((time.perf_counter() - started) * 1000)
        finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return StaticToolResult(
            tool="stylelint",
            findings=findings,
            duration_ms=duration_ms,
            scanned_files=len(css_paths),
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
            stats={"targets": len(css_paths), "failed_batches": failed_batches},
        )

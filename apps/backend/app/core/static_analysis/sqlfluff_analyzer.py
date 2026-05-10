from __future__ import annotations

import json
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from app.core.static_analysis.base import StaticRawFinding, StaticToolResult
from app.core.static_analysis.cli_utils import chunk_paths_for_command, resolve_tool_command


def _parse_sqlfluff_output(stdout: str) -> list[StaticRawFinding]:
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
        file_path = str(file_result.get("filepath") or "")
        for violation in file_result.get("violations") or []:
            if not isinstance(violation, dict):
                continue
            code = str(violation.get("code") or "sqlfluff")
            description = str(violation.get("description") or "SQLFluff finding")
            line_no = violation.get("line_no")
            findings.append(
                StaticRawFinding(
                    tool="sqlfluff",
                    rule_id=code,
                    file_path=file_path,
                    line_start=int(line_no) if isinstance(line_no, int) else None,
                    line_end=int(line_no) if isinstance(line_no, int) else None,
                    severity="WARN",
                    message=description,
                    suggestion=None,
                    evidence={"tool": "sqlfluff"},
                )
            )
    return findings


class SqlFluffAnalyzer:
    tool_name = "sqlfluff"

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

        sql_paths = [p for p in paths if Path(p).suffix.lower() == ".sql"]
        if not sql_paths:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="sqlfluff",
                findings=[],
                duration_ms=0,
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="sqlfluff skipped: no SQL files to scan",
            )

        resolved = resolve_tool_command("sqlfluff")
        warnings: list[str] = []
        if resolved.warning:
            warnings.append(resolved.warning)

        findings: list[StaticRawFinding] = []
        version: str | None = None
        exit_code: int | None = None
        stdout_snippet: str | None = None
        stderr_snippet: str | None = None
        status: Literal["SUCCESS", "FAILED", "SKIPPED"] = "SUCCESS"

        try:
            version_run = subprocess.run(
                [*resolved.command_prefix, "--version"],
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

        command_prefix = [*resolved.command_prefix, "lint", "--format", "json"]
        path_batches = chunk_paths_for_command(base_command=command_prefix, paths=sql_paths)
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

                # sqlfluff exits 0 (no issues), 1 (lint failures), 2 (fatal error)
                if completed.returncode == 2:
                    failed_batches += 1
                    warnings.append(f"sqlfluff batch {batch_index} fatal error")

                if completed.stdout.strip():
                    try:
                        batch_findings = _parse_sqlfluff_output(completed.stdout)
                        findings.extend(batch_findings)
                    except Exception:
                        warnings.append(f"sqlfluff output parsing failed for batch {batch_index}")

        except FileNotFoundError:
            warnings.append("sqlfluff is not installed")
            status = "SKIPPED"
        except subprocess.TimeoutExpired:
            warnings.append("sqlfluff command timed out")
            status = "FAILED"
        except Exception as exc:
            warnings.append(f"sqlfluff execution failed: {exc}")
            status = "FAILED"

        if failed_batches > 0 and status == "SUCCESS":
            status = "FAILED"

        duration_ms = int((time.perf_counter() - started) * 1000)
        finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return StaticToolResult(
            tool="sqlfluff",
            findings=findings,
            duration_ms=duration_ms,
            scanned_files=len(sql_paths),
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
            stats={"targets": len(sql_paths), "failed_batches": failed_batches},
        )

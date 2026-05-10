from __future__ import annotations

import json
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from app.core.static_analysis.base import StaticRawFinding, StaticToolResult


def _has_go_module(workspace: str) -> bool:
    return (Path(workspace) / "go.mod").exists()


def _parse_staticcheck_output(stdout: str, workspace: str) -> list[StaticRawFinding]:
    """Parse staticcheck JSON-lines output (one JSON object per line)."""
    findings: list[StaticRawFinding] = []
    workspace_path = Path(workspace).resolve()

    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(item, dict):
            continue

        code = str(item.get("code") or "staticcheck")
        message = str(item.get("message") or "Staticcheck finding")
        location = item.get("location") or {}
        raw_file = str(location.get("file") or "")
        line_start = location.get("line")
        line_end = location.get("end_line", line_start)

        # Normalize path relative to workspace
        file_path = raw_file
        if raw_file:
            try:
                abs_path = Path(raw_file).resolve()
                file_path = abs_path.relative_to(workspace_path).as_posix()
            except Exception:
                file_path = raw_file

        findings.append(
            StaticRawFinding(
                tool="staticcheck",
                rule_id=code,
                file_path=file_path,
                line_start=int(line_start) if isinstance(line_start, int) else None,
                line_end=int(line_end) if isinstance(line_end, int) else None,
                severity="WARN",
                message=message,
                suggestion=None,
                evidence={"tool": "staticcheck"},
            )
        )
    return findings


class StaticcheckAnalyzer:
    tool_name = "staticcheck"

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

        go_paths = [p for p in paths if Path(p).suffix.lower() == ".go"]
        if not go_paths:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="staticcheck",
                findings=[],
                duration_ms=0,
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="staticcheck skipped: no Go files to scan",
            )

        # Staticcheck requires go.mod to resolve packages
        if not _has_go_module(workspace):
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="staticcheck",
                findings=[],
                duration_ms=0,
                scanned_files=len(go_paths),
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="staticcheck skipped: no go.mod found in workspace",
            )

        staticcheck_bin = shutil.which("staticcheck")
        if not staticcheck_bin:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="staticcheck",
                findings=[],
                duration_ms=int((time.perf_counter() - started) * 1000),
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="staticcheck is not installed",
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
                [staticcheck_bin, "-version"],
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

        # Staticcheck must scan at the package level (./...) not individual files
        command = [staticcheck_bin, "-f", "json", "./..."]

        try:
            completed = subprocess.run(
                command,
                cwd=workspace,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                check=False,
            )
            exit_code = completed.returncode
            stdout_snippet = (completed.stdout or "")[:2000]
            stderr_snippet = (completed.stderr or "")[:2000]

            # Exit code 0 = no issues, 1 = issues found, 2 = fatal (crash / compile error)
            if completed.returncode == 2:
                warnings.append("staticcheck fatal error (exit 2) — possible compile error")
                status = "FAILED"
            elif completed.stdout.strip():
                findings = _parse_staticcheck_output(completed.stdout, workspace)

        except FileNotFoundError:
            warnings.append("staticcheck is not installed")
            status = "SKIPPED"
        except subprocess.TimeoutExpired:
            warnings.append("staticcheck command timed out")
            status = "FAILED"
        except Exception as exc:
            warnings.append(f"staticcheck execution failed: {exc}")
            status = "FAILED"

        duration_ms = int((time.perf_counter() - started) * 1000)
        finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return StaticToolResult(
            tool="staticcheck",
            findings=findings,
            duration_ms=duration_ms,
            scanned_files=len(go_paths),
            version=version,
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            exit_code=exit_code,
            command=command,
            workspace_path=workspace,
            stdout_snippet=stdout_snippet,
            stderr_snippet=stderr_snippet,
            warning="; ".join(warnings) if warnings else None,
            stats={"targets": len(go_paths)},
        )

from __future__ import annotations

import json
import subprocess
import time
from datetime import datetime, timezone
from typing import Any, Literal

from app.core.static_analysis.base import StaticRawFinding, StaticToolResult
from app.core.static_analysis.cli_utils import chunk_paths_for_command, resolve_tool_command


def _extract_json_payload(raw: str) -> str:
    text = raw.strip()
    if not text:
        return ""
    if (text.startswith("[") and text.endswith("]")) or (text.startswith("{") and text.endswith("}")):
        return text

    start_candidates = [index for index in (text.find("["), text.find("{")) if index >= 0]
    if not start_candidates:
        return text
    start = min(start_candidates)

    end_candidates = [index for index in (text.rfind("]"), text.rfind("}")) if index >= start]
    if not end_candidates:
        return text
    end = max(end_candidates)
    return text[start : end + 1]


def parse_ruff_output(stdout: str) -> list[StaticRawFinding]:
    payload: Any
    payload_raw = _extract_json_payload(stdout)
    if not payload_raw:
        return []
    payload = json.loads(payload_raw)

    items: Any = payload
    if isinstance(payload, dict):
        items = payload.get("diagnostics")
    if not isinstance(items, list):
        return []

    findings: list[StaticRawFinding] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        rule_id = str(item.get("code") or "RUFF")
        file_path = str(item.get("filename") or "")
        message = str(item.get("message") or "Ruff finding")
        line_start = item.get("location", {}).get("row")
        line_end = item.get("end_location", {}).get("row", line_start)
        fix = item.get("fix")
        suggestion = None
        if isinstance(fix, dict):
            suggestion = str(fix.get("message") or "") or None
        findings.append(
            StaticRawFinding(
                tool="ruff",
                rule_id=rule_id,
                file_path=file_path,
                line_start=int(line_start) if isinstance(line_start, int) else None,
                line_end=int(line_end) if isinstance(line_end, int) else None,
                severity="WARN",
                message=message,
                suggestion=suggestion,
                evidence={"tool": "ruff"},
            )
        )
    return findings


def parse_ruff_output_json_lines(stdout: str) -> list[StaticRawFinding]:
    findings: list[StaticRawFinding] = []
    for raw_line in stdout.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if not line.startswith("{"):
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if not isinstance(item, dict):
            continue

        rule_id = str(item.get("code") or "RUFF")
        file_path = str(item.get("filename") or "")
        message = str(item.get("message") or "Ruff finding")
        location = item.get("location") if isinstance(item.get("location"), dict) else {}
        end_location = item.get("end_location") if isinstance(item.get("end_location"), dict) else {}
        line_start = location.get("row")
        line_end = end_location.get("row", line_start)
        fix = item.get("fix")
        suggestion = None
        if isinstance(fix, dict):
            suggestion = str(fix.get("message") or "") or None

        findings.append(
            StaticRawFinding(
                tool="ruff",
                rule_id=rule_id,
                file_path=file_path,
                line_start=int(line_start) if isinstance(line_start, int) else None,
                line_end=int(line_end) if isinstance(line_end, int) else None,
                severity="WARN",
                message=message,
                suggestion=suggestion,
                evidence={"tool": "ruff"},
            )
        )
    return findings


class RuffAnalyzer:
    tool_name = "ruff"

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
        _ = parsed
        _ = repo
        _ = metadata
        started = time.perf_counter()
        started_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        if not paths:
            return StaticToolResult(
                tool="ruff",
                findings=[],
                duration_ms=0,
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=started_at,
                command=[],
                workspace_path=workspace,
            )

        python_paths = [path for path in paths if path.lower().endswith((".py", ".pyi"))]
        if not python_paths:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="ruff",
                findings=[],
                duration_ms=0,
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="ruff skipped: no Python files to scan",
            )

        resolved = resolve_tool_command("ruff")
        command_prefix = [*resolved.command_prefix, "check", "--output-format=json"]
        path_batches = chunk_paths_for_command(base_command=command_prefix, paths=python_paths)

        warning: str | None = None
        findings: list[StaticRawFinding] = []
        version: str | None = None
        exit_code: int | None = None
        stdout_snippet: str | None = None
        stderr_snippet: str | None = None
        status: Literal["SUCCESS", "FAILED", "SKIPPED"] = "SUCCESS"
        warnings: list[str] = []
        if resolved.warning:
            warnings.append(resolved.warning)

        try:
            version_run = subprocess.run(
                [*resolved.command_prefix, "--version"],
                cwd=workspace,
                capture_output=True,
                text=True,
                timeout=max(5, timeout_seconds // 2),
                check=False,
            )
            if version_run.returncode == 0:
                version = version_run.stdout.strip() or None
            elif version_run.stderr.strip() or version_run.stdout.strip():
                warnings.append("ruff version probe failed")
        except Exception:
            version = None

        failed_batches = 0
        parse_failed_batches = 0
        last_exit_code: int | None = None
        if not path_batches:
            path_batches = [[]]

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
                last_exit_code = completed.returncode
                if stdout_snippet is None and completed.stdout:
                    stdout_snippet = completed.stdout[:2000]
                if stderr_snippet is None and completed.stderr:
                    stderr_snippet = completed.stderr[:2000]

                if completed.returncode not in (0, 1):
                    failed_batches += 1
                    warnings.append(f"ruff batch {batch_index}/{len(path_batches)} failed (exit {completed.returncode})")

                batch_output = completed.stdout or ""
                batch_findings: list[StaticRawFinding] = []
                parsed_ok = False

                if batch_output.strip():
                    # Try standard JSON array format first
                    try:
                        batch_findings = parse_ruff_output(batch_output)
                        parsed_ok = True
                    except Exception:
                        parsed_ok = False

                    # If that fails, try JSON-lines format (one JSON object per line)
                    if not parsed_ok:
                        try:
                            batch_findings = parse_ruff_output_json_lines(batch_output)
                            parsed_ok = bool(batch_findings) or batch_output.strip().startswith("{")
                        except Exception:
                            parsed_ok = False

                # Exit code 1 with empty stdout is normal when no issues found
                # but could also indicate a config/parse error - check stderr
                if not parsed_ok and completed.returncode == 1 and not batch_output.strip():
                    stderr_text = (completed.stderr or "").strip()
                    if stderr_text and not stderr_text.startswith("warning:"):
                        # Actual error in stderr
                        parse_failed_batches += 1
                        warnings.append(
                            f"ruff batch {batch_index}/{len(path_batches)} returned no output (stderr: {stderr_text[:100]})"
                        )
                    # else: empty output with exit 1 and no error = no findings, that's OK
                    parsed_ok = True  # Don't fail just because there's no output
                elif not parsed_ok and completed.returncode == 1:
                    parse_failed_batches += 1
                    warnings.append(
                        f"ruff output parsing failed for batch {batch_index}/{len(path_batches)}"
                    )

                findings.extend(batch_findings)

            exit_code = last_exit_code
            if failed_batches > 0 or parse_failed_batches > 0:
                status = "FAILED"
        except FileNotFoundError:
            warnings.append("ruff is not installed")
            status = "FAILED"
        except subprocess.TimeoutExpired:
            warnings.append("ruff command timed out")
            status = "FAILED"
        except Exception:
            warnings.append("ruff execution failed")
            status = "FAILED"

        if not findings and status == "FAILED" and not warnings:
            warnings.append("ruff command failed")

        warning = "; ".join(warnings) if warnings else None

        duration_ms = int((time.perf_counter() - started) * 1000)
        finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return StaticToolResult(
            tool="ruff",
            findings=findings,
            duration_ms=duration_ms,
            scanned_files=len(python_paths),
            version=version,
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            exit_code=exit_code,
            command=[
                *command_prefix,
                f"<batched:{len(path_batches)}>",
                f"<targets:{len(python_paths)}>",
            ],
            workspace_path=workspace,
            stdout_snippet=stdout_snippet,
            stderr_snippet=stderr_snippet,
            warning=warning,
            stats={
                "batches": len(path_batches),
                "targets": len(python_paths),
                "failed_batches": failed_batches,
                "parse_failed_batches": parse_failed_batches,
                "resolved_command": resolved.resolved_path,
                "resolution_source": resolved.source,
            },
        )

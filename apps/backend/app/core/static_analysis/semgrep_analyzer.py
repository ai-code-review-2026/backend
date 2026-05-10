from __future__ import annotations

import json
import subprocess
import time
from datetime import datetime, timezone
from typing import Any, Literal

from app.core.static_analysis.base import StaticRawFinding, StaticToolResult
from app.core.static_analysis.cli_utils import resolve_tool_command

# Max include patterns before switching to scanning entire workspace
_MAX_INCLUDE_PATTERNS = 50


def _build_include_patterns(paths: list[str], workspace: str) -> list[str]:
    """
    Build --include patterns for semgrep from target file paths.
    
    Instead of passing all file paths directly (which hits Windows command line limits
    and causes repeated rule downloads per batch), we derive include patterns that
    semgrep can use to filter its workspace scan.
    
    Strategy:
    - If few unique files, use exact relative paths as patterns
    - If many files, use directory-based patterns or extension patterns
    """
    from pathlib import Path
    
    workspace_path = Path(workspace).resolve()
    relative_paths: list[str] = []
    
    for p in paths:
        try:
            abs_path = Path(p).resolve()
            rel = abs_path.relative_to(workspace_path)
            # Use forward slashes for semgrep patterns
            relative_paths.append(rel.as_posix())
        except (ValueError, OSError):
            # Path not relative to workspace, skip
            continue
    
    if not relative_paths:
        return []
    
    # If we have a manageable number of files, use them directly
    if len(relative_paths) <= _MAX_INCLUDE_PATTERNS:
        return relative_paths
    
    # Too many files - use directory patterns instead
    # Group by parent directory and create patterns
    dirs: set[str] = set()
    for rel in relative_paths:
        parts = rel.split("/")
        if len(parts) > 1:
            # Use top-level directory pattern
            dirs.add(f"{parts[0]}/**")
        else:
            # Root-level file, include directly
            dirs.add(rel)
    
    patterns = list(dirs)
    
    # If still too many patterns, just scan everything (no --include)
    if len(patterns) > _MAX_INCLUDE_PATTERNS:
        return []
    
    return patterns


def _extract_json_payload(raw: str) -> str:
    text = raw.strip()
    if not text:
        return ""
    if (text.startswith("[") and text.endswith("]")) or (text.startswith("{") and text.endswith("}")):
        return text

    start_candidates = [index for index in (text.find("{"), text.find("[")) if index >= 0]
    if not start_candidates:
        return text
    start = min(start_candidates)

    end_candidates = [index for index in (text.rfind("}"), text.rfind("]")) if index >= start]
    if not end_candidates:
        return text
    end = max(end_candidates)
    return text[start : end + 1]


def parse_semgrep_output(stdout: str) -> list[StaticRawFinding]:
    payload_raw = _extract_json_payload(stdout)
    if not payload_raw:
        return []
    payload: Any = json.loads(payload_raw)
    if not isinstance(payload, dict):
        return []
    results = payload.get("results", [])
    if not isinstance(results, list):
        return []

    findings: list[StaticRawFinding] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        extra = item.get("extra") or {}
        start = item.get("start") or {}
        end = item.get("end") or {}
        metadata = extra.get("metadata") if isinstance(extra, dict) else {}
        metadata = metadata if isinstance(metadata, dict) else {}

        findings.append(
            StaticRawFinding(
                tool="semgrep",
                rule_id=str(item.get("check_id") or "semgrep.rule"),
                file_path=str(item.get("path") or ""),
                line_start=int(start.get("line")) if isinstance(start.get("line"), int) else None,
                line_end=int(end.get("line")) if isinstance(end.get("line"), int) else None,
                severity=str(extra.get("severity") or "WARNING"),
                message=str(extra.get("message") or "Semgrep finding"),
                suggestion=None,
                evidence={
                    "tool": "semgrep",
                    "metadata_category": metadata.get("category"),
                },
            )
        )
    return findings


class SemgrepAnalyzer:
    tool_name = "semgrep"

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
                tool="semgrep",
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

        resolved = resolve_tool_command("semgrep")
        # Use workspace-based scan with --include patterns instead of listing all files.
        # This avoids: (1) Windows command line length limits, (2) repeated rule downloads
        # per batch when using --config=auto. Semgrep will scan workspace and filter.
        include_patterns = _build_include_patterns(paths, workspace)
        command = [
            *resolved.command_prefix,
            "scan",
            "--config=auto",
            "--json",
            "--quiet",
            "--timeout",
            str(timeout_seconds),
        ]
        for pattern in include_patterns:
            command.extend(["--include", pattern])
        command.append(workspace)

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
                timeout=15,
                check=False,
            )
            if version_run.returncode == 0:
                version = version_run.stdout.strip().split("\n")[0] or None
            elif version_run.stderr.strip() or version_run.stdout.strip():
                warnings.append("semgrep version probe failed")
        except Exception:
            version = None

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
            stdout_snippet = completed.stdout[:2000] if completed.stdout else None
            stderr_snippet = completed.stderr[:2000] if completed.stderr else None

            if completed.returncode not in (0, 1):
                # Exit code 2 often means "invalid scanning root" or config error
                warnings.append(f"semgrep exited with code {completed.returncode}")
                # Try to extract error message from JSON output
                try:
                    err_payload = json.loads(_extract_json_payload(completed.stdout or completed.stderr or ""))
                    errors = err_payload.get("errors", [])
                    if errors and isinstance(errors, list):
                        err_msgs = [str(e.get("message", "")) for e in errors[:3] if isinstance(e, dict)]
                        if err_msgs:
                            warnings.append("; ".join(filter(None, err_msgs)))
                except Exception:
                    pass
                status = "FAILED"

            payload = completed.stdout or completed.stderr
            try:
                findings = parse_semgrep_output(payload)
            except Exception:
                warnings.append("semgrep output parsing failed")
                findings = []
                if status != "FAILED":
                    status = "FAILED"

        except FileNotFoundError:
            warnings.append("semgrep is not installed or not in PATH")
            status = "FAILED"
        except subprocess.TimeoutExpired:
            warnings.append(f"semgrep command timed out after {timeout_seconds}s")
            status = "FAILED"
        except OSError as e:
            # Catch Windows command line too long errors
            warnings.append(f"semgrep execution failed: {e}")
            status = "FAILED"
        except Exception as e:
            warnings.append(f"semgrep execution failed: {type(e).__name__}")
            status = "FAILED"

        if not findings and status == "FAILED" and not warnings:
            warnings.append("semgrep command failed")

        warning = "; ".join(warnings) if warnings else None

        duration_ms = int((time.perf_counter() - started) * 1000)
        finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return StaticToolResult(
            tool="semgrep",
            findings=findings,
            duration_ms=duration_ms,
            scanned_files=len(paths),
            version=version,
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            exit_code=exit_code,
            command=command,
            workspace_path=workspace,
            stdout_snippet=stdout_snippet,
            stderr_snippet=stderr_snippet,
            warning=warning,
            stats={
                "targets": len(paths),
                "include_patterns": len(include_patterns),
                "resolved_command": resolved.resolved_path,
                "resolution_source": resolved.source,
            },
        )

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


_JS_EXTENSIONS = frozenset({".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"})
_ESLINT_CONFIG_NAMES = frozenset({
    ".eslintrc",
    ".eslintrc.js",
    ".eslintrc.cjs",
    ".eslintrc.yaml",
    ".eslintrc.yml",
    ".eslintrc.json",
    "eslint.config.js",
    "eslint.config.mjs",
    "eslint.config.cjs",
    "eslint.config.ts",
})


def _has_eslint_config(workspace: str) -> bool:
    workspace_path = Path(workspace)
    return any((workspace_path / name).exists() for name in _ESLINT_CONFIG_NAMES)


def _parse_eslint_output(stdout: str) -> list[StaticRawFinding]:
    text = stdout.strip()
    if not text:
        return []

    # ESLint --format json outputs a JSON array
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
        file_path = str(file_result.get("filePath") or "")
        messages = file_result.get("messages") or []
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            rule_id = str(msg.get("ruleId") or "eslint")
            message = str(msg.get("message") or "ESLint finding")
            line_start = msg.get("line")
            line_end = msg.get("endLine", line_start)
            # ESLint severity: 1 = warning, 2 = error
            raw_severity = int(msg.get("severity") or 1)
            severity = "BLOCKER" if raw_severity >= 2 else "WARN"
            findings.append(
                StaticRawFinding(
                    tool="eslint",
                    rule_id=rule_id,
                    file_path=file_path,
                    line_start=int(line_start) if isinstance(line_start, int) else None,
                    line_end=int(line_end) if isinstance(line_end, int) else None,
                    severity=severity,
                    message=message,
                    suggestion=None,
                    evidence={"tool": "eslint", "raw_severity": raw_severity},
                )
            )
    return findings


class EslintAnalyzer:
    tool_name = "eslint"

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

        js_paths = [p for p in paths if Path(p).suffix.lower() in _JS_EXTENSIONS]
        if not js_paths:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="eslint",
                findings=[],
                duration_ms=0,
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="eslint skipped: no JS/TS files to scan",
            )

        # Skip gracefully if no ESLint config is present (avoids noisy failures)
        if not _has_eslint_config(workspace):
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="eslint",
                findings=[],
                duration_ms=0,
                scanned_files=len(js_paths),
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="eslint skipped: no ESLint config file found in workspace",
            )

        eslint_bin = shutil.which("eslint")
        if not eslint_bin:
            finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            return StaticToolResult(
                tool="eslint",
                findings=[],
                duration_ms=int((time.perf_counter() - started) * 1000),
                scanned_files=0,
                version=None,
                status="SKIPPED",
                started_at=started_at,
                finished_at=finished_at,
                command=[],
                workspace_path=workspace,
                warning="eslint is not installed",
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
                [eslint_bin, "--version"],
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

        command_prefix = [eslint_bin, "--format", "json"]
        path_batches = chunk_paths_for_command(base_command=command_prefix, paths=js_paths)
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

                # ESLint exits 0 (no issues), 1 (issues found), 2 (fatal error)
                if completed.returncode == 2:
                    failed_batches += 1
                    warnings.append(
                        f"eslint batch {batch_index}/{len(path_batches)} fatal error (exit 2)"
                    )

                if completed.stdout.strip():
                    try:
                        batch_findings = _parse_eslint_output(completed.stdout)
                        findings.extend(batch_findings)
                    except Exception:
                        warnings.append(f"eslint output parsing failed for batch {batch_index}")

        except FileNotFoundError:
            warnings.append("eslint is not installed")
            status = "SKIPPED"
        except subprocess.TimeoutExpired:
            warnings.append("eslint command timed out")
            status = "FAILED"
        except Exception as exc:
            warnings.append(f"eslint execution failed: {exc}")
            status = "FAILED"

        if failed_batches > 0 and status == "SUCCESS":
            status = "FAILED"

        duration_ms = int((time.perf_counter() - started) * 1000)
        finished_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return StaticToolResult(
            tool="eslint",
            findings=findings,
            duration_ms=duration_ms,
            scanned_files=len(js_paths),
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
            stats={"targets": len(js_paths), "failed_batches": failed_batches},
        )

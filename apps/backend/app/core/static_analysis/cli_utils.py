from __future__ import annotations

import os
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

WINDOWS_CREATE_PROCESS_LIMIT = 32767
COMMAND_LENGTH_SAFETY_MARGIN = 4096
DEFAULT_MAX_COMMAND_CHARS = WINDOWS_CREATE_PROCESS_LIMIT - COMMAND_LENGTH_SAFETY_MARGIN


@dataclass(frozen=True)
class ResolvedToolCommand:
    command_prefix: list[str]
    resolved_path: str | None
    source: str
    warning: str | None = None


def _estimate_command_chars(parts: list[str]) -> int:
    # Approximate shell quoting overhead per arg.
    return sum(len(part) + 3 for part in parts)


def chunk_paths_for_command(
    *,
    base_command: list[str],
    paths: list[str],
    max_command_chars: int = DEFAULT_MAX_COMMAND_CHARS,
    max_paths_per_batch: int = 120,
) -> list[list[str]]:
    if not paths:
        return []

    batches: list[list[str]] = []
    current_batch: list[str] = []
    base_len = _estimate_command_chars(base_command)
    current_len = base_len

    for path in paths:
        path_cost = len(path) + 3
        would_overflow = current_batch and current_len + path_cost > max_command_chars
        would_exceed_batch_size = current_batch and len(current_batch) >= max_paths_per_batch
        if would_overflow or would_exceed_batch_size:
            batches.append(current_batch)
            current_batch = []
            current_len = base_len

        current_batch.append(path)
        current_len += path_cost

    if current_batch:
        batches.append(current_batch)
    return batches


def resolve_tool_command(tool: str) -> ResolvedToolCommand:
    direct = shutil.which(tool)
    if direct:
        return ResolvedToolCommand(
            command_prefix=[direct],
            resolved_path=direct,
            source="path",
        )

    script_name = f"{tool}.exe" if os.name == "nt" else tool
    python_scripts_candidate = Path(sys.executable).resolve().parent / script_name
    if python_scripts_candidate.exists():
        candidate = str(python_scripts_candidate)
        return ResolvedToolCommand(
            command_prefix=[candidate],
            resolved_path=candidate,
            source="python-scripts",
        )

    return ResolvedToolCommand(
        command_prefix=[sys.executable, "-m", tool],
        resolved_path=None,
        source="python-module",
        warning=f"{tool} executable not found in PATH; using 'python -m {tool}' fallback",
    )

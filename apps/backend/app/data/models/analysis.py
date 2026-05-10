from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass
class Analysis:
    id: str
    repo: str
    provider: str
    pr_number: int | None
    commit_sha: str | None
    source: str
    status: str
    stage: str | None
    progress: int | None
    nb_files_changed: int | None
    additions_total: int | None
    deletions_total: int | None
    diff_hash: str
    diff_raw: str
    summary: str | None
    diff_redacted: str | None
    has_secrets: bool
    redaction_stats_json: str
    static_stats_json: str
    change_type: str | None
    change_type_confidence: float | None
    change_type_source: str | None
    change_type_signals_json: str
    error_code: str | None
    error_message: str | None
    created_at: str
    updated_at: str
    metadata_json: str
    findings_count: int = 0
    blocker_count: int = 0
    warn_count: int = 0
    info_count: int = 0
    project_id: str | None = None

    @property
    def metadata(self) -> dict[str, Any]:
        try:
            return json.loads(self.metadata_json)
        except Exception:
            return {}

    @property
    def redaction_stats(self) -> dict[str, Any]:
        try:
            return json.loads(self.redaction_stats_json)
        except Exception:
            return {}

    @property
    def static_stats(self) -> dict[str, Any]:
        try:
            return json.loads(self.static_stats_json)
        except Exception:
            return {}

    @property
    def change_type_signals(self) -> dict[str, Any]:
        try:
            return json.loads(self.change_type_signals_json)
        except Exception:
            return {}

    @property
    def diff_text(self) -> str:
        # Backward-compatible alias for older code paths.
        return self.diff_raw

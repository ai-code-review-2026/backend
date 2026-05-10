from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


Severity = Literal["WARN", "BLOCKER"]


@dataclass(frozen=True)
class SecretMatch:
    rule_id: str
    severity: Severity
    description: str
    confidence: float
    secret_value: str
    masked_value: str
    start: int
    end: int
    entropy_score: float | None = None


@dataclass(frozen=True)
class SecretLineScanResult:
    matches: list[SecretMatch]
    redacted_content: str
    masked_count: int
    rules_hit: dict[str, int]
    entropy_hits: int


@dataclass(frozen=True)
class SecretDetection:
    file_path: str
    line_no: int | None
    match: SecretMatch
    issue_type: str = "secret_exposure"


@dataclass(frozen=True)
class SecretScanResult:
    detections: list[SecretDetection] = field(default_factory=list)
    masked_count: int = 0
    rules_hit: dict[str, int] = field(default_factory=dict)
    entropy_hits: int = 0
    scan_scope: str = "added_lines"
    scanner_version: str = "t5-v1"

    @property
    def has_secrets(self) -> bool:
        return self.masked_count > 0 or len(self.detections) > 0


@dataclass(frozen=True)
class RedactionResult:
    diff_redacted: str
    masked_count: int
    rules_hit: dict[str, int]
    entropy_hits: int
    scan_scope: str = "added_lines"
    scanner_version: str = "t5-v1"

    @property
    def has_secrets(self) -> bool:
        return self.masked_count > 0

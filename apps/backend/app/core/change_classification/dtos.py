from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

ChangeType = Literal["bugfix", "feature", "refactor"]
ChangeTypeSource = Literal["heuristic", "llm"]


@dataclass(frozen=True)
class ChangeClassificationResult:
    change_type: ChangeType
    confidence: float
    source: ChangeTypeSource
    signals: dict[str, Any] = field(default_factory=dict)

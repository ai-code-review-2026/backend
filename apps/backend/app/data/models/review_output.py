from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class AnalysisReviewOutput:
    analysis_id: str
    source: str
    graph_rag_required: bool
    payload_json: str
    created_at: str
    updated_at: str

    @property
    def payload(self) -> dict[str, Any]:
        try:
            parsed = json.loads(self.payload_json)
        except Exception:
            return {}
        return parsed if isinstance(parsed, dict) else {}

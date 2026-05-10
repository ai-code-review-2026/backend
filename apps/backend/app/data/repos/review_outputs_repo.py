from __future__ import annotations

import json
from dataclasses import dataclass
from threading import Lock
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine
from app.data.models.review_output import AnalysisReviewOutput

_REVIEW_OUTPUTS_LOCK = Lock()


@dataclass(frozen=True)
class UpsertReviewOutputInput:
    analysis_id: str
    source: str
    graph_rag_required: bool
    payload: dict[str, Any]


class ReviewOutputsRepo:
    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def upsert(self, payload: UpsertReviewOutputInput) -> AnalysisReviewOutput:
        payload_json = json.dumps(payload.payload, ensure_ascii=False)
        with _REVIEW_OUTPUTS_LOCK:
            with self._engine.begin() as conn:
                row = (
                    conn.execute(
                        text(
                            """
                            INSERT INTO analysis_review_outputs (
                                analysis_id, source, graph_rag_required, payload_json
                            )
                            VALUES (
                                :analysis_id, :source, :graph_rag_required, CAST(:payload_json AS jsonb)
                            )
                            ON CONFLICT (analysis_id) DO UPDATE
                            SET source = EXCLUDED.source,
                                graph_rag_required = EXCLUDED.graph_rag_required,
                                payload_json = EXCLUDED.payload_json,
                                updated_at = NOW()
                            RETURNING *
                            """
                        ),
                        {
                            "analysis_id": payload.analysis_id,
                            "source": payload.source,
                            "graph_rag_required": payload.graph_rag_required,
                            "payload_json": payload_json,
                        },
                    )
                    .mappings()
                    .first()
                )
        assert row is not None
        return _row_to_model(row)

    def get_by_analysis_id(self, analysis_id: str) -> AnalysisReviewOutput | None:
        with _REVIEW_OUTPUTS_LOCK:
            with self._engine.connect() as conn:
                row = (
                    conn.execute(
                        text("SELECT * FROM analysis_review_outputs WHERE analysis_id = :analysis_id LIMIT 1"),
                        {"analysis_id": analysis_id},
                    )
                    .mappings()
                    .first()
                )
        if row is None:
            return None
        return _row_to_model(row)


def _row_to_model(row: RowMapping) -> AnalysisReviewOutput:
    raw_payload = row.get("payload_json")
    if isinstance(raw_payload, str):
        payload_json = raw_payload
    else:
        payload_json = json.dumps(raw_payload or {})
    return AnalysisReviewOutput(
        analysis_id=str(row["analysis_id"]),
        source=str(row["source"]),
        graph_rag_required=bool(row["graph_rag_required"]),
        payload_json=payload_json,
        created_at=str(row["created_at"]),
        updated_at=str(row["updated_at"]),
    )

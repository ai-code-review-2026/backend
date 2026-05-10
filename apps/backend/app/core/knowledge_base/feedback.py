"""RAG feedback loop — collects user signals and adjusts retrieval scores.

The feedback loop closes the gap between retrieval quality and user
expectations.  When a chunk accumulates negative signals (>threshold in 30
days), its re-ranking score is penalised so it appears less often.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from app.settings import settings

logger = logging.getLogger(__name__)

FeedbackType = Literal["helpful", "not_helpful", "wrong"]


class FeedbackCollector:
    """Collect and query RAG feedback stored in PostgreSQL."""

    def __init__(self, engine: Any | None = None) -> None:
        self._engine = engine

    def record_feedback(
        self,
        *,
        analysis_id: str,
        finding_id: str | None,
        chunk_id: str,
        feedback_type: FeedbackType,
        user_id: str | None = None,
    ) -> None:
        """Insert a feedback record into ``rag_feedback``."""
        engine = self._get_engine()
        if engine is None:
            return
        try:
            from sqlalchemy import text as sa_text

            with engine.begin() as conn:
                conn.execute(
                    sa_text(
                        "INSERT INTO rag_feedback (analysis_id, finding_id, chunk_id, feedback_type, user_id) "
                        "VALUES (:analysis_id, :finding_id, :chunk_id, :feedback_type, :user_id)"
                    ),
                    {
                        "analysis_id": analysis_id,
                        "finding_id": finding_id,
                        "chunk_id": chunk_id,
                        "feedback_type": feedback_type,
                        "user_id": user_id,
                    },
                )
        except Exception:
            logger.warning("Failed to record RAG feedback", exc_info=True)

    def get_negative_count(self, chunk_id: str, *, window_days: int = 30) -> int:
        """Return the number of negative signals for *chunk_id* within a time window."""
        engine = self._get_engine()
        if engine is None:
            return 0
        try:
            from sqlalchemy import text as sa_text

            cutoff = datetime.now(UTC) - timedelta(days=window_days)
            with engine.connect() as conn:
                row = conn.execute(
                    sa_text(
                        "SELECT COUNT(*) FROM rag_feedback "
                        "WHERE chunk_id = :chunk_id "
                        "AND feedback_type IN ('not_helpful', 'wrong') "
                        "AND created_at >= :cutoff"
                    ),
                    {"chunk_id": chunk_id, "cutoff": cutoff},
                ).fetchone()
                return int(row[0]) if row else 0
        except Exception:
            return 0

    def compute_penalty(self, chunk_id: str) -> float:
        """Return a score penalty (≥ 0) based on accumulated negative feedback."""
        if not settings.RAG_FEEDBACK_ENABLED:
            return 0.0
        count = self.get_negative_count(chunk_id)
        if count >= settings.RAG_FEEDBACK_PENALTY_THRESHOLD:
            return settings.RAG_FEEDBACK_PENALTY_SCORE
        return 0.0

    def _get_engine(self) -> Any:
        if self._engine is not None:
            return self._engine
        try:
            from app.data.database import get_engine
            self._engine = get_engine()
            return self._engine
        except Exception:
            return None

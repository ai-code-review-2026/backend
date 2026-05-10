"""RAG Feedback API — collects user signals on retrieval quality.

Exposes a POST endpoint for submitting feedback on RAG-generated review
findings so the retrieval pipeline can learn from user corrections.
"""
from __future__ import annotations

import logging
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/rag", tags=["rag"])


class RAGFeedbackRequest(BaseModel):
    analysis_id: str = Field(..., description="Analysis the feedback relates to")
    finding_id: str | None = Field(None, description="Specific finding ID (optional)")
    chunk_id: str = Field(..., description="Retrieved chunk that the feedback targets")
    feedback_type: Literal["helpful", "not_helpful", "wrong"] = Field(
        ..., description="Signal type"
    )
    user_id: str | None = Field(None, description="Submitting user ID (optional)")


class RAGFeedbackResponse(BaseModel):
    status: str = "ok"
    message: str = "Feedback recorded"


@router.post(
    "/feedback",
    response_model=RAGFeedbackResponse,
    status_code=201,
    summary="Submit RAG retrieval feedback",
)
async def submit_rag_feedback(payload: RAGFeedbackRequest) -> RAGFeedbackResponse:
    """Record a user signal about retrieval quality.

    Accepted ``feedback_type`` values:
    - **helpful** — the retrieved chunk was useful for the review finding.
    - **not_helpful** — the chunk was irrelevant or low-quality.
    - **wrong** — the chunk led to an incorrect or misleading finding.

    Negative signals (``not_helpful``, ``wrong``) accumulate per chunk.  Once
    a chunk exceeds the configured threshold within a 30-day window its
    re-ranking score is penalised automatically.
    """
    try:
        from app.core.knowledge_base.feedback import FeedbackCollector

        collector = FeedbackCollector()
        collector.record_feedback(
            analysis_id=payload.analysis_id,
            finding_id=payload.finding_id,
            chunk_id=payload.chunk_id,
            feedback_type=payload.feedback_type,
            user_id=payload.user_id,
        )
        return RAGFeedbackResponse()
    except Exception:
        logger.exception("Failed to record RAG feedback")
        raise HTTPException(status_code=500, detail="Failed to record feedback")

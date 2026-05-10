"""
LLM Trace Service - Stores and retrieves individual LLM request traces.

Architecture:
- Persists full trace data in PostgreSQL for auditing and debugging
- Supports querying traces by various filters (user, project, analysis, provider)
- Prepares for future Langfuse integration via structured trace format
- Async operations for non-blocking database access

Table Schema: llm_traces
- trace_id (TEXT PRIMARY KEY)
- user_id (TEXT NULL)
- project_id (TEXT NULL)
- analysis_id (TEXT NULL)
- provider (TEXT NOT NULL)
- model (TEXT NOT NULL)
- prompt (TEXT)  # Truncated to first 2000 chars
- response (TEXT)  # Truncated to first 2000 chars
- system_prompt (TEXT)  # Truncated to first 500 chars
- input_tokens (INTEGER)
- output_tokens (INTEGER)
- total_tokens (INTEGER)
- duration_ms (INTEGER)
- cost_cents (DOUBLE PRECISION)
- error (TEXT NULL)
- fallback_used (BOOLEAN)
- fallback_provider (TEXT NULL)
- priority (TEXT)
- sensitivity (TEXT)
- cost_target (TEXT)
- routing_reason (TEXT NULL)
- context_token_count (INTEGER)
- retrieved_context_count (INTEGER)
- hallucination_score (DOUBLE PRECISION NULL)
- relevance_score (DOUBLE PRECISION NULL)
- faithfulness_score (DOUBLE PRECISION NULL)
- tags (JSONB)
- metadata (JSONB)
- created_at (TIMESTAMPTZ NOT NULL DEFAULT NOW())
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.data.database import get_engine, get_session
from app.gateway.request_context import LLMRequestContext

logger = logging.getLogger(__name__)


class TraceServiceError(Exception):
    """Raised when trace service operations fail."""
    pass


def init_traces_table() -> None:
    """
    Initialize llm_traces table if it doesn't exist.
    Idempotent - safe to call multiple times.
    """
    engine = get_engine()
    
    try:
        with engine.begin() as conn:
            # Create table
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS llm_traces (
                        trace_id TEXT PRIMARY KEY,
                        user_id TEXT NULL,
                        project_id TEXT NULL,
                        analysis_id TEXT NULL,
                        provider TEXT NOT NULL,
                        model TEXT NOT NULL,
                        prompt TEXT,
                        response TEXT,
                        system_prompt TEXT,
                        input_tokens INTEGER,
                        output_tokens INTEGER,
                        total_tokens INTEGER,
                        duration_ms INTEGER,
                        cost_cents DOUBLE PRECISION,
                        error TEXT NULL,
                        fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
                        fallback_provider TEXT NULL,
                        priority TEXT,
                        sensitivity TEXT,
                        cost_target TEXT,
                        routing_reason TEXT NULL,
                        context_token_count INTEGER,
                        retrieved_context_count INTEGER,
                        hallucination_score DOUBLE PRECISION NULL,
                        relevance_score DOUBLE PRECISION NULL,
                        faithfulness_score DOUBLE PRECISION NULL,
                        tags JSONB NOT NULL DEFAULT '{}'::jsonb,
                        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )
            
            # Create indexes for common queries
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_traces_created_at ON llm_traces(created_at DESC)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_traces_user_id ON llm_traces(user_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_traces_project_id ON llm_traces(project_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_traces_analysis_id ON llm_traces(analysis_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_traces_provider ON llm_traces(provider)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_traces_model ON llm_traces(provider, model)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_traces_error ON llm_traces(error) WHERE error IS NOT NULL")
            )
            
            logger.info("llm_traces table initialized successfully")
            
    except SQLAlchemyError as exc:
        logger.error("Failed to initialize llm_traces table: %s", exc)
        raise TraceServiceError(f"Failed to initialize traces table: {exc}") from exc


async def log_trace(ctx: LLMRequestContext) -> None:
    """
    Store an LLM request trace in PostgreSQL and optionally export to Langfuse.
    
    Args:
        ctx: LLMRequestContext with completed request data
        
    Raises:
        TraceServiceError: If database operation fails
    """
    session = get_session()
    
    try:
        # Truncate long text fields for storage efficiency
        prompt_truncated = ctx.user_prompt[:2000] if ctx.user_prompt else None
        response_truncated = ctx.response_content[:2000] if ctx.response_content else None
        system_prompt_truncated = ctx.system_prompt[:500] if ctx.system_prompt else None
        
        session.execute(
            text(
                """
                INSERT INTO llm_traces (
                    trace_id, user_id, project_id, analysis_id,
                    provider, model, prompt, response, system_prompt,
                    input_tokens, output_tokens, total_tokens,
                    duration_ms, cost_cents, error,
                    fallback_used, fallback_provider,
                    priority, sensitivity, cost_target, routing_reason,
                    context_token_count, retrieved_context_count,
                    hallucination_score, relevance_score, faithfulness_score,
                    tags, metadata
                ) VALUES (
                    :trace_id, :user_id, :project_id, :analysis_id,
                    :provider, :model, :prompt, :response, :system_prompt,
                    :input_tokens, :output_tokens, :total_tokens,
                    :duration_ms, :cost_cents, :error,
                    :fallback_used, :fallback_provider,
                    :priority, :sensitivity, :cost_target, :routing_reason,
                    :context_token_count, :retrieved_context_count,
                    :hallucination_score, :relevance_score, :faithfulness_score,
                    :tags, :metadata
                )
                """
            ),
            {
                "trace_id": ctx.trace_id,
                "user_id": ctx.user_id,
                "project_id": ctx.project_id,
                "analysis_id": ctx.analysis_id,
                "provider": ctx.selected_provider or "unknown",
                "model": ctx.selected_model or "unknown",
                "prompt": prompt_truncated,
                "response": response_truncated,
                "system_prompt": system_prompt_truncated,
                "input_tokens": ctx.input_tokens,
                "output_tokens": ctx.output_tokens,
                "total_tokens": ctx.total_tokens,
                "duration_ms": ctx.duration_ms,
                "cost_cents": ctx.actual_cost_cents,
                "error": ctx.error,
                "fallback_used": ctx.fallback_used,
                "fallback_provider": ctx.fallback_provider,
                "priority": ctx.priority.value if ctx.priority else None,
                "sensitivity": ctx.sensitivity.value if ctx.sensitivity else None,
                "cost_target": ctx.cost_target.value if ctx.cost_target else None,
                "routing_reason": ctx.routing_reason,
                "context_token_count": ctx.context_token_count,
                "retrieved_context_count": len(ctx.retrieved_context),
                "hallucination_score": ctx.hallucination_score,
                "relevance_score": ctx.relevance_score,
                "faithfulness_score": ctx.faithfulness_score,
                "tags": ctx.tags,
                "metadata": ctx.metadata,
            },
        )
        session.commit()
        
        logger.debug(
            "Logged LLM trace: trace_id=%s provider=%s model=%s duration_ms=%s",
            ctx.trace_id,
            ctx.selected_provider,
            ctx.selected_model,
            ctx.duration_ms,
        )
        
        # Export to Langfuse asynchronously (non-blocking, best-effort)
        try:
            from app.observability.langfuse_client import send_trace_to_langfuse
            # Fire and forget - don't block on Langfuse export
            await send_trace_to_langfuse(ctx)
        except Exception as langfuse_exc:
            # Log but don't fail the trace operation
            logger.debug(
                "Langfuse export failed for trace %s: %s",
                ctx.trace_id,
                langfuse_exc,
            )
        
        # Compute RAGAS metrics asynchronously (non-blocking, best-effort)
        # This evaluates the quality of the RAG interaction (faithfulness, relevancy, etc.)
        if ctx.response_content and ctx.retrieved_context:
            try:
                from app.observability.ragas_evaluator import compute_and_store_ragas_metrics
                from app.settings import settings
                
                # Only compute if enabled (can be expensive for high-volume systems)
                if getattr(settings, "RAGAS_EVALUATION_ENABLED", True):
                    import asyncio
                    # Fire and forget - compute in background
                    asyncio.create_task(
                        compute_and_store_ragas_metrics(
                            trace_id=ctx.trace_id,
                            query=ctx.user_prompt or "",
                            retrieved_context=ctx.retrieved_context,
                            answer=ctx.response_content,
                            ground_truth=None,  # No ground truth in prod
                        )
                    )
            except Exception as ragas_exc:
                logger.debug(
                    "RAGAS evaluation failed for trace %s: %s",
                    ctx.trace_id,
                    ragas_exc,
                )
        
    except SQLAlchemyError as exc:
        session.rollback()
        logger.error("Failed to log trace %s: %s", ctx.trace_id, exc)
        raise TraceServiceError(f"Failed to log trace: {exc}") from exc
    finally:
        session.close()


async def get_trace(trace_id: str) -> dict[str, Any] | None:
    """
    Retrieve a single trace by trace_id.
    
    Args:
        trace_id: Unique trace identifier
        
    Returns:
        Trace data dict or None if not found
    """
    session = get_session()
    
    try:
        result = session.execute(
            text("SELECT * FROM llm_traces WHERE trace_id = :trace_id"),
            {"trace_id": trace_id},
        )
        row = result.fetchone()
        
        if not row:
            return None
            
        return dict(row._mapping)
        
    except SQLAlchemyError as exc:
        logger.error("Failed to retrieve trace %s: %s", trace_id, exc)
        raise TraceServiceError(f"Failed to retrieve trace: {exc}") from exc
    finally:
        session.close()


async def list_traces(
    user_id: str | None = None,
    project_id: str | None = None,
    analysis_id: str | None = None,
    provider: str | None = None,
    has_error: bool | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """
    List traces with optional filters.
    
    Args:
        user_id: Filter by user
        project_id: Filter by project
        analysis_id: Filter by analysis
        provider: Filter by LLM provider
        has_error: Filter by error presence (True = only errors, False = only successful)
        start_date: Filter by minimum created_at
        end_date: Filter by maximum created_at
        limit: Maximum number of results (default 100, max 1000)
        offset: Pagination offset
        
    Returns:
        List of trace data dicts
    """
    session = get_session()
    
    # Build WHERE clause dynamically
    where_clauses = []
    params: dict[str, Any] = {}
    
    if user_id:
        where_clauses.append("user_id = :user_id")
        params["user_id"] = user_id
        
    if project_id:
        where_clauses.append("project_id = :project_id")
        params["project_id"] = project_id
        
    if analysis_id:
        where_clauses.append("analysis_id = :analysis_id")
        params["analysis_id"] = analysis_id
        
    if provider:
        where_clauses.append("provider = :provider")
        params["provider"] = provider
        
    if has_error is not None:
        if has_error:
            where_clauses.append("error IS NOT NULL")
        else:
            where_clauses.append("error IS NULL")
            
    if start_date:
        where_clauses.append("created_at >= :start_date")
        params["start_date"] = start_date
        
    if end_date:
        where_clauses.append("created_at <= :end_date")
        params["end_date"] = end_date
    
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    
    # Enforce limit bounds
    limit = min(max(1, limit), 1000)
    params["limit"] = limit
    params["offset"] = max(0, offset)
    
    try:
        result = session.execute(
            text(
                f"""
                SELECT * FROM llm_traces
                {where_sql}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
                """
            ),
            params,
        )
        
        rows = result.fetchall()
        return [dict(row._mapping) for row in rows]
        
    except SQLAlchemyError as exc:
        logger.error("Failed to list traces: %s", exc)
        raise TraceServiceError(f"Failed to list traces: {exc}") from exc
    finally:
        session.close()


async def get_traces_by_analysis(analysis_id: str) -> list[dict[str, Any]]:
    """
    Get all traces for a specific analysis, ordered by creation time.
    
    Args:
        analysis_id: Analysis identifier
        
    Returns:
        List of trace data dicts
    """
    return await list_traces(analysis_id=analysis_id, limit=1000)


async def export_traces_for_langfuse(
    start_date: datetime,
    end_date: datetime,
) -> list[dict[str, Any]]:
    """
    Export traces in Langfuse-compatible format.
    
    Prepares trace data for future Langfuse integration.
    Langfuse expects: trace_id, name, user_id, metadata, input, output, timestamps.
    
    Args:
        start_date: Export traces from this date
        end_date: Export traces until this date
        
    Returns:
        List of Langfuse-formatted trace objects
    """
    traces = await list_traces(start_date=start_date, end_date=end_date, limit=1000)
    
    langfuse_traces = []
    for trace in traces:
        langfuse_traces.append({
            "id": trace["trace_id"],
            "name": f"{trace['provider']}:{trace['model']}",
            "userId": trace["user_id"],
            "metadata": {
                "project_id": trace["project_id"],
                "analysis_id": trace["analysis_id"],
                "provider": trace["provider"],
                "model": trace["model"],
                "priority": trace["priority"],
                "sensitivity": trace["sensitivity"],
                "cost_target": trace["cost_target"],
                "routing_reason": trace["routing_reason"],
                "fallback_used": trace["fallback_used"],
                "fallback_provider": trace["fallback_provider"],
                **(trace["tags"] or {}),
            },
            "input": {
                "system_prompt": trace["system_prompt"],
                "user_prompt": trace["prompt"],
                "context_token_count": trace["context_token_count"],
                "retrieved_context_count": trace["retrieved_context_count"],
            },
            "output": trace["response"],
            "usage": {
                "input": trace["input_tokens"],
                "output": trace["output_tokens"],
                "total": trace["total_tokens"],
            },
            "level": "ERROR" if trace["error"] else "DEFAULT",
            "statusMessage": trace["error"],
            "startTime": trace["created_at"],
            "endTime": trace["created_at"],  # We only store completed traces
            "release": trace.get("metadata", {}).get("release"),
            "version": trace.get("metadata", {}).get("version"),
            "scores": {
                "hallucination": trace["hallucination_score"],
                "relevance": trace["relevance_score"],
                "faithfulness": trace["faithfulness_score"],
            },
            "totalCost": trace["cost_cents"] / 100 if trace["cost_cents"] else None,  # Convert to dollars
        })
    
    return langfuse_traces


async def delete_old_traces(days: int = 90) -> int:
    """
    Delete traces older than specified days.
    
    Args:
        days: Delete traces older than this many days (default 90)
        
    Returns:
        Number of traces deleted
    """
    session = get_session()
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    try:
        result = session.execute(
            text("DELETE FROM llm_traces WHERE created_at < :cutoff_date"),
            {"cutoff_date": cutoff_date},
        )
        session.commit()
        
        deleted_count = result.rowcount
        logger.info("Deleted %d traces older than %d days", deleted_count, days)
        return deleted_count
        
    except SQLAlchemyError as exc:
        session.rollback()
        logger.error("Failed to delete old traces: %s", exc)
        raise TraceServiceError(f"Failed to delete old traces: {exc}") from exc
    finally:
        session.close()

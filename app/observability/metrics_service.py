"""
LLM Metrics Service - Aggregated metrics and time-series data.

Architecture:
- Records aggregated LLM usage metrics in PostgreSQL
- Tracks per-provider, per-user, per-project statistics
- Time-series aggregation (hourly, daily) for trending analysis
- Exposes Prometheus metrics for real-time monitoring
- Supports dashboard queries via get_summary()

Table Schema: llm_metrics
- id (TEXT PRIMARY KEY)
- metric_type (TEXT NOT NULL)  # hourly | daily | total
- timestamp (TIMESTAMPTZ NOT NULL)
- user_id (TEXT NULL)
- project_id (TEXT NULL)
- provider (TEXT)
- model (TEXT NULL)
- total_requests (INTEGER)
- successful_requests (INTEGER)
- failed_requests (INTEGER)
- total_input_tokens (BIGINT)
- total_output_tokens (BIGINT)
- total_tokens (BIGINT)
- total_cost_cents (DOUBLE PRECISION)
- total_duration_ms (BIGINT)
- avg_latency_ms (DOUBLE PRECISION)
- fallback_count (INTEGER)
- error_count (INTEGER)
- created_at (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- updated_at (TIMESTAMPTZ NOT NULL DEFAULT NOW())
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from typing import Any, Literal

from prometheus_client import Counter, Gauge, Histogram
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.data.database import get_engine, get_session
from app.gateway.request_context import LLMRequestContext

logger = logging.getLogger(__name__)


class MetricsServiceError(Exception):
    """Raised when metrics service operations fail."""
    pass


# ─── Prometheus Metrics ───────────────────────────────────────────────────────

LLM_REQUESTS_COUNTER = Counter(
    "llm_gateway_requests_total",
    "Total LLM requests through gateway",
    ["provider", "model", "status"],  # status: success | error | timeout
)

LLM_COST_COUNTER = Counter(
    "llm_gateway_cost_cents_total",
    "Total cost in cents for LLM requests",
    ["provider", "model"],
)

LLM_TOKENS_COUNTER = Counter(
    "llm_gateway_tokens_total",
    "Total tokens processed",
    ["provider", "model", "token_type"],  # token_type: input | output
)

LLM_LATENCY_HISTOGRAM = Histogram(
    "llm_gateway_latency_seconds",
    "LLM request latency distribution",
    ["provider", "model"],
    buckets=[0.5, 1, 2, 5, 10, 30, 60, 120, 300],
)

LLM_FALLBACK_COUNTER = Counter(
    "llm_gateway_fallbacks_total",
    "Total number of fallback provider uses",
    ["primary_provider", "fallback_provider"],
)

LLM_ERROR_RATE_GAUGE = Gauge(
    "llm_gateway_error_rate",
    "Current error rate (errors / total requests)",
    ["provider"],
)

LLM_ACTIVE_REQUESTS_GAUGE = Gauge(
    "llm_gateway_active_requests",
    "Currently active LLM requests",
    ["provider"],
)


# ─── Database Initialization ──────────────────────────────────────────────────


def init_metrics_table() -> None:
    """
    Initialize llm_metrics table if it doesn't exist.
    Idempotent - safe to call multiple times.
    """
    engine = get_engine()
    
    try:
        with engine.begin() as conn:
            # Create table
            conn.execute(
                text(
                    """
                    CREATE TABLE IF NOT EXISTS llm_metrics (
                        id TEXT PRIMARY KEY,
                        metric_type TEXT NOT NULL CHECK (metric_type IN ('hourly', 'daily', 'total')),
                        timestamp TIMESTAMPTZ NOT NULL,
                        user_id TEXT NULL,
                        project_id TEXT NULL,
                        provider TEXT,
                        model TEXT NULL,
                        total_requests INTEGER NOT NULL DEFAULT 0,
                        successful_requests INTEGER NOT NULL DEFAULT 0,
                        failed_requests INTEGER NOT NULL DEFAULT 0,
                        total_input_tokens BIGINT NOT NULL DEFAULT 0,
                        total_output_tokens BIGINT NOT NULL DEFAULT 0,
                        total_tokens BIGINT NOT NULL DEFAULT 0,
                        total_cost_cents DOUBLE PRECISION NOT NULL DEFAULT 0,
                        total_duration_ms BIGINT NOT NULL DEFAULT 0,
                        avg_latency_ms DOUBLE PRECISION NULL,
                        fallback_count INTEGER NOT NULL DEFAULT 0,
                        error_count INTEGER NOT NULL DEFAULT 0,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
            )
            
            # Create unique constraint for time-series metrics
            conn.execute(
                text(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_llm_metrics_unique_timeseries
                    ON llm_metrics(metric_type, timestamp, COALESCE(user_id, ''), COALESCE(project_id, ''), COALESCE(provider, ''), COALESCE(model, ''))
                    """
                )
            )
            
            # Create indexes for queries
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_metrics_timestamp ON llm_metrics(timestamp DESC)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_metrics_provider ON llm_metrics(provider)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_metrics_user_id ON llm_metrics(user_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_metrics_project_id ON llm_metrics(project_id)")
            )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_llm_metrics_type_timestamp ON llm_metrics(metric_type, timestamp DESC)")
            )
            
            logger.info("llm_metrics table initialized successfully")
            
    except SQLAlchemyError as exc:
        logger.error("Failed to initialize llm_metrics table: %s", exc)
        raise MetricsServiceError(f"Failed to initialize metrics table: {exc}") from exc


# ─── Record Metrics ───────────────────────────────────────────────────────────


async def record_request(ctx: LLMRequestContext) -> None:
    """
    Record metrics for a completed LLM request.
    
    Updates:
    - Prometheus metrics (real-time)
    - PostgreSQL aggregated metrics (hourly/daily rollups)
    
    Args:
        ctx: Completed LLMRequestContext
    """
    # Update Prometheus metrics
    _update_prometheus_metrics(ctx)
    
    # Update PostgreSQL aggregated metrics
    await _update_aggregated_metrics(ctx)


def _update_prometheus_metrics(ctx: LLMRequestContext) -> None:
    """Update Prometheus metrics for the request."""
    provider = ctx.selected_provider or "unknown"
    model = ctx.selected_model or "unknown"
    
    # Request counter
    status = "error" if ctx.error else "success"
    LLM_REQUESTS_COUNTER.labels(provider=provider, model=model, status=status).inc()
    
    # Cost tracking
    if ctx.actual_cost_cents:
        LLM_COST_COUNTER.labels(provider=provider, model=model).inc(ctx.actual_cost_cents)
    
    # Token tracking
    if ctx.input_tokens:
        LLM_TOKENS_COUNTER.labels(provider=provider, model=model, token_type="input").inc(ctx.input_tokens)
    if ctx.output_tokens:
        LLM_TOKENS_COUNTER.labels(provider=provider, model=model, token_type="output").inc(ctx.output_tokens)
    
    # Latency histogram
    if ctx.duration_ms:
        LLM_LATENCY_HISTOGRAM.labels(provider=provider, model=model).observe(ctx.duration_ms / 1000.0)
    
    # Fallback tracking
    if ctx.fallback_used and ctx.fallback_provider:
        LLM_FALLBACK_COUNTER.labels(
            primary_provider=provider,
            fallback_provider=ctx.fallback_provider,
        ).inc()


async def _update_aggregated_metrics(ctx: LLMRequestContext) -> None:
    """
    Update aggregated metrics in PostgreSQL.
    
    Creates/updates hourly and daily rollup records.
    """
    session = get_session()
    
    try:
        # Get current hour and day timestamps
        now = datetime.utcnow()
        hour_timestamp = now.replace(minute=0, second=0, microsecond=0)
        day_timestamp = now.replace(hour=0, minute=0, second=0, microsecond=0)
        
        provider = ctx.selected_provider or "unknown"
        model = ctx.selected_model or "unknown"
        
        # Update hourly metrics
        await _upsert_metric_record(
            session,
            metric_type="hourly",
            timestamp=hour_timestamp,
            user_id=ctx.user_id,
            project_id=ctx.project_id,
            provider=provider,
            model=model,
            ctx=ctx,
        )
        
        # Update daily metrics
        await _upsert_metric_record(
            session,
            metric_type="daily",
            timestamp=day_timestamp,
            user_id=ctx.user_id,
            project_id=ctx.project_id,
            provider=provider,
            model=model,
            ctx=ctx,
        )
        
        session.commit()
        
    except SQLAlchemyError as exc:
        session.rollback()
        logger.error("Failed to update aggregated metrics: %s", exc)
        # Don't raise - metrics failures shouldn't break the main flow
    finally:
        session.close()


async def _upsert_metric_record(
    session: Any,
    metric_type: str,
    timestamp: datetime,
    user_id: str | None,
    project_id: str | None,
    provider: str,
    model: str,
    ctx: LLMRequestContext,
) -> None:
    """Upsert a single metric record with aggregated values."""
    
    # Calculate increments
    is_success = ctx.error is None
    is_failure = ctx.error is not None
    is_fallback = ctx.fallback_used
    
    session.execute(
        text(
            """
            INSERT INTO llm_metrics (
                id, metric_type, timestamp,
                user_id, project_id, provider, model,
                total_requests, successful_requests, failed_requests,
                total_input_tokens, total_output_tokens, total_tokens,
                total_cost_cents, total_duration_ms,
                fallback_count, error_count,
                updated_at
            ) VALUES (
                :id, :metric_type, :timestamp,
                :user_id, :project_id, :provider, :model,
                1, :successful, :failed,
                :input_tokens, :output_tokens, :total_tokens,
                :cost_cents, :duration_ms,
                :fallback, :error,
                NOW()
            )
            ON CONFLICT ON CONSTRAINT idx_llm_metrics_unique_timeseries
            DO UPDATE SET
                total_requests = llm_metrics.total_requests + 1,
                successful_requests = llm_metrics.successful_requests + EXCLUDED.successful_requests,
                failed_requests = llm_metrics.failed_requests + EXCLUDED.failed_requests,
                total_input_tokens = llm_metrics.total_input_tokens + EXCLUDED.total_input_tokens,
                total_output_tokens = llm_metrics.total_output_tokens + EXCLUDED.total_output_tokens,
                total_tokens = llm_metrics.total_tokens + EXCLUDED.total_tokens,
                total_cost_cents = llm_metrics.total_cost_cents + EXCLUDED.total_cost_cents,
                total_duration_ms = llm_metrics.total_duration_ms + EXCLUDED.total_duration_ms,
                avg_latency_ms = (llm_metrics.total_duration_ms + EXCLUDED.total_duration_ms)::float / (llm_metrics.total_requests + 1),
                fallback_count = llm_metrics.fallback_count + EXCLUDED.fallback_count,
                error_count = llm_metrics.error_count + EXCLUDED.error_count,
                updated_at = NOW()
            """
        ),
        {
            "id": str(uuid.uuid4()),
            "metric_type": metric_type,
            "timestamp": timestamp,
            "user_id": user_id,
            "project_id": project_id,
            "provider": provider,
            "model": model,
            "successful": 1 if is_success else 0,
            "failed": 1 if is_failure else 0,
            "input_tokens": ctx.input_tokens or 0,
            "output_tokens": ctx.output_tokens or 0,
            "total_tokens": ctx.total_tokens or 0,
            "cost_cents": ctx.actual_cost_cents or 0.0,
            "duration_ms": ctx.duration_ms or 0,
            "fallback": 1 if is_fallback else 0,
            "error": 1 if is_failure else 0,
        },
    )


# ─── Query Metrics ────────────────────────────────────────────────────────────


async def get_summary(
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    group_by: Literal["provider", "user", "project", "model"] | None = None,
    user_id: str | None = None,
    project_id: str | None = None,
    provider: str | None = None,
) -> dict[str, Any]:
    """
    Get aggregated metrics summary for dashboard display.
    
    Args:
        start_date: Filter by minimum timestamp
        end_date: Filter by maximum timestamp
        group_by: Group results by dimension (provider | user | project | model)
        user_id: Filter by specific user
        project_id: Filter by specific project
        provider: Filter by specific provider
        
    Returns:
        Summary dict with aggregated metrics
    """
    session = get_session()
    
    # Default to last 30 days if no dates specified
    if not start_date:
        start_date = datetime.utcnow() - timedelta(days=30)
    if not end_date:
        end_date = datetime.utcnow()
    
    # Build WHERE clause
    where_clauses = ["metric_type = 'daily'", "timestamp >= :start_date", "timestamp <= :end_date"]
    params: dict[str, Any] = {"start_date": start_date, "end_date": end_date}
    
    if user_id:
        where_clauses.append("user_id = :user_id")
        params["user_id"] = user_id
    if project_id:
        where_clauses.append("project_id = :project_id")
        params["project_id"] = project_id
    if provider:
        where_clauses.append("provider = :provider")
        params["provider"] = provider
    
    where_sql = " AND ".join(where_clauses)
    
    # Build GROUP BY clause
    group_by_sql = ""
    select_group_fields = ""
    if group_by == "provider":
        group_by_sql = "GROUP BY provider"
        select_group_fields = "provider,"
    elif group_by == "user":
        group_by_sql = "GROUP BY user_id"
        select_group_fields = "user_id,"
    elif group_by == "project":
        group_by_sql = "GROUP BY project_id"
        select_group_fields = "project_id,"
    elif group_by == "model":
        group_by_sql = "GROUP BY provider, model"
        select_group_fields = "provider, model,"
    
    try:
        # Get aggregated totals
        result = session.execute(
            text(
                f"""
                SELECT
                    {select_group_fields}
                    SUM(total_requests) as total_requests,
                    SUM(successful_requests) as successful_requests,
                    SUM(failed_requests) as failed_requests,
                    SUM(total_input_tokens) as total_input_tokens,
                    SUM(total_output_tokens) as total_output_tokens,
                    SUM(total_tokens) as total_tokens,
                    SUM(total_cost_cents) as total_cost_cents,
                    AVG(avg_latency_ms) as avg_latency_ms,
                    SUM(fallback_count) as fallback_count,
                    SUM(error_count) as error_count
                FROM llm_metrics
                WHERE {where_sql}
                {group_by_sql}
                """
            ),
            params,
        )
        
        rows = result.fetchall()
        
        if group_by:
            # Return grouped results
            grouped_data = []
            for row in rows:
                row_dict = dict(row._mapping)
                # Calculate derived metrics
                total_req = row_dict.get("total_requests", 0)
                row_dict["error_rate"] = (row_dict.get("error_count", 0) / total_req) if total_req > 0 else 0
                row_dict["fallback_rate"] = (row_dict.get("fallback_count", 0) / total_req) if total_req > 0 else 0
                grouped_data.append(row_dict)
            
            return {
                "group_by": group_by,
                "data": grouped_data,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            }
        else:
            # Return single summary
            if rows:
                summary = dict(rows[0]._mapping)
                total_req = summary.get("total_requests", 0)
                summary["error_rate"] = (summary.get("error_count", 0) / total_req) if total_req > 0 else 0
                summary["fallback_rate"] = (summary.get("fallback_count", 0) / total_req) if total_req > 0 else 0
            else:
                summary = {
                    "total_requests": 0,
                    "successful_requests": 0,
                    "failed_requests": 0,
                    "total_input_tokens": 0,
                    "total_output_tokens": 0,
                    "total_tokens": 0,
                    "total_cost_cents": 0.0,
                    "avg_latency_ms": 0.0,
                    "fallback_count": 0,
                    "error_count": 0,
                    "error_rate": 0.0,
                    "fallback_rate": 0.0,
                }
            
            return {
                "summary": summary,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            }
        
    except SQLAlchemyError as exc:
        logger.error("Failed to get metrics summary: %s", exc)
        raise MetricsServiceError(f"Failed to get metrics summary: {exc}") from exc
    finally:
        session.close()


async def get_time_series(
    metric_type: Literal["hourly", "daily"] = "daily",
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    provider: str | None = None,
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    """
    Get time-series metrics for charting.
    
    Args:
        metric_type: Granularity (hourly or daily)
        start_date: Start of time range
        end_date: End of time range
        provider: Filter by provider
        project_id: Filter by project
        
    Returns:
        List of time-series data points
    """
    session = get_session()
    
    # Default to last 30 days
    if not start_date:
        start_date = datetime.utcnow() - timedelta(days=30)
    if not end_date:
        end_date = datetime.utcnow()
    
    # Build WHERE clause
    where_clauses = ["metric_type = :metric_type", "timestamp >= :start_date", "timestamp <= :end_date"]
    params: dict[str, Any] = {
        "metric_type": metric_type,
        "start_date": start_date,
        "end_date": end_date,
    }
    
    if provider:
        where_clauses.append("provider = :provider")
        params["provider"] = provider
    if project_id:
        where_clauses.append("project_id = :project_id")
        params["project_id"] = project_id
    
    where_sql = " AND ".join(where_clauses)
    
    try:
        result = session.execute(
            text(
                f"""
                SELECT
                    timestamp,
                    SUM(total_requests) as total_requests,
                    SUM(successful_requests) as successful_requests,
                    SUM(failed_requests) as failed_requests,
                    SUM(total_tokens) as total_tokens,
                    SUM(total_cost_cents) as total_cost_cents,
                    AVG(avg_latency_ms) as avg_latency_ms
                FROM llm_metrics
                WHERE {where_sql}
                GROUP BY timestamp
                ORDER BY timestamp ASC
                """
            ),
            params,
        )
        
        rows = result.fetchall()
        return [dict(row._mapping) for row in rows]
        
    except SQLAlchemyError as exc:
        logger.error("Failed to get time-series data: %s", exc)
        raise MetricsServiceError(f"Failed to get time-series data: {exc}") from exc
    finally:
        session.close()


async def get_provider_distribution() -> dict[str, Any]:
    """
    Get distribution of requests across providers (last 30 days).
    
    Returns:
        Dict with provider names as keys and request counts as values
    """
    start_date = datetime.utcnow() - timedelta(days=30)
    summary = await get_summary(start_date=start_date, group_by="provider")
    
    distribution = {}
    for item in summary.get("data", []):
        provider = item.get("provider", "unknown")
        distribution[provider] = item.get("total_requests", 0)
    
    return distribution

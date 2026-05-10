"""
Observability Infrastructure for LLM Operations.

This module provides comprehensive observability for LLM requests:

1. **trace_service.py** - Individual request traces
   - Stores full LLM request/response traces in PostgreSQL
   - Supports querying by user, project, analysis, provider
   - Auto-exports to Langfuse for LLMOps
   - Query methods: get_trace(), list_traces(), get_traces_by_analysis()

2. **metrics_service.py** - Aggregated metrics
   - Time-series metrics (hourly/daily rollups)
   - Per-provider, per-user, per-project aggregations
   - Prometheus metrics for real-time monitoring
   - Dashboard queries via get_summary(), get_time_series()

3. **langfuse_client.py** - Langfuse integration for LLMOps
   - Real-time trace export to Langfuse
   - Token usage and cost tracking
   - Quality metrics (hallucination, relevance, faithfulness)
   - Model performance comparison

4. **otel_config.py** - OpenTelemetry distributed tracing
   - FastAPI auto-instrumentation
   - Custom spans for LLM operations
   - Export to Jaeger, Zipkin, or OTLP endpoints
   - Semantic conventions for LLM observability

Usage:

```python
from app.observability import (
    log_trace, 
    record_request, 
    get_summary, 
    init_observability,
    init_otel_tracing,
    create_llm_span,
)

# Initialize at startup
init_observability()  # DB tables
init_otel_tracing(app)  # OpenTelemetry

# Log a completed LLM request
await log_trace(ctx)  # Auto-exports to Langfuse if enabled
await record_request(ctx)  # Updates Prometheus + PostgreSQL metrics

# Create custom spans
with create_llm_span("llm.generate", ctx):
    response = await provider.generate(prompt)

# Query traces
trace = await get_trace(trace_id="abc-123")
traces = await list_traces(user_id="user_123", limit=50)
analysis_traces = await get_traces_by_analysis(analysis_id="analysis_456")

# Query metrics
summary = await get_summary(
    start_date=datetime.utcnow() - timedelta(days=7),
    group_by="provider"
)
time_series = await get_time_series(metric_type="daily", provider="ollama")
distribution = await get_provider_distribution()
```

Integration with API Gateway:

The API Gateway should call both functions after each LLM request:

```python
# In app.gateway.api_gateway.py
from app.observability import log_trace, record_request, create_llm_span

async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
    with create_llm_span("llm.generate", ctx):
        try:
            # ... execute request ...
            ctx.mark_completed(duration_ms)
        except Exception as e:
            ctx.mark_failed(str(e))
        finally:
            # Log observability data
            await log_trace(ctx)  # Postgres + Langfuse
            await record_request(ctx)  # Prometheus + Postgres
    return ctx
```
"""

from app.observability.metrics_service import (
    MetricsServiceError,
    get_provider_distribution,
    get_summary,
    get_time_series,
    init_metrics_table,
    record_request,
)
from app.observability.trace_service import (
    TraceServiceError,
    delete_old_traces,
    export_traces_for_langfuse,
    get_trace,
    get_traces_by_analysis,
    init_traces_table,
    list_traces,
    log_trace,
)

# Langfuse integration (optional, graceful degradation)
try:
    from app.observability.langfuse_client import (
        is_langfuse_enabled,
        send_trace_to_langfuse,
        send_trace_with_retry,
        get_langfuse_status,
    )
    _LANGFUSE_AVAILABLE = True
except ImportError:
    _LANGFUSE_AVAILABLE = False
    
    def is_langfuse_enabled():
        return False
    
    async def send_trace_to_langfuse(ctx):
        return False
    
    async def send_trace_with_retry(ctx):
        return False
    
    def get_langfuse_status():
        return {"enabled": False, "status": "unavailable"}

# OpenTelemetry integration (optional, graceful degradation)
try:
    from app.observability.otel_config import (
        init_otel_tracing,
        is_otel_enabled,
        create_llm_span,
        add_span_event,
        get_otel_status,
    )
    _OTEL_AVAILABLE = True
except ImportError:
    _OTEL_AVAILABLE = False
    
    def init_otel_tracing(app=None):
        return False
    
    def is_otel_enabled():
        return False
    
    def create_llm_span(operation, ctx=None, attributes=None):
        from contextlib import contextmanager
        @contextmanager
        def _noop():
            yield None
        return _noop()
    
    def add_span_event(name, attributes=None):
        pass
    
    def get_otel_status():
        return {"enabled": False, "status": "unavailable"}


__all__ = [
    # Trace service
    "log_trace",
    "get_trace",
    "list_traces",
    "get_traces_by_analysis",
    "export_traces_for_langfuse",
    "delete_old_traces",
    "init_traces_table",
    "TraceServiceError",
    # Metrics service
    "record_request",
    "get_summary",
    "get_time_series",
    "get_provider_distribution",
    "init_metrics_table",
    "MetricsServiceError",
    # Langfuse integration
    "is_langfuse_enabled",
    "send_trace_to_langfuse",
    "send_trace_with_retry",
    "get_langfuse_status",
    # OpenTelemetry integration
    "init_otel_tracing",
    "is_otel_enabled",
    "create_llm_span",
    "add_span_event",
    "get_otel_status",
    # Initialization
    "init_observability",
]


def init_observability() -> None:
    """
    Initialize all observability infrastructure.
    
    Creates database tables for traces and metrics.
    Logs status of Langfuse and OTEL integrations.
    Safe to call multiple times (idempotent).
    
    Call this during application startup:
    
    ```python
    # In app/main.py or startup event
    from app.observability import init_observability, init_otel_tracing
    
    @app.on_event("startup")
    async def startup():
        init_observability()
        init_otel_tracing(app)  # Pass FastAPI app for auto-instrumentation
    ```
    """
    import logging
    logger = logging.getLogger(__name__)
    
    # Initialize database tables
    init_traces_table()
    init_metrics_table()
    
    # Log integration status
    if _LANGFUSE_AVAILABLE:
        langfuse_status = get_langfuse_status()
        logger.info(
            "Langfuse integration: %s - %s",
            langfuse_status["status"],
            langfuse_status["message"],
        )
    else:
        logger.info("Langfuse integration: unavailable (module not imported)")
    
    if _OTEL_AVAILABLE:
        otel_status = get_otel_status()
        logger.info(
            "OpenTelemetry integration: %s - %s",
            otel_status["status"],
            otel_status["message"],
        )
    else:
        logger.info("OpenTelemetry integration: unavailable (module not imported)")

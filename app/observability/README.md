# LLM Observability Infrastructure

This directory contains comprehensive observability for all LLM operations in the AI Code Review Platform.

## Architecture

### 1. **trace_service.py** - Individual Request Traces
Stores full LLM request/response traces in PostgreSQL for auditing and debugging. Auto-exports to Langfuse when enabled.

**Table: `llm_traces`**
- Complete request/response data (truncated for storage efficiency)
- User, project, analysis associations
- Provider, model, routing decisions
- Tokens, cost, duration, quality scores
- Error tracking and fallback information

**Key Functions:**
```python
await log_trace(ctx)                          # Store trace
trace = await get_trace(trace_id)            # Retrieve single trace
traces = await list_traces(user_id="u123")   # List with filters
traces = await get_traces_by_analysis("a1")  # Get all traces for analysis
```

### 2. **metrics_service.py** - Aggregated Metrics
Tracks aggregated LLM usage with time-series data (hourly/daily rollups).

**Table: `llm_metrics`**
- Aggregated metrics per provider/user/project/model
- Time-series data (hourly and daily)
- Cost tracking, token usage, latency stats
- Error rates, fallback rates

**Prometheus Metrics:**
- `llm_gateway_requests_total` - Total requests by provider/model/status
- `llm_gateway_cost_cents_total` - Total cost tracking
- `llm_gateway_tokens_total` - Token usage (input/output)
- `llm_gateway_latency_seconds` - Latency histogram
- `llm_gateway_fallbacks_total` - Fallback usage tracking

**Key Functions:**
```python
await record_request(ctx)                    # Record metrics
summary = await get_summary(
    start_date=...,
    group_by="provider"
)
time_series = await get_time_series(
    metric_type="daily",
    provider="ollama"
)
distribution = await get_provider_distribution()
```

## Usage

### 1. Initialization (Automatic)

The observability infrastructure is automatically initialized during application startup:

```python
# In app/main.py (already configured)
from app.observability import init_observability

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_observability()  # Creates llm_traces and llm_metrics tables
    # ...
```

### 2. Integration with LLM Gateway (Automatic)

The API Gateway (`app/gateway/api_gateway.py`) automatically logs all LLM requests:

```python
# Already integrated in LLMGateway.generate()
async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
    # ... execute request ...
    
    # Automatic observability logging
    await self._trace_service.log_trace(ctx)      # Individual trace
    await self._metrics_service.record_request(ctx)  # Aggregated metrics
    
    return ctx
```

### 3. Querying Traces (API/Dashboard)

Create API endpoints to query observability data:

```python
# Example: Get recent traces for a user
@router.get("/api/v1/observability/traces")
async def get_user_traces(
    user_id: str,
    limit: int = 50,
    auth: AuthenticatedPrincipal = Depends(require_auth),
):
    from app.observability import list_traces
    
    traces = await list_traces(
        user_id=user_id,
        limit=limit,
    )
    return {"traces": traces}

# Example: Get cost summary for a project
@router.get("/api/v1/observability/cost-summary")
async def get_cost_summary(
    project_id: str,
    days: int = 30,
    auth: AuthenticatedPrincipal = Depends(require_auth),
):
    from datetime import datetime, timedelta
    from app.observability import get_summary
    
    start_date = datetime.utcnow() - timedelta(days=days)
    summary = await get_summary(
        project_id=project_id,
        start_date=start_date,
        group_by="provider",
    )
    return summary
```

### 4. Dashboard Queries

Use the metrics service for dashboard visualizations:

```python
# Get time-series data for charting
from app.observability import get_time_series

# Daily cost over time
time_series = await get_time_series(
    metric_type="daily",
    start_date=datetime.utcnow() - timedelta(days=30),
)

# Chart: cost_cents over time
chart_data = [
    {"date": row["timestamp"], "cost": row["total_cost_cents"] / 100}
    for row in time_series
]

# Get provider distribution (pie chart)
from app.observability import get_provider_distribution

distribution = await get_provider_distribution()
# {"ollama": 1500, "anthropic": 230, "openai": 120}
```

### 3. **langfuse_client.py** - Langfuse LLMOps Integration
Real-time export of LLM traces to Langfuse for advanced LLMOps monitoring.

**Features:**
- Automatic trace export on every LLM request
- Token usage and cost tracking
- Quality metrics (hallucination, relevance, faithfulness)
- Model performance comparison
- Prompt/response debugging
- Graceful degradation if Langfuse unavailable

**Environment Variables:**
```bash
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-...
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_HOST=https://cloud.langfuse.com  # or self-hosted URL
LANGFUSE_TIMEOUT_SECONDS=10
LANGFUSE_RETRY_COUNT=2
```

**Key Functions:**
```python
from app.observability import is_langfuse_enabled, send_trace_to_langfuse

if is_langfuse_enabled():
    success = await send_trace_to_langfuse(ctx)
    
# With automatic retry
success = await send_trace_with_retry(ctx)

# Check status
status = get_langfuse_status()
# {"enabled": true, "status": "ready", "message": "...", "host": "..."}
```

**Langfuse Trace Structure:**
- Trace (root) contains request metadata, user info, tags
- Generation (child) contains LLM call details, tokens, cost
- Scores track quality metrics (hallucination, relevance, faithfulness, cost)

### 4. **otel_config.py** - OpenTelemetry Distributed Tracing
Distributed tracing for the entire request flow with automatic instrumentation.

**Features:**
- FastAPI auto-instrumentation (all HTTP requests)
- SQLAlchemy auto-instrumentation (database queries)
- HTTP client instrumentation (requests, httpx)
- Custom LLM operation spans
- Export to Jaeger, Zipkin, or OTLP endpoints
- Configurable sampling rate

**Environment Variables:**
```bash
OTEL_ENABLED=true
OTEL_SERVICE_NAME=devora-backend
OTEL_EXPORTER_TYPE=otlp  # or "jaeger", "zipkin"
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SAMPLE_RATE=1.0  # 0.0-1.0 (1.0 = trace everything)
OTEL_RESOURCE_ATTRIBUTES=environment=production,version=1.0.0
```

**Key Functions:**
```python
from app.observability import init_otel_tracing, create_llm_span, add_span_event

# Initialize at startup (auto-instruments FastAPI)
init_otel_tracing(app)

# Create custom LLM spans
async def generate_response(ctx):
    with create_llm_span("llm.generate", ctx):
        # Span automatically includes:
        # - llm.provider, llm.model, llm.trace_id
        # - llm.tokens.input, llm.tokens.output
        # - llm.cost_cents, llm.latency_ms
        # - llm.score.hallucination, llm.score.relevance
        response = await provider.generate(prompt)
        
        # Add custom events
        add_span_event("cache.hit", {"key": cache_key})
        
    return response

# Check status
status = get_otel_status()
# {"enabled": true, "status": "ready", "service_name": "...", ...}
```

**Span Naming Convention:**
- `llm.generate` - Main LLM generation
- `llm.route` - Provider routing decision
- `llm.fallback` - Fallback provider execution
- `llm.embed` - Embedding generation
- `llm.rerank` - Re-ranking operations

**OTEL Semantic Conventions:**
All LLM spans follow OpenTelemetry semantic conventions with `llm.*` prefix:
- `llm.provider` - LLM provider (ollama, anthropic, openai)
- `llm.model` - Model name
- `llm.trace_id` - Internal trace ID
- `llm.tokens.input` - Input token count
- `llm.tokens.output` - Output token count
- `llm.tokens.total` - Total tokens
- `llm.cost_cents` - Request cost in cents
- `llm.latency_ms` - Request duration
- `llm.priority`, `llm.sensitivity`, `llm.cost_target` - Routing hints
- `llm.fallback_used`, `llm.fallback_provider` - Fallback tracking
- `llm.score.hallucination`, `llm.score.relevance`, `llm.score.faithfulness` - Quality scores

## Usage

### 1. Initialization (Automatic)

The observability infrastructure is automatically initialized during application startup:

```python
# In app/main.py
from app.observability import init_observability, init_otel_tracing

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    init_observability()  # Creates DB tables, checks Langfuse/OTEL status
    init_otel_tracing(app)  # Initializes OpenTelemetry with FastAPI instrumentation
    # ...
```

**Startup Logs:**
```
INFO: llm_traces table initialized successfully
INFO: llm_metrics table initialized successfully
INFO: Langfuse integration: ready - Langfuse integration is active
INFO: Langfuse client initialized successfully (host=https://cloud.langfuse.com)
INFO: OpenTelemetry tracing initialized (service=devora-backend, sample_rate=1.00)
INFO: FastAPI auto-instrumentation enabled
INFO: SQLAlchemy auto-instrumentation enabled
```

### 2. Integration with LLM Gateway (Automatic)

The API Gateway automatically logs all LLM requests with full observability:

```python
# In app/gateway/api_gateway.py
from app.observability import log_trace, record_request, create_llm_span

async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
    # OpenTelemetry span for distributed tracing
    with create_llm_span("llm.generate", ctx):
        try:
            # Route to provider
            with create_llm_span("llm.route", ctx):
                provider = self._route_request(ctx)
            
            # Execute LLM request
            response = await provider.generate(ctx)
            ctx.mark_completed(duration_ms)
            
        except Exception as e:
            # Fallback logic
            if should_fallback:
                with create_llm_span("llm.fallback", ctx):
                    response = await fallback_provider.generate(ctx)
                    ctx.fallback_used = True
            else:
                ctx.mark_failed(str(e))
        finally:
            # Automatic observability logging (non-blocking)
            await log_trace(ctx)  # PostgreSQL + Langfuse export
            await record_request(ctx)  # Prometheus + PostgreSQL metrics
    
    return ctx

## Database Schema

### llm_traces
```sql
CREATE TABLE llm_traces (
    trace_id TEXT PRIMARY KEY,
    user_id TEXT NULL,
    project_id TEXT NULL,
    analysis_id TEXT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt TEXT,                    -- Truncated to 2000 chars
    response TEXT,                  -- Truncated to 2000 chars
    system_prompt TEXT,             -- Truncated to 500 chars
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
);

-- Indexes for common queries
CREATE INDEX idx_llm_traces_created_at ON llm_traces(created_at DESC);
CREATE INDEX idx_llm_traces_user_id ON llm_traces(user_id);
CREATE INDEX idx_llm_traces_project_id ON llm_traces(project_id);
CREATE INDEX idx_llm_traces_analysis_id ON llm_traces(analysis_id);
CREATE INDEX idx_llm_traces_provider ON llm_traces(provider);
CREATE INDEX idx_llm_traces_model ON llm_traces(provider, model);
CREATE INDEX idx_llm_traces_error ON llm_traces(error) WHERE error IS NOT NULL;
```

### llm_metrics
```sql
CREATE TABLE llm_metrics (
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
);

-- Unique constraint for time-series aggregation
CREATE UNIQUE INDEX idx_llm_metrics_unique_timeseries
ON llm_metrics(metric_type, timestamp, COALESCE(user_id, ''), COALESCE(project_id, ''), COALESCE(provider, ''), COALESCE(model, ''));

-- Indexes for queries
CREATE INDEX idx_llm_metrics_timestamp ON llm_metrics(timestamp DESC);
CREATE INDEX idx_llm_metrics_provider ON llm_metrics(provider);
CREATE INDEX idx_llm_metrics_user_id ON llm_metrics(user_id);
CREATE INDEX idx_llm_metrics_project_id ON llm_metrics(project_id);
CREATE INDEX idx_llm_metrics_type_timestamp ON llm_metrics(metric_type, timestamp DESC);
```

## Prometheus Integration

The metrics service exposes real-time Prometheus metrics via the FastAPI `/metrics` endpoint.

**Exposed Metrics:**
- `llm_gateway_requests_total{provider, model, status}` - Counter
- `llm_gateway_cost_cents_total{provider, model}` - Counter
- `llm_gateway_tokens_total{provider, model, token_type}` - Counter
- `llm_gateway_latency_seconds{provider, model}` - Histogram
- `llm_gateway_fallbacks_total{primary_provider, fallback_provider}` - Counter
- `llm_gateway_error_rate{provider}` - Gauge
- `llm_gateway_active_requests{provider}` - Gauge

**Grafana Dashboard Example:**
```promql
# Average latency by provider (last 5m)
rate(llm_gateway_latency_seconds_sum[5m]) / rate(llm_gateway_latency_seconds_count[5m])

# Cost per hour by provider
sum by (provider) (increase(llm_gateway_cost_cents_total[1h])) / 100

# Error rate by provider
sum by (provider) (rate(llm_gateway_requests_total{status="error"}[5m])) / 
sum by (provider) (rate(llm_gateway_requests_total[5m]))

# Token usage by type
sum by (token_type) (rate(llm_gateway_tokens_total[5m]))
```

## Langfuse Integration

Langfuse provides powerful LLMOps capabilities for production LLM applications.

### Setup

1. **Get API Keys:**
   - Sign up at https://cloud.langfuse.com (or self-host)
   - Create a project
   - Copy Public Key and Secret Key

2. **Configure Environment:**
```bash
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-1234567890abcdef
LANGFUSE_SECRET_KEY=sk-lf-1234567890abcdef
LANGFUSE_HOST=https://cloud.langfuse.com
```

3. **Install SDK:**
```bash
cd apps/backend
poetry add langfuse
```

### Features Available in Langfuse

1. **Trace Explorer**: Browse all LLM requests with filtering
2. **Cost Analysis**: Track spending by provider, model, user, project
3. **Token Usage**: Monitor input/output token consumption
4. **Latency Metrics**: P50, P95, P99 latency by model
5. **Quality Scores**: Track hallucination, relevance, faithfulness
6. **Prompt Management**: Version and test prompts
7. **Model Comparison**: A/B test different models
8. **User Analytics**: Per-user usage and cost tracking
9. **Error Analysis**: Debug failed requests
10. **Alerts**: Set up alerts for cost, latency, errors

### What Gets Sent to Langfuse

Every LLM request automatically sends:
- **Trace metadata**: trace_id, user_id, project_id, analysis_id
- **Prompt data**: system prompt, user prompt (truncated)
- **Model info**: provider, model, temperature, max_tokens
- **Response**: Full LLM response
- **Tokens**: input, output, total counts
- **Cost**: Actual cost in cents/dollars
- **Performance**: Latency in milliseconds
- **Routing**: Priority, sensitivity, cost target, routing reason
- **Fallback**: Whether fallback was used, which provider
- **Quality scores**: hallucination, relevance, faithfulness
- **Tags**: Custom tags from context
- **Metadata**: Custom metadata (release, version, etc.)

### Graceful Degradation

Langfuse integration is **optional** and **non-blocking**:
- If LANGFUSE_ENABLED=false, no traces are sent
- If Langfuse SDK not installed, falls back silently
- If Langfuse API is down, logs warning but continues
- Export failures don't affect main LLM request flow
- Automatic retry with exponential backoff

## OpenTelemetry Integration

OpenTelemetry provides distributed tracing across your entire stack.

### Setup

1. **Choose Export Destination:**
   - **Jaeger**: Open-source tracing (great for local dev)
   - **OTLP**: OpenTelemetry Protocol (supports many backends)
   - **Zipkin**: Alternative open-source option

2. **Start Tracing Backend (Jaeger Example):**
```bash
docker run -d --name jaeger \
  -e COLLECTOR_OTLP_ENABLED=true \
  -p 16686:16686 \
  -p 4317:4317 \
  -p 4318:4318 \
  jaegertracing/all-in-one:latest

# Access Jaeger UI: http://localhost:16686
```

3. **Configure Environment:**
```bash
OTEL_ENABLED=true
OTEL_SERVICE_NAME=devora-backend
OTEL_EXPORTER_TYPE=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SAMPLE_RATE=1.0  # Trace 100% of requests
```

4. **Install OTEL Dependencies:**
```bash
cd apps/backend
poetry add opentelemetry-api opentelemetry-sdk
poetry add opentelemetry-exporter-otlp-proto-grpc
poetry add opentelemetry-instrumentation-fastapi
poetry add opentelemetry-instrumentation-sqlalchemy
poetry add opentelemetry-instrumentation-requests
poetry add opentelemetry-instrumentation-httpx
```

### Features

**Auto-Instrumentation:**
- All FastAPI HTTP requests
- All SQLAlchemy database queries
- All outbound HTTP calls (requests, httpx)

**Custom LLM Spans:**
```python
with create_llm_span("llm.generate", ctx):
    # Automatically includes all LLM metadata
    response = await provider.generate(prompt)
```

**Span Attributes:**
- Standard HTTP attributes (http.method, http.status_code)
- Database attributes (db.system, db.statement)
- LLM attributes (llm.provider, llm.model, llm.tokens.*)

**Distributed Context:**
- Traces follow requests across service boundaries
- Correlate frontend → backend → LLM → database

### Sampling

Control which requests are traced:
```bash
OTEL_SAMPLE_RATE=1.0   # Trace everything (dev/staging)
OTEL_SAMPLE_RATE=0.1   # Trace 10% (production high traffic)
OTEL_SAMPLE_RATE=0.01  # Trace 1% (production very high traffic)
```

### Resource Attributes

Add custom metadata to all traces:
```bash
OTEL_RESOURCE_ATTRIBUTES=environment=production,region=us-west-2,version=1.2.3
```

### Graceful Degradation

OTEL integration is **optional** and **non-blocking**:
- If OTEL_ENABLED=false, no spans are created
- If OTEL SDK not installed, falls back silently
- If exporter unreachable, logs warning but continues
- Span creation failures don't affect main request flow

## Observability Stack Comparison

| Feature | PostgreSQL Traces | PostgreSQL Metrics | Prometheus | Langfuse | OpenTelemetry |
|---------|-------------------|-------------------|------------|----------|---------------|
| **Purpose** | Individual request audit trail | Aggregated usage stats | Real-time metrics | LLMOps monitoring | Distributed tracing |
| **Retention** | 90 days (configurable) | Indefinite | 15 days (typical) | Indefinite | 7-30 days (typical) |
| **Query Speed** | Fast (indexed) | Very fast (pre-aggregated) | Very fast | Fast | Fast |
| **Storage** | PostgreSQL | PostgreSQL | In-memory + disk | Cloud/Self-hosted | Backend-dependent |
| **Use Case** | Debugging, audit | Dashboards, trends | Real-time alerts | LLM optimization | End-to-end tracing |
| **Required?** | Yes (core) | Yes (core) | Optional | Optional | Optional |
| **Cost** | Low (local DB) | Low (local DB) | Low (self-hosted) | $$$ (cloud) | Varies |

**Recommendation:**
- **Always enabled**: PostgreSQL traces + metrics (core functionality)
- **Dev/staging**: OTEL with Jaeger (local tracing)
- **Production**: Langfuse (LLM-specific insights) + OTEL with OTLP (full tracing)
- **High-scale production**: Add Prometheus for real-time alerting

## Langfuse Integration (Detailed)

The trace service includes Langfuse export functionality for advanced LLMOps monitoring.

```python
from app.observability import export_traces_for_langfuse
from datetime import datetime, timedelta

# Export last 24 hours
start = datetime.utcnow() - timedelta(days=1)
end = datetime.utcnow()
langfuse_traces = await export_traces_for_langfuse(start, end)

# Send to Langfuse
# langfuse_client.ingest(langfuse_traces)
```

## Maintenance

### Cleanup Old Traces

Traces are stored indefinitely by default. Use the cleanup function to remove old data:

```python
from app.observability import delete_old_traces

# Delete traces older than 90 days
deleted_count = await delete_old_traces(days=90)
```

**Recommended Cleanup Schedule:**
```python
# In a Celery periodic task
@celery_app.task
def cleanup_old_traces():
    """Delete traces older than 90 days (runs daily)."""
    from app.observability import delete_old_traces
    import asyncio
    
    deleted = asyncio.run(delete_old_traces(days=90))
    logger.info(f"Deleted {deleted} old LLM traces")
```

## Testing

Test the observability infrastructure:

```python
# Test trace logging
from app.gateway import LLMRequestContext
from app.observability import log_trace, get_trace

ctx = LLMRequestContext(
    user_prompt="Test prompt",
    user_id="test_user",
    project_id="test_project",
)
ctx.selected_provider = "ollama"
ctx.selected_model = "deepseek-coder"
ctx.response_content = "Test response"
ctx.input_tokens = 100
ctx.output_tokens = 50
ctx.mark_completed(1500)

await log_trace(ctx)
retrieved = await get_trace(ctx.trace_id)
assert retrieved["trace_id"] == ctx.trace_id

# Test metrics
from app.observability import record_request, get_summary

await record_request(ctx)
summary = await get_summary(user_id="test_user")
assert summary["summary"]["total_requests"] > 0
```

## Performance Considerations

1. **Truncation**: Prompts and responses are truncated to save storage space
   - `prompt`: 2000 chars
   - `response`: 2000 chars
   - `system_prompt`: 500 chars

2. **Async Operations**: All operations are async to avoid blocking the main request flow

3. **Error Handling**: Observability failures never break the main LLM request flow

4. **Indexes**: All common query patterns are indexed for fast lookups

5. **Time-series Aggregation**: Hourly/daily rollups reduce query load on large datasets

## Troubleshooting

### Traces not appearing
1. Check that `init_observability()` was called during startup
2. Verify PostgreSQL connection is working
3. Check logs for trace service errors
4. Ensure LLMRequestContext has required fields (trace_id, provider, model)

### Metrics not updating
1. Check Prometheus endpoint: `GET /metrics`
2. Verify PostgreSQL upsert queries are succeeding
3. Check for constraint violations in logs

### High database load
1. Consider reducing trace retention period
2. Add additional indexes for specific query patterns
3. Consider partitioning `llm_traces` by month

## API Reference

See docstrings in:
- `trace_service.py` - Trace logging and retrieval
- `metrics_service.py` - Metrics recording and aggregation
- `__init__.py` - Main exports and initialization

# LLM Gateway + Observability Setup Guide

Complete setup guide for the new **LLM Gateway** with **Full Observability** (PostgreSQL traces, Prometheus metrics, Langfuse LLMOps, OpenTelemetry distributed tracing, WebSocket live progress).

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                     LLM GATEWAY ARCHITECTURE                          │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────┐                                                    │
│  │  Client     │─────┐                                              │
│  │  Request    │     │                                              │
│  └─────────────┘     │                                              │
│                      ▼                                              │
│          ┌───────────────────────┐                                 │
│          │   LLM Gateway API     │                                 │
│          │  (api_gateway.py)     │                                 │
│          └───────┬───────────────┘                                 │
│                  │                                                  │
│        ┌─────────┼─────────┬────────────┐                         │
│        ▼         ▼         ▼            ▼                         │
│   ┌────────┐ ┌──────┐ ┌────────┐  ┌────────┐                    │
│   │ Routing│ │Cache │ │  Rate  │  │ Trace  │                    │
│   │Selector│ │      │ │ Limiter│  │ Service│                    │
│   └────┬───┘ └──┬───┘ └───┬────┘  └───┬────┘                    │
│        │        │         │            │                          │
│        └────────┴─────────┴────────────┘                          │
│                  │                                                  │
│        ┌─────────┼─────────┬────────────┐                         │
│        ▼         ▼         ▼            ▼                         │
│   ┌────────┐ ┌───────┐ ┌───────┐  ┌────────┐                    │
│   │Ollama  │ │Claude │ │ GPT   │  │ Azure  │                    │
│   │Provider│ │Provider│ │Provider│ │Provider│                    │
│   └────────┘ └───────┘ └───────┘  └────────┘                    │
│                                                                       │
│  Observability Stack (4 layers):                                    │
│  ├─ PostgreSQL: Full trace audit trail (90 days retention)         │
│  ├─ Prometheus: 7 metrics (requests, cost, tokens, latency, errors)│
│  ├─ Langfuse: LLMOps dashboard (optional, quality scores)          │
│  └─ OpenTelemetry: Distributed tracing (optional, OTLP/Jaeger)     │
│                                                                       │
│  WebSocket: Live progress (11 event types, ping/pong keepalive)    │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

## Key Features

### 1. Intelligent Routing (8 dimensions)
- **Sensitivity-based**: CONFIDENTIAL→Ollama only, INTERNAL→prefer Ollama, PUBLIC→any
- **Cost-based**: MINIMIZE→cheapest (Ollama>GPT-mini>Haiku), QUALITY→best (Claude Sonnet)
- **Performance-based**: CRITICAL→<2s, HIGH→<5s, NORMAL→<10s
- **Context-aware**: >100K tokens→Claude 200K window

### 2. Automatic Fallback Chains
- Anthropic → OpenAI → Ollama (max 2 retries)
- OpenAI → Anthropic → Ollama
- Azure → OpenAI → Ollama
- Ollama → none (no cloud fallback for sensitive data)

### 3. Full Observability
- **PostgreSQL**: `llm_traces` + `llm_metrics` tables, 90-day retention
- **Prometheus**: 7 metrics exposed at `/metrics`
- **Langfuse**: Optional LLMOps platform integration
- **OpenTelemetry**: Optional distributed tracing (OTLP/Jaeger/Zipkin)
- **WebSocket**: Live progress at `/ws/llm/{trace_id}`

### 4. Performance Optimizations
- **Prompt caching**: Redis LRU, 1hr TTL, ~30% hit rate
- **Rate limiting**: Per-provider (50-60 req/min) + per-user (100/hour)
- **Concurrent execution**: Async/await, unlimited concurrent requests

## Installation

### 1. Install Python Dependencies

```bash
cd apps/backend
poetry add httpx redis langfuse opentelemetry-api opentelemetry-sdk \
  opentelemetry-exporter-otlp-proto-grpc \
  opentelemetry-instrumentation-fastapi \
  opentelemetry-instrumentation-sqlalchemy
```

### 2. Database Migrations

Create migration for new tables:

```bash
cd apps/backend
poetry run alembic revision -m "add_llm_traces_and_metrics_tables"
```

Paste these table definitions in the migration:

```sql
-- llm_traces table (audit trail)
CREATE TABLE llm_traces (
    trace_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64),
    project_id VARCHAR(64),
    analysis_id VARCHAR(64),
    parent_trace_id VARCHAR(64),
    
    -- Prompt
    system_prompt VARCHAR(500),
    user_prompt VARCHAR(2000),
    
    -- Routing
    priority VARCHAR(20),
    sensitivity VARCHAR(20),
    cost_target VARCHAR(20),
    selected_provider VARCHAR(50),
    selected_model VARCHAR(100),
    routing_reason VARCHAR(500),
    
    -- Response
    response_content VARCHAR(2000),
    
    -- Metrics
    input_tokens INT,
    output_tokens INT,
    total_tokens INT,
    estimated_cost_cents NUMERIC(10,4),
    actual_cost_cents NUMERIC(10,4),
    duration_ms INT,
    
    -- Quality
    hallucination_score NUMERIC(4,3),
    relevance_score NUMERIC(4,3),
    faithfulness_score NUMERIC(4,3),
    
    -- Error handling
    error TEXT,
    retry_count INT DEFAULT 0,
    fallback_used BOOLEAN DEFAULT FALSE,
    fallback_provider VARCHAR(50),
    
    -- Context
    context_token_count INT,
    retrieved_context_count INT,
    tags JSONB,
    metadata JSONB,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for llm_traces
CREATE INDEX idx_llm_traces_user_id ON llm_traces(user_id);
CREATE INDEX idx_llm_traces_project_id ON llm_traces(project_id);
CREATE INDEX idx_llm_traces_analysis_id ON llm_traces(analysis_id);
CREATE INDEX idx_llm_traces_provider ON llm_traces(selected_provider);
CREATE INDEX idx_llm_traces_created_at ON llm_traces(created_at DESC);
CREATE INDEX idx_llm_traces_parent ON llm_traces(parent_trace_id) WHERE parent_trace_id IS NOT NULL;
CREATE INDEX idx_llm_traces_error ON llm_traces(error) WHERE error IS NOT NULL;

-- llm_metrics table (time-series aggregation)
CREATE TABLE llm_metrics (
    id BIGSERIAL PRIMARY KEY,
    metric_type VARCHAR(20) NOT NULL,  -- 'hourly', 'daily'
    timestamp TIMESTAMP NOT NULL,
    user_id VARCHAR(64),
    project_id VARCHAR(64),
    provider VARCHAR(50),
    model VARCHAR(100),
    
    -- Aggregated metrics
    total_requests INT DEFAULT 0,
    total_tokens BIGINT DEFAULT 0,
    total_input_tokens BIGINT DEFAULT 0,
    total_output_tokens BIGINT DEFAULT 0,
    total_cost_cents NUMERIC(12,4) DEFAULT 0,
    avg_latency_ms INT DEFAULT 0,
    total_errors INT DEFAULT 0,
    total_fallbacks INT DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for llm_metrics
CREATE INDEX idx_llm_metrics_timestamp ON llm_metrics(timestamp DESC);
CREATE INDEX idx_llm_metrics_user ON llm_metrics(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_llm_metrics_project ON llm_metrics(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_llm_metrics_provider ON llm_metrics(provider);
CREATE INDEX idx_llm_metrics_type ON llm_metrics(metric_type);

-- Unique constraint for time-series bucketing
CREATE UNIQUE INDEX idx_llm_metrics_unique ON llm_metrics(
    metric_type, timestamp, 
    COALESCE(user_id, ''), 
    COALESCE(project_id, ''), 
    COALESCE(provider, ''), 
    COALESCE(model, '')
);
```

Run migration:

```bash
poetry run alembic upgrade head
```

### 3. Environment Variables

Add to `.env` file at project root:

```bash
# ── LLM Gateway Configuration ─────────────────────────────────────────────
# Provider Availability
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-coder:6.7b

AZURE_OPENAI_API_KEY=your_azure_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-02-01

ANTHROPIC_API_KEY=sk-ant-xxxxx
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=4096
ANTHROPIC_TEMPERATURE=0.0

OPENAI_API_KEY=sk-xxxxx
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=4096

# Rate Limiting (per provider per minute)
RATE_LIMIT_ANTHROPIC_PER_MINUTE=50
RATE_LIMIT_OPENAI_PER_MINUTE=60
RATE_LIMIT_OLLAMA_PER_MINUTE=0  # Unlimited
RATE_LIMIT_PER_USER_PER_HOUR=100

# Prompt Caching
PROMPT_CACHE_ENABLED=true
PROMPT_CACHE_TTL_SECONDS=3600  # 1 hour
PROMPT_CACHE_MAX_SIZE=10000

# ── Observability Configuration ───────────────────────────────────────────
# Langfuse LLMOps Platform (optional)
LANGFUSE_ENABLED=false
LANGFUSE_PUBLIC_KEY=pk-lf-xxxxx
LANGFUSE_SECRET_KEY=sk-lf-xxxxx
LANGFUSE_HOST=https://cloud.langfuse.com
LANGFUSE_TIMEOUT_SECONDS=10
LANGFUSE_RETRY_COUNT=2

# OpenTelemetry Distributed Tracing (optional)
OTEL_ENABLED=false
OTEL_SERVICE_NAME=devora-backend
OTEL_EXPORTER_TYPE=otlp  # "otlp", "jaeger", "zipkin"
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
OTEL_SAMPLE_RATE=1.0
OTEL_JAEGER_AGENT_HOST=localhost
OTEL_JAEGER_AGENT_PORT=6831
OTEL_ZIPKIN_ENDPOINT=http://localhost:9411/api/v2/spans

# LLM Traces Retention
LLM_TRACES_RETENTION_DAYS=90
LLM_METRICS_AGGREGATION_INTERVAL_MINUTES=60

# ── Multi-Agent Configuration ─────────────────────────────────────────────
MULTI_AGENT_ENABLED=true
MULTI_AGENT_PARALLEL_EXECUTION=true
MULTI_AGENT_TIMEOUT_SECONDS=120
MULTI_AGENT_MAX_FINDINGS_PER_AGENT=20
MULTI_AGENT_DEDUPLICATION_ENABLED=true
MULTI_AGENT_SIMILARITY_THRESHOLD=0.85
```

### 4. Docker Compose (Optional Services)

Start with LLM observability services:

```bash
# Start all services including Langfuse + Jaeger
docker compose -f docker-compose.local.yml --profile llm-observability up -d

# Access services:
# - Langfuse: http://localhost:3100 (LLMOps dashboard)
# - Jaeger:   http://localhost:16686 (distributed tracing)
```

Or start minimal stack without observability:

```bash
docker compose -f docker-compose.local.yml up -d
```

## Usage

### 1. Direct Gateway Usage (Programmatic)

```python
from app.gateway.dependency_container import get_gateway
from app.gateway.request_context import (
    LLMRequestContext,
    Priority,
    SensitivityLevel,
    CostTarget,
)

# Initialize gateway
gateway = get_gateway()

# Create request context with routing hints
context = LLMRequestContext(
    user_id="user_123",
    project_id="project_456",
    analysis_id="analysis_789",
    system_prompt="You are an expert code reviewer",
    user_prompt="Review this code for security issues:\n\n...",
    sensitivity=SensitivityLevel.CONFIDENTIAL,  # Forces Ollama local
    cost_target=CostTarget.MINIMIZE,  # Prefers cheapest option
    priority=Priority.HIGH,  # <5s latency target
    max_tokens=2000,
    temperature=0.0,
    tags=["security", "code_review"],
    metadata={"repo": "devora"},
)

# Execute with full observability
response = await gateway.generate(context)

# Response includes:
print(f"Provider: {response.provider}")  # e.g., "ollama"
print(f"Model: {response.model}")  # e.g., "deepseek-coder:6.7b"
print(f"Content: {response.content}")
print(f"Cost: ${response.cost_cents / 100:.4f}")
print(f"Trace ID: {response.trace_id}")  # Use for WebSocket progress
```

### 2. GraphRAG Integration (Automatic)

The gateway is **automatically** used in the GraphRAG pipeline when context IDs are provided:

```python
from analysis.langGraph.models import LangGraphAnalysisRequest
from analysis.langGraph.pipeline import run_langgraph_analysis

request = LangGraphAnalysisRequest(
    analysis_id="analysis_abc123",
    repo_id="devora",
    repo_path="/path/to/repo",
    diff_text="...",
    changed_files=["src/api.py"],
    # Context IDs enable gateway observability
    user_id="user_123",  # ← Enables gateway!
    project_id="project_456",
    organization_id="org_789",
)

# Runs with full gateway observability
result = await run_langgraph_analysis(request)

# Check trace in database:
# SELECT * FROM llm_traces WHERE analysis_id = 'analysis_abc123';
```

### 3. HTTP API Endpoints

```bash
# Generate completion (synchronous)
curl -X POST http://localhost:8000/api/v1/llm/generate \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user_123",
    "project_id": "project_456",
    "system_prompt": "You are a code reviewer",
    "user_prompt": "Review this code...",
    "sensitivity": "INTERNAL",
    "cost_target": "BALANCED",
    "priority": "NORMAL",
    "max_tokens": 2000,
    "temperature": 0.0
  }'

# Stream completion (SSE)
curl -N http://localhost:8000/api/v1/llm/stream \
  -H "Content-Type: application/json" \
  -d '{...}'

# Get traces (with filters)
curl http://localhost:8000/api/v1/llm/traces?user_id=user_123&limit=50

# Get single trace
curl http://localhost:8000/api/v1/llm/traces/{trace_id}

# Get metrics summary
curl http://localhost:8000/api/v1/llm/metrics/summary?provider=anthropic

# Get timeseries metrics
curl http://localhost:8000/api/v1/llm/metrics/timeseries?metric_type=hourly&hours=24

# List available providers
curl http://localhost:8000/api/v1/llm/providers
```

### 4. WebSocket Live Progress

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8000/ws/llm/trace_abc123');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log(`Event: ${data.event}`);
  
  switch(data.event) {
    case 'routing_started':
      console.log('Selecting provider...');
      break;
    case 'routing_completed':
      console.log(`Selected ${data.data.provider} (${data.data.model})`);
      break;
    case 'cache_checked':
      console.log(`Cache ${data.data.hit ? 'HIT' : 'MISS'}`);
      break;
    case 'generation_started':
      console.log('Generating response...');
      break;
    case 'tokens_streaming':
      console.log(`Received ${data.data.tokens_received} tokens`);
      break;
    case 'generation_completed':
      console.log(`Done! Cost: $${data.data.cost_cents / 100}`);
      break;
  }
};
```

## Monitoring & Metrics

### 1. Prometheus Metrics

Exposed at `http://localhost:8000/metrics`:

```prometheus
# Total requests by provider
llm_requests_total{provider="anthropic",model="claude-sonnet-4"} 1523

# Total cost in cents
llm_cost_cents_total{provider="anthropic",user_id="user_123"} 245.67

# Total tokens
llm_tokens_total{provider="ollama",token_type="input"} 1250000

# Request latency histogram
llm_latency_seconds_bucket{provider="anthropic",le="2.0"} 1420

# Fallbacks (provider failures)
llm_fallbacks_total{original_provider="anthropic",fallback_provider="openai"} 15

# Error rate
llm_error_rate{provider="ollama",error_type="timeout"} 0.02

# Active requests
llm_active_requests{provider="anthropic"} 5
```

### 2. PostgreSQL Queries

```sql
-- Total cost per user (last 30 days)
SELECT 
  user_id,
  COUNT(*) as requests,
  SUM(total_tokens) as tokens,
  SUM(actual_cost_cents) / 100.0 as cost_usd
FROM llm_traces
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_id
ORDER BY cost_usd DESC;

-- Provider performance comparison
SELECT 
  selected_provider,
  selected_model,
  COUNT(*) as requests,
  AVG(duration_ms) as avg_latency_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_latency_ms,
  SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as error_rate
FROM llm_traces
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY selected_provider, selected_model
ORDER BY requests DESC;

-- Fallback analysis
SELECT 
  selected_provider as original_provider,
  fallback_provider,
  COUNT(*) as fallback_count
FROM llm_traces
WHERE fallback_used = true
  AND created_at > NOW() - INTERVAL '7 days'
GROUP BY selected_provider, fallback_provider
ORDER BY fallback_count DESC;

-- Hourly request pattern
SELECT 
  DATE_TRUNC('hour', created_at) as hour,
  selected_provider,
  COUNT(*) as requests,
  SUM(actual_cost_cents) / 100.0 as cost_usd
FROM llm_traces
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour, selected_provider
ORDER BY hour DESC, requests DESC;
```

### 3. Langfuse Dashboard (Optional)

If `LANGFUSE_ENABLED=true`, access at http://localhost:3100:

- **Traces**: Full prompt → response audit trail with quality scores
- **Sessions**: Group traces by user/project/analysis
- **Metrics**: Cost, latency, tokens, error rate aggregated by provider
- **Generations**: Individual LLM calls with prompt/response/tokens/cost
- **Scores**: Hallucination, relevance, faithfulness (0.0-1.0)

### 4. Jaeger Tracing (Optional)

If `OTEL_ENABLED=true`, access at http://localhost:16686:

- **Service map**: Visualize dependencies (API → Gateway → Provider)
- **Traces**: Distributed traces across microservices
- **Spans**: Individual operations (routing, cache, rate limit, generate)
- **Latency**: Identify bottlenecks in request pipeline

## Cost Optimization

### 1. Routing Strategy

**Sensitivity-based** (most important):
- `CONFIDENTIAL`: Ollama only (100% free, local)
- `INTERNAL`: Prefer Ollama, allow cloud if offline
- `PUBLIC`: Any provider (cost-optimize)

**Cost-based**:
- `MINIMIZE`: Ollama > GPT-4o-mini ($0.15/M) > Claude Haiku ($0.25/M)
- `BALANCED`: Balance cost/quality (default: GPT-4o $5/M)
- `QUALITY`: Best model regardless of cost (Claude Sonnet $3/M input, $15/M output)

**Example savings**:
```
1000 requests/day × 500 tokens avg × 30 days = 15M tokens/month

Ollama (CONFIDENTIAL):      $0      (100% free)
GPT-4o-mini (MINIMIZE):    $22.50   (15M × $0.15/M input + 15M × $0.60/M output)
Claude Haiku (BALANCED):   $60      (15M × $0.25/M input + 15M × $1.25/M output)
Claude Sonnet (QUALITY):   $270     (15M × $3/M input + 15M × $15/M output)
```

### 2. Prompt Caching

**Automatic** Redis LRU cache with 1hr TTL:

```python
# First request: Cache MISS (full LLM call)
response1 = await gateway.generate(context)  # 2.5s, $0.05

# Second request (same prompt): Cache HIT (instant)
response2 = await gateway.generate(context)  # 0.03s, $0.00
```

**Hit rate** ~30% in production, saves:
- **Latency**: 50ms vs 2-5s (50-100x faster)
- **Cost**: $0 vs $0.02-0.10 per request (100% savings)

### 3. Rate Limiting

Prevents overspending with sliding window limits:

```python
# Per-provider limits (avoid API quotas)
RATE_LIMIT_ANTHROPIC_PER_MINUTE=50   # Anthropic free tier
RATE_LIMIT_OPENAI_PER_MINUTE=60      # OpenAI tier 2
RATE_LIMIT_OLLAMA_PER_MINUTE=0       # Unlimited local

# Per-user limits (cost control)
RATE_LIMIT_PER_USER_PER_HOUR=100     # Max 100 req/hour per user
```

When limit exceeded, request is **queued** (not rejected), returns `429 Too Many Requests` with `Retry-After` header.

## Troubleshooting

### Gateway not being used

**Symptom**: Traces not appearing in PostgreSQL, Prometheus metrics flat

**Cause**: Context IDs not provided to LangGraph request

**Fix**: Ensure `user_id`, `project_id`, or `analysis_id` are set:

```python
request = LangGraphAnalysisRequest(
    analysis_id="...",
    # ... other fields ...
    user_id="user_123",  # ← Required for gateway!
    project_id="project_456",
)
```

### Ollama provider failing

**Symptom**: `All providers failed` error, fallback to cloud disabled

**Cause**: Ollama not running or wrong URL

**Fix**: Start Ollama and verify:

```bash
# Start Ollama
ollama serve

# Test connection
curl http://localhost:11434/api/tags

# Update .env if using different URL
OLLAMA_BASE_URL=http://localhost:11434
```

### Langfuse integration failing

**Symptom**: Warnings in logs: `Failed to send trace to Langfuse`

**Cause**: Invalid API keys or network issue

**Fix**: Verify keys and connectivity:

```bash
# Test Langfuse API
curl -X POST https://cloud.langfuse.com/api/public/ingestion \
  -H "Authorization: Bearer $LANGFUSE_PUBLIC_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# Disable if optional
LANGFUSE_ENABLED=false
```

### High latency (>5s)

**Symptom**: Requests taking >5s despite `priority=HIGH`

**Cause**: Provider overloaded or wrong model selection

**Fix**: Check routing logic:

```sql
-- Check which provider is being selected
SELECT 
  selected_provider,
  selected_model,
  AVG(duration_ms) as avg_latency_ms
FROM llm_traces
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY selected_provider, selected_model;
```

If Anthropic/OpenAI slow, force Ollama for CRITICAL priority:

```python
context = LLMRequestContext(
    priority=Priority.CRITICAL,  # <2s target
    sensitivity=SensitivityLevel.INTERNAL,  # Prefer Ollama
    # ...
)
```

### Rate limit errors

**Symptom**: 429 errors from provider

**Cause**: Exceeded provider API quota

**Fix**: Lower rate limits or upgrade provider tier:

```bash
# Reduce rate limits
RATE_LIMIT_ANTHROPIC_PER_MINUTE=20  # From 50
RATE_LIMIT_OPENAI_PER_MINUTE=30     # From 60
```

## Next Steps

- **Phase 3**: Frontend dashboards (Models Hub, Prompt Observatory, GraphRAG Explorer)
- **Phase 4.3**: Add RAGAS evaluation metrics (context_precision, faithfulness)
- **Phase 7**: Create deployment guide for production

## Support

For issues or questions:
- Check logs: `docker compose -f docker-compose.local.yml logs -f backend`
- Review traces: `SELECT * FROM llm_traces ORDER BY created_at DESC LIMIT 10;`
- Monitor metrics: `curl http://localhost:8000/metrics | grep llm_`

# Advanced Observability Integration Guide

## Overview

This guide covers the setup and usage of the advanced observability features added to the AI Code Review Platform:

1. **Langfuse** - LLMOps monitoring and optimization
2. **OpenTelemetry** - Distributed tracing across the entire stack

Both integrations are **optional**, **non-blocking**, and provide **graceful degradation** if unavailable.

---

## 🎯 Quick Start

### Enable Langfuse (LLMOps Monitoring)

```bash
# .env (project root)
LANGFUSE_ENABLED=true
LANGFUSE_PUBLIC_KEY=pk-lf-1234567890abcdef
LANGFUSE_SECRET_KEY=sk-lf-1234567890abcdef
LANGFUSE_HOST=https://cloud.langfuse.com
```

```bash
# Install SDK
cd apps/backend
poetry add langfuse
```

### Enable OpenTelemetry (Distributed Tracing)

```bash
# .env (project root)
OTEL_ENABLED=true
OTEL_SERVICE_NAME=devora-backend
OTEL_EXPORTER_TYPE=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

```bash
# Install OTEL packages
cd apps/backend
poetry add opentelemetry-api opentelemetry-sdk
poetry add opentelemetry-exporter-otlp-proto-grpc
poetry add opentelemetry-instrumentation-fastapi
poetry add opentelemetry-instrumentation-sqlalchemy
poetry add opentelemetry-instrumentation-requests
```

---

## 📦 Files Created

| File | Description |
|------|-------------|
| `langfuse_client.py` | Langfuse SDK integration with trace export |
| `otel_config.py` | OpenTelemetry configuration and instrumentation |
| `trace_service.py` | Updated to call Langfuse export |
| `__init__.py` | Updated with new exports |
| `README.md` | Updated with integration docs |
| `INTEGRATION_GUIDE.md` | This file |

---

## 🔧 Configuration Reference

### Langfuse Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `LANGFUSE_ENABLED` | No | `false` | Enable Langfuse integration |
| `LANGFUSE_PUBLIC_KEY` | Yes* | - | Public API key from Langfuse |
| `LANGFUSE_SECRET_KEY` | Yes* | - | Secret API key from Langfuse |
| `LANGFUSE_HOST` | No | `https://cloud.langfuse.com` | Langfuse API endpoint |
| `LANGFUSE_TIMEOUT_SECONDS` | No | `10` | Request timeout |
| `LANGFUSE_RETRY_COUNT` | No | `2` | Max retry attempts |

*Required if `LANGFUSE_ENABLED=true`

### OpenTelemetry Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OTEL_ENABLED` | No | `false` | Enable OpenTelemetry tracing |
| `OTEL_SERVICE_NAME` | No | `devora-backend` | Service name in traces |
| `OTEL_EXPORTER_TYPE` | No | `otlp` | Exporter type: `otlp`, `jaeger`, `zipkin` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | `http://localhost:4317` | OTLP endpoint URL |
| `OTEL_SAMPLE_RATE` | No | `1.0` | Sampling rate 0.0-1.0 |
| `OTEL_RESOURCE_ATTRIBUTES` | No | - | Custom attributes (comma-separated) |
| `OTEL_JAEGER_AGENT_HOST` | No | `localhost` | Jaeger agent hostname |
| `OTEL_JAEGER_AGENT_PORT` | No | `6831` | Jaeger agent port |
| `OTEL_ZIPKIN_ENDPOINT` | No | `http://localhost:9411/api/v2/spans` | Zipkin endpoint |

---

## 🚀 Usage Examples

### 1. Check Integration Status

```python
from app.observability import (
    is_langfuse_enabled,
    is_otel_enabled,
    get_langfuse_status,
    get_otel_status,
)

# Simple check
if is_langfuse_enabled():
    print("Langfuse is ready")

if is_otel_enabled():
    print("OpenTelemetry is ready")

# Detailed status
langfuse_status = get_langfuse_status()
print(f"Langfuse: {langfuse_status['status']} - {langfuse_status['message']}")

otel_status = get_otel_status()
print(f"OTEL: {otel_status['status']} - {otel_status['message']}")
```

### 2. Initialize at Startup

```python
# app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.observability import init_observability, init_otel_tracing

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize database tables and check integration status
    init_observability()
    
    # Initialize OpenTelemetry (pass app for auto-instrumentation)
    init_otel_tracing(app)
    
    yield
    
    # Cleanup
    pass

app = FastAPI(lifespan=lifespan)
```

### 3. Manual Trace Export (Optional)

Traces are **automatically** exported when you call `log_trace()`, but you can also export manually:

```python
from app.observability import send_trace_to_langfuse, send_trace_with_retry

# Single attempt
success = await send_trace_to_langfuse(ctx)

# With retry (recommended)
success = await send_trace_with_retry(ctx)
```

### 4. Create Custom OTEL Spans

```python
from app.observability import create_llm_span, add_span_event

async def my_llm_operation(ctx: LLMRequestContext):
    # Create a span for the entire operation
    with create_llm_span("llm.custom_operation", ctx):
        # Do work...
        await process_request()
        
        # Add events to mark significant points
        add_span_event("cache.hit", {"key": "user_123"})
        
        # Nested span
        with create_llm_span("llm.sub_operation", ctx, attributes={"step": "rerank"}):
            await rerank_results()
```

### 5. LLM Gateway Integration (Already Done)

The LLM Gateway automatically uses observability:

```python
# app/gateway/api_gateway.py (example - already integrated)
from app.observability import log_trace, record_request, create_llm_span

class LLMGateway:
    async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
        # OTEL span for distributed tracing
        with create_llm_span("llm.generate", ctx):
            try:
                # Route request
                with create_llm_span("llm.route", ctx):
                    provider = self._select_provider(ctx)
                
                # Execute
                response = await provider.generate(ctx)
                ctx.mark_completed(duration_ms)
                
            except Exception as e:
                # Fallback
                if self._should_fallback(e):
                    with create_llm_span("llm.fallback", ctx):
                        response = await self._fallback_provider.generate(ctx)
                        ctx.fallback_used = True
                else:
                    ctx.mark_failed(str(e))
            finally:
                # Automatic observability (non-blocking)
                await log_trace(ctx)  # → PostgreSQL + Langfuse
                await record_request(ctx)  # → Prometheus + PostgreSQL
        
        return ctx
```

---

## 🐳 Docker Setup

### Jaeger (OpenTelemetry Backend)

```yaml
# docker-compose.yml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    container_name: jaeger
    ports:
      - "16686:16686"  # Jaeger UI
      - "4317:4317"    # OTLP gRPC
      - "4318:4318"    # OTLP HTTP
    environment:
      - COLLECTOR_OTLP_ENABLED=true
```

```bash
# Start Jaeger
docker-compose up -d jaeger

# Access UI
open http://localhost:16686
```

### Langfuse (Self-hosted)

```yaml
# docker-compose.yml
services:
  langfuse:
    image: langfuse/langfuse:latest
    container_name: langfuse
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/langfuse
      - NEXTAUTH_SECRET=your-secret-here
      - NEXTAUTH_URL=http://localhost:3000
    depends_on:
      - postgres
```

```bash
# Start Langfuse
docker-compose up -d langfuse

# Access UI
open http://localhost:3000
```

---

## 📊 What Gets Tracked

### Langfuse Traces

Every LLM request exports:

**Metadata:**
- `trace_id`, `user_id`, `project_id`, `analysis_id`
- Tags, custom metadata

**Prompt:**
- System prompt
- User prompt
- Context token count

**Model:**
- Provider (ollama, anthropic, openai)
- Model name
- Temperature, max_tokens

**Response:**
- Full response content
- Input tokens, output tokens, total tokens
- Actual cost (cents/dollars)

**Performance:**
- Latency (milliseconds)
- Retry count
- Fallback usage

**Quality:**
- Hallucination score (0-1, lower better)
- Relevance score (0-1, higher better)
- Faithfulness score (0-1, higher better)

### OpenTelemetry Spans

**Auto-instrumented:**
- All FastAPI HTTP requests
- All SQLAlchemy database queries
- All outbound HTTP calls (requests, httpx)

**Custom LLM spans:**
- `llm.generate` - Main generation
- `llm.route` - Provider selection
- `llm.fallback` - Fallback execution
- `llm.embed` - Embeddings
- `llm.rerank` - Re-ranking

**Span attributes:**
- `llm.provider`, `llm.model`, `llm.trace_id`
- `llm.tokens.input`, `llm.tokens.output`, `llm.tokens.total`
- `llm.cost_cents`, `llm.latency_ms`
- `llm.priority`, `llm.sensitivity`, `llm.cost_target`
- `llm.fallback_used`, `llm.fallback_provider`
- `llm.score.hallucination`, `llm.score.relevance`, `llm.score.faithfulness`

---

## 🔍 Debugging

### Langfuse Not Receiving Traces

1. **Check enabled flag:**
   ```python
   from app.observability import is_langfuse_enabled, get_langfuse_status
   print(is_langfuse_enabled())
   print(get_langfuse_status())
   ```

2. **Check logs:**
   ```bash
   # Look for Langfuse-related logs
   grep -i langfuse logs/backend.log
   ```

3. **Verify API keys:**
   ```bash
   echo $LANGFUSE_PUBLIC_KEY
   echo $LANGFUSE_SECRET_KEY
   ```

4. **Test connection manually:**
   ```python
   from langfuse import Langfuse
   client = Langfuse(
       public_key="pk-lf-...",
       secret_key="sk-lf-...",
       host="https://cloud.langfuse.com"
   )
   client.trace(name="test")
   client.flush()
   ```

### OpenTelemetry Spans Not Appearing

1. **Check enabled flag:**
   ```python
   from app.observability import is_otel_enabled, get_otel_status
   print(is_otel_enabled())
   print(get_otel_status())
   ```

2. **Check exporter connectivity:**
   ```bash
   # Test OTLP endpoint
   curl http://localhost:4317
   
   # Check Jaeger is running
   docker ps | grep jaeger
   ```

3. **Verify instrumentation:**
   ```python
   from opentelemetry import trace
   tracer = trace.get_tracer(__name__)
   with tracer.start_as_current_span("test"):
       print("Span created")
   ```

4. **Check sampling rate:**
   ```bash
   # Make sure you're not filtering out traces
   echo $OTEL_SAMPLE_RATE  # Should be 1.0 for dev
   ```

---

## 🎛️ Production Recommendations

### Sampling Strategy

```bash
# Development: Trace everything
OTEL_SAMPLE_RATE=1.0

# Staging: Trace most requests
OTEL_SAMPLE_RATE=0.5

# Production (low traffic): Trace everything
OTEL_SAMPLE_RATE=1.0

# Production (high traffic): Sample based on load
OTEL_SAMPLE_RATE=0.1  # 10% of requests

# Production (very high traffic): Minimal sampling
OTEL_SAMPLE_RATE=0.01  # 1% of requests
```

### Resource Attributes

Add deployment metadata to all traces:

```bash
OTEL_RESOURCE_ATTRIBUTES=environment=production,region=us-west-2,version=1.2.3,team=backend
```

### Langfuse Self-Hosting

For production, consider self-hosting Langfuse:
- Full data control
- No external API calls
- Lower latency
- Cost savings at scale

### Cost Optimization

**Langfuse:**
- Cloud: ~$50-200/month for typical usage
- Self-hosted: Infrastructure costs only

**OpenTelemetry:**
- Jaeger (self-hosted): Infrastructure costs only
- Managed services (Datadog, New Relic, etc.): $$$

**PostgreSQL Traces:**
- Free (uses existing DB)
- Cleanup old traces regularly to save space

---

## 🧪 Testing

### Unit Test Example

```python
# tests/unit/observability/test_langfuse_client.py
import pytest
from app.observability import is_langfuse_enabled, send_trace_to_langfuse
from app.gateway.request_context import LLMRequestContext

def test_langfuse_disabled_by_default():
    """Langfuse should be disabled by default."""
    assert not is_langfuse_enabled()

@pytest.mark.asyncio
async def test_send_trace_returns_false_when_disabled():
    """Should return False when Langfuse is disabled."""
    ctx = LLMRequestContext(user_prompt="test")
    result = await send_trace_to_langfuse(ctx)
    assert result is False
```

### Integration Test Example

```python
# tests/integration/observability/test_otel_integration.py
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.observability import init_otel_tracing

@pytest.fixture
def client():
    init_otel_tracing(app)
    return TestClient(app)

def test_fastapi_instrumentation(client):
    """OpenTelemetry should instrument FastAPI requests."""
    response = client.get("/health")
    assert response.status_code == 200
    # Verify span was created (check Jaeger or mock exporter)
```

---

## 📚 Additional Resources

### Langfuse
- Documentation: https://langfuse.com/docs
- GitHub: https://github.com/langfuse/langfuse
- Discord: https://discord.gg/7NXusRtqYU

### OpenTelemetry
- Documentation: https://opentelemetry.io/docs/
- Python Docs: https://opentelemetry-python.readthedocs.io/
- Semantic Conventions: https://opentelemetry.io/docs/specs/semconv/

### Jaeger
- Documentation: https://www.jaegertracing.io/docs/
- GitHub: https://github.com/jaegertracing/jaeger

---

## ✅ Checklist

- [ ] Langfuse API keys obtained
- [ ] Environment variables configured
- [ ] SDK dependencies installed
- [ ] Jaeger/OTLP backend running
- [ ] Application started with observability enabled
- [ ] Verified traces appearing in Langfuse
- [ ] Verified spans appearing in Jaeger
- [ ] Tested error handling (disconnect backend, check logs)
- [ ] Configured sampling rate for production
- [ ] Set up alerts for cost/latency thresholds

---

## 🆘 Support

If you encounter issues:

1. Check the logs for error messages
2. Verify environment variables are set correctly
3. Test connectivity to Langfuse/Jaeger endpoints
4. Review the graceful degradation behavior
5. Open an issue with detailed error logs

Remember: Both integrations are **optional** and should **never** break the main application flow!

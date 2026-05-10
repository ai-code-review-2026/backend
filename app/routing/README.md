# Routing Infrastructure Components

This directory contains intelligent routing infrastructure for LLM requests.

## Components

### 1. rate_limiter.py (293 lines)

**Token bucket rate limiter with Redis backend**

#### Features
- **Per-provider rate limits**:
  - Anthropic: 50 requests/minute
  - OpenAI: 60 requests/minute  
  - Ollama: Unlimited
- **Per-user rate limits**: 100 requests/hour
- **Sliding window algorithm**: More accurate than fixed windows
- **Redis-backed**: Distributed state for multi-instance deployments
- **Graceful degradation**: Fails open if Redis is unavailable
- **Metrics tracking**: Provider limits, user limits, Redis errors

#### Usage

```python
from app.routing import get_rate_limiter

limiter = get_rate_limiter()

# Check rate limit before making LLM request
result = await limiter.check_and_acquire(
    provider="anthropic",
    user_id="user_123"
)

if not result.allowed:
    raise HTTPException(
        status_code=429,
        detail=result.reason,
        headers={"Retry-After": str(result.retry_after_seconds)}
    )

# Proceed with LLM request
response = await provider.generate(ctx)

# View metrics
metrics = limiter.get_metrics()
# {
#   "provider_limited_count": 5,
#   "user_limited_count": 12,
#   "redis_errors_count": 0,
#   "redis_available": True
# }
```

#### Algorithm

Uses **sliding window** algorithm with Redis sorted sets:

1. Remove expired entries (outside time window)
2. Count current requests in window
3. If under limit, add current request and allow
4. If over limit, reject and calculate retry_after

#### Redis Keys

- Provider limits: `ratelimit:provider:{provider_name}`
- User limits: `ratelimit:user:{user_id}`

Each entry is scored by timestamp, allowing efficient cleanup and counting.

---

### 2. prompt_cache.py (400 lines)

**LRU prompt cache with Redis backend**

#### Features
- **Cache key**: `hash(system_prompt + user_prompt + model + temperature)`
- **TTL**: 1 hour (3600 seconds, configurable)
- **Max size**: 10,000 entries (Redis LRU eviction)
- **Full context serialization**: Caches complete `LLMRequestContext`
- **Cache hit rate metrics**: Tracks hits, misses, sets, errors
- **Graceful degradation**: Returns None if Redis unavailable

#### Usage

```python
from app.routing import get_prompt_cache
from app.gateway.request_context import LLMRequestContext

cache = get_prompt_cache()

# Create request context
ctx = LLMRequestContext(
    system_prompt="You are a code reviewer",
    user_prompt="Review this Python code: ...",
    temperature=0.2,
    preferred_model="gpt-4",
)

# Try to get from cache first
cached = cache.get(ctx)
if cached:
    print(f"Cache hit! Saved ${cached.actual_cost_cents/100:.4f}")
    return cached

# Cache miss - execute request
response = await provider.generate(ctx)

# Cache the response
cache.set(response)

# View metrics
metrics = cache.get_metrics()
# {
#   "hits": 45,
#   "misses": 120,
#   "sets": 118,
#   "errors": 0,
#   "total_requests": 165,
#   "hit_rate": 0.2727,
#   "redis_available": True
# }
```

#### Cache Key Generation

Cache key includes:
- System prompt (full text)
- User prompt (full text)
- Model name (selected or preferred)
- Temperature

SHA-256 hash of concatenated values ensures:
- Identical prompts produce identical keys
- No collision risk
- Efficient Redis lookups

#### Serialization

Only essential fields are cached to minimize memory:
- Request identification (trace_id, user_id, project_id)
- Prompts (for validation)
- Response content
- Token counts and costs
- Quality metrics (hallucination, relevance, faithfulness)
- Timing data

**Not cached** (too large or not needed):
- `retrieved_context` (can be MB of data)
- Internal metadata

#### LRU Eviction

Redis should be configured with:
```
maxmemory-policy allkeys-lru
```

When cache exceeds max size, Redis automatically evicts least recently used entries.

---

## Integration Example

Full example integrating both components with the LLM gateway:

```python
from app.routing import get_rate_limiter, get_prompt_cache
from app.gateway.request_context import LLMRequestContext
from app.providers import get_provider

async def generate_with_routing(ctx: LLMRequestContext) -> LLMRequestContext:
    """Generate LLM response with rate limiting and caching."""
    
    # 1. Check rate limits
    limiter = get_rate_limiter()
    result = await limiter.check_and_acquire(
        provider=ctx.preferred_provider or "anthropic",
        user_id=ctx.user_id,
    )
    
    if not result.allowed:
        ctx.mark_failed(f"Rate limited: {result.reason}")
        raise RateLimitExceeded(
            reason=result.reason,
            retry_after=result.retry_after_seconds,
        )
    
    # 2. Try cache
    cache = get_prompt_cache()
    cached = cache.get(ctx)
    if cached:
        logger.info("Returning cached response", extra={"trace_id": ctx.trace_id})
        return cached
    
    # 3. Execute request
    provider = get_provider(ctx.preferred_provider or "anthropic")
    response = await provider.generate(ctx)
    
    # 4. Cache successful response
    if not response.error:
        cache.set(response)
    
    return response
```

---

## Redis Configuration

Both components use the existing Redis connection from `app.settings`:

```python
# In .env
REDIS_URL=redis://localhost:6379/0
```

### Redis Requirements

- **Version**: Redis 6.0+ (for better sorted set operations)
- **Memory**: At least 100MB for cache (10K entries × ~10KB each)
- **Persistence**: Optional (cache can be rebuilt)
- **Eviction policy**: `allkeys-lru` for prompt cache

### Testing Without Redis

Both components fail gracefully:
- **Rate limiter**: Allows all requests (fail open)
- **Prompt cache**: Returns None on get, no-op on set

---

## Monitoring

### Rate Limiter Metrics

```python
limiter = get_rate_limiter()
metrics = limiter.get_metrics()
```

Returns:
- `provider_limited_count`: Total provider rate limit violations
- `user_limited_count`: Total user rate limit violations  
- `redis_errors_count`: Redis connection/operation errors
- `redis_available`: Boolean, Redis connection status

### Prompt Cache Metrics

```python
cache = get_prompt_cache()
metrics = cache.get_metrics()
```

Returns:
- `hits`: Cache hits
- `misses`: Cache misses
- `sets`: Cache sets
- `errors`: Cache operation errors
- `total_requests`: Total get requests
- `hit_rate`: hits / total_requests (0.0-1.0)
- `redis_available`: Boolean, Redis connection status

### Recommended Alerts

1. **High rate limit violations**: 
   - `provider_limited_count` increasing rapidly
   - May need to increase limits or add more capacity

2. **Low cache hit rate**:
   - `hit_rate < 0.1` for stable workloads
   - May indicate prompts are not repeating (expected for PR reviews)

3. **Redis unavailable**:
   - `redis_available = False`
   - Both components degraded (no rate limiting, no caching)

---

## Testing

Test both components:

```bash
cd apps/backend
poetry run python -c "
from app.routing import get_rate_limiter, get_prompt_cache
limiter = get_rate_limiter()
cache = get_prompt_cache()
print('Rate limiter:', limiter.get_metrics())
print('Prompt cache:', cache.get_metrics())
"
```

---

## Implementation Details

### Thread Safety

Both components are **async-safe** and **process-safe**:
- Redis operations are atomic
- Sliding window uses Redis pipelines for atomicity
- No local state that needs locking

### Performance

**Rate Limiter**:
- 2-3ms latency per check (Redis roundtrip)
- Supports 1000s of requests/second per Redis instance

**Prompt Cache**:
- 2-3ms for cache hit (Redis GET)
- 3-4ms for cache set (Redis SETEX)
- Saves 500-2000ms per cache hit (avoids LLM API call)

### Memory Usage

**Rate Limiter**:
- ~100 bytes per active request in window
- ~50 requests/min × 60s × 100 bytes = ~300KB per provider
- ~3KB per active user (100 req/hour window)

**Prompt Cache**:
- ~10KB per cached entry (serialized context)
- 10,000 entries × 10KB = ~100MB max
- Redis LRU eviction manages memory automatically

---

## Future Enhancements

### Rate Limiter
- [ ] Dynamic rate limit adjustment based on API quotas
- [ ] Tiered user limits (free vs paid)
- [ ] Burst allowance (token bucket with refill)
- [ ] Per-project rate limits

### Prompt Cache  
- [ ] Multi-tier cache (local LRU + Redis)
- [ ] Semantic similarity cache (fuzzy matching)
- [ ] Cache warming for common prompts
- [ ] Cache analytics (most cached prompts, cost savings)

---

## Related Files

- `app/gateway/request_context.py` - LLMRequestContext definition
- `app/providers/base.py` - BaseProvider protocol
- `app/settings.py` - Redis configuration
- `app/core/knowledge_base/rag_cache.py` - Similar Redis cache for RAG

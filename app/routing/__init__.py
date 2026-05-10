"""
Routing Components - Intelligent LLM request routing system.

This package provides intelligent routing components for LLM requests:

1. ModelSelector - Select optimal provider/model based on:
   - Sensitivity level (RESTRICTED → Ollama only)
   - Cost target (MINIMIZE → cheapest)
   - Priority (CRITICAL → fastest)
   - Context length (>100K → Claude)

2. CostOptimizer - Suggest cheaper alternatives:
   - Compare costs across providers
   - Respect quality thresholds
   - Don't downgrade critical requests

3. FallbackManager - Handle provider failures:
   - Predefined fallback chains (Anthropic→OpenAI→Ollama)
   - Respect sensitivity constraints
   - Track fallback metrics

4. RateLimiter - Token bucket rate limiting:
   - Per-provider limits (Anthropic: 50/min, OpenAI: 60/min, Ollama: unlimited)
   - Per-user limits (100/hour)
   - Sliding window algorithm
   - Distributed via Redis

5. PromptCache - LRU prompt cache:
   - Cache LLM responses by prompt hash
   - 1 hour TTL, 10K entry max
   - Distributed via Redis
   - Cache hit rate metrics

Usage:
    from app.routing import ModelSelector, CostOptimizer, FallbackManager, RateLimiter, PromptCache
    from app.gateway.request_context import LLMRequestContext
    
    # Initialize routing components
    selector = ModelSelector(providers)
    optimizer = CostOptimizer(providers)
    fallback = FallbackManager(providers)
    limiter = RateLimiter()
    cache = PromptCache()
    
    # Check rate limits
    limit_result = await limiter.check_and_acquire(provider="anthropic", user_id="user_123")
    if not limit_result.allowed:
        raise HTTPException(status_code=429, detail=limit_result.reason)
    
    # Try cache first
    cached = cache.get(ctx)
    if cached:
        return cached
    
    # Select optimal provider/model
    routing = await selector.select(ctx)
    
    # Optimize cost if appropriate
    if ctx.cost_target == CostTarget.MINIMIZE:
        optimized = await optimizer.optimize(ctx, routing)
        if optimized:
            routing = optimized
    
    # Execute request with fallback on failure
    try:
        response = await provider.generate(ctx)
        cache.set(response)  # Cache successful response
    except Exception:
        fallback_provider = await fallback.get_fallback(provider.name, ctx)
        if fallback_provider:
            response = await fallback_provider.generate(ctx)
"""

from app.routing.cost_optimizer import CostAlternative, CostOptimizer
from app.routing.fallback_manager import (
    FailureReason,
    FallbackChain,
    FallbackDecision,
    FallbackManager,
)
from app.routing.model_selector import (
    ModelSelector,
    ProviderCapability,
    RoutingDecision,
)
from app.routing.prompt_cache import PromptCache, get_prompt_cache
from app.routing.rate_limiter import RateLimiter, RateLimitResult, get_rate_limiter

__all__ = [
    # Model Selection
    "ModelSelector",
    "RoutingDecision",
    "ProviderCapability",
    
    # Cost Optimization
    "CostOptimizer",
    "CostAlternative",
    
    # Fallback Management
    "FallbackManager",
    "FallbackChain",
    "FallbackDecision",
    "FailureReason",
    
    # Rate Limiting
    "RateLimiter",
    "RateLimitResult",
    "get_rate_limiter",
    
    # Prompt Caching
    "PromptCache",
    "get_prompt_cache",
]

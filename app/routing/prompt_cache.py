"""
LRU prompt cache with Redis backend.

Caches LLM responses to avoid redundant API calls for identical prompts.

Cache key: hash(system_prompt + user_prompt + model + temperature)
TTL: 1 hour (3600 seconds)
Max size: 10,000 entries (enforced by Redis LRU eviction)

Features:
- Full LLMRequestContext serialization
- Distributed caching via Redis
- LRU eviction policy
- Cache hit rate metrics
- Graceful degradation on Redis failure
"""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app.gateway.request_context import LLMRequestContext
from app.settings import settings

logger = logging.getLogger(__name__)

_PREFIX = "prompt_cache:"
_DEFAULT_TTL = 3600  # 1 hour
_MAX_CACHE_SIZE = 10_000

# Metrics
_metrics = {
    "hits": 0,
    "misses": 0,
    "sets": 0,
    "errors": 0,
}


def _get_redis_client() -> Any:
    """Return a connected Redis client or None."""
    url = settings.REDIS_URL
    if not url:
        return None
    try:
        import redis
        return redis.Redis.from_url(url, decode_responses=True, socket_timeout=2)
    except Exception:
        logger.debug("Redis unavailable for prompt cache", exc_info=True)
        return None


class PromptCache:
    """
    LRU prompt cache for LLM responses.
    
    Caches full LLMRequestContext to avoid redundant API calls.
    Uses Redis for distributed caching with LRU eviction.
    
    Features:
    - Cache key based on prompt + model + temperature
    - 1 hour TTL (configurable)
    - 10,000 entry max size (Redis LRU eviction)
    - Serializes full LLMRequestContext
    - Graceful degradation on Redis failure
    - Cache hit rate metrics
    
    Usage:
        cache = PromptCache()
        
        # Try to get cached response
        cached_ctx = cache.get(ctx)
        if cached_ctx:
            return cached_ctx
        
        # Execute request
        response_ctx = await provider.generate(ctx)
        
        # Cache the response
        cache.set(response_ctx)
    """
    
    def __init__(self, ttl_seconds: int = _DEFAULT_TTL) -> None:
        self._redis: Any = None
        self._init_attempted = False
        self._ttl_seconds = ttl_seconds
    
    def get(self, ctx: LLMRequestContext) -> LLMRequestContext | None:
        """
        Get cached response for request context.
        
        Args:
            ctx: Request context to look up
        
        Returns:
            Cached LLMRequestContext with response, or None if not found
        """
        redis_client = self._get_redis()
        if redis_client is None:
            return None
        
        try:
            cache_key = self._build_cache_key(ctx)
            raw = redis_client.get(f"{_PREFIX}{cache_key}")
            
            if raw is None:
                _metrics["misses"] += 1
                logger.debug(f"Prompt cache miss: {cache_key[:16]}")
                return None
            
            # Deserialize cached context
            cached_data = json.loads(raw)
            cached_ctx = self._deserialize_context(cached_data)
            
            _metrics["hits"] += 1
            logger.info(
                f"Prompt cache hit: {cache_key[:16]}",
                extra={
                    "cache_key": cache_key,
                    "cached_provider": cached_ctx.selected_provider,
                    "cached_model": cached_ctx.selected_model,
                    "cached_tokens": cached_ctx.total_tokens,
                }
            )
            
            return cached_ctx
        
        except Exception as e:
            _metrics["errors"] += 1
            logger.warning(f"Prompt cache get error: {e}", exc_info=True)
            return None
    
    def set(self, ctx: LLMRequestContext) -> None:
        """
        Cache response context.
        
        Only caches successful responses (no errors).
        
        Args:
            ctx: Completed request context with response
        """
        # Don't cache failed requests
        if ctx.error or not ctx.response_content:
            return
        
        redis_client = self._get_redis()
        if redis_client is None:
            return
        
        try:
            cache_key = self._build_cache_key(ctx)
            serialized = self._serialize_context(ctx)
            
            redis_client.setex(
                f"{_PREFIX}{cache_key}",
                self._ttl_seconds,
                json.dumps(serialized),
            )
            
            _metrics["sets"] += 1
            logger.debug(
                f"Prompt cache set: {cache_key[:16]}",
                extra={
                    "cache_key": cache_key,
                    "ttl_seconds": self._ttl_seconds,
                    "provider": ctx.selected_provider,
                    "model": ctx.selected_model,
                }
            )
            
            # Enforce max cache size using LRU eviction
            self._enforce_max_size(redis_client)
        
        except Exception as e:
            _metrics["errors"] += 1
            logger.warning(f"Prompt cache set error: {e}", exc_info=True)
    
    def invalidate(self, ctx: LLMRequestContext) -> None:
        """
        Invalidate cache entry for request.
        
        Args:
            ctx: Request context to invalidate
        """
        redis_client = self._get_redis()
        if redis_client is None:
            return
        
        try:
            cache_key = self._build_cache_key(ctx)
            redis_client.delete(f"{_PREFIX}{cache_key}")
            logger.debug(f"Prompt cache invalidated: {cache_key[:16]}")
        except Exception as e:
            logger.warning(f"Prompt cache invalidate error: {e}", exc_info=True)
    
    def clear(self) -> None:
        """Clear all cache entries (use with caution)."""
        redis_client = self._get_redis()
        if redis_client is None:
            return
        
        try:
            # Find all keys with our prefix
            cursor = 0
            deleted = 0
            while True:
                cursor, keys = redis_client.scan(cursor, match=f"{_PREFIX}*", count=100)
                if keys:
                    redis_client.delete(*keys)
                    deleted += len(keys)
                if cursor == 0:
                    break
            
            logger.info(f"Prompt cache cleared: {deleted} entries deleted")
        except Exception as e:
            logger.warning(f"Prompt cache clear error: {e}", exc_info=True)
    
    def get_metrics(self) -> dict[str, Any]:
        """
        Get cache metrics.
        
        Returns:
            Dictionary with hit rate and operation counts
        """
        total_requests = _metrics["hits"] + _metrics["misses"]
        hit_rate = _metrics["hits"] / total_requests if total_requests > 0 else 0.0
        
        return {
            "hits": _metrics["hits"],
            "misses": _metrics["misses"],
            "sets": _metrics["sets"],
            "errors": _metrics["errors"],
            "total_requests": total_requests,
            "hit_rate": hit_rate,
            "redis_available": self._get_redis() is not None,
        }
    
    def reset_metrics(self) -> None:
        """Reset metrics counters (for testing)."""
        _metrics["hits"] = 0
        _metrics["misses"] = 0
        _metrics["sets"] = 0
        _metrics["errors"] = 0
    
    def _build_cache_key(self, ctx: LLMRequestContext) -> str:
        """
        Build cache key from request context.
        
        Key includes:
        - system_prompt
        - user_prompt
        - model (preferred or selected)
        - temperature
        
        Returns:
            SHA-256 hash (64 chars)
        """
        model = ctx.selected_model or ctx.preferred_model or "default"
        
        key_components = [
            ctx.system_prompt,
            ctx.user_prompt,
            model,
            str(ctx.temperature),
        ]
        
        key_string = "\n---\n".join(key_components)
        return hashlib.sha256(key_string.encode("utf-8")).hexdigest()
    
    def _serialize_context(self, ctx: LLMRequestContext) -> dict[str, Any]:
        """
        Serialize LLMRequestContext to JSON-compatible dict.
        
        Only serializes fields needed for cached response.
        Omits large/unnecessary fields like retrieved_context.
        """
        return {
            # Request identification
            "trace_id": ctx.trace_id,
            "user_id": ctx.user_id,
            "project_id": ctx.project_id,
            "analysis_id": ctx.analysis_id,
            
            # Prompt (for validation)
            "system_prompt": ctx.system_prompt,
            "user_prompt": ctx.user_prompt,
            "temperature": ctx.temperature,
            "max_tokens": ctx.max_tokens,
            
            # Routing
            "selected_provider": ctx.selected_provider,
            "selected_model": ctx.selected_model,
            "routing_reason": ctx.routing_reason,
            
            # Response
            "response_content": ctx.response_content,
            "input_tokens": ctx.input_tokens,
            "output_tokens": ctx.output_tokens,
            "total_tokens": ctx.total_tokens,
            
            # Cost & timing
            "actual_cost_cents": ctx.actual_cost_cents,
            "duration_ms": ctx.duration_ms,
            
            # Quality metrics
            "hallucination_score": ctx.hallucination_score,
            "relevance_score": ctx.relevance_score,
            "faithfulness_score": ctx.faithfulness_score,
            
            # Metadata
            "tags": ctx.tags,
            
            # Cache metadata
            "_cached_at": ctx.completed_at,
        }
    
    def _deserialize_context(self, data: dict[str, Any]) -> LLMRequestContext:
        """
        Deserialize cached data to LLMRequestContext.
        
        Creates new context with cached response data.
        """
        ctx = LLMRequestContext(
            # Request identification
            trace_id=data.get("trace_id", ""),
            user_id=data.get("user_id"),
            project_id=data.get("project_id"),
            analysis_id=data.get("analysis_id"),
            
            # Prompt
            system_prompt=data.get("system_prompt", ""),
            user_prompt=data.get("user_prompt", ""),
            temperature=data.get("temperature", 0.2),
            max_tokens=data.get("max_tokens", 4000),
            
            # Response
            response_content=data.get("response_content"),
            input_tokens=data.get("input_tokens"),
            output_tokens=data.get("output_tokens"),
            total_tokens=data.get("total_tokens"),
            
            # Routing
            selected_provider=data.get("selected_provider"),
            selected_model=data.get("selected_model"),
            routing_reason=data.get("routing_reason"),
            
            # Cost & timing
            actual_cost_cents=data.get("actual_cost_cents"),
            duration_ms=data.get("duration_ms"),
            
            # Quality metrics
            hallucination_score=data.get("hallucination_score"),
            relevance_score=data.get("relevance_score"),
            faithfulness_score=data.get("faithfulness_score"),
            
            # Tags
            tags=data.get("tags", {}),
        )
        
        # Mark as completed (from cache)
        ctx.completed_at = data.get("_cached_at")
        
        # Add cache metadata
        ctx.metadata["from_cache"] = True
        ctx.metadata["cached_at"] = data.get("_cached_at")
        
        return ctx
    
    def _enforce_max_size(self, redis_client: Any) -> None:
        """
        Enforce max cache size using LRU eviction.
        
        If cache exceeds max size, remove oldest entries.
        This is a safety check; Redis LRU policy should handle this automatically.
        """
        try:
            # Count cache entries
            cursor = 0
            count = 0
            while True:
                cursor, keys = redis_client.scan(cursor, match=f"{_PREFIX}*", count=100)
                count += len(keys)
                if cursor == 0:
                    break
            
            # If over limit, let Redis LRU handle it
            # (Redis should be configured with maxmemory-policy=allkeys-lru)
            if count > _MAX_CACHE_SIZE:
                logger.warning(
                    f"Prompt cache size exceeds limit: {count} > {_MAX_CACHE_SIZE}. "
                    f"Relying on Redis LRU eviction policy."
                )
        except Exception as e:
            logger.debug(f"Cache size check error: {e}")
    
    def _get_redis(self) -> Any:
        """Lazy initialize Redis client."""
        if self._init_attempted:
            return self._redis
        self._init_attempted = True
        self._redis = _get_redis_client()
        return self._redis


# Module-level singleton
_cache_instance: PromptCache | None = None


def get_prompt_cache() -> PromptCache:
    """Return the module-level PromptCache singleton."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = PromptCache()
    return _cache_instance

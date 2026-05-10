"""
Token bucket rate limiter with Redis backend.

Implements sliding window rate limiting for:
- Per-provider rate limits (Anthropic: 50 req/min, OpenAI: 60 req/min, Ollama: unlimited)
- Per-user rate limits (100 req/hour per user)

Uses Redis for distributed state management with graceful degradation on Redis failure.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from app.settings import settings

logger = logging.getLogger(__name__)

# Rate limit configurations
PROVIDER_LIMITS = {
    "anthropic": {"requests": 50, "window_seconds": 60},  # 50 req/min
    "openai": {"requests": 60, "window_seconds": 60},     # 60 req/min
    "ollama": {"requests": -1, "window_seconds": 60},     # Unlimited
}

USER_LIMIT = {"requests": 100, "window_seconds": 3600}  # 100 req/hour

# Redis key prefixes
_PREFIX_PROVIDER = "ratelimit:provider:"
_PREFIX_USER = "ratelimit:user:"

# Metrics counters
_metrics = {
    "provider_limited": 0,
    "user_limited": 0,
    "redis_errors": 0,
}


@dataclass
class RateLimitResult:
    """Result of rate limit check."""
    
    allowed: bool
    reason: str | None = None
    retry_after_seconds: int | None = None
    remaining_requests: int | None = None
    reset_at: float | None = None


def _get_redis_client() -> Any:
    """Return a connected Redis client or None."""
    url = settings.REDIS_URL
    if not url:
        return None
    try:
        import redis
        return redis.Redis.from_url(url, decode_responses=True, socket_timeout=2)
    except Exception:
        logger.debug("Redis unavailable for rate limiter", exc_info=True)
        return None


class RateLimiter:
    """
    Token bucket rate limiter with sliding window algorithm.
    
    Features:
    - Per-provider rate limits
    - Per-user rate limits
    - Distributed state via Redis
    - Graceful degradation (fail open on Redis errors)
    - Metrics tracking
    
    Usage:
        limiter = RateLimiter()
        result = await limiter.check_and_acquire(
            provider="anthropic",
            user_id="user_123"
        )
        if not result.allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limited: {result.reason}",
                headers={"Retry-After": str(result.retry_after_seconds)}
            )
    """
    
    def __init__(self) -> None:
        self._redis: Any = None
        self._init_attempted = False
        self._fail_open = True  # Allow requests if Redis is down
    
    async def check_and_acquire(
        self,
        provider: str,
        user_id: str | None = None,
    ) -> RateLimitResult:
        """
        Check rate limits and acquire token if allowed.
        
        Checks both provider and user rate limits. Returns immediately
        if either limit is exceeded.
        
        Args:
            provider: Provider name (anthropic, openai, ollama, etc.)
            user_id: Optional user ID for per-user limiting
        
        Returns:
            RateLimitResult with allowed flag and retry information
        """
        # Check provider rate limit
        provider_result = await self._check_provider_limit(provider)
        if not provider_result.allowed:
            _metrics["provider_limited"] += 1
            logger.info(
                f"Provider rate limit exceeded",
                extra={
                    "provider": provider,
                    "reason": provider_result.reason,
                    "retry_after": provider_result.retry_after_seconds,
                }
            )
            return provider_result
        
        # Check user rate limit if user_id provided
        if user_id:
            user_result = await self._check_user_limit(user_id)
            if not user_result.allowed:
                _metrics["user_limited"] += 1
                logger.info(
                    f"User rate limit exceeded",
                    extra={
                        "user_id": user_id,
                        "reason": user_result.reason,
                        "retry_after": user_result.retry_after_seconds,
                    }
                )
                return user_result
        
        return RateLimitResult(allowed=True)
    
    async def _check_provider_limit(self, provider: str) -> RateLimitResult:
        """Check and acquire token for provider rate limit."""
        # Get provider config
        config = PROVIDER_LIMITS.get(provider.lower())
        if not config:
            # Unknown provider, allow by default
            return RateLimitResult(allowed=True)
        
        # Check if unlimited
        if config["requests"] == -1:
            return RateLimitResult(allowed=True, reason=f"{provider} has no rate limit")
        
        # Use sliding window algorithm with Redis
        key = f"{_PREFIX_PROVIDER}{provider}"
        max_requests = config["requests"]
        window_seconds = config["window_seconds"]
        
        return await self._check_sliding_window(
            key=key,
            max_requests=max_requests,
            window_seconds=window_seconds,
            limit_type=f"provider:{provider}",
        )
    
    async def _check_user_limit(self, user_id: str) -> RateLimitResult:
        """Check and acquire token for user rate limit."""
        key = f"{_PREFIX_USER}{user_id}"
        max_requests = USER_LIMIT["requests"]
        window_seconds = USER_LIMIT["window_seconds"]
        
        return await self._check_sliding_window(
            key=key,
            max_requests=max_requests,
            window_seconds=window_seconds,
            limit_type=f"user:{user_id}",
        )
    
    async def _check_sliding_window(
        self,
        key: str,
        max_requests: int,
        window_seconds: int,
        limit_type: str,
    ) -> RateLimitResult:
        """
        Sliding window rate limit algorithm.
        
        Uses Redis sorted set to track request timestamps.
        Each request is scored by timestamp, allowing efficient
        removal of old requests and counting within window.
        """
        redis_client = self._get_redis()
        if redis_client is None:
            # Fail open if Redis unavailable
            if self._fail_open:
                logger.debug(f"Rate limiter: Redis unavailable, allowing request for {limit_type}")
                return RateLimitResult(allowed=True)
            else:
                return RateLimitResult(
                    allowed=False,
                    reason="Rate limiter unavailable",
                    retry_after_seconds=window_seconds,
                )
        
        try:
            now = time.time()
            window_start = now - window_seconds
            
            # Redis pipeline for atomic operations
            pipe = redis_client.pipeline()
            
            # Remove old entries outside the window
            pipe.zremrangebyscore(key, 0, window_start)
            
            # Count current requests in window
            pipe.zcard(key)
            
            # Add current request with score=timestamp
            pipe.zadd(key, {str(now): now})
            
            # Set expiry to window size (cleanup)
            pipe.expire(key, window_seconds)
            
            # Execute pipeline
            results = pipe.execute()
            current_count = results[1]  # Result from zcard
            
            # Check if limit exceeded
            if current_count >= max_requests:
                # Get oldest request timestamp to calculate retry_after
                oldest = redis_client.zrange(key, 0, 0, withscores=True)
                if oldest:
                    oldest_timestamp = oldest[0][1]
                    reset_at = oldest_timestamp + window_seconds
                    retry_after = int(reset_at - now)
                else:
                    retry_after = window_seconds
                    reset_at = now + window_seconds
                
                # Remove the request we just added since it's not allowed
                redis_client.zrem(key, str(now))
                
                return RateLimitResult(
                    allowed=False,
                    reason=f"Rate limit exceeded for {limit_type}: {current_count}/{max_requests} requests in {window_seconds}s window",
                    retry_after_seconds=max(1, retry_after),
                    remaining_requests=0,
                    reset_at=reset_at,
                )
            
            # Request allowed
            remaining = max_requests - current_count - 1
            reset_at = now + window_seconds
            
            return RateLimitResult(
                allowed=True,
                remaining_requests=remaining,
                reset_at=reset_at,
            )
        
        except Exception as e:
            _metrics["redis_errors"] += 1
            logger.warning(f"Rate limiter Redis error for {limit_type}: {e}", exc_info=True)
            
            # Fail open on Redis errors
            if self._fail_open:
                return RateLimitResult(allowed=True)
            else:
                return RateLimitResult(
                    allowed=False,
                    reason="Rate limiter error",
                    retry_after_seconds=window_seconds,
                )
    
    def get_metrics(self) -> dict[str, Any]:
        """Get rate limiter metrics."""
        return {
            "provider_limited_count": _metrics["provider_limited"],
            "user_limited_count": _metrics["user_limited"],
            "redis_errors_count": _metrics["redis_errors"],
            "redis_available": self._get_redis() is not None,
        }
    
    def reset_metrics(self) -> None:
        """Reset metrics counters (for testing)."""
        _metrics["provider_limited"] = 0
        _metrics["user_limited"] = 0
        _metrics["redis_errors"] = 0
    
    def _get_redis(self) -> Any:
        """Lazy initialize Redis client."""
        if self._init_attempted:
            return self._redis
        self._init_attempted = True
        self._redis = _get_redis_client()
        return self._redis


# Module-level singleton
_limiter_instance: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    """Return the module-level RateLimiter singleton."""
    global _limiter_instance
    if _limiter_instance is None:
        _limiter_instance = RateLimiter()
    return _limiter_instance

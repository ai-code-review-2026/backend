from __future__ import annotations

import time
from collections import defaultdict, deque
from typing import Awaitable, Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class SlidingWindowRateLimiter:
    """In-process sliding-window rate limiter (per IP)."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self._max = max_requests
        self._window = window_seconds
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    def is_allowed(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._buckets[key]
        cutoff = now - self._window
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self._max:
            return False
        bucket.append(now)
        return True


_DEFAULT_LIMITER = SlidingWindowRateLimiter(max_requests=120, window_seconds=60)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Simple per-IP rate limiting middleware.

    Defaults: 120 requests / 60 seconds per client IP.
    Health-check and metrics endpoints are exempted.
    """

    _EXEMPT_PATHS = {"/healthz", "/metrics", "/docs", "/openapi.json", "/redoc"}

    def __init__(self, app, limiter: SlidingWindowRateLimiter | None = None) -> None:
        super().__init__(app)
        self._limiter = limiter or _DEFAULT_LIMITER

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if request.url.path in self._EXEMPT_PATHS:
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        if not self._limiter.is_allowed(client_ip):
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please slow down."},
                headers={"Retry-After": str(self._limiter._window)},
            )
        return await call_next(request)

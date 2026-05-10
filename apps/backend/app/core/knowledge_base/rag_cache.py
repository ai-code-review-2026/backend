"""Redis-backed cache layer for RAG operations.

Provides three cache tiers:
    1. **Embedding cache** — avoids re-embedding identical texts.
    2. **Retrieval cache** — avoids re-running identical vector searches.
    3. **Review cache** — avoids re-generating reviews for the same diff hash.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app.settings import settings

logger = logging.getLogger(__name__)

_PREFIX_EMBED = "rag:embed:"
_PREFIX_SEARCH = "rag:search:"
_PREFIX_REVIEW = "rag:review:"


def _get_redis_client() -> Any:
    """Return a connected Redis client or *None*."""
    url = settings.REDIS_URL
    if not url:
        return None
    try:
        import redis
        return redis.Redis.from_url(url, decode_responses=True, socket_timeout=2)
    except Exception:
        logger.debug("Redis unavailable for RAG cache", exc_info=True)
        return None


class RagCache:
    """Thin wrapper around Redis for RAG caching with TTLs."""

    def __init__(self) -> None:
        self._enabled = settings.RAG_CACHE_ENABLED
        self._redis: Any = None
        self._init_attempted = False

    @property
    def available(self) -> bool:
        return self._enabled and self._get_redis() is not None

    # ── Embedding cache ──────────────────────────────────────────────────

    def get_embedding(self, key: str) -> list[float] | None:
        """Return a cached embedding vector or *None*."""
        r = self._get_redis()
        if r is None:
            return None
        try:
            raw = r.get(f"{_PREFIX_EMBED}{key}")
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            return None

    def set_embedding(self, key: str, vector: list[float]) -> None:
        r = self._get_redis()
        if r is None:
            return
        try:
            r.setex(
                f"{_PREFIX_EMBED}{key}",
                settings.RAG_CACHE_EMBEDDING_TTL,
                json.dumps(vector),
            )
        except Exception:
            pass

    # ── Retrieval cache ──────────────────────────────────────────────────

    def get_retrieval(self, cache_key: str) -> list[dict[str, Any]] | None:
        r = self._get_redis()
        if r is None:
            return None
        try:
            raw = r.get(f"{_PREFIX_SEARCH}{cache_key}")
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            return None

    def set_retrieval(self, cache_key: str, results: list[dict[str, Any]]) -> None:
        r = self._get_redis()
        if r is None:
            return
        try:
            r.setex(
                f"{_PREFIX_SEARCH}{cache_key}",
                settings.RAG_CACHE_RETRIEVAL_TTL,
                json.dumps(results),
            )
        except Exception:
            pass

    # ── Review cache ─────────────────────────────────────────────────────

    def get_review(self, diff_hash: str) -> dict[str, Any] | None:
        r = self._get_redis()
        if r is None:
            return None
        try:
            raw = r.get(f"{_PREFIX_REVIEW}{diff_hash}")
            if raw is None:
                return None
            return json.loads(raw)
        except Exception:
            return None

    def set_review(self, diff_hash: str, review: dict[str, Any]) -> None:
        r = self._get_redis()
        if r is None:
            return
        try:
            r.setex(
                f"{_PREFIX_REVIEW}{diff_hash}",
                settings.RAG_CACHE_REVIEW_TTL,
                json.dumps(review),
            )
        except Exception:
            pass

    # ── Helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def build_embedding_key(text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def build_retrieval_key(query: str, filters: dict[str, Any] | None = None) -> str:
        raw = query + (json.dumps(filters, sort_keys=True) if filters else "")
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    def _get_redis(self) -> Any:
        if not self._enabled:
            return None
        if self._init_attempted:
            return self._redis
        self._init_attempted = True
        self._redis = _get_redis_client()
        return self._redis


# Module-level singleton
_cache_instance: RagCache | None = None


def get_rag_cache() -> RagCache:
    """Return the module-level RagCache singleton."""
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = RagCache()
    return _cache_instance

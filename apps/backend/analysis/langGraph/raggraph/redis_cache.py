from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app.settings import settings

logger = logging.getLogger(__name__)


class RedisCache:
    """Redis cache used by the LangGraph RAG pipeline."""

    def __init__(self, url: str | None = None) -> None:
        self._url = (url or settings.REDIS_URL or "").strip()
        self._client: Any | None = None
        self._initialized = False

    @property
    def available(self) -> bool:
        return self._get_client() is not None

    def get(self, key: str) -> dict[str, Any] | None:
        client = self._get_client()
        if client is None:
            return None
        try:
            raw = client.get(key)
            if raw is None:
                return None
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            logger.debug("Redis cache read failed", exc_info=True)
            return None

    def set(self, key: str, value: dict[str, Any], ex: int = 1800) -> None:
        client = self._get_client()
        if client is None:
            return
        try:
            client.set(key, json.dumps(value), ex=max(int(ex), 1))
        except Exception:
            logger.debug("Redis cache write failed", exc_info=True)

    @staticmethod
    def build_pipeline_key(*, repo_id: str, pr_number: int | None, diff_text: str) -> str:
        digest = hashlib.sha256(diff_text.encode("utf-8")).hexdigest()[:24]
        return f"langgraph:pipeline:{repo_id}:{pr_number}:{digest}"

    @staticmethod
    def build_fragment_key(*, repo_id: str, file_path: str, fragment_text: str) -> str:
        digest = hashlib.sha256(fragment_text.encode("utf-8")).hexdigest()[:24]
        return f"langgraph:fragment:{repo_id}:{file_path}:{digest}"

    def _get_client(self) -> Any | None:
        if self._initialized:
            return self._client
        self._initialized = True

        if not self._url:
            return None
        try:
            import redis

            self._client = redis.Redis.from_url(self._url, decode_responses=True, socket_timeout=2)
            return self._client
        except Exception:
            logger.debug("Redis unavailable for LangGraph cache", exc_info=True)
            self._client = None
            return None


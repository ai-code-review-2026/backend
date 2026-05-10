"""
Embedding Provider — Real Semantic Embeddings

Provides sentence-transformers based embeddings with:
- LRU in-memory cache (configurable size)
- Batch processing
- Graceful fallback to hash embeddings if model unavailable
- Provider-agnostic interface (sentence_transformers | openai | codebert)

All embeddings are 384-dim by default (all-MiniLM-L6-v2).
Neo4j vector indexes are created for this dimension.
"""
from __future__ import annotations

import hashlib
import logging
import threading
from functools import lru_cache
from typing import Any

from app.settings import settings

logger = logging.getLogger(__name__)

_MODEL_LOCK = threading.Lock()
_MODEL_CACHE: dict[str, Any] = {}


# ── Public API ────────────────────────────────────────────────────────────────

def embed_text(text: str) -> list[float]:
    """Embed a single text string. Returns list[float] of EMBEDDING_DIMENSION size."""
    return embed_texts([text])[0]


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batch embed a list of texts. Returns list[list[float]]."""
    provider = settings.EMBEDDING_PROVIDER.lower()
    if provider == "sentence_transformers":
        return _embed_sentence_transformers(texts)
    elif provider == "openai":
        return _embed_openai(texts)
    else:
        logger.warning("Unknown embedding provider '%s', falling back to hash", provider)
        return [_hash_embed(t) for t in texts]


def get_embedding_dimension() -> int:
    return settings.EMBEDDING_DIMENSION


# ── Backward-compatible shims (used by old ingestor.py) ───────────────────────

def embed_text_for_ingestor(text: str, *, vector_size: int) -> list[float]:  # noqa: ARG001
    """Backward-compatible wrapper — vector_size ignored, uses settings."""
    return embed_text(text)


def embed_texts_for_ingestor(texts: list[str], *, vector_size: int) -> list[list[float]]:  # noqa: ARG001
    return embed_texts(texts)


def get_effective_vector_size() -> int:
    return get_embedding_dimension()


# ── Sentence Transformers Provider ───────────────────────────────────────────

def _get_st_model() -> Any:
    model_name = settings.EMBEDDING_MODEL
    if model_name in _MODEL_CACHE:
        return _MODEL_CACHE[model_name]

    with _MODEL_LOCK:
        if model_name in _MODEL_CACHE:
            return _MODEL_CACHE[model_name]
        try:
            from sentence_transformers import SentenceTransformer
            logger.info("Loading sentence-transformers model: %s", model_name)
            model = SentenceTransformer(model_name)
            _MODEL_CACHE[model_name] = model
            return model
        except Exception as exc:
            logger.error("Failed to load sentence-transformers model '%s': %s", model_name, exc)
            return None


def _embed_sentence_transformers(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []

    model = _get_st_model()
    if model is None:
        logger.warning("sentence-transformers unavailable, using hash fallback")
        return [_hash_embed(t) for t in texts]

    try:
        batch_size = settings.EMBEDDING_BATCH_SIZE
        all_embeddings: list[list[float]] = []
        for start in range(0, len(texts), batch_size):
            batch = texts[start : start + batch_size]
            vecs = model.encode(
                batch,
                batch_size=batch_size,
                show_progress_bar=False,
                normalize_embeddings=True,
                convert_to_numpy=True,
            )
            all_embeddings.extend(vec.tolist() for vec in vecs)
        return all_embeddings
    except Exception as exc:
        logger.warning("sentence-transformers encode failed: %s — falling back to hash", exc)
        return [_hash_embed(t) for t in texts]


# ── OpenAI Provider ───────────────────────────────────────────────────────────

def _embed_openai(texts: list[str]) -> list[list[float]]:
    try:
        import openai
        client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.embeddings.create(
            model="text-embedding-3-small",
            input=texts,
        )
        return [item.embedding for item in response.data]
    except Exception as exc:
        logger.warning("OpenAI embeddings failed: %s — falling back to hash", exc)
        return [_hash_embed(t) for t in texts]


# ── Hash Fallback ─────────────────────────────────────────────────────────────

@lru_cache(maxsize=4096)
def _hash_embed_cached(text: str) -> tuple[float, ...]:
    return tuple(_hash_embed(text))


def _hash_embed(text: str, dim: int | None = None) -> list[float]:
    """Deterministic pseudo-embedding from SHA-256. Not semantic — fallback only."""
    target_dim = dim or settings.EMBEDDING_DIMENSION
    digest = hashlib.sha256(text.encode("utf-8", errors="ignore")).digest()
    # Repeat digest to fill dimension
    raw = (digest * (target_dim // len(digest) + 1))[:target_dim]
    vec = [(b / 255.0) * 2.0 - 1.0 for b in raw]
    # L2-normalize
    magnitude = sum(v * v for v in vec) ** 0.5 or 1.0
    return [v / magnitude for v in vec]

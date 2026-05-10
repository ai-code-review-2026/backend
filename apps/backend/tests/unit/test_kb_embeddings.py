from __future__ import annotations

import math

from app.core.knowledge_base.embeddings import hash_embed_text


def test_hash_embed_text_returns_expected_dimension() -> None:
    vector = hash_embed_text("hello world", vector_size=32)

    assert len(vector) == 32
    norm = math.sqrt(sum(item * item for item in vector))
    assert abs(norm - 1.0) < 1e-6


def test_hash_embed_text_is_deterministic() -> None:
    left = hash_embed_text("Same INPUT", vector_size=24)
    right = hash_embed_text("Same INPUT", vector_size=24)

    assert left == right


def test_hash_embed_text_empty_returns_zero_vector() -> None:
    vector = hash_embed_text("", vector_size=8)
    assert vector == [0.0] * 8

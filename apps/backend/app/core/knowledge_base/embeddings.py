from __future__ import annotations

import hashlib
import math
import re

_TOKEN_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_./:-]{1,63}")


def hash_embed_text(text: str, *, vector_size: int) -> list[float]:
    """Create a deterministic dense vector without external model dependency."""
    if vector_size <= 0:
        raise ValueError("vector_size must be > 0")

    tokens = _TOKEN_RE.findall(text.lower())
    if not tokens:
        return [0.0] * vector_size

    vector = [0.0] * vector_size
    for token in tokens:
        digest = hashlib.sha1(token.encode("utf-8")).digest()
        idx = int.from_bytes(digest[:4], "big") % vector_size
        sign = -1.0 if (digest[4] & 1) else 1.0
        vector[idx] += sign

    norm = math.sqrt(sum(item * item for item in vector))
    if norm == 0:
        return vector
    return [item / norm for item in vector]

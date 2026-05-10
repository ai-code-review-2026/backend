from __future__ import annotations

import math
from collections import Counter


def shannon_entropy(value: str) -> float:
    if not value:
        return 0.0

    counts = Counter(value)
    length = len(value)
    entropy = 0.0
    for count in counts.values():
        probability = count / length
        entropy -= probability * math.log2(probability)
    return entropy


def is_entropy_candidate(token: str, min_len: int) -> bool:
    if len(token) < min_len:
        return False
    has_alpha = any(ch.isalpha() for ch in token)
    has_digit = any(ch.isdigit() for ch in token)
    return has_alpha and has_digit

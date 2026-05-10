from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class KBDocument:
    id: str
    title: str
    source_type: str
    path_or_url: str | None
    tags: dict[str, Any]
    doc_version: int
    created_at: str


@dataclass(frozen=True)
class KBChunk:
    id: str
    doc_id: str
    chunk_index: int
    text: str
    metadata: dict[str, Any]
    embedding_id: str | None
    created_at: str

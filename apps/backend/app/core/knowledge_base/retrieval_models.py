from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class QueryRoute(str, Enum):
    AUTO = "auto"
    DIFF_REVIEW = "diff_review"
    REPO_QUERY = "repo_query"
    CODE_QUERY = "code_query"
    POLICY_QUERY = "policy_query"
    DOCUMENT_QUERY = "document_query"
    PDF_QUERY = "pdf_query"
    WEB_QUERY = "web_query"
    MARKDOWN_QUERY = "markdown_query"
    SQL_QUERY = "sql_query"
    MULTI_SOURCE_QUERY = "multi_source_query"
    GENERIC_HYBRID_QUERY = "generic_hybrid_query"


@dataclass(frozen=True)
class RetrievedContextChunk:
    score: float
    path: str
    chunk_index: int
    language: str
    content: str
    token_count: int
    file_type: str = "text"
    chunk_type: str = "text_chunk"
    symbol_name: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    source: str = "semantic"
    source_type: str | None = None
    tags: tuple[str, ...] = ()
    document_id: str | None = None
    title: str | None = None
    repo_id: str | None = None
    source_id: str | None = None
    chunk_id: str | None = None
    document_version: str | None = None
    section_title: str | None = None
    heading_path: tuple[str, ...] = ()
    page: int | None = None
    source_uri: str | None = None
    content_hash: str | None = None
    version: str | None = None
    entity_type: str | None = None
    entity_name: str | None = None
    domain: str | None = None
    crawl_timestamp: str | None = None
    retrieval_reason: str | None = None
    retriever_channel: str | None = None
    score_raw: float | None = None
    score_final: float | None = None
    collection_version: str | None = None


@dataclass(frozen=True)
class RetrievalCandidate:
    chunk: RetrievedContextChunk
    channel: str
    raw_score: float
    score: float

    def with_score(self, score: float) -> "RetrievalCandidate":
        return RetrievalCandidate(
            chunk=self.chunk,
            channel=self.channel,
            raw_score=self.raw_score,
            score=score,
        )

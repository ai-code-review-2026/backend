from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Literal, TypedDict


FindingSeverity = Literal["INFO", "WARN", "BLOCKER"]
LLMRunStatus = Literal["completed", "fallback", "unavailable", "failed", "skipped"]
IndexMode = Literal["full", "incremental", "unknown"]


@dataclass(frozen=True)
class DiffCodeFragment:
    file_path: str
    language: str
    module: str | None
    function_name: str | None
    class_name: str | None
    start_line: int | None
    end_line: int | None
    added_lines: list[str] = field(default_factory=list)
    removed_lines: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RetrievalFilters:
    language: str | None = None
    module: str | None = None
    tags: tuple[str, ...] = ()
    since_iso: str | None = None

    def normalized_tags(self) -> set[str]:
        return {item.strip().lower() for item in self.tags if item.strip()}

    def to_dict(self) -> dict[str, Any]:
        return {
            "language": self.language,
            "module": self.module,
            "tags": list(self.tags),
            "since_iso": self.since_iso,
        }


@dataclass(frozen=True)
class RetrievedContextReference:
    path: str
    source: str
    source_type: str | None
    chunk_type: str | None
    symbol_name: str | None
    line_start: int | None
    line_end: int | None
    score: float
    tags: tuple[str, ...] = ()
    content: str = ""
    title: str | None = None
    indexed_at: str | None = None

    def to_dict(self, include_content: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "path": self.path,
            "title": self.title,
            "source": self.source,
            "source_type": self.source_type,
            "chunk_type": self.chunk_type,
            "symbol_name": self.symbol_name,
            "line_start": self.line_start,
            "line_end": self.line_end,
            "score": round(float(self.score), 4),
            "tags": list(self.tags),
            "indexed_at": self.indexed_at,
        }
        if include_content:
            payload["content"] = self.content
        return payload


@dataclass(frozen=True)
class RetrievalResult:
    context_text: str | None
    references: list[RetrievedContextReference]
    vector_hits: int
    graph_hits: int
    hyde_hits: int
    reranked_count: int
    retrieval_mode: str
    retrieval_trace: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "context_text": self.context_text,
            "references": [item.to_dict() for item in self.references],
            "vector_hits": self.vector_hits,
            "graph_hits": self.graph_hits,
            "hyde_hits": self.hyde_hits,
            "reranked_count": self.reranked_count,
            "retrieval_mode": self.retrieval_mode,
            "retrieval_trace": dict(self.retrieval_trace),
        }


# Canonical GraphRAG aliases used by the rest of the backend.
GraphRagCitation = RetrievedContextReference
GraphRagRetrievalResult = RetrievalResult


@dataclass(frozen=True)
class GraphIndexSnapshot:
    status: Literal["completed", "failed", "skipped"]
    mode: IndexMode
    indexed_commit: str | None
    default_branch: str | None
    files_seen: int
    files_indexed: int
    chunks_upserted: int
    chunks_deleted: int
    changed_files: list[str]
    started_at: str | None
    completed_at: str | None
    error: str | None = None
    graph_edges_count: int = 0

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


GraphRagIndexSnapshot = GraphIndexSnapshot


@dataclass(frozen=True)
class LLMGeneratedFinding:
    severity: FindingSeverity
    category: str
    message: str
    suggestion: str | None
    confidence: float
    file_path: str | None
    line_start: int | None
    line_end: int | None
    references: tuple[str, ...] = ()
    auto_fix: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "severity": self.severity,
            "category": self.category,
            "message": self.message,
            "suggestion": self.suggestion,
            "confidence": round(float(self.confidence), 4),
            "file_path": self.file_path,
            "line_start": self.line_start,
            "line_end": self.line_end,
            "references": list(self.references),
            "auto_fix": self.auto_fix,
        }


@dataclass(frozen=True)
class LLMOutput:
    status: LLMRunStatus
    summary: str | None
    findings: list[LLMGeneratedFinding]
    fallback_reason: str | None = None
    prompt: str | None = None
    raw_response: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "summary": self.summary,
            "findings": [item.to_dict() for item in self.findings],
            "fallback_reason": self.fallback_reason,
            "prompt": self.prompt,
            "raw_response": self.raw_response,
        }


@dataclass(frozen=True)
class LangGraphAnalysisRequest:
    analysis_id: str
    repo_id: str
    repo_path: str
    diff_text: str
    changed_files: list[str]
    pr_number: int | None = None
    commit_sha: str | None = None
    base_ref: str | None = None
    head_ref: str = "HEAD"
    metadata: dict[str, Any] = field(default_factory=dict)
    filters: RetrievalFilters = field(default_factory=RetrievalFilters)
    # Context IDs for gateway observability (optional, enables full trace logging)
    user_id: str | None = None
    project_id: str | None = None
    organization_id: str | None = None

    def cache_key(self) -> str:
        diff_hash = self.metadata.get("diff_hash")
        if isinstance(diff_hash, str) and diff_hash.strip():
            return f"{self.repo_id}:{self.pr_number}:{diff_hash.strip()}"
        return f"{self.repo_id}:{self.pr_number}:{abs(hash(self.diff_text))}"

    def to_dict(self) -> dict[str, Any]:
        return {
            "analysis_id": self.analysis_id,
            "repo_id": self.repo_id,
            "repo_path": self.repo_path,
            "diff_text": self.diff_text,
            "changed_files": list(self.changed_files),
            "pr_number": self.pr_number,
            "commit_sha": self.commit_sha,
            "base_ref": self.base_ref,
            "head_ref": self.head_ref,
            "metadata": dict(self.metadata),
            "filters": self.filters.to_dict(),
            "user_id": self.user_id,
            "project_id": self.project_id,
            "organization_id": self.organization_id,
        }


@dataclass(frozen=True)
class LangGraphAnalysisResult:
    indexing: GraphIndexSnapshot
    fragments: list[DiffCodeFragment]
    retrieval: RetrievalResult
    llm_output: LLMOutput
    duration_ms: int
    cached: bool = False
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "indexing": self.indexing.to_dict(),
            "fragments": [item.to_dict() for item in self.fragments],
            "retrieval": self.retrieval.to_dict(),
            "llm_output": self.llm_output.to_dict(),
            "duration_ms": self.duration_ms,
            "cached": self.cached,
            "errors": list(self.errors),
        }


class LangGraphState(TypedDict, total=False):
    request: LangGraphAnalysisRequest
    indexing: GraphIndexSnapshot
    fragments: list[DiffCodeFragment]
    retrieval: RetrievalResult
    llm_output: LLMOutput
    errors: list[str]
    started_perf: float
    completed_perf: float


GraphRagAnalysisResult = LangGraphAnalysisResult

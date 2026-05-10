from __future__ import annotations

import hashlib
from dataclasses import replace

from app.core.knowledge_base.retrieval_models import QueryRoute, RetrievalCandidate, RetrievedContextChunk
from app.settings import settings


class ContextPacker:
    def __init__(self, *, max_chars: int, max_chunks: int, max_chunks_per_path: int = 3) -> None:
        self._max_chars = max_chars
        self._max_chunks = max_chunks
        self._max_chunks_per_path = max_chunks_per_path

    def pack(
        self,
        *,
        candidates: list[RetrievalCandidate],
        route: QueryRoute,
        limit: int | None = None,
    ) -> list[RetrievedContextChunk]:
        if not candidates:
            return []

        max_chunks = min(limit or self._max_chunks, self._max_chunks)
        quotas = _quotas_for_route(route, max_chunks)

        deduped = self._dedup(candidates)
        deduped.sort(key=lambda item: item.score, reverse=True)

        # Token-based budget allocation
        budget = _TokenBudget.from_settings(route)

        selected: list[RetrievedContextChunk] = []
        bucket_counts = {key: 0 for key in quotas}
        path_counts: dict[str, int] = {}
        total_chars = 0

        # Separate parent-document chunks — they will be considered for
        # expansion only after child chunks are selected.
        parent_chunks: dict[str, RetrievalCandidate] = {}
        child_candidates: list[RetrievalCandidate] = []
        for candidate in deduped:
            if candidate.chunk.chunk_type == "parent_document":
                parent_chunks[candidate.chunk.path] = candidate
            else:
                child_candidates.append(candidate)

        for candidate in child_candidates:
            chunk = candidate.chunk
            bucket = _bucket_for_candidate(candidate)
            if bucket_counts.get(bucket, 0) >= quotas.get(bucket, max_chunks):
                continue
            if path_counts.get(chunk.path, 0) >= self._max_chunks_per_path:
                continue

            token_cost = chunk.token_count or max(1, len(chunk.content.split()))
            if not budget.can_fit(bucket, token_cost) and selected:
                continue

            projected_chars = total_chars + len(chunk.content)
            if projected_chars > self._max_chars and selected:
                continue

            selected.append(
                replace(
                    chunk,
                    score=candidate.score,
                    retrieval_reason=chunk.retrieval_reason or f"packed:{candidate.channel}",
                    retriever_channel=candidate.channel,
                    score_raw=candidate.raw_score,
                    score_final=candidate.score,
                )
            )
            bucket_counts[bucket] = bucket_counts.get(bucket, 0) + 1
            path_counts[chunk.path] = path_counts.get(chunk.path, 0) + 1
            total_chars = projected_chars
            budget.consume(bucket, token_cost)
            if len(selected) >= max_chunks:
                break

        # Parent-document expansion: when a child scored high, check if
        # replacing it with the parent gives richer context within budget.
        if settings.PARENT_DOCUMENT_ENABLED and parent_chunks:
            selected = self._expand_to_parents(
                selected, parent_chunks, budget, total_chars,
            )

        if not selected and deduped:
            top_candidate = deduped[0]
            return [
                replace(
                    top_candidate.chunk,
                    score=top_candidate.score,
                    retrieval_reason=top_candidate.chunk.retrieval_reason or f"packed:{top_candidate.channel}",
                    retriever_channel=top_candidate.channel,
                    score_raw=top_candidate.raw_score,
                    score_final=top_candidate.score,
                )
            ]
        return selected

    def _expand_to_parents(
        self,
        selected: list[RetrievedContextChunk],
        parent_chunks: dict[str, RetrievalCandidate],
        budget: _TokenBudget,
        total_chars: int,
    ) -> list[RetrievedContextChunk]:
        """Replace high-scoring child chunks with their parent document if budget allows."""
        expanded_paths: set[str] = set()
        result: list[RetrievedContextChunk] = []

        for chunk in selected:
            if chunk.path in expanded_paths:
                # Already expanded this path — skip to avoid duplicates
                result.append(chunk)
                continue

            parent = parent_chunks.get(chunk.path)
            if parent is None:
                result.append(chunk)
                continue

            parent_tokens = parent.chunk.token_count or max(1, len(parent.chunk.content.split()))
            child_tokens = chunk.token_count or max(1, len(chunk.content.split()))
            extra_tokens = parent_tokens - child_tokens

            if extra_tokens <= 0 or not budget.can_fit("code", extra_tokens):
                result.append(chunk)
                continue

            extra_chars = len(parent.chunk.content) - len(chunk.content)
            if (total_chars + extra_chars) > self._max_chars:
                result.append(chunk)
                continue

            # Replace child with parent
            result.append(
                replace(
                    parent.chunk,
                    score=chunk.score,
                    retrieval_reason=f"parent_expanded:{chunk.retrieval_reason or ''}",
                    retriever_channel=chunk.retriever_channel,
                    score_raw=chunk.score_raw,
                    score_final=chunk.score_final,
                )
            )
            budget.consume("code", extra_tokens)
            total_chars += extra_chars
            expanded_paths.add(chunk.path)

        return result

    def _dedup(self, candidates: list[RetrievalCandidate]) -> list[RetrievalCandidate]:
        deduped: dict[tuple[str, int, str], RetrievalCandidate] = {}
        content_hashes: set[str] = set()
        for candidate in candidates:
            key = (candidate.chunk.path, candidate.chunk.chunk_index, candidate.channel)
            previous = deduped.get(key)
            if previous is None or candidate.score > previous.score:
                deduped[key] = candidate
        results: list[RetrievalCandidate] = []
        for candidate in deduped.values():
            content_hash = hashlib.sha1(candidate.chunk.content.strip().encode("utf-8")).hexdigest()
            if content_hash in content_hashes:
                continue
            content_hashes.add(content_hash)
            results.append(candidate)
        return results


class _TokenBudget:
    """Manages token allocation per source bucket."""

    def __init__(self, *, total: int, code_ratio: float, kb_ratio: float, profile_ratio: float) -> None:
        self.total = total
        self.buckets: dict[str, int] = {
            "code": int(total * code_ratio),
            "test": int(total * code_ratio * 0.3),
            "policy": int(total * kb_ratio * 0.5),
            "document": int(total * kb_ratio * 0.3),
            "pdf": int(total * kb_ratio * 0.2),
            "web": int(total * kb_ratio * 0.15),
            "markdown": int(total * kb_ratio * 0.15),
            "sql": int(total * kb_ratio * 0.1),
            "profile": int(total * profile_ratio),
        }
        self.consumed: dict[str, int] = {key: 0 for key in self.buckets}

    def can_fit(self, bucket: str, tokens: int) -> bool:
        budget = self.buckets.get(bucket, self.total // 4)
        used = self.consumed.get(bucket, 0)
        return (used + tokens) <= budget

    def consume(self, bucket: str, tokens: int) -> None:
        self.consumed[bucket] = self.consumed.get(bucket, 0) + tokens

    @classmethod
    def from_settings(cls, route: QueryRoute) -> _TokenBudget:
        total = settings.RAG_TOKEN_BUDGET_TOTAL
        if route == QueryRoute.DIFF_REVIEW:
            return cls(total=total, code_ratio=0.55, kb_ratio=0.30, profile_ratio=0.10)
        if route == QueryRoute.POLICY_QUERY:
            return cls(total=total, code_ratio=0.20, kb_ratio=0.65, profile_ratio=0.05)
        if route in {QueryRoute.DOCUMENT_QUERY, QueryRoute.PDF_QUERY, QueryRoute.WEB_QUERY, QueryRoute.MARKDOWN_QUERY}:
            return cls(total=total, code_ratio=0.15, kb_ratio=0.70, profile_ratio=0.05)
        return cls(
            total=total,
            code_ratio=settings.RAG_TOKEN_BUDGET_CODE_RATIO,
            kb_ratio=settings.RAG_TOKEN_BUDGET_KB_RATIO,
            profile_ratio=settings.RAG_TOKEN_BUDGET_PROFILE_RATIO,
        )


def _bucket_for_candidate(candidate: RetrievalCandidate) -> str:
    chunk = candidate.chunk
    if chunk.file_type == "test" or chunk.chunk_type in {"test_case", "test_block"}:
        return "test"
    tags = {tag.lower() for tag in chunk.tags}
    if chunk.source_type == "policy" or tags.intersection({"policy", "security", "compliance"}):
        return "policy"
    if chunk.source_type in {"pdf", "markdown", "web", "sql"}:
        return chunk.source_type
    if chunk.chunk_type == "document_chunk":
        return "document"
    return "code"


def _quotas_for_route(route: QueryRoute, max_chunks: int) -> dict[str, int]:
    if route == QueryRoute.DIFF_REVIEW:
        return {"code": max_chunks, "test": max(2, max_chunks // 3), "pdf": 1, "web": 1, "markdown": 1, "sql": 1, "policy": 2, "document": 2}
    if route == QueryRoute.POLICY_QUERY:
        return {"policy": max_chunks, "markdown": max(2, max_chunks // 2), "web": 2, "pdf": 2, "sql": 1, "code": 3, "test": 1, "document": max(3, max_chunks // 2)}
    if route == QueryRoute.DOCUMENT_QUERY:
        return {"document": max_chunks, "pdf": max(2, max_chunks // 2), "web": max(2, max_chunks // 2), "markdown": max(2, max_chunks // 2), "sql": max(2, max_chunks // 3), "policy": max(3, max_chunks // 2), "code": 3, "test": 1}
    if route == QueryRoute.PDF_QUERY:
        return {"pdf": max_chunks, "web": 2, "markdown": 2, "policy": 2, "code": 2, "sql": 1}
    if route == QueryRoute.WEB_QUERY:
        return {"web": max_chunks, "markdown": 3, "pdf": 2, "policy": 2, "code": 2, "sql": 1}
    if route == QueryRoute.MARKDOWN_QUERY:
        return {"markdown": max_chunks, "web": 3, "pdf": 2, "policy": 2, "code": 2, "sql": 1}
    if route == QueryRoute.SQL_QUERY:
        return {"sql": max_chunks, "code": max(3, max_chunks // 2), "markdown": 2, "web": 1, "pdf": 1, "policy": 2}
    if route == QueryRoute.MULTI_SOURCE_QUERY:
        return _normalize_multi_source_quotas(max_chunks)
    return {"code": max_chunks, "pdf": 2, "web": 2, "markdown": 2, "sql": 2, "document": max(3, max_chunks // 2), "policy": 2, "test": 2}


def _normalize_multi_source_quotas(max_chunks: int) -> dict[str, int]:
    if max_chunks <= 0:
        return {"code": 1}

    quotas = {"code": 1}
    remaining = max_chunks - 1
    for bucket in ("sql", "markdown", "web", "pdf", "policy", "test"):
        if remaining <= 0:
            break
        quotas[bucket] = 1
        remaining -= 1
    if remaining > 0:
        quotas["code"] += remaining
    return quotas

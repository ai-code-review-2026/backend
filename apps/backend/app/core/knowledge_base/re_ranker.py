from __future__ import annotations

import logging
import re
from threading import Lock

from app.core.knowledge_base.retrieval_models import QueryRoute, RetrievalCandidate
from app.settings import settings

logger = logging.getLogger(__name__)

_MODEL_LOCK = Lock()


class ReRanker:
    """Multi-stage re-ranking pipeline.

    Stage 1 — Heuristic scoring (cheap): prunes the bottom ~50% of candidates.
    Stage 2 — Cross-encoder (medium): ``ms-marco-MiniLM-L-6-v2`` on top candidates.
    Stage 3 — LLM judge (expensive, optional): deepseek-coder scores the top-N
              for ``DIFF_REVIEW`` route only (enabled via ``RAG_LLM_RERANK_ENABLED``).
    """

    def __init__(self) -> None:
        self._enabled = settings.KB_RERANK_ENABLED
        self._model_name = settings.KB_CROSS_ENCODER_MODEL
        self._model: object | None = None
        self._model_load_attempted = False
        self._feedback_collector: object | None = None

    def rank(
        self,
        *,
        query: str,
        candidates: list[RetrievalCandidate],
        route: QueryRoute,
        limit: int,
    ) -> list[RetrievalCandidate]:
        if not candidates:
            return []

        deduped = self._dedup_candidates(candidates)
        normalized_scores = self._normalize_scores(deduped)

        # ── Stage 1: Heuristic prune ─────────────────────────────────────
        heuristic_scored = [
            candidate.with_score(
                self._heuristic_score(
                    query=query,
                    candidate=candidate,
                    route=route,
                    normalized_score=normalized_scores.get(id(candidate), candidate.score),
                )
            )
            for candidate in deduped
        ]
        heuristic_scored.sort(key=lambda item: item.score, reverse=True)
        # Keep top ~3x of limit for Stage 2
        stage1_limit = min(len(heuristic_scored), max(limit * 3, 24))
        stage1_results = heuristic_scored[:stage1_limit]

        # ── Stage 2: Cross-encoder ───────────────────────────────────────
        model = self._get_model()
        if model is not None:
            try:
                stage2_limit = min(len(stage1_results), max(limit * 2, 16))
                stage2_results = self._rank_with_model(
                    query=query,
                    candidates=stage1_results,
                    normalized_scores={id(c): c.score for c in stage1_results},
                    model=model,
                    limit=stage2_limit,
                )
            except Exception:
                logger.debug("Cross-encoder re-ranking failed", exc_info=True)
                stage2_results = stage1_results[:max(limit * 2, 16)]
        else:
            stage2_results = stage1_results[:max(limit * 2, 16)]

        # ── Stage 3: LLM judge (optional) ────────────────────────────────
        if (
            settings.RAG_LLM_RERANK_ENABLED
            and route == QueryRoute.DIFF_REVIEW
            and len(stage2_results) > 0
        ):
            try:
                stage3_top_n = min(len(stage2_results), settings.RAG_LLM_RERANK_TOP_N)
                stage3_results = self._llm_rerank(
                    query=query,
                    candidates=stage2_results[:stage3_top_n],
                    limit=limit,
                )
                # Merge LLM-ranked top with remaining stage2
                remaining = [c for c in stage2_results[stage3_top_n:]]
                return (stage3_results + remaining)[:limit]
            except Exception:
                logger.debug("LLM re-ranking failed", exc_info=True)

        # Apply feedback penalties
        if settings.RAG_FEEDBACK_ENABLED:
            stage2_results = self._apply_feedback_penalties(stage2_results)
            stage2_results.sort(key=lambda item: item.score, reverse=True)

        return stage2_results[:limit]

    def _get_model(self) -> object | None:
        if not self._enabled:
            return None
        with _MODEL_LOCK:
            if self._model_load_attempted:
                return self._model
            self._model_load_attempted = True
            try:
                from sentence_transformers.cross_encoder import CrossEncoder  # type: ignore[import]

                self._model = CrossEncoder(self._model_name)
            except Exception:
                self._model = None
            return self._model

    def _rank_with_model(
        self,
        *,
        query: str,
        candidates: list[RetrievalCandidate],
        normalized_scores: dict[int, float],
        model: object,
        limit: int,
    ) -> list[RetrievalCandidate]:
        pairs = [(query, candidate.chunk.content[:4000]) for candidate in candidates]
        predictions = model.predict(pairs, show_progress_bar=False)  # type: ignore[attr-defined]
        rescored = [
            candidate.with_score(float(prediction) + normalized_scores.get(id(candidate), candidate.score))
            for candidate, prediction in zip(candidates, predictions, strict=False)
        ]
        rescored.sort(key=lambda item: item.score, reverse=True)
        return rescored[:limit]

    def _llm_rerank(
        self,
        *,
        query: str,
        candidates: list[RetrievalCandidate],
        limit: int,
    ) -> list[RetrievalCandidate]:
        """Use the LLM to score relevance of top candidates."""
        try:
            from app.integrations.llm_providers.ollama_client import OllamaClient

            client = OllamaClient()

            scored: list[tuple[float, RetrievalCandidate]] = []
            for candidate in candidates:
                prompt = (
                    f"Rate the relevance of this code snippet to the following query on a scale of 0-10.\n"
                    f"Query: {query[:500]}\n"
                    f"Snippet ({candidate.chunk.path}):\n"
                    f"{candidate.chunk.content[:2000]}\n\n"
                    f"Output ONLY a single number (0-10):"
                )
                response = client.generate(prompt)
                try:
                    score = float(response.text.strip().split()[0])
                    score = max(0.0, min(10.0, score))
                except (ValueError, IndexError):
                    score = 5.0
                scored.append((candidate.score + score * 0.1, candidate))

            scored.sort(key=lambda item: item[0], reverse=True)
            return [candidate.with_score(s) for s, candidate in scored[:limit]]

        except Exception:
            logger.debug("LLM rerank failed", exc_info=True)
            return candidates[:limit]

    def _apply_feedback_penalties(self, candidates: list[RetrievalCandidate]) -> list[RetrievalCandidate]:
        """Apply score penalties from accumulated negative user feedback."""
        collector = self._get_feedback_collector()
        if collector is None:
            return candidates
        result: list[RetrievalCandidate] = []
        for candidate in candidates:
            chunk_id = candidate.chunk.chunk_id
            if chunk_id:
                penalty = collector.compute_penalty(chunk_id)
                if penalty > 0:
                    result.append(candidate.with_score(candidate.score - penalty))
                    continue
            result.append(candidate)
        return result

    def _get_feedback_collector(self) -> object | None:
        if self._feedback_collector is not None:
            return self._feedback_collector
        try:
            from app.core.knowledge_base.feedback import FeedbackCollector

            self._feedback_collector = FeedbackCollector()
            return self._feedback_collector
        except Exception:
            return None

    def _dedup_candidates(self, candidates: list[RetrievalCandidate]) -> list[RetrievalCandidate]:
        deduped: dict[tuple[str, ...], RetrievalCandidate] = {}
        for candidate in candidates:
            key = _identity_key(candidate)
            previous = deduped.get(key)
            if previous is None or candidate.score > previous.score:
                deduped[key] = candidate
        return list(deduped.values())

    def _normalize_scores(self, candidates: list[RetrievalCandidate]) -> dict[int, float]:
        per_channel: dict[str, list[float]] = {}
        per_bucket: dict[str, list[float]] = {}
        for candidate in candidates:
            per_channel.setdefault(candidate.channel, []).append(candidate.score)
            per_bucket.setdefault(_source_bucket(candidate), []).append(candidate.score)

        normalized: dict[int, float] = {}
        for candidate in candidates:
            channel_norm = _min_max(candidate.score, per_channel.get(candidate.channel, [candidate.score]))
            bucket_norm = _min_max(candidate.score, per_bucket.get(_source_bucket(candidate), [candidate.score]))
            raw_norm = max(0.0, min(1.0, float(candidate.score)))
            normalized[id(candidate)] = (channel_norm * 0.45) + (bucket_norm * 0.35) + (raw_norm * 0.20)
        return normalized

    def _heuristic_score(
        self,
        *,
        query: str,
        candidate: RetrievalCandidate,
        route: QueryRoute,
        normalized_score: float,
    ) -> float:
        tokens = _tokenize(query)
        content_tokens = _tokenize(candidate.chunk.content)
        overlap = len(tokens.intersection(content_tokens))
        token_bonus = overlap / max(len(tokens), 1)

        path_bonus = 0.0
        lower_path = candidate.chunk.path.lower()
        if any(token in lower_path for token in tokens):
            path_bonus += 0.3
        if candidate.chunk.symbol_name and candidate.chunk.symbol_name.lower() in tokens:
            path_bonus += 0.4

        channel_bonus = {
            "file_exact": 1.4,
            "symbol_exact": 1.2,
            "graph_connected": 1.0,
            "test_related": 0.7,
            "lexical_code": 0.9,
            "lexical_document": 0.8,
            "lexical_global_document": 0.72,
            "semantic_code": 0.75,
            "semantic_document": 0.7,
            "semantic_global_document": 0.64,
            "repo_bootstrap": 0.6,
        }.get(candidate.channel, 0.5)

        route_bonus = 0.0
        if route == QueryRoute.DIFF_REVIEW and candidate.chunk.file_type == "test":
            route_bonus += 0.3
        if route == QueryRoute.POLICY_QUERY and (
            candidate.chunk.source_type == "policy" or "policy" in {tag.lower() for tag in candidate.chunk.tags}
        ):
            route_bonus += 0.6
        if route == QueryRoute.DOCUMENT_QUERY and candidate.chunk.chunk_type == "document_chunk":
            route_bonus += 0.4
        if route == QueryRoute.MULTI_SOURCE_QUERY:
            route_bonus += {
                "code": 0.35,
                "pdf": 0.25,
                "web": 0.24,
                "markdown": 0.23,
                "sql": 0.26,
                "policy": 0.22,
                "test": 0.15,
            }.get(_source_bucket(candidate), 0.1)
        if route == QueryRoute.SQL_QUERY and _source_bucket(candidate) == "sql":
            route_bonus += 0.5
        if route == QueryRoute.WEB_QUERY and _source_bucket(candidate) == "web":
            route_bonus += 0.45
        if route == QueryRoute.MARKDOWN_QUERY and _source_bucket(candidate) == "markdown":
            route_bonus += 0.45
        if route == QueryRoute.PDF_QUERY and _source_bucket(candidate) == "pdf":
            route_bonus += 0.45
        if route in {QueryRoute.REPO_QUERY, QueryRoute.CODE_QUERY} and _source_bucket(candidate) == "code":
            route_bonus += 0.45

        return normalized_score + token_bonus + path_bonus + channel_bonus + route_bonus


def _tokenize(value: str) -> set[str]:
    return {token for token in re.findall(r"[a-z0-9_./-]+", value.lower()) if token}


def _identity_key(candidate: RetrievalCandidate) -> tuple[str, ...]:
    chunk = candidate.chunk
    if chunk.chunk_id:
        return ("chunk_id", chunk.chunk_id)
    if chunk.source_id:
        return ("source_id", chunk.source_id, str(chunk.page or ""), str(chunk.entity_name or ""))
    if chunk.document_id:
        return ("document", chunk.document_id, str(chunk.page or ""), str(chunk.chunk_index))
    return ("path", chunk.path, str(chunk.chunk_index), str(chunk.page or ""), str(chunk.entity_name or ""))


def _source_bucket(candidate: RetrievalCandidate) -> str:
    chunk = candidate.chunk
    if chunk.file_type == "test" or chunk.chunk_type in {"test_case", "test_block"}:
        return "test"
    if chunk.source_type in {"pdf", "web", "markdown", "sql", "policy"}:
        return chunk.source_type
    tags = {tag.lower() for tag in chunk.tags}
    if tags.intersection({"policy", "security", "compliance"}):
        return "policy"
    return "code"


def _min_max(value: float, values: list[float]) -> float:
    if not values:
        return max(0.0, min(1.0, value))
    minimum = min(values)
    maximum = max(values)
    if maximum <= minimum:
        return max(0.0, min(1.0, value))
    return (value - minimum) / (maximum - minimum)

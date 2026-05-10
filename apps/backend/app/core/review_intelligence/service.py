from __future__ import annotations

from typing import Any

from app.core.review_engine.diff_engine import ParsedDiff
from app.core.review_intelligence.change_explainer import ChangeExplainer
from app.core.review_intelligence.pr_summary_service import PRSummaryService
from app.core.review_intelligence.risk_detector import RiskDetector
from app.core.review_intelligence.schemas import (
    MergeReadinessOutput,
    ReviewContextReference,
    StructuredReviewOutput,
)
from app.core.review_intelligence.test_generator import TestGenerator
from app.data.models.finding import Finding
from app.settings import settings


class GraphRAGRequiredError(RuntimeError):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.code = "GRAPH_RAG_REQUIRED"


class ReviewIntelligenceService:
    def __init__(
        self,
        *,
        summary_service: PRSummaryService,
        change_explainer: ChangeExplainer,
        risk_detector: RiskDetector,
        test_generator: TestGenerator,
    ) -> None:
        self._summary_service = summary_service
        self._change_explainer = change_explainer
        self._risk_detector = risk_detector
        self._test_generator = test_generator

    def generate(
        self,
        *,
        repo: str,
        pr_number: int | None,
        change_type: str | None,
        parsed_diff: ParsedDiff,
        diff_redacted: str,
        metadata: dict[str, Any],
        findings: list[Finding],
        knowledge_base_context: str | None,
        context_references: list[dict[str, Any]],
        fallback_summary: str,
        qdrant_enabled: bool = False,  # deprecated — ignored, Neo4j only
        neo4j_enabled: bool = True,
        kb_retrieval_mode: str,
        kb_context_chunks_count: int,
        kb_retrieval_error: str | None,
        allow_non_qdrant_grounding: bool = True,  # deprecated — ignored
    ) -> StructuredReviewOutput:
        self.require_graph_rag(
            neo4j_enabled=neo4j_enabled,
            kb_retrieval_mode=kb_retrieval_mode,
            kb_context_chunks_count=kb_context_chunks_count,
            knowledge_base_context=knowledge_base_context,
            kb_retrieval_error=kb_retrieval_error,
            context_references=context_references,
        )
        validated_context_references = _validated_context_references(context_references)

        files_changed = [item.path_new for item in parsed_diff.files]
        impacted_components = _extract_impacted_components(files_changed)
        risk_findings = self._risk_detector.generate(parsed_diff=parsed_diff, findings=findings)
        risk_level = _derive_risk_level(risk_findings)
        summary = self._summary_service.generate(
            repo=repo,
            pr_number=pr_number,
            change_type=change_type,
            diff_redacted=diff_redacted,
            files_changed=files_changed,
            impacted_components=impacted_components,
            risk_level=risk_level,
            metadata=metadata,
            knowledge_base_context=knowledge_base_context or "",
            fallback_summary=fallback_summary,
        )
        explanation = self._change_explainer.generate(
            repo=repo,
            parsed_diff=parsed_diff,
            summary_text=summary.detailed_summary,
            metadata=metadata,
            knowledge_base_context=knowledge_base_context or "",
        )
        generated_tests = self._test_generator.generate(
            repo=repo,
            parsed_diff=parsed_diff,
            risk_findings=risk_findings,
            knowledge_base_context=knowledge_base_context or "",
        )
        merge_readiness = _derive_merge_readiness(risk_findings)
        return StructuredReviewOutput(
            summary=summary,
            key_changes=_build_key_changes(parsed_diff=parsed_diff),
            impacted_components=impacted_components,
            change_explanation=explanation,
            risk_findings=risk_findings,
            generated_tests=generated_tests,
            merge_readiness=merge_readiness,
            context_references=validated_context_references,
        )

    def generate_rule_engine_output(
        self,
        *,
        repo: str,
        change_type: str | None,
        parsed_diff: ParsedDiff,
        metadata: dict[str, Any],
        findings: list[Finding],
        fallback_summary: str,
    ) -> StructuredReviewOutput:
        files_changed = [item.path_new for item in parsed_diff.files]
        impacted_components = _extract_impacted_components(files_changed)
        risk_findings = self._risk_detector.generate(parsed_diff=parsed_diff, findings=findings)
        risk_level = _derive_risk_level(risk_findings)
        summary = self._summary_service._fallback(
            repo=repo,
            change_type=change_type,
            files_changed=files_changed,
            impacted_components=impacted_components,
            risk_level=risk_level,
            metadata=metadata,
            fallback_summary=fallback_summary,
        )
        explanation = self._change_explainer._fallback(
            parsed_diff=parsed_diff,
            summary_text=summary.detailed_summary,
            metadata=metadata,
        )
        generated_tests = self._test_generator._fallback(
            parsed_diff=parsed_diff,
            risk_findings=risk_findings,
        )
        return StructuredReviewOutput(
            summary=summary,
            key_changes=_build_key_changes(parsed_diff=parsed_diff),
            impacted_components=impacted_components,
            change_explanation=explanation,
            risk_findings=risk_findings,
            generated_tests=generated_tests,
            merge_readiness=_derive_merge_readiness(risk_findings),
            context_references=[],
        )

    def can_use_graph_rag(
        self,
        *,
        qdrant_enabled: bool = False,  # deprecated
        neo4j_enabled: bool = True,
        kb_retrieval_mode: str,
        kb_context_chunks_count: int,
        knowledge_base_context: str | None,
        kb_retrieval_error: str | None,
        context_references: list[dict[str, Any]] | None = None,
        allow_non_qdrant_grounding: bool = True,  # deprecated — ignored
    ) -> tuple[bool, str | None]:
        try:
            self.require_graph_rag(
                neo4j_enabled=neo4j_enabled,
                kb_retrieval_mode=kb_retrieval_mode,
                kb_context_chunks_count=kb_context_chunks_count,
                knowledge_base_context=knowledge_base_context,
                kb_retrieval_error=kb_retrieval_error,
                context_references=context_references,
            )
        except GraphRAGRequiredError as exc:
            return False, str(exc)
        return True, None

    def require_graph_rag(
        self,
        *,
        qdrant_enabled: bool = False,  # deprecated, ignored
        neo4j_enabled: bool = True,
        kb_retrieval_mode: str,
        kb_context_chunks_count: int,
        knowledge_base_context: str | None,
        kb_retrieval_error: str | None,
        context_references: list[dict[str, Any]] | None = None,
        allow_non_qdrant_grounding: bool = True,  # deprecated — ignored
    ) -> None:
        if not settings.REVIEW_INTELLIGENCE_ENABLED:
            return
        if not settings.GRAPH_RAG_REQUIRED:
            return
        if not neo4j_enabled:
            raise GraphRAGRequiredError("Neo4j is required for the GraphRAG review pipeline.")
        if kb_retrieval_mode == "failed":
            detail = f" Retrieval error: {kb_retrieval_error}" if kb_retrieval_error else ""
            raise GraphRAGRequiredError(f"GraphRAG retrieval failed.{detail}")
        if kb_context_chunks_count <= 0 or not isinstance(knowledge_base_context, str) or not knowledge_base_context.strip():
            raise GraphRAGRequiredError("GraphRAG retrieval returned no usable grounded context.")
        if not _validated_context_references(context_references or []):
            raise GraphRAGRequiredError("GraphRAG retrieval returned no valid grounded citations.")


    def can_use_hybrid_rag(self, **kwargs: Any) -> tuple[bool, str | None]:
        enabled, reason = self.can_use_graph_rag(**kwargs)
        if reason:
            reason = reason.replace("GraphRAG", "Hybrid RAG")
        return enabled, reason

    def require_hybrid_rag(self, **kwargs: Any) -> None:
        try:
            self.require_graph_rag(**kwargs)
        except GraphRAGRequiredError as exc:
            raise HybridRAGRequiredError(str(exc).replace("GraphRAG", "Hybrid RAG")) from exc


HybridRAGRequiredError = GraphRAGRequiredError


def _validated_context_references(context_references: list[dict[str, Any]]) -> list[ReviewContextReference]:
    validated: list[ReviewContextReference] = []
    for item in context_references[:12]:
        try:
            reference = ReviewContextReference.model_validate(item)
        except Exception:
            continue
        if not reference.path.strip():
            continue
        if not reference.source.strip():
            continue
        validated.append(reference)
    return validated


def _extract_impacted_components(files_changed: list[str]) -> list[str]:
    components: list[str] = []
    seen: set[str] = set()
    for path in files_changed:
        normalized = path.replace("\\", "/")
        parts = [part for part in normalized.split("/") if part]
        candidate = "/".join(parts[:2]) if len(parts) >= 2 else (parts[0] if parts else normalized)
        if not candidate:
            continue
        lowered = candidate.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        components.append(candidate)
        if len(components) >= 12:
            break
    return components


def _build_key_changes(*, parsed_diff: ParsedDiff) -> list[str]:
    changes: list[str] = []
    for item in parsed_diff.files[:8]:
        changes.append(
            f"{item.change_type.title()} {item.path_new} (+{item.additions_count}/-{item.deletions_count})"
        )
    return changes[:10]


def _derive_risk_level(risk_findings: list[Any]) -> str:
    severities = {getattr(item, "severity", "medium") for item in risk_findings}
    if "critical" in severities:
        return "critical"
    if "high" in severities:
        return "high"
    if "medium" in severities:
        return "medium"
    return "low"


def _derive_merge_readiness(risk_findings: list[Any]) -> MergeReadinessOutput:
    blocking_items = [item.title for item in risk_findings if getattr(item, "severity", None) == "critical"]
    if blocking_items:
        return MergeReadinessOutput(
            status="blocked",
            reason="Critical review findings must be addressed before merge.",
            blocking_items=blocking_items[:8],
        )
    attention_items = [item.title for item in risk_findings if getattr(item, "severity", None) == "high"]
    if attention_items:
        return MergeReadinessOutput(
            status="needs_attention",
            reason="High-severity findings or sensitive changes still require manual review.",
            blocking_items=attention_items[:8],
        )
    return MergeReadinessOutput(
        status="ready",
        reason="No critical or high-severity grounded findings remain in the generated review output.",
        blocking_items=[],
    )

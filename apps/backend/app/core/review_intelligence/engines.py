from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol

from app.core.ai_orchestration import GroundedFindingOutput, GroundedReviewService
from app.core.review_engine.diff_engine import ParsedDiff
from app.core.review_intelligence.change_explainer import ChangeExplainer
from app.core.review_intelligence.pr_summary_service import PRSummaryService
from app.core.review_intelligence.risk_detector import RiskDetector
from app.core.review_intelligence.schemas import StructuredReviewOutput
from app.core.review_intelligence.service import ReviewIntelligenceService
from app.core.review_intelligence.test_generator import TestGenerator
from app.core.summarization import RepoOverviewOutput, SummaryOutput, SummaryService
from app.data.models.finding import Finding
from app.integrations.llm_providers.ollama_client import OllamaClient
from app.settings import settings


class ReviewGenerationEngine(Protocol):
    stack_name: str
    model_name: str | None
    available: bool

    def generate_summary(
        self,
        *,
        repo: str,
        pr_number: int | None,
        change_type: str | None,
        diff_redacted: str,
        files_changed: list[str],
        retrieved_context: str | None = None,
    ) -> SummaryOutput: ...

    def generate_repo_overview(
        self,
        *,
        repo_id: str,
        repo_profile: dict[str, Any],
        context_excerpt: str,
    ) -> RepoOverviewOutput: ...

    def generate_grounded_findings(
        self,
        *,
        repo: str,
        pr_number: int | None,
        diff_redacted: str,
        files_changed: list[str],
        knowledge_base_context: str,
        max_findings: int,
    ) -> GroundedFindingOutput: ...

    def can_use_graph_rag(
        self,
        *,
        qdrant_enabled: bool = False,  # deprecated — ignored
        neo4j_enabled: bool = True,
        kb_retrieval_mode: str,
        kb_context_chunks_count: int,
        knowledge_base_context: str | None,
        kb_retrieval_error: str | None,
        context_references: list[dict[str, Any]] | None = None,
        allow_non_qdrant_grounding: bool = True,  # deprecated — ignored
    ) -> tuple[bool, str | None]: ...

    def generate_review_output(
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
        qdrant_enabled: bool = False,  # deprecated — ignored
        neo4j_enabled: bool = True,
        kb_retrieval_mode: str,
        kb_context_chunks_count: int,
        kb_retrieval_error: str | None,
        allow_non_qdrant_grounding: bool = True,  # deprecated — ignored
    ) -> StructuredReviewOutput: ...

    def generate_rule_engine_output(
        self,
        *,
        repo: str,
        change_type: str | None,
        parsed_diff: ParsedDiff,
        metadata: dict[str, Any],
        findings: list[Finding],
        fallback_summary: str,
    ) -> StructuredReviewOutput: ...


@dataclass
class _BaseReviewGenerationEngine:
    stack_name: str
    model_name: str | None
    available: bool
    summary_service: SummaryService
    grounded_review_service: GroundedReviewService
    review_intelligence_service: ReviewIntelligenceService

    def generate_summary(
        self,
        *,
        repo: str,
        pr_number: int | None,
        change_type: str | None,
        diff_redacted: str,
        files_changed: list[str],
        retrieved_context: str | None = None,
    ) -> SummaryOutput:
        return self.summary_service.generate_summary(
            repo=repo,
            pr_number=pr_number,
            change_type=change_type,
            diff_redacted=diff_redacted,
            files_changed=files_changed,
            retrieved_context=retrieved_context,
        )

    def generate_repo_overview(
        self,
        *,
        repo_id: str,
        repo_profile: dict[str, Any],
        context_excerpt: str,
    ) -> RepoOverviewOutput:
        return self.summary_service.generate_repo_overview(
            repo_id=repo_id,
            repo_profile=repo_profile,
            context_excerpt=context_excerpt,
        )

    def generate_grounded_findings(
        self,
        *,
        repo: str,
        pr_number: int | None,
        diff_redacted: str,
        files_changed: list[str],
        knowledge_base_context: str,
        max_findings: int,
    ) -> GroundedFindingOutput:
        return self.grounded_review_service.generate_findings(
            repo=repo,
            pr_number=pr_number,
            diff_redacted=diff_redacted,
            files_changed=files_changed,
            knowledge_base_context=knowledge_base_context,
            max_findings=max_findings,
        )

    def can_use_graph_rag(
        self,
        *,
        qdrant_enabled: bool = False,  # deprecated — ignored
        neo4j_enabled: bool = True,
        kb_retrieval_mode: str,
        kb_context_chunks_count: int,
        knowledge_base_context: str | None,
        kb_retrieval_error: str | None,
        context_references: list[dict[str, Any]] | None = None,
        allow_non_qdrant_grounding: bool = True,  # deprecated — ignored
    ) -> tuple[bool, str | None]:
        return self.review_intelligence_service.can_use_graph_rag(
            neo4j_enabled=neo4j_enabled,
            kb_retrieval_mode=kb_retrieval_mode,
            kb_context_chunks_count=kb_context_chunks_count,
            knowledge_base_context=knowledge_base_context,
            kb_retrieval_error=kb_retrieval_error,
            context_references=context_references,
        )

    def can_use_hybrid_rag(
        self,
        *,
        qdrant_enabled: bool = False,  # deprecated — ignored
        neo4j_enabled: bool = True,
        kb_retrieval_mode: str,
        kb_context_chunks_count: int,
        knowledge_base_context: str | None,
        kb_retrieval_error: str | None,
        context_references: list[dict[str, Any]] | None = None,
        allow_non_qdrant_grounding: bool = True,  # deprecated — ignored
    ) -> tuple[bool, str | None]:
        enabled, reason = self.can_use_graph_rag(
            neo4j_enabled=neo4j_enabled,
            kb_retrieval_mode=kb_retrieval_mode,
            kb_context_chunks_count=kb_context_chunks_count,
            knowledge_base_context=knowledge_base_context,
            kb_retrieval_error=kb_retrieval_error,
            context_references=context_references,
        )
        if reason:
            reason = reason.replace("GraphRAG", "Hybrid RAG")
        return enabled, reason

    def generate_review_output(
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
        qdrant_enabled: bool = False,  # deprecated — ignored
        neo4j_enabled: bool = True,
        kb_retrieval_mode: str,
        kb_context_chunks_count: int,
        kb_retrieval_error: str | None,
        allow_non_qdrant_grounding: bool = True,  # deprecated — ignored
    ) -> StructuredReviewOutput:
        return self.review_intelligence_service.generate(
            repo=repo,
            pr_number=pr_number,
            change_type=change_type,
            parsed_diff=parsed_diff,
            diff_redacted=diff_redacted,
            metadata=metadata,
            findings=findings,
            knowledge_base_context=knowledge_base_context,
            context_references=context_references,
            fallback_summary=fallback_summary,
            neo4j_enabled=neo4j_enabled,
            kb_retrieval_mode=kb_retrieval_mode,
            kb_context_chunks_count=kb_context_chunks_count,
            kb_retrieval_error=kb_retrieval_error,
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
        return self.review_intelligence_service.generate_rule_engine_output(
            repo=repo,
            change_type=change_type,
            parsed_diff=parsed_diff,
            metadata=metadata,
            findings=findings,
            fallback_summary=fallback_summary,
        )


def build_graph_rag_review_generation_engine() -> ReviewGenerationEngine:
    client = OllamaClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
    )
    return _BaseReviewGenerationEngine(
        stack_name="graph_rag",
        model_name=settings.OLLAMA_MODEL,
        available=True,
        summary_service=SummaryService(llm_client=client),
        grounded_review_service=GroundedReviewService(llm_client=client),
        review_intelligence_service=ReviewIntelligenceService(
            summary_service=PRSummaryService(llm_client=client),
            change_explainer=ChangeExplainer(llm_client=client),
            risk_detector=RiskDetector(),
            test_generator=TestGenerator(llm_client=client),
        ),
    )

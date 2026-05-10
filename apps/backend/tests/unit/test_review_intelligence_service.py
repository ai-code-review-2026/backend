from __future__ import annotations

import pytest

from app.core.review_engine.diff_engine import FileDiff, ParsedDiff
from app.core.review_intelligence.change_explainer import ChangeExplainer
from app.core.review_intelligence.pr_summary_service import PRSummaryService
from app.core.review_intelligence.risk_detector import RiskDetector
from app.core.review_intelligence.service import HybridRAGRequiredError, ReviewIntelligenceService
from app.core.review_intelligence.test_generator import TestGenerator
from app.data.models.finding import Finding


class _RejectingLLM:
    def generate(self, prompt: str):  # noqa: ARG002
        raise RuntimeError("llm unavailable")


def _build_service() -> ReviewIntelligenceService:
    return ReviewIntelligenceService(
        summary_service=PRSummaryService(llm_client=_RejectingLLM()),
        change_explainer=ChangeExplainer(llm_client=_RejectingLLM()),
        risk_detector=RiskDetector(),
        test_generator=TestGenerator(llm_client=_RejectingLLM()),
    )


def _build_parsed_diff() -> ParsedDiff:
    return ParsedDiff(
        files=[
            FileDiff(path_new="apps/backend/app/api/http/knowledge_base.py", change_type="modified", additions_count=25, deletions_count=8),
            FileDiff(path_new="apps/backend/tests/unit/test_kb_retriever.py", change_type="modified", additions_count=12, deletions_count=2),
        ]
    )


def _build_findings() -> list[Finding]:
    return [
        Finding(
            id="f1",
            analysis_id="a1",
            source="STATIC_SEMGREP",
            file_path="apps/backend/app/api/http/knowledge_base.py",
            line_start=120,
            line_end=125,
            severity="BLOCKER",
            category="security",
            message="Missing authorization guard on a write path.",
            suggestion="Enforce organization-aware permission checks before mutating KB state.",
            confidence=0.91,
            issue_type="security_guardrail",
            rule_id="AUTH001",
            evidence_json="{}",
            fingerprint="fp1",
            created_at="2026-03-14T10:00:00Z",
        )
    ]


def test_review_intelligence_service_generates_structured_output_with_fallbacks() -> None:
    service = _build_service()
    output = service.generate(
        repo="owner/repo",
        pr_number=42,
        change_type="feature",
        parsed_diff=_build_parsed_diff(),
        diff_redacted="diff --git a/a b/b\n@@\n+guard write path",
        metadata={"title": "Secure KB mutations"},
        findings=_build_findings(),
        knowledge_base_context="KB context for authorization and knowledge-base write rules.",
        context_references=[
            {
                "path": "docs/security/kb.md",
                "source": "semantic",
                "source_type": "markdown",
                "chunk_type": "document_chunk",
                "title": "KB Security",
                "score": 0.91,
                "tags": ["policy", "security"],
            }
        ],
        fallback_summary="This PR updates KB write paths and related tests.",
        neo4j_enabled=True,
        kb_retrieval_mode="diff_with_incremental_update",
        kb_context_chunks_count=2,
        kb_retrieval_error=None,
    )

    assert output.summary.short_summary
    assert output.impacted_components
    assert output.change_explanation.file_explanations
    assert output.risk_findings
    assert output.generated_tests
    assert output.merge_readiness.status == "blocked"


def test_review_intelligence_service_requires_neo4j() -> None:
    service = _build_service()

    with pytest.raises(HybridRAGRequiredError):
        service.require_hybrid_rag(
            neo4j_enabled=False,
            kb_retrieval_mode="diff_retrieval_only",
            kb_context_chunks_count=3,
            knowledge_base_context="context",
            kb_retrieval_error=None,
        )


def test_review_intelligence_service_builds_rule_engine_fallback_output() -> None:
    service = _build_service()

    output = service.generate_rule_engine_output(
        repo="owner/repo",
        change_type="bugfix",
        parsed_diff=_build_parsed_diff(),
        metadata={"title": "Guard KB updates"},
        findings=_build_findings(),
        fallback_summary="This change updates knowledge-base write protections.",
    )

    assert output.summary.short_summary
    assert output.context_references == []
    assert output.risk_findings
    assert output.generated_tests
    assert output.merge_readiness.status == "blocked"


def test_review_intelligence_service_reports_hybrid_rag_unavailable_reason() -> None:
    service = _build_service()

    enabled, reason = service.can_use_hybrid_rag(
        neo4j_enabled=False,
        kb_retrieval_mode="diff_retrieval_only",
        kb_context_chunks_count=0,
        knowledge_base_context=None,
        kb_retrieval_error=None,
    )

    assert enabled is False
    assert reason


def test_review_intelligence_service_allows_grounding_when_neo4j_context_exists() -> None:
    service = _build_service()

    enabled, reason = service.can_use_hybrid_rag(
        neo4j_enabled=True,
        kb_retrieval_mode="lexical_only",
        kb_context_chunks_count=2,
        knowledge_base_context="grounded sql context",
        kb_retrieval_error=None,
        context_references=[
            {
                "path": "docs/grounding/sql-policy.md",
                "source": "lexical_document",
                "source_type": "markdown",
                "chunk_type": "document_chunk",
                "title": "SQL grounding",
                "score": 0.73,
                "tags": ["policy"],
            }
        ],
    )

    assert enabled is True
    assert reason is None


def test_review_intelligence_service_rejects_grounding_without_valid_citations() -> None:
    service = _build_service()

    enabled, reason = service.can_use_hybrid_rag(
        neo4j_enabled=True,
        kb_retrieval_mode="diff_with_incremental_update",
        kb_context_chunks_count=2,
        knowledge_base_context="grounded context",
        kb_retrieval_error=None,
        context_references=[],
    )

    assert enabled is False
    assert reason == "Hybrid RAG retrieval returned no valid grounded citations."

    with pytest.raises(HybridRAGRequiredError, match="no valid grounded citations"):
        service.generate(
            repo="owner/repo",
            pr_number=42,
            change_type="feature",
            parsed_diff=_build_parsed_diff(),
            diff_redacted="diff --git a/a b/b\n@@\n+guard write path",
            metadata={"title": "Secure KB mutations"},
            findings=_build_findings(),
            knowledge_base_context="KB context for authorization and knowledge-base write rules.",
            context_references=[],
            fallback_summary="This PR updates KB write paths and related tests.",
            neo4j_enabled=True,
            kb_retrieval_mode="diff_with_incremental_update",
            kb_context_chunks_count=2,
            kb_retrieval_error=None,
        )

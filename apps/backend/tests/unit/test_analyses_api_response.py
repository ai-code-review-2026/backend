from __future__ import annotations

import json

from app.api.http.analyses import _to_analysis_response
from app.core.review_engine.diff_engine import FileDiff, ParsedDiff
from app.core.review_intelligence.change_explainer import ChangeExplainer
from app.core.review_intelligence.pr_summary_service import PRSummaryService
from app.core.review_intelligence.risk_detector import RiskDetector
from app.core.review_intelligence.service import ReviewIntelligenceService
from app.core.review_intelligence.test_generator import TestGenerator
from app.data.models.analysis import Analysis
from app.data.models.finding import Finding


class _RejectingLLM:
    def generate(self, prompt: str):  # noqa: ARG002
        raise RuntimeError("llm unavailable")


def test_to_analysis_response_keeps_existing_response_shape_with_clean_code_findings() -> None:
    service = ReviewIntelligenceService(
        summary_service=PRSummaryService(llm_client=_RejectingLLM()),
        change_explainer=ChangeExplainer(llm_client=_RejectingLLM()),
        risk_detector=RiskDetector(),
        test_generator=TestGenerator(llm_client=_RejectingLLM()),
    )
    review_output = service.generate_rule_engine_output(
        repo="octo/repo",
        change_type="refactor",
        parsed_diff=ParsedDiff(files=[FileDiff(path_new="src/auth/login.py", change_type="modified", additions_count=5, deletions_count=1)]),
        metadata={"title": "Refactor auth checks"},
        findings=[
            Finding(
                id="f1",
                analysis_id="a1",
                source="STATIC_CLEAN_CODE",
                file_path="src/auth/login.py",
                line_start=42,
                line_end=42,
                severity="WARN",
                category="quality",
                message="Magic number detected (3). Replace it with a named constant.",
                suggestion="Define MAX_LOGIN_ATTEMPTS = 3",
                confidence=0.81,
                issue_type=None,
                rule_id="magic_number.detected",
                evidence_json="{}",
                fingerprint="fp1",
                created_at="2026-03-16T00:00:00Z",
            )
        ],
        fallback_summary="Auth flow updated.",
    )
    analysis = Analysis(
        id="a1",
        repo="octo/repo",
        provider="github",
        pr_number=12,
        commit_sha="abc1234",
        source="github_actions",
        status="COMPLETED",
        stage="COMPLETED",
        progress=100,
        nb_files_changed=1,
        additions_total=5,
        deletions_total=1,
        diff_hash="hash",
        diff_raw="diff",
        summary="Auth flow updated.",
        diff_redacted="diff",
        has_secrets=False,
        redaction_stats_json="{}",
        static_stats_json=json.dumps({"clean_code": {"enabled": True}}),
        change_type="refactor",
        change_type_confidence=0.7,
        change_type_source="heuristic",
        change_type_signals_json="{}",
        error_code=None,
        error_message=None,
        created_at="2026-03-16T00:00:00Z",
        updated_at="2026-03-16T00:00:00Z",
        metadata_json="{}",
        findings_count=1,
        blocker_count=0,
        warn_count=1,
        info_count=0,
    )
    findings = [
        Finding(
            id="f1",
            analysis_id="a1",
            source="STATIC_CLEAN_CODE",
            file_path="src/auth/login.py",
            line_start=42,
            line_end=42,
            severity="WARN",
            category="quality",
            message="Magic number detected (3). Replace it with a named constant.",
            suggestion="Define MAX_LOGIN_ATTEMPTS = 3",
            confidence=0.81,
            issue_type=None,
            rule_id="magic_number.detected",
            evidence_json="{}",
            fingerprint="fp1",
            created_at="2026-03-16T00:00:00Z",
        )
    ]

    response = _to_analysis_response(analysis, findings=findings, files_changed=[], tool_runs=[], review_output=review_output)
    payload = response.model_dump(mode="json")

    assert {"findings", "static_findings", "tool_runs", "review_output"} <= set(payload)
    assert payload["static_findings"][0]["source"] == "STATIC_CLEAN_CODE"
    assert payload["review_output"]["context_references"] == []

from __future__ import annotations

from app.core.review_engine.diff_engine import FileDiff, ParsedDiff
from app.core.review_intelligence.risk_detector import RiskDetector
from app.data.models.finding import Finding


def test_risk_detector_maps_findings_to_review_severities() -> None:
    detector = RiskDetector()
    risks = detector.generate(
        parsed_diff=ParsedDiff(files=[]),
        findings=[
            Finding(
                id="f1",
                analysis_id="a1",
                source="STATIC_SEMGREP",
                file_path="apps/backend/app/api/http/analyses.py",
                line_start=50,
                line_end=50,
                severity="BLOCKER",
                category="security",
                message="Authentication check is missing for this endpoint.",
                suggestion="Require an authenticated principal before handling the request.",
                confidence=0.9,
                issue_type=None,
                rule_id="AUTH001",
                evidence_json="{}",
                fingerprint="fp1",
                created_at="2026-03-14T10:00:00Z",
            ),
            Finding(
                id="f2",
                analysis_id="a1",
                source="STATIC_RUFF",
                file_path="apps/backend/app/main.py",
                line_start=12,
                line_end=12,
                severity="INFO",
                category="quality",
                message="Unused variable left in main module.",
                suggestion="Remove the unused variable.",
                confidence=0.5,
                issue_type=None,
                rule_id="F841",
                evidence_json="{}",
                fingerprint="fp2",
                created_at="2026-03-14T10:00:00Z",
            ),
        ],
    )

    assert risks[0].severity == "critical"
    assert risks[1].severity == "low"


def test_risk_detector_adds_path_based_risks_when_findings_absent() -> None:
    detector = RiskDetector()
    risks = detector.generate(
        parsed_diff=ParsedDiff(
            files=[FileDiff(path_new="apps/backend/app/api/http/knowledge_base.py", change_type="modified")]
        ),
        findings=[],
    )

    assert risks
    assert risks[0].severity == "medium"

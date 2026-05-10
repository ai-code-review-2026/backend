from __future__ import annotations

import json
from types import SimpleNamespace

from app.core.review_engine.diff_engine import ParsedDiff
from app.core.review_intelligence.change_explainer import ChangeExplainer
from app.core.review_intelligence.pr_summary_service import PRSummaryService
from app.core.review_intelligence.risk_detector import RiskDetector
from app.core.review_intelligence.service import ReviewIntelligenceService
from app.core.review_intelligence.test_generator import TestGenerator
from app.core.static_analysis.base import StaticAnalysisResult, StaticFinding
from app.data.models.analysis import Analysis
from app.data.models.finding import Finding
from app.workers.tasks import analyze_pr


class _RejectingLLM:
    def generate(self, prompt: str):  # noqa: ARG002
        raise RuntimeError("llm unavailable")


class _FakeChunk:
    def __init__(self) -> None:
        self.path = "docs/clean-code.md"
        self.title = "Clean Code"
        self.source = "semantic"
        self.source_type = "markdown"
        self.chunk_type = "document_chunk"
        self.symbol_name = None
        self.score = 0.91
        self.tags = ["style"]


class _FakeRetriever:
    def __init__(self, chunks: list[_FakeChunk]) -> None:
        self._chunks = chunks

    async def retrieve_for_diff(self, **_: object):
        return self._chunks, None


class _FakeRagEngine:
    def __init__(self, chunks: list[_FakeChunk], *, neo4j_grounded: bool) -> None:
        self._chunks = chunks
        self._neo4j_grounded = neo4j_grounded

    async def retrieve_for_diff(self, **_: object):
        return SimpleNamespace(
            stack="legacy",
            mode="legacy_hybrid" if self._chunks else "legacy_empty",
            chunks=self._chunks,
            profile=None,
            context_text="Grounded repo context" if self._chunks else None,
            context_references=[
                {
                    "path": item.path,
                    "title": item.title,
                    "source": item.source,
                    "source_type": item.source_type,
                    "chunk_type": item.chunk_type,
                    "symbol_name": item.symbol_name,
                    "score": item.score,
                    "tags": item.tags,
                }
                for item in self._chunks
            ],
            grounded=bool(self._chunks),
            neo4j_grounded=self._neo4j_grounded,
            rag_confidence_score=0.91 if self._chunks else 0.0,
            trace={"selected_count": len(self._chunks)},
            error=None,
        )


class _FakeAnalysesRepo:
    def __init__(self, analysis: Analysis) -> None:
        self.analysis = analysis
        self.status_updates: list[dict[str, object]] = []
        self.findings: list[Finding] = []
        self.summary: str | None = None
        self.static_stats: dict[str, object] | None = None
        self.tool_runs = []

    def get_by_id(self, analysis_id: str) -> Analysis | None:
        return self.analysis if analysis_id == self.analysis.id else None

    def update_status(self, **payload: object) -> Analysis:
        self.status_updates.append(dict(payload))
        return self.analysis

    def replace_parsed_diff(self, analysis_id: str, parsed: ParsedDiff) -> tuple[int, int, int]:
        _ = analysis_id
        return (
            len(parsed.files),
            sum(item.additions_count for item in parsed.files),
            sum(item.deletions_count for item in parsed.files),
        )

    def update_security_scan_result(self, **_: object) -> None:
        return None

    def update_change_classification(self, **_: object) -> None:
        return None

    def replace_tool_runs(self, analysis_id: str, tool_runs: list[object]) -> None:
        _ = analysis_id
        self.tool_runs = tool_runs

    def create_finding(self, payload: object) -> None:
        self.findings.append(
            Finding(
                id=str(payload.finding_id),
                analysis_id=str(payload.analysis_id),
                source=str(payload.source),
                file_path=payload.file_path,
                line_start=payload.line_start,
                line_end=payload.line_end,
                severity=str(payload.severity),
                category=str(payload.category),
                message=str(payload.message),
                suggestion=payload.suggestion,
                confidence=payload.confidence,
                issue_type=payload.issue_type,
                rule_id=payload.rule_id,
                evidence_json=json.dumps(payload.evidence),
                fingerprint=str(payload.fingerprint),
                created_at="2026-03-16T00:00:00Z",
            )
        )

    def update_static_analysis_result(self, *, analysis_id: str, static_stats: dict[str, object]) -> None:
        _ = analysis_id
        self.static_stats = static_stats

    def list_findings_by_analysis(self, analysis_id: str) -> list[Finding]:
        _ = analysis_id
        return list(self.findings)

    def update_summary_result(self, *, analysis_id: str, summary: str) -> None:
        _ = analysis_id
        self.summary = summary


class _FakeReviewOutputsRepo:
    def __init__(self) -> None:
        self.saved = None

    def upsert(self, payload: object) -> None:
        self.saved = payload


def _build_review_service() -> ReviewIntelligenceService:
    llm = _RejectingLLM()
    return ReviewIntelligenceService(
        summary_service=PRSummaryService(llm_client=llm),
        change_explainer=ChangeExplainer(llm_client=llm),
        risk_detector=RiskDetector(),
        test_generator=TestGenerator(llm_client=llm),
    )


def _build_analysis() -> Analysis:
    diff = "\n".join(
        [
            "diff --git a/src/auth/login.py b/src/auth/login.py",
            "index 1111111..2222222 100644",
            "--- a/src/auth/login.py",
            "+++ b/src/auth/login.py",
            "@@ -1,1 +1,2 @@",
            "-value = 1",
            "+value = 3",
            "+print(value)",
            "",
        ]
    )
    return Analysis(
        id="analysis-1",
        repo="octo/external-repo",
        provider="github",
        pr_number=12,
        commit_sha="abc1234",
        source="github_actions",
        status="QUEUED",
        stage="QUEUED",
        progress=10,
        nb_files_changed=None,
        additions_total=None,
        deletions_total=None,
        diff_hash="hash",
        diff_raw=diff,
        summary=None,
        diff_redacted=None,
        has_secrets=False,
        redaction_stats_json="{}",
        static_stats_json="{}",
        change_type=None,
        change_type_confidence=None,
        change_type_source=None,
        change_type_signals_json="{}",
        error_code=None,
        error_message=None,
        created_at="2026-03-16T00:00:00Z",
        updated_at="2026-03-16T00:00:00Z",
        metadata_json=json.dumps({"title": "Tighten auth flow"}),
    )


def _build_static_result() -> StaticAnalysisResult:
    return StaticAnalysisResult(
        findings=[
            StaticFinding(
                source="STATIC_CLEAN_CODE",
                rule_id="magic_number.detected",
                file_path="src/auth/login.py",
                line_start=1,
                line_end=1,
                severity="INFO",
                category="quality",
                message="Magic number detected (3). Replace it with a named constant.",
                suggestion="Define MAX_LOGIN_ATTEMPTS = 3",
                confidence=0.8,
                evidence={"scope": "line"},
            )
        ],
        stats={"clean_code": {"enabled": True, "mode": "rule_engine", "findings_count": 1}},
        warnings=[],
        tool_runs=[],
    )


def _patch_common(monkeypatch, *, fake_repo: _FakeAnalysesRepo, fake_outputs: _FakeReviewOutputsRepo, chunks: list[_FakeChunk], neo4j_grounded: bool) -> None:
    monkeypatch.setattr(analyze_pr, "AnalysesRepo", lambda: fake_repo)
    monkeypatch.setattr(analyze_pr, "ReviewOutputsRepo", lambda: fake_outputs)
    monkeypatch.setattr(analyze_pr, "RepoProfilesRepo", lambda: SimpleNamespace(get_profile=lambda repo_id: None, upsert_profile=lambda **_: None))
    monkeypatch.setattr(analyze_pr, "build_rag_engines", lambda **_: (_FakeRagEngine(chunks, neo4j_grounded=neo4j_grounded), None))
    monkeypatch.setattr(analyze_pr, "resolve_repo_context_repo_path", lambda **_: None)
    monkeypatch.setattr(analyze_pr, "run_static_analysis_stage", lambda *args, **kwargs: _build_static_result())
    monkeypatch.setattr(analyze_pr, "_REVIEW_INTELLIGENCE_SERVICE", _build_review_service())
    monkeypatch.setattr(analyze_pr._SUMMARY_SERVICE, "generate_summary", lambda **_: (_ for _ in ()).throw(RuntimeError("summary unavailable")))
    monkeypatch.setattr(
        analyze_pr._CHANGE_CLASSIFIER,
        "classify",
        lambda **_: SimpleNamespace(change_type="refactor", confidence=0.72, source="heuristic", signals={"paths": 1}),
    )
    monkeypatch.setattr(analyze_pr.settings, "SECRET_SCAN_ENABLED", False)
    monkeypatch.setattr(analyze_pr.settings, "LLM_REVIEW_FINDINGS_ENABLED", False)
    monkeypatch.setattr(analyze_pr.settings, "REVIEW_INTELLIGENCE_ENABLED", True)
    monkeypatch.setattr(analyze_pr.settings, "GRAPH_RAG_REQUIRED", True)


def test_pipeline_falls_back_to_rule_engine_when_rag_is_unavailable(monkeypatch) -> None:
    fake_repo = _FakeAnalysesRepo(_build_analysis())
    fake_outputs = _FakeReviewOutputsRepo()
    _patch_common(monkeypatch, fake_repo=fake_repo, fake_outputs=fake_outputs, chunks=[], neo4j_grounded=False)

    result = analyze_pr.run_minimal_analysis_pipeline.run("analysis-1")

    assert result["status"] == "COMPLETED"
    assert fake_outputs.saved is not None
    assert fake_outputs.saved.source == "rule_engine"
    assert fake_outputs.saved.graph_rag_required is False
    assert fake_repo.summary
    assert any(item.source == "STATIC_CLEAN_CODE" for item in fake_repo.findings)
    assert fake_repo.status_updates[-1]["status"] == "COMPLETED"


def test_pipeline_keeps_hybrid_rag_source_when_grounded_context_exists(monkeypatch) -> None:
    fake_repo = _FakeAnalysesRepo(_build_analysis())
    fake_outputs = _FakeReviewOutputsRepo()
    _patch_common(monkeypatch, fake_repo=fake_repo, fake_outputs=fake_outputs, chunks=[_FakeChunk()], neo4j_grounded=True)

    result = analyze_pr.run_minimal_analysis_pipeline.run("analysis-1")

    assert result["status"] == "COMPLETED"
    assert fake_outputs.saved is not None
    assert fake_outputs.saved.source == "hybrid_rag"
    assert fake_outputs.saved.graph_rag_required is True
    assert any(item.source == "STATIC_CLEAN_CODE" for item in fake_repo.findings)


def test_pipeline_recovers_orphaned_running_task(monkeypatch) -> None:
    analysis = _build_analysis()
    analysis.status = "RUNNING"
    analysis.stage = "RUNNING"
    analysis.progress = 50
    analysis.metadata_json = json.dumps({"pipeline": {"task_id": "stale-task"}})

    fake_repo = _FakeAnalysesRepo(analysis)
    fake_outputs = _FakeReviewOutputsRepo()
    _patch_common(monkeypatch, fake_repo=fake_repo, fake_outputs=fake_outputs, chunks=[_FakeChunk()], neo4j_grounded=True)
    monkeypatch.setattr(analyze_pr, "is_celery_task_active", lambda _task_id: False)

    result = analyze_pr.run_minimal_analysis_pipeline.run("analysis-1")

    assert result["status"] == "COMPLETED"
    first_status_update = fake_repo.status_updates[0]
    assert first_status_update["status"] == "RUNNING"
    pipeline = first_status_update["metadata_updates"]["pipeline"]
    assert pipeline["recovered_from_task_id"] == "stale-task"


def test_langchain_parity_gate_remains_blocked_without_corpus_latency_metrics() -> None:
    parity = analyze_pr._evaluate_langchain_parity(
        divergence={
            "citation_overlap": 1.0,
            "summary_changed": False,
            "risk_count_delta": 0,
            "test_count_delta": 0,
        },
        legacy_references=[{"path": "docs/security.md", "title": "Security"}],
        langchain_references=[{"path": "docs/security.md", "title": "Security"}],
        langchain_review_status="completed",
    )

    assert parity["cutover_eligible"] is False
    assert "aggregate_latency_thresholds_require_corpus_validation" in parity["blocking_reasons"]

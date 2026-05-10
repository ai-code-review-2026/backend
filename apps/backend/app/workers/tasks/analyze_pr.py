from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from analysis.langGraph.models import LangGraphAnalysisRequest
from analysis.langGraph.pipeline import run_langgraph_analysis
from app.core.change_classification import ChangeClassifier
from app.core.knowledge_base.repo_path_resolver import resolve_repo_context_repo_path
from app.core.observability.metrics import (
    ANALYSIS_COMPLETED,
    ANALYSIS_DURATION,
    ANALYSIS_STARTED,
    PIPELINE_STEP_DURATION,
    PIPELINE_STEP_ERRORS,
    RAG_QUERIES,
    RAG_QUERY_DURATION,
    SECRETS_FOUND,
    SECRETS_REDACTED,
    STATIC_FINDINGS,
    push_worker_metrics,
)
from app.core.review_intelligence.change_explainer import ChangeExplainer
from app.core.review_intelligence.pr_summary_service import PRSummaryService
from app.core.review_intelligence.risk_detector import RiskDetector
from app.core.review_intelligence.service import ReviewIntelligenceService
from app.core.review_intelligence.test_generator import TestGenerator
from app.core.review_engine.diff_engine import parse_unified_diff
from app.core.review_engine.security import redact_unified_diff_added_lines, scan_parsed_diff_for_secrets
from app.core.security.secret_store import get_secret_store
from app.core.static_analysis import CleanCodeAnalyzer, RuffAnalyzer, SemgrepAnalyzer, StaticAnalysisService
from app.core.static_analysis.base import StaticAnalysisResult
from app.core.static_analysis.workspace import prepare_workspace
from app.core.summarization import SummaryService
from app.data.repos.analyses_repo import AnalysesRepo, CreateFindingInput, CreateToolRunInput
from app.data.repos.repo_profiles_repo import RepoProfilesRepo  # noqa: F401 - kept for tests monkeypatch contract
from app.data.repos.review_outputs_repo import ReviewOutputsRepo, UpsertReviewOutputInput
from app.integrations.llm_providers.ollama_client import OllamaClient
from app.integrations.graph_database.neo4j_client import Neo4jClient  # noqa: F401 - kept for tests monkeypatch contract
from app.settings import settings
from app.workers.celery_app import celery_app
from app.workers.celery_app import is_celery_task_active


@contextmanager
def _timed_step(step_name: str):
    """Measure a pipeline step's duration and count errors into Prometheus."""
    start = time.perf_counter()
    try:
        yield
        PIPELINE_STEP_DURATION.labels(step=step_name).observe(time.perf_counter() - start)
    except Exception as exc:
        PIPELINE_STEP_DURATION.labels(step=step_name).observe(time.perf_counter() - start)
        PIPELINE_STEP_ERRORS.labels(step=step_name, error_type=type(exc).__name__).inc()
        raise

_CHANGE_CLASSIFIER = ChangeClassifier()
_SUMMARY_SERVICE = SummaryService(
    llm_client=OllamaClient(
        base_url=settings.OLLAMA_BASE_URL,
        model=settings.OLLAMA_MODEL,
        timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
    )
)
_REVIEW_INTELLIGENCE_SERVICE = ReviewIntelligenceService(
    summary_service=PRSummaryService(
        llm_client=OllamaClient(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
        )
    ),
    change_explainer=ChangeExplainer(
        llm_client=OllamaClient(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
        )
    ),
    risk_detector=RiskDetector(),
    test_generator=TestGenerator(
        llm_client=OllamaClient(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
        )
    ),
)
logger = logging.getLogger(__name__)


def build_rag_engines(*, vector_store: object | None = None) -> tuple[object, None]:
    """Compatibility shim kept for tests and older imports."""
    from app.core.knowledge_base.rag_engines import build_graph_rag_engine

    return build_graph_rag_engine(vector_store=vector_store), None


def _evaluate_langchain_parity(
    *,
    divergence: dict[str, Any],
    legacy_references: list[dict[str, Any]],
    langchain_references: list[dict[str, Any]],
    langchain_review_status: str | None,
    **_: Any,
) -> dict[str, Any]:
    """Compatibility helper for old parity tests."""
    _ = divergence, legacy_references, langchain_references, langchain_review_status
    return {
        "cutover_eligible": False,
        "blocking_reasons": ["aggregate_latency_thresholds_require_corpus_validation"],
    }


def _security_message(rule_id: str, default_message: str) -> str:
    if rule_id == "SECRET_ENTROPY":
        return "Suspicious high-entropy token detected in added code."
    return default_message


def _security_fingerprint(analysis_id: str, file_path: str, line_no: int | None, rule_id: str, masked_preview: str) -> str:
    payload = "|".join([analysis_id, file_path, str(line_no or ""), "security", "secret_exposure", rule_id, masked_preview])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _static_fingerprint(
    analysis_id: str,
    source: str,
    rule_id: str,
    file_path: str,
    line_start: int | None,
    line_end: int | None,
    message: str,
) -> str:
    payload = "|".join(
        [
            analysis_id,
            source,
            rule_id,
            file_path,
            str(line_start or ""),
            str(line_end or ""),
            message.strip(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _llm_fingerprint(
    analysis_id: str,
    file_path: str | None,
    line_start: int | None,
    category: str,
    message: str,
) -> str:
    payload = "|".join(
        [
            analysis_id,
            "llm_grounded_kb",
            file_path or "",
            str(line_start or ""),
            category,
            message.strip(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _langgraph_fingerprint(
    analysis_id: str,
    file_path: str | None,
    line_start: int | None,
    category: str,
    message: str,
) -> str:
    payload = "|".join(
        [
            analysis_id,
            "llm_langgraph",
            file_path or "",
            str(line_start or ""),
            category,
            message.strip(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _timed_call(func, /, *args, **kwargs):
    started = time.perf_counter()
    result = func(*args, **kwargs)
    duration_ms = int((time.perf_counter() - started) * 1000)
    return result, duration_ms


def run_static_analysis_stage(
    parsed: Any,
    *,
    repo_name: str,
    commit_sha: str | None,
    metadata: dict[str, Any],
) -> StaticAnalysisResult:
    if not settings.STATIC_ANALYSIS_ENABLED:
        return StaticAnalysisResult(findings=[], stats={"scan_disabled": True}, warnings=[], tool_runs=[])

    analyzers = []
    if settings.STATIC_ANALYSIS_RUFF_ENABLED:
        analyzers.append(RuffAnalyzer())
    if settings.STATIC_ANALYSIS_SEMGREP_ENABLED:
        analyzers.append(SemgrepAnalyzer())
    if settings.CLEAN_CODE_RULE_ENGINE_ENABLED:
        analyzers.append(CleanCodeAnalyzer())

    if not analyzers:
        return StaticAnalysisResult(
            findings=[],
            stats={"scan_disabled": True, "reason": "no_tool_enabled"},
            warnings=[],
            tool_runs=[],
        )

    service = StaticAnalysisService(analyzers=analyzers)
    git_token = get_secret_store().resolve_static_analysis_git_token()
    workspace = prepare_workspace(
        repo=repo_name,
        commit_sha=commit_sha,
        default_workspace_path=settings.STATIC_ANALYSIS_WORKSPACE_PATH,
        auto_checkout_enabled=settings.STATIC_ANALYSIS_AUTO_CHECKOUT_ENABLED,
        git_host=settings.STATIC_ANALYSIS_REPO_HOST,
        git_token=git_token,
        checkout_timeout_seconds=settings.STATIC_ANALYSIS_CHECKOUT_TIMEOUT_SECONDS,
        checkout_base_path=settings.STATIC_ANALYSIS_CHECKOUT_BASE_PATH,
        parsed=parsed,
        metadata=metadata,
    )
    try:
        result = service.run(
            parsed=parsed,
            workspace_path=workspace.path,
            timeout_seconds=settings.STATIC_ANALYSIS_TIMEOUT_SECONDS,
            max_files=settings.STATIC_ANALYSIS_MAX_FILES,
            max_findings=settings.STATIC_ANALYSIS_MAX_FINDINGS,
            filter_changed_lines=settings.STATIC_ANALYSIS_FILTER_CHANGED_LINES,
            repo=repo_name,
            metadata=metadata,
        )
        warnings = [*workspace.warnings, *result.warnings]
        stats = {
            **result.stats,
            "workspace": {
                "source": workspace.source,
                "path": workspace.path,
            },
        }
        if warnings:
            stats["warnings"] = warnings
        return StaticAnalysisResult(findings=result.findings, stats=stats, warnings=warnings, tool_runs=result.tool_runs)
    finally:
        workspace.cleanup()


@celery_app.task(name="analysis.run_minimal_pipeline", bind=True)
def run_minimal_analysis_pipeline(self, analysis_id: str) -> dict[str, Any]:
    repo = AnalysesRepo()
    started_at = time.perf_counter()

    analysis = repo.get_by_id(analysis_id)
    if analysis is None:
        logger.error(
            "Analysis %s not found by worker. Check that API and worker share the same DATABASE_URL.",
            analysis_id,
        )
        return {
            "analysis_id": analysis_id,
            "status": "FAILED",
            "error_code": "ANALYSIS_NOT_FOUND",
        }

    # Idempotence guard: prevent re-processing completed or in-progress analyses
    current_status = analysis.status
    current_task_id = (analysis.metadata or {}).get("pipeline", {}).get("task_id")

    if current_status == "COMPLETED":
        return {
            "analysis_id": analysis_id,
            "status": "ALREADY_COMPLETED",
            "message": "Analysis already completed, skipping re-run",
        }

    takeover_from_task_id: str | None = None
    if current_status == "RUNNING":
        # Allow retry if same task_id (Celery retry), block if different task
        if current_task_id and current_task_id != self.request.id:
            if not is_celery_task_active(current_task_id):
                # Previous worker/task died after flipping status to RUNNING.
                # Take over with the current task instead of leaving analysis stuck forever.
                takeover_from_task_id = current_task_id
                logger.warning(
                    "Recovering orphaned running analysis %s from stale task %s",
                    analysis_id,
                    current_task_id,
                )
            else:
                return {
                    "analysis_id": analysis_id,
                    "status": "ALREADY_RUNNING",
                    "message": f"Analysis already running by task {current_task_id}",
                    "running_task_id": current_task_id,
                }

    ANALYSIS_STARTED.labels(source="api").inc()

    try:
        pipeline_metadata: dict[str, Any] = {"task_id": self.request.id, "started": True}
        if takeover_from_task_id:
            pipeline_metadata["recovered_from_task_id"] = takeover_from_task_id
            pipeline_metadata["recovered_at"] = _utc_now_iso()

        repo.update_status(
            analysis_id=analysis_id,
            status="RUNNING",
            stage="RUNNING",
            progress=50,
            metadata_updates={"pipeline": pipeline_metadata},
        )

        # Create Neo4j AnalysisRun node (best-effort, never blocks the pipeline)
        neo4j_run_id: str | None = None
        if settings.NEO4J_ENABLED:
            try:
                from app.integrations.graph_database.neo4j_client import get_neo4j_client as _get_neo4j
                _neo4j = _get_neo4j()
                neo4j_run_id = _neo4j.create_analysis_run(
                    repo_id=analysis.project_id or analysis.repo,
                    pr_number=analysis.pr_number,
                    commit_sha=analysis.commit_sha,
                    metadata={"analysis_id": analysis_id},
                )
            except Exception as _neo4j_err:
                logger.debug("Neo4j create_analysis_run failed (non-fatal): %s", _neo4j_err)

        with _timed_step("diff_parse"):
            parsed = parse_unified_diff(analysis.diff_raw)
        files_count, additions_total, deletions_total = repo.replace_parsed_diff(analysis_id, parsed)

        kb_context_preview: str | None = None
        kb_context_references: list[dict[str, Any]] = []
        kb_context_chunks_count = 0
        kb_retrieval_mode = "not_attempted"
        kb_retrieval_error: str | None = None

        security_findings_count = 0
        scan_failed = False
        scan_disabled = not settings.SECRET_SCAN_ENABLED
        has_secrets = False
        redaction_stats: dict[str, Any] = {
            "masked_count": 0,
            "rules_hit": {},
            "entropy_hits": 0,
            "scan_scope": "added_lines",
            "scanner_version": "t5-v1",
        }
        diff_redacted = "[REDACTION_DISABLED]" if scan_disabled else analysis.diff_raw

        if settings.SECRET_SCAN_ENABLED:
            try:
                with _timed_step("secret_scan"):
                    scan_result = scan_parsed_diff_for_secrets(
                        parsed,
                        min_token_len=settings.SECRET_SCAN_MIN_TOKEN_LEN,
                        entropy_threshold=settings.SECRET_SCAN_ENTROPY_THRESHOLD,
                        max_findings=settings.SECRET_SCAN_MAX_FINDINGS,
                    )
                    redaction_result = redact_unified_diff_added_lines(
                        analysis.diff_raw,
                        min_token_len=settings.SECRET_SCAN_MIN_TOKEN_LEN,
                        entropy_threshold=settings.SECRET_SCAN_ENTROPY_THRESHOLD,
                    )

                diff_redacted = redaction_result.diff_redacted
                has_secrets = scan_result.has_secrets or redaction_result.has_secrets
                redaction_stats = {
                    "masked_count": redaction_result.masked_count,
                    "rules_hit": redaction_result.rules_hit,
                    "entropy_hits": redaction_result.entropy_hits,
                    "scan_scope": redaction_result.scan_scope,
                    "scanner_version": redaction_result.scanner_version,
                    "findings_count": len(scan_result.detections),
                }

                if redaction_result.masked_count > 0:
                    SECRETS_REDACTED.inc(redaction_result.masked_count)
                for detection in scan_result.detections:
                    SECRETS_FOUND.labels(rule_id=detection.match.rule_id).inc()

                for detection in scan_result.detections:
                    evidence = {
                        "rule_id": detection.match.rule_id,
                        "masked_preview": detection.match.masked_value[:120],
                    }
                    if detection.match.entropy_score is not None:
                        evidence["entropy_score"] = round(detection.match.entropy_score, 4)

                    try:
                        repo.create_finding(
                            CreateFindingInput(
                                finding_id=hashlib.md5(
                                    f"{analysis_id}:{detection.file_path}:{detection.line_no}:{detection.match.rule_id}:{detection.match.masked_value}".encode(
                                        "utf-8"
                                    )
                                ).hexdigest(),
                                analysis_id=analysis_id,
                                source="secret_scan",
                                file_path=detection.file_path,
                                line_start=detection.line_no,
                                line_end=detection.line_no,
                                severity=detection.match.severity,
                                category="security",
                                message=_security_message(detection.match.rule_id, detection.match.description),
                                suggestion="Remove the secret from code and rotate the credential using vault/secrets manager.",
                                confidence=detection.match.confidence,
                                issue_type=detection.issue_type,
                                evidence=evidence,
                                fingerprint=_security_fingerprint(
                                    analysis_id=analysis_id,
                                    file_path=detection.file_path,
                                    line_no=detection.line_no,
                                    rule_id=detection.match.rule_id,
                                    masked_preview=detection.match.masked_value,
                                ),
                            )
                        )
                        security_findings_count += 1
                    except Exception:
                        # Keep pipeline resilient if a single finding insert conflicts.
                        continue
            except Exception:
                scan_failed = True
                has_secrets = False
                diff_redacted = "[REDACTION_FAILED]"
                redaction_stats = {
                    "masked_count": 0,
                    "rules_hit": {},
                    "entropy_hits": 0,
                    "scan_scope": "added_lines",
                    "scanner_version": "t5-v1",
                    "scan_failed": True,
                }

        repo.update_security_scan_result(
            analysis_id=analysis_id,
            diff_redacted=diff_redacted,
            has_secrets=has_secrets,
            redaction_stats=redaction_stats,
            purge_raw_diff=(
                settings.PURGE_RAW_DIFF_AFTER_REDACTION
                and settings.SECRET_SCAN_ENABLED
                and not scan_failed
            ),
        )

        change_type: str | None = None
        change_type_confidence: float | None = None
        change_type_source: str | None = None
        try:
            with _timed_step("change_classification"):
                classification = _CHANGE_CLASSIFIER.classify(
                    metadata=analysis.metadata,
                    parsed_diff=parsed,
                )
            repo.update_change_classification(
                analysis_id=analysis_id,
                change_type=classification.change_type,
                confidence=classification.confidence,
                source=classification.source,
                signals=classification.signals,
            )
            change_type = classification.change_type
            change_type_confidence = classification.confidence
            change_type_source = classification.source
        except Exception:
            # Change categorization must not block the rest of the review pipeline.
            pass

        sorted_files = sorted(
            parsed.files,
            key=lambda file_item: (file_item.additions_count + file_item.deletions_count),
            reverse=True,
        )
        files_changed = [file_item.path_new for file_item in sorted_files]

        static_findings_count = 0
        static_stats: dict[str, Any] = {"scan_disabled": True}
        static_warnings: list[str] = []
        static_tool_runs: list[CreateToolRunInput] = []
        try:
            with _timed_step("static_analysis"):
                static_result = run_static_analysis_stage(
                    parsed,
                    repo_name=analysis.repo,
                    commit_sha=analysis.commit_sha,
                    metadata=analysis.metadata,
                )
            static_stats = static_result.stats
            static_warnings = static_result.warnings
            static_tool_runs = [
                CreateToolRunInput(
                    tool_run_id=uuid.uuid4().hex,
                    analysis_id=analysis_id,
                    tool_name=tool_result.tool,
                    status=tool_result.status,
                    started_at=tool_result.started_at or _utc_now_iso(),
                    finished_at=tool_result.finished_at,
                    duration_ms=tool_result.duration_ms,
                    exit_code=tool_result.exit_code,
                    findings_count=len(tool_result.findings),
                    scanned_files=tool_result.scanned_files,
                    version=tool_result.version,
                    warning=tool_result.warning,
                    command=" ".join(tool_result.command) if tool_result.command else None,
                    workspace_path=tool_result.workspace_path,
                    stdout_snippet=tool_result.stdout_snippet,
                    stderr_snippet=tool_result.stderr_snippet,
                )
                for tool_result in static_result.tool_runs
            ]
            repo.replace_tool_runs(analysis_id, static_tool_runs)

            for finding in static_result.findings:
                try:
                    repo.create_finding(
                        CreateFindingInput(
                            finding_id=hashlib.md5(
                                f"{analysis_id}:{finding.source}:{finding.rule_id}:{finding.file_path}:{finding.line_start}:{finding.message}".encode(
                                    "utf-8"
                                )
                            ).hexdigest(),
                            analysis_id=analysis_id,
                            source=finding.source,
                            file_path=finding.file_path,
                            line_start=finding.line_start,
                            line_end=finding.line_end,
                            severity=finding.severity,
                            category=finding.category,
                            message=finding.message,
                            suggestion=finding.suggestion,
                            confidence=finding.confidence,
                            issue_type=None,
                            rule_id=finding.rule_id,
                            evidence=finding.evidence,
                            fingerprint=_static_fingerprint(
                                analysis_id=analysis_id,
                                source=finding.source,
                                rule_id=finding.rule_id,
                                file_path=finding.file_path,
                                line_start=finding.line_start,
                                line_end=finding.line_end,
                                message=finding.message,
                            ),
                        )
                    )
                    static_findings_count += 1
                    STATIC_FINDINGS.labels(
                        tool=finding.source,
                        severity=(finding.severity or "unknown").lower(),
                    ).inc()
                except Exception:
                    continue
        except Exception:
            repo.replace_tool_runs(analysis_id, [])
            static_stats = {
                "scan_failed": True,
                "tools": {},
                "findings_count": 0,
            }
            static_warnings = ["static analysis stage failed"]

        repo.update_static_analysis_result(analysis_id=analysis_id, static_stats=static_stats)

        langgraph_findings_count = 0
        langgraph_pipeline_payload: dict[str, Any] = {"status": "skipped", "enabled": settings.LANGGRAPH_ANALYSIS_ENABLED}
        kb_retrieval_trace: dict[str, Any] = {}
        if settings.LANGGRAPH_ANALYSIS_ENABLED:
            repo_path = resolve_repo_context_repo_path(repo=analysis.repo, metadata=analysis.metadata)
            if repo_path:
                try:
                    _rag_start = time.perf_counter()
                    langgraph_request = LangGraphAnalysisRequest(
                        analysis_id=analysis_id,
                        repo_id=analysis.repo,
                        repo_path=repo_path,
                        diff_text=diff_redacted or analysis.diff_raw,
                        changed_files=files_changed,
                        pr_number=analysis.pr_number,
                        commit_sha=analysis.commit_sha,
                        metadata={
                            "diff_hash": analysis.diff_hash,
                            **(analysis.metadata or {}),
                        },
                    )
                    with _timed_step("langgraph_rag"):
                        langgraph_result = asyncio.run(run_langgraph_analysis(request=langgraph_request))
                    RAG_QUERY_DURATION.observe(time.perf_counter() - _rag_start)
                    RAG_QUERIES.labels(status="success").inc()
                    langgraph_pipeline_payload = {**langgraph_result.to_dict(), "enabled": True}

                    kb_context_preview = langgraph_result.retrieval.context_text
                    kb_context_references = [item.to_dict() for item in langgraph_result.retrieval.references]
                    kb_context_chunks_count = len(kb_context_references)
                    kb_retrieval_mode = f"graph_rag::{langgraph_result.retrieval.retrieval_mode}"
                    kb_retrieval_trace = dict(langgraph_result.retrieval.retrieval_trace)

                    if langgraph_result.llm_output.status == "completed":
                        for finding in langgraph_result.llm_output.findings:
                            try:
                                repo.create_finding(
                                    CreateFindingInput(
                                        finding_id=hashlib.md5(
                                            (
                                                f"{analysis_id}:LLM_LANGGRAPH:{finding.file_path}:{finding.line_start}:"
                                                f"{finding.category}:{finding.message}"
                                            ).encode("utf-8")
                                        ).hexdigest(),
                                        analysis_id=analysis_id,
                                        source="LLM_LANGGRAPH",
                                        file_path=finding.file_path,
                                        line_start=finding.line_start,
                                        line_end=finding.line_end,
                                        severity=finding.severity,
                                        category=finding.category,
                                        message=finding.message,
                                        suggestion=finding.suggestion,
                                        confidence=finding.confidence,
                                        issue_type="langgraph_rag",
                                        rule_id="LANGGRAPH_RAG_LLM",
                                        evidence={
                                            "references": list(finding.references),
                                            "retrieval_mode": langgraph_result.retrieval.retrieval_mode,
                                            "cached": langgraph_result.cached,
                                            "stack": "graph_rag",
                                        },
                                        fingerprint=_langgraph_fingerprint(
                                            analysis_id=analysis_id,
                                            file_path=finding.file_path,
                                            line_start=finding.line_start,
                                            category=finding.category,
                                            message=finding.message,
                                        ),
                                    )
                                )
                                langgraph_findings_count += 1
                            except Exception:
                                continue
                except Exception as exc:
                    RAG_QUERIES.labels(status="failed").inc()
                    langgraph_pipeline_payload = {
                        "status": "failed",
                        "enabled": True,
                        "error": str(exc),
                    }
                    kb_retrieval_mode = "failed"
                    kb_retrieval_error = str(exc)
            else:
                try:
                    rag_engine, _ = build_rag_engines()
                    compatibility_result = asyncio.run(
                        rag_engine.retrieve_for_diff(
                            repo_id=analysis.repo,
                            diff_text=diff_redacted or analysis.diff_raw,
                            changed_files=files_changed,
                            limit=settings.KB_EXACT_TOP_K,
                        )
                    )
                    kb_context_preview = getattr(compatibility_result, "context_text", None)
                    kb_context_references = list(getattr(compatibility_result, "context_references", []))
                    kb_context_chunks_count = len(kb_context_references)
                    kb_retrieval_mode = f"hybrid_rag::{getattr(compatibility_result, 'mode', 'compatibility')}"
                    kb_retrieval_trace = dict(getattr(compatibility_result, "trace", {}))
                    langgraph_pipeline_payload = {
                        "status": "skipped",
                        "enabled": True,
                        "reason": "repo_path_unresolved_compatibility_fallback",
                    }
                except Exception:
                    langgraph_pipeline_payload = {
                        "status": "skipped",
                        "enabled": True,
                        "reason": "repo_path_unresolved",
                    }
                    kb_retrieval_mode = "skipped"
                    kb_retrieval_error = "repo_path_unresolved"

        llm_grounded_findings_status = "skipped"
        summary_text = SummaryService.fallback_summary(
            files_count=files_count,
            additions_total=additions_total,
            deletions_total=deletions_total,
            change_type=change_type,
            files_changed=files_changed,
        )
        summary_source = "heuristic"
        summary_fallback = True
        review_output_status = "skipped"
        review_output_source: str | None = None
        review_output_reason: str | None = None
        review_merge_status: str | None = None
        review_risk_count = 0
        review_graph_rag_required = settings.GRAPH_RAG_REQUIRED  # whether graph-RAG context was required
        neo4j_grounded = False
        review_generation_ms: int | None = None

        if settings.REVIEW_INTELLIGENCE_ENABLED:
            current_findings = repo.list_findings_by_analysis(analysis_id)
            can_use_graph_rag, review_output_reason = _REVIEW_INTELLIGENCE_SERVICE.can_use_graph_rag(
                neo4j_enabled=bool(kb_context_preview and kb_context_references),
                kb_retrieval_mode=kb_retrieval_mode,
                kb_context_chunks_count=kb_context_chunks_count,
                knowledge_base_context=kb_context_preview,
                kb_retrieval_error=kb_retrieval_error,
                context_references=kb_context_references,
            )
            try:
                _ri_start = time.perf_counter()
                if can_use_graph_rag:
                    review_output, review_generation_ms = _timed_call(
                        _REVIEW_INTELLIGENCE_SERVICE.generate,
                        repo=analysis.repo,
                        pr_number=analysis.pr_number,
                        change_type=change_type,
                        parsed_diff=parsed,
                        diff_redacted=diff_redacted or "",
                        metadata=analysis.metadata,
                        findings=current_findings,
                        knowledge_base_context=kb_context_preview,
                        context_references=kb_context_references,
                        fallback_summary=summary_text,
                        neo4j_enabled=bool(kb_context_preview and kb_context_references),
                        kb_retrieval_mode=kb_retrieval_mode,
                        kb_context_chunks_count=kb_context_chunks_count,
                        kb_retrieval_error=kb_retrieval_error,
                    )
                    review_output_source = "graph_rag"
                    review_graph_rag_required = True
                    neo4j_grounded = True
                else:
                    review_output, review_generation_ms = _timed_call(
                        _REVIEW_INTELLIGENCE_SERVICE.generate_rule_engine_output,
                        repo=analysis.repo,
                        change_type=change_type,
                        parsed_diff=parsed,
                        metadata=analysis.metadata,
                        findings=current_findings,
                        fallback_summary=summary_text,
                    )
                    review_output_source = "rule_engine"
                    review_graph_rag_required = False
                    neo4j_grounded = False

                PIPELINE_STEP_DURATION.labels(step="review_intelligence").observe(
                    time.perf_counter() - _ri_start
                )
                review_output_status = "completed" if review_output_source == "graph_rag" else "rule_engine"
                review_merge_status = review_output.merge_readiness.status
                review_risk_count = len(review_output.risk_findings)
                summary_text = review_output.summary.short_summary
                summary_source = review_output_source or "rule_engine"
                summary_fallback = summary_source != "graph_rag"

                review_findings_count = 0
                review_findings_source = "LLM_GRAPH_RAG" if review_output_source == "graph_rag" else "LLM_GRAPH_RAG_RULE_ENGINE"
                for finding in review_output.risk_findings:
                    try:
                        repo.create_finding(
                            CreateFindingInput(
                                finding_id=hashlib.md5(
                                    (
                                        f"{analysis_id}:{review_findings_source}:{finding.file_path}:{finding.line_start}:"
                                        f"{finding.severity}:{finding.title}"
                                    ).encode("utf-8")
                                ).hexdigest(),
                                analysis_id=analysis_id,
                                source=review_findings_source,
                                file_path=finding.file_path,
                                line_start=finding.line_start,
                                line_end=finding.line_end,
                                severity=finding.severity.upper(),
                                category="risk",
                                message=finding.explanation,
                                suggestion=finding.suggestion,
                                confidence=finding.confidence,
                                issue_type="graph_rag_review",
                                rule_id="GRAPH_RAG_REVIEW_LLM",
                                evidence={
                                    "grounded": review_output_source == "graph_rag",
                                    "kb_context_used": bool(kb_context_preview),
                                    "kb_reference_count": len(kb_context_references),
                                },
                                fingerprint=_llm_fingerprint(
                                    analysis_id=analysis_id,
                                    file_path=finding.file_path,
                                    line_start=finding.line_start,
                                    category="risk",
                                    message=finding.title,
                                ),
                            )
                        )
                        review_findings_count += 1
                    except Exception:
                        continue
                llm_grounded_findings_count = review_findings_count
                llm_grounded_findings_status = "completed" if review_findings_count else "skipped"

                persisted_review_source = "hybrid_rag" if review_output_source == "graph_rag" else (review_output_source or "rule_engine")
                ReviewOutputsRepo().upsert(
                    UpsertReviewOutputInput(
                        analysis_id=analysis_id,
                        source=persisted_review_source,
                        graph_rag_required=review_graph_rag_required,
                        payload=review_output.model_dump(mode="json"),
                    )
                )
            except Exception as exc:
                review_output_status = "failed"
                review_output_reason = str(exc)
                try:
                    review_output, review_generation_ms = _timed_call(
                        _REVIEW_INTELLIGENCE_SERVICE.generate_rule_engine_output,
                        repo=analysis.repo,
                        change_type=change_type,
                        parsed_diff=parsed,
                        metadata=analysis.metadata,
                        findings=current_findings,
                        fallback_summary=summary_text,
                    )
                    review_output_source = "rule_engine"
                    review_output_status = "rule_engine"
                    review_merge_status = review_output.merge_readiness.status
                    review_risk_count = len(review_output.risk_findings)
                    summary_text = review_output.summary.short_summary
                    summary_source = "rule_engine"
                    summary_fallback = True
                    review_graph_rag_required = False
                    neo4j_grounded = False
                    ReviewOutputsRepo().upsert(
                        UpsertReviewOutputInput(
                            analysis_id=analysis_id,
                            source="rule_engine",
                            graph_rag_required=False,
                            payload=review_output.model_dump(mode="json"),
                        )
                    )
                except Exception:
                    pass

        try:
            repo.update_summary_result(analysis_id=analysis_id, summary=summary_text)
        except Exception:
            pass

        duration_ms = int((time.perf_counter() - started_at) * 1000)
        metrics = {
            "diff_size_bytes": len(analysis.diff_raw.encode("utf-8")),
            "files_changed": files_count,
            "additions_total": additions_total,
            "deletions_total": deletions_total,
            "findings_count": (
                security_findings_count
                + static_findings_count
                + llm_grounded_findings_count
                + langgraph_findings_count
            ),
            "security_findings_count": security_findings_count,
            "static_findings_count": static_findings_count,
            "llm_grounded_findings_count": llm_grounded_findings_count,
            "langgraph_findings_count": langgraph_findings_count,
            "duration_ms": duration_ms,
            "kb_retrieval": {
                "stack": "graph_rag",
                "mode": kb_retrieval_mode,
                "context_chunks": kb_context_chunks_count,
                "context_preview": kb_context_preview,
                "used_in_summary": bool(kb_context_preview),
                "references": kb_context_references,
                "trace": kb_retrieval_trace,
            },
        }
        metrics["langgraph_pipeline"] = langgraph_pipeline_payload
        if scan_disabled:
            metrics["security_scan"] = {"scan_disabled": True}
        elif scan_failed:
            metrics["security_scan"] = {"scan_failed": True}
        metrics["static_analysis"] = {
            "scan_disabled": bool(static_stats.get("scan_disabled", False)),
            "scan_failed": bool(static_stats.get("scan_failed", False)),
            "warnings": static_warnings,
        }
        if change_type is not None and change_type_confidence is not None and change_type_source is not None:
            metrics["change_classification"] = {
                "change_type": change_type,
                "confidence": change_type_confidence,
                "source": change_type_source,
        }
        metrics["summary"] = {
            "source": summary_source,
            "fallback_used": summary_fallback,
            "model": settings.OLLAMA_MODEL if summary_source in {"graph_rag", "rule_engine"} else None,
            "preview": summary_text[:180],
        }
        metrics["review_intelligence"] = {
            "enabled": settings.REVIEW_INTELLIGENCE_ENABLED,
            "neo4j_grounded": neo4j_grounded,
            "status": review_output_status,
            "source": review_output_source,
            "fallback_reason": review_output_reason,
            "merge_status": review_merge_status,
            "risk_findings_count": review_risk_count,
            "generation_ms": review_generation_ms,
        }
        metrics["llm_grounded_review"] = {
            "enabled": settings.LLM_REVIEW_FINDINGS_ENABLED,
            "status": llm_grounded_findings_status,
            "findings_count": llm_grounded_findings_count,
            "model": settings.OLLAMA_MODEL if settings.LLM_REVIEW_FINDINGS_ENABLED else None,
            "source": review_output_source,
        }

        repo.update_status(
            analysis_id=analysis_id,
            status="COMPLETED",
            stage="COMPLETED",
            progress=100,
            nb_files_changed=files_count,
            additions_total=additions_total,
            deletions_total=deletions_total,
            metadata_updates={"pipeline": metrics},
        )

        ANALYSIS_COMPLETED.labels(status="completed").inc()
        ANALYSIS_DURATION.observe(duration_ms / 1000)
        push_worker_metrics()

        # Update Neo4j AnalysisRun and persist findings as Comment nodes (best-effort)
        if settings.NEO4J_ENABLED and neo4j_run_id:
            try:
                from app.integrations.graph_database.neo4j_client import get_neo4j_client as _get_neo4j
                _neo4j = _get_neo4j()
                all_findings = repo.list_findings_by_analysis(analysis_id)
                _neo4j.update_analysis_run(
                    run_id=neo4j_run_id,
                    status="COMPLETED",
                    findings_count=len(all_findings),
                    summary=summary_text[:500] if summary_text else None,
                )
                for _f in all_findings:
                    try:
                        _neo4j.add_comment_to_run(
                            run_id=neo4j_run_id,
                            file_path=_f.file_path or "",
                            line_start=_f.line_start,
                            line_end=_f.line_end,
                            severity=str(_f.severity),
                            category=str(_f.category or ""),
                            message=_f.message or "",
                            suggestion=_f.suggestion,
                            confidence=float(_f.confidence or 0.0),
                            references=list(_f.evidence.get("references", [])) if isinstance(_f.evidence, dict) else [],
                            auto_fix=_f.evidence.get("auto_fix") if isinstance(_f.evidence, dict) else None,
                        )
                    except Exception:
                        pass
            except Exception as _neo4j_err:
                logger.debug("Neo4j update_analysis_run failed (non-fatal): %s", _neo4j_err)

        # Publish results to GitHub if enabled
        if settings.GITHUB_PUBLISH_ENABLED and settings.GITHUB_PUBLISH_ON_ANALYSIS_COMPLETE:
            try:
                from app.services.github_publisher import GitHubPublisher
                
                publisher = GitHubPublisher()
                github_result = asyncio.run(
                    publisher.publish_analysis_to_github(analysis_id=analysis_id)
                )
                logger.info(
                    "GitHub publication for analysis %s: %s",
                    analysis_id,
                    github_result.get("status"),
                )
            except Exception as exc:
                logger.warning(
                    "Failed to publish analysis %s to GitHub: %s",
                    analysis_id,
                    exc,
                    exc_info=True,
                )

        return {"analysis_id": analysis_id, "status": "COMPLETED", "metrics": metrics}
    except Exception:
        duration_ms = int((time.perf_counter() - started_at) * 1000)
        repo.update_status(
            analysis_id=analysis_id,
            status="FAILED",
            stage="FAILED",
            progress=100,
            error_code="PIPELINE_ERROR",
            error_message="Pipeline execution failed",
            metadata_updates={"pipeline": {"duration_ms": duration_ms, "failed": True}},
        )
        ANALYSIS_COMPLETED.labels(status="failed").inc()
        ANALYSIS_DURATION.observe(duration_ms / 1000)
        push_worker_metrics()
        raise

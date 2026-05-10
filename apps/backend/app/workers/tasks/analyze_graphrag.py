"""
New GraphRAG-based analysis pipeline task.

This task replaces the monolithic analyze_pr.py with the new microservices architecture:
- Uses AnalysisOrchestrator for coordinating services
- Uses GraphManager for Neo4j graph operations
- Uses HybridRetriever for knowledge retrieval
- Uses GenerationService for LLM-based analysis
- Uses AnalysisHistoryService for tracking

The old analyze_pr.py task is kept for backward compatibility.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from typing import Any
from uuid import UUID
import uuid

from app.core.analysis.repository_resolution import resolve_repository_scope
from app.core.analysis.orchestrator import AnalysisOrchestrator
from app.core.analysis.graph.manager import GraphManager
from app.core.analysis.history import AnalysisHistoryService, AnalysisStatus, AnalysisMetrics
from app.core.review_engine.diff_engine import parse_unified_diff
from app.core.review_engine.security import redact_unified_diff_added_lines, scan_parsed_diff_for_secrets
from app.data.repos.analyses_repo import AnalysesRepo, CreateFindingInput
from app.core.design_patterns.pattern_analysis_service import get_pattern_analysis_service
from app.settings import settings
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="analysis.run_graphrag_pipeline", bind=True)
def run_graphrag_analysis_pipeline(self, analysis_id: str) -> dict[str, Any]:
    """
    Execute GraphRAG-based analysis pipeline.
    
    Pipeline stages:
    1. Load analysis from DB
    2. Parse diff
    3. Secret scan & redaction
    4. Start analysis run in history
    5. Index repository (if needed)
    6. Run orchestrator (static analysis + GraphRAG)
    7. Complete analysis run
    8. Compare with previous run
    
    Args:
        analysis_id: Analysis UUID string
        
    Returns:
        Dict with status and metrics
    """
    started_at = time.perf_counter()
    
    logger.info(f"Starting GraphRAG analysis pipeline for analysis_id={analysis_id}")
    
    # Run async pipeline
    result = asyncio.run(_run_graphrag_pipeline_async(
        analysis_id=analysis_id,
        task_id=self.request.id,
    ))
    
    elapsed = time.perf_counter() - started_at
    logger.info(
        f"GraphRAG analysis pipeline completed for analysis_id={analysis_id} "
        f"in {elapsed:.2f}s with status={result.get('status')}"
    )
    
    return result


async def _run_graphrag_pipeline_async(
    analysis_id: str,
    task_id: str,
) -> dict[str, Any]:
    """Async implementation of the GraphRAG pipeline."""
    
    analyses_repo = AnalysesRepo()
    
    # 1. Load analysis
    analysis = analyses_repo.get_by_id(analysis_id)
    if analysis is None:
        return {
            "analysis_id": analysis_id,
            "status": "FAILED",
            "error_code": "ANALYSIS_NOT_FOUND",
        }
    
    # Idempotence guard
    current_status = analysis.status
    current_task_id = (analysis.metadata or {}).get("pipeline", {}).get("task_id")
    
    if current_status == "COMPLETED":
        return {
            "analysis_id": analysis_id,
            "status": "ALREADY_COMPLETED",
            "message": "Analysis already completed, skipping re-run",
        }
    
    if current_status == "RUNNING" and current_task_id and current_task_id != task_id:
        return {
            "analysis_id": analysis_id,
            "status": "ALREADY_RUNNING",
            "message": f"Analysis already running by task {current_task_id}",
            "running_task_id": current_task_id,
        }
    
    try:
        # Update status to RUNNING
        analyses_repo.update_status(
            analysis_id=analysis_id,
            status="RUNNING",
            stage="RUNNING",
            progress=10,
            metadata_updates={
                "pipeline": {
                    "task_id": task_id,
                    "started": True,
                    "orchestrator": "graphrag",
                }
            },
        )
        
        # 2. Parse diff
        logger.info(f"Parsing diff for analysis {analysis_id}")
        parsed_diff = parse_unified_diff(analysis.diff_raw)
        files_count, additions_total, deletions_total = analyses_repo.replace_parsed_diff(
            analysis_id, parsed_diff
        )
        
        analyses_repo.update_status(
            analysis_id=analysis_id,
            stage="DIFF_PARSED",
            progress=20,
        )
        
        # 3. Secret scan & redaction
        logger.info(f"Running secret scan for analysis {analysis_id}")
        scan_result = None
        diff_redacted = analysis.diff_raw
        has_secrets = False
        
        if settings.SECRET_SCAN_ENABLED:
            try:
                scan_result = scan_parsed_diff_for_secrets(
                    parsed_diff,
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
                
                # Store secret findings
                for detection in scan_result.detections:
                    fingerprint = hashlib.sha256(
                        f"{analysis_id}:secret_scan:{detection.file_path}:{detection.line_no}:{detection.match.description}".encode(
                            "utf-8"
                        )
                    ).hexdigest()
                    analyses_repo.create_finding(
                        CreateFindingInput(
                            finding_id=uuid.uuid4().hex,
                            analysis_id=analysis_id,
                            source="secret_scan",
                            file_path=detection.file_path,
                            line_start=detection.line_no,
                            line_end=detection.line_no,
                            severity=detection.match.severity,
                            category="security",
                            message=detection.match.description,
                            suggestion=None,
                            confidence=detection.match.confidence,
                            fingerprint=fingerprint,
                            issue_type="secret_exposure",
                            rule_id=getattr(detection.match, "rule_id", None),
                            evidence={"detector": "entropy_scan"},
                        )
                    )
            except Exception as e:
                logger.error(f"Secret scan failed for analysis {analysis_id}: {e}")

        try:
            analyses_repo.update_security_scan_result(
                analysis_id=analysis_id,
                diff_redacted=diff_redacted,
                has_secrets=has_secrets,
                redaction_stats={
                    "has_secrets": has_secrets,
                    "detections": len(scan_result.detections) if scan_result else 0,
                },
                purge_raw_diff=settings.PURGE_RAW_DIFF_AFTER_REDACTION,
            )
        except Exception as e:
            logger.warning("Failed to persist security scan metadata for %s: %s", analysis_id, e)
        
        analyses_repo.update_status(
            analysis_id=analysis_id,
            stage="SECRET_SCAN_COMPLETE",
            progress=30,
        )
        
        # 4. Initialize services
        logger.info(f"Initializing GraphRAG services for analysis {analysis_id}")
        
        graph_manager = GraphManager()
        history_service = AnalysisHistoryService(graph_manager)
        
        if not analysis.project_id:
            raise ValueError(f"Analysis {analysis_id} is missing project_id; GraphRAG requires a canonical project")

        resolved_scope = await asyncio.to_thread(
            resolve_repository_scope,
            str(analysis.project_id),
            metadata=analysis.metadata,
        )
        if resolved_scope is None:
            raise ValueError(f"Unable to resolve project profile for analysis {analysis_id}")
        if not resolved_scope.organization_id:
            raise ValueError(
                f"Unable to resolve organization_id for project {resolved_scope.project_id} ({resolved_scope.repo_id})"
            )
        if not resolved_scope.repo_path:
            raise ValueError(
                f"Unable to resolve repo_path for project {resolved_scope.project_id} ({resolved_scope.repo_id})"
            )

        repository_id = UUID(resolved_scope.repository_id)
        project_id = UUID(resolved_scope.project_id)
        organization_id = UUID(resolved_scope.organization_id)
        
        # 5. Start analysis run in history
        logger.info(f"Starting analysis run in history for analysis {analysis_id}")
        
        run_id = await history_service.start_analysis_run(
            repository_id=repository_id,
            project_id=project_id,
            organization_id=organization_id,
            git_commit_sha=analysis.metadata.get("commit_sha") if analysis.metadata else None,
            git_branch=analysis.metadata.get("branch") if analysis.metadata else None,
        )
        
        analyses_repo.update_status(
            analysis_id=analysis_id,
            stage="HISTORY_STARTED",
            progress=40,
            metadata_updates={"run_id": str(run_id)},
        )
        
        # 6. Run orchestrator
        logger.info(f"Running analysis orchestrator for analysis {analysis_id}")
        
        orchestrator = AnalysisOrchestrator(
            graph_manager=graph_manager,
            # Other dependencies will be injected in orchestrator.run()
        )
        
        orchestration_result = await orchestrator.run(
            repository_path=resolved_scope.repo_path,
            repository_id=str(repository_id),
            organization_id=str(organization_id),
            project_id=str(project_id),
            diff_content=diff_redacted,
            analysis_id=analysis_id,
            incremental=settings.INCREMENTAL_INDEXING_ENABLED,
        )

        # Persist GraphRAG findings in PostgreSQL with explicit provenance.
        graph_rag_findings = orchestration_result.get("graph_rag_findings", [])
        for finding in graph_rag_findings:
            fingerprint = hashlib.sha256(
                (
                    f"{analysis_id}:llm_langgraph:{finding.get('file_path')}:{finding.get('line_start')}:"
                    f"{finding.get('category')}:{finding.get('message')}"
                ).encode("utf-8")
            ).hexdigest()
            analyses_repo.create_finding(
                CreateFindingInput(
                    finding_id=uuid.uuid4().hex,
                    analysis_id=analysis_id,
                    source=str(finding.get("source", "llm_langgraph")),
                    file_path=finding.get("file_path"),
                    line_start=finding.get("line_start"),
                    line_end=finding.get("line_end"),
                    severity=str(finding.get("severity", "WARN")),
                    category=str(finding.get("category", "code_quality")),
                    message=str(finding.get("message", "")),
                    suggestion=finding.get("suggestion"),
                    confidence=float(finding.get("confidence", 0.0)),
                    fingerprint=fingerprint,
                    issue_type="review_finding",
                    rule_id=finding.get("rule_id"),
                    evidence={
                        "source": finding.get("source", "llm_langgraph"),
                        "references": finding.get("references", []),
                        "retrieval": finding.get("evidence", {}),
                    },
                )
            )
        
        analyses_repo.update_status(
            analysis_id=analysis_id,
            stage="ORCHESTRATION_COMPLETE",
            progress=80,
        )
        
        # 6.5. Run pattern analysis (NEW)
        logger.info(f"Running pattern analysis for analysis {analysis_id}")
        
        pattern_service = get_pattern_analysis_service()
        pattern_result = await pattern_service.run_pattern_analysis(
            analysis_id=analysis_id,
            repository_path=resolved_scope.repo_path,
            repository_name=resolved_scope.repo_id or "unknown",
            diff_content=diff_redacted,
        )
        
        logger.info(
            f"Pattern analysis completed: {pattern_result.get('total_violations', 0)} violations, "
            f"{pattern_result.get('findings_created', 0)} findings created"
        )
        
        analyses_repo.update_status(
            analysis_id=analysis_id,
            stage="PATTERN_ANALYSIS_COMPLETE",
            progress=85,
            metadata_updates={
                "pattern_analysis": pattern_result,
            },
        )
        
        # 6.6. Run multi-agent review (NEW)
        logger.info(f"Running multi-agent review for analysis {analysis_id}")
        
        from app.agents.agent_dispatcher import dispatch_review
        
        # Extract changed files from parsed diff
        changed_files = [file.file_path for file in parsed_diff.files if file.file_path]
        
        agent_findings = await dispatch_review(
            diff_content=diff_redacted,
            changed_files=changed_files,
            project_type=analysis.metadata.get("project_type") if analysis.metadata else None,
            repository_path=resolved_scope.repo_path,
            metadata={
                "analysis_id": analysis_id,
                "repository_id": str(repository_id),
                "project_id": str(project_id),
            },
        )
        
        # Persist multi-agent findings
        agent_findings_count = 0
        agent_findings_by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}
        
        for finding in agent_findings:
            fingerprint = hashlib.sha256(
                (
                    f"{analysis_id}:multi_agent:{finding.agent_id}:{finding.file_path}:{finding.line}:"
                    f"{finding.category}:{finding.message}"
                ).encode("utf-8")
            ).hexdigest()
            
            analyses_repo.create_finding(
                CreateFindingInput(
                    finding_id=uuid.uuid4().hex,
                    analysis_id=analysis_id,
                    source=f"multi_agent:{finding.agent_id}",
                    file_path=finding.file_path,
                    line_start=finding.line,
                    line_end=finding.line,
                    severity=finding.severity,
                    category=finding.category,
                    message=finding.message,
                    suggestion=finding.suggestion,
                    confidence=finding.confidence,
                    fingerprint=fingerprint,
                    issue_type="agent_review",
                    rule_id=finding.rule_id,
                    evidence={
                        "agent_id": finding.agent_id,
                        "agent_evidence": finding.evidence,
                    },
                )
            )
            
            agent_findings_count += 1
            severity_lower = finding.severity.lower()
            if severity_lower in agent_findings_by_severity:
                agent_findings_by_severity[severity_lower] += 1
        
        logger.info(
            f"Multi-agent review completed: {agent_findings_count} findings from {len(set(f.agent_id for f in agent_findings))} agents"
        )
        
        analyses_repo.update_status(
            analysis_id=analysis_id,
            stage="MULTI_AGENT_COMPLETE",
            progress=90,
            metadata_updates={
                "multi_agent_review": {
                    "total_findings": agent_findings_count,
                    "findings_by_severity": agent_findings_by_severity,
                    "agents_used": list(set(f.agent_id for f in agent_findings)),
                },
            },
        )
        
        # 7. Calculate metrics
        total_findings = orchestration_result.get("total_findings", 0)
        pattern_findings = pattern_result.get("findings_created", 0)
        agent_findings_total = agent_findings_count
        
        metrics = AnalysisMetrics(
            total_findings=total_findings + pattern_findings + agent_findings_total,
            critical_findings=orchestration_result.get("critical_findings", 0) + pattern_result.get("violations_by_severity", {}).get("critical", 0) + agent_findings_by_severity.get("critical", 0),
            high_findings=orchestration_result.get("high_findings", 0) + pattern_result.get("violations_by_severity", {}).get("high", 0) + agent_findings_by_severity.get("high", 0),
            medium_findings=orchestration_result.get("medium_findings", 0) + pattern_result.get("violations_by_severity", {}).get("medium", 0) + agent_findings_by_severity.get("medium", 0),
            low_findings=orchestration_result.get("low_findings", 0) + pattern_result.get("violations_by_severity", {}).get("low", 0) + agent_findings_by_severity.get("low", 0),
            files_analyzed=files_count,
            lines_of_code=additions_total + deletions_total,
        )
        
        # 8. Complete analysis run
        await history_service.complete_analysis_run(
            run_id=run_id,
            metrics=metrics,
            status=AnalysisStatus.COMPLETED,
        )

        # Record findings in graph history for run-over-run comparison.
        for finding in graph_rag_findings:
            await history_service.record_finding(
                run_id,
                {
                    "type": str(finding.get("category", "code_quality")),
                    "rule_id": finding.get("rule_id"),
                    "severity": str(finding.get("severity", "WARN")),
                    "file_path": finding.get("file_path"),
                    "line_start": finding.get("line_start"),
                    "line_end": finding.get("line_end"),
                    "message": finding.get("message"),
                    "source": finding.get("source", "llm_langgraph"),
                },
            )
        
        # 9. Compare with previous run
        logger.info(f"Comparing with previous run for analysis {analysis_id}")
        comparison = await history_service.compare_with_previous(run_id)
        
        metrics.new_findings = comparison.total_new
        metrics.fixed_findings = comparison.total_fixed
        metrics.persistent_findings = comparison.total_persistent
        
        # 10. Update analysis to COMPLETED
        analyses_repo.update_status(
            analysis_id=analysis_id,
            status="COMPLETED",
            stage="COMPLETED",
            progress=100,
            metadata_updates={
                "pipeline": {
                    "task_id": task_id,
                    "completed": True,
                    "orchestrator": "graphrag",
                },
                "run_id": str(run_id),
                "comparison": {
                    "new_findings": comparison.total_new,
                    "fixed_findings": comparison.total_fixed,
                    "persistent_findings": comparison.total_persistent,
                },
                "has_secrets": has_secrets,
                "pattern_analysis": {
                    "total_violations": pattern_result.get("total_violations", 0),
                    "patterns_checked": pattern_result.get("patterns_checked", 0),
                    "violations_by_severity": pattern_result.get("violations_by_severity", {}),
                    "violations_by_pattern": pattern_result.get("violations_by_pattern", {}),
                },
                "multi_agent_review": {
                    "total_findings": agent_findings_count,
                    "findings_by_severity": agent_findings_by_severity,
                    "agents_used": list(set(f.agent_id for f in agent_findings)),
                },
            },
        )
        
        return {
            "analysis_id": analysis_id,
            "status": "COMPLETED",
            "run_id": str(run_id),
            "metrics": {
                "total_findings": metrics.total_findings,
                "critical_findings": metrics.critical_findings,
                "high_findings": metrics.high_findings,
                "medium_findings": metrics.medium_findings,
                "low_findings": metrics.low_findings,
                "new_findings": metrics.new_findings,
                "fixed_findings": metrics.fixed_findings,
                "persistent_findings": metrics.persistent_findings,
                "files_analyzed": metrics.files_analyzed,
                "lines_of_code": metrics.lines_of_code,
            },
        }
    
    except Exception as e:
        logger.error(f"GraphRAG analysis pipeline failed for analysis {analysis_id}: {e}", exc_info=True)
        
        # Update to FAILED
        analyses_repo.update_status(
            analysis_id=analysis_id,
            status="FAILED",
            stage="FAILED",
            metadata_updates={
                "pipeline": {
                    "task_id": task_id,
                    "failed": True,
                    "error": str(e),
                    "orchestrator": "graphrag",
                }
            },
        )
        
        return {
            "analysis_id": analysis_id,
            "status": "FAILED",
            "error": str(e),
        }

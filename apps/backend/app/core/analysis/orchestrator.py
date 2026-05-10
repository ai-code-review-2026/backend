"""
Analysis Orchestrator - Main Pipeline Coordinator

Responsibilities:
1. Coordinate analysis workflow across microservices
2. Ensure repository context is indexed
3. Trigger hybrid retrieval (vector + graph)
4. Aggregate findings from static + GraphRAG
5. Generate editor comments with auto-fix suggestions
6. Store analysis history per repository

Design: Event-driven, async, fault-tolerant
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from analysis.langGraph.models import LangGraphAnalysisRequest
from analysis.langGraph.pipeline import run_langgraph_analysis

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AnalysisRequest:
    """Request to analyze code changes."""
    
    analysis_id: str
    organization_id: str
    project_id: str
    repository_id: str
    repo_path: str
    commit_sha: str | None
    pr_number: int | None
    diff_text: str
    changed_files: list[str]
    metadata: dict[str, Any]


@dataclass(frozen=True)
class AnalysisResult:
    """Complete analysis result."""
    
    analysis_id: str
    status: str  # completed, failed, partial
    duration_ms: int
    
    # Context
    repo_indexed: bool
    indexed_commit: str | None
    
    # Findings
    static_findings: list[dict[str, Any]]
    graph_rag_findings: list[dict[str, Any]]
    
    # Comments for UI
    editor_comments: list[dict[str, Any]]
    
    # Metadata
    retrieval_trace: dict[str, Any]
    generation_trace: dict[str, Any]
    error: str | None = None


class AnalysisOrchestrator:
    """
    Orchestrates the complete analysis pipeline.
    
    Pipeline stages:
    1. Context: Ensure repo is indexed (context service)
    2. Static: Run static analyzers (static analysis service)
    3. Retrieval: Hybrid vector + graph retrieval (retrieval service)
    4. Generation: LLM-based analysis with KB priority (generation service)
    5. History: Store analysis run (history service)
    
    Design rationale:
    - Microservices pattern for scalability
    - Async execution for performance
    - Fault tolerance: continue on partial failures
    - Traceability: full audit trail
    """
    
    def __init__(
        self,
        *,
        context_service: Any | None = None,  # Will be typed after service implementation
        knowledge_base_service: Any | None = None,
        retrieval_service: Any | None = None,
        generation_service: Any | None = None,
        static_analysis_service: Any | None = None,
        history_service: Any | None = None,
        graph_manager: Any | None = None,
    ) -> None:
        self._context_service = context_service
        self._kb_service = knowledge_base_service
        self._retrieval_service = retrieval_service
        self._generation_service = generation_service
        self._static_service = static_analysis_service
        self._history_service = history_service
        self._graph_manager = graph_manager
    
    async def analyze(self, request: AnalysisRequest) -> AnalysisResult:
        """
        Execute complete analysis pipeline.
        
        Strategy:
        1. Context service: Index repository if needed (incremental)
        2. Static service: Run linters/analyzers in parallel
        3. Retrieval service: Hybrid GraphRAG retrieval
        4. Generation service: LLM analysis with KB priority
        5. Merge findings: Static + GraphRAG + KB rules
        6. Generate editor comments with auto-fix suggestions
        7. Store in history service
        
        Args:
            request: Analysis request with repo and changes
            
        Returns:
            Complete analysis result with findings and comments
        """
        started = time.perf_counter()
        
        try:
            # Stage 1: Ensure repository context is indexed
            logger.info(f"[{request.analysis_id}] Stage 1: Indexing repository context")
            index_result = await self._context_service.index_repository(
                organization_id=request.organization_id,
                project_id=request.project_id,
                repository_id=request.repository_id,
                repo_path=request.repo_path,
                commit_sha=request.commit_sha,
                changed_files=request.changed_files,
            )
            
            # Stage 2: Run static analysis in parallel with retrieval prep
            logger.info(f"[{request.analysis_id}] Stage 2: Static analysis")
            static_task = asyncio.create_task(
                self._static_service.analyze(
                    repo_path=request.repo_path,
                    changed_files=request.changed_files,
                    diff_text=request.diff_text,
                )
            )
            
            # Stage 3: Hybrid retrieval (vector + graph)
            logger.info(f"[{request.analysis_id}] Stage 3: Hybrid retrieval")
            retrieval_result = await self._retrieval_service.retrieve(
                repository_id=request.repository_id,
                diff_text=request.diff_text,
                changed_files=request.changed_files,
                query_mode="code_review",
            )
            
            # Wait for static analysis
            static_result = await static_task
            
            # Stage 4: LLM generation with KB priority
            logger.info(f"[{request.analysis_id}] Stage 4: LLM generation")
            generation_result = await self._generation_service.generate(
                analysis_id=request.analysis_id,
                repository_id=request.repository_id,
                project_id=request.project_id,
                diff_text=request.diff_text,
                changed_files=request.changed_files,
                repo_context=retrieval_result.repo_context,
                kb_context=retrieval_result.kb_context,
                graph_context=retrieval_result.graph_context,
                static_findings=static_result.findings,
            )
            
            # Stage 5: Merge findings and generate editor comments
            logger.info(f"[{request.analysis_id}] Stage 5: Generating editor comments")
            editor_comments = self._build_editor_comments(
                static_findings=static_result.findings,
                graph_rag_findings=generation_result.findings,
                auto_fix_enabled=True,
            )
            
            duration_ms = int((time.perf_counter() - started) * 1000)
            
            result = AnalysisResult(
                analysis_id=request.analysis_id,
                status="completed",
                duration_ms=duration_ms,
                repo_indexed=index_result.success,
                indexed_commit=index_result.indexed_commit,
                static_findings=static_result.findings,
                graph_rag_findings=generation_result.findings,
                editor_comments=editor_comments,
                retrieval_trace=retrieval_result.trace,
                generation_trace=generation_result.trace,
            )
            
            # Stage 6: Store in history
            await self._history_service.store(
                repository_id=request.repository_id,
                analysis_id=request.analysis_id,
                result=result,
            )
            
            return result
            
        except Exception as exc:
            logger.error(f"[{request.analysis_id}] Analysis failed: {exc}")
            duration_ms = int((time.perf_counter() - started) * 1000)
            return AnalysisResult(
                analysis_id=request.analysis_id,
                status="failed",
                duration_ms=duration_ms,
                repo_indexed=False,
                indexed_commit=None,
                static_findings=[],
                graph_rag_findings=[],
                editor_comments=[],
                retrieval_trace={},
                generation_trace={},
                error=str(exc),
            )
    
    def _build_editor_comments(
        self,
        *,
        static_findings: list[dict[str, Any]],
        graph_rag_findings: list[dict[str, Any]],
        auto_fix_enabled: bool,
    ) -> list[dict[str, Any]]:
        """
        Build editor comments from all findings.
        
        Each comment includes:
        - file_path + line_range
        - severity (INFO, WARN, BLOCKER)
        - message (grounded in KB rules when possible)
        - evidence (graph relations, KB references)
        - auto_fix_suggestion (optional LLM-generated fix)
        
        Priority:
        1. KB rule violations (highest)
        2. GraphRAG findings (grounded)
        3. Static analysis (supplementary)
        """
        comments = []
        
        # GraphRAG findings (KB-grounded) have priority
        for finding in graph_rag_findings:
            comment = {
                "file_path": finding.get("file_path"),
                "line_start": finding.get("line_start"),
                "line_end": finding.get("line_end"),
                "severity": finding.get("severity", "WARN"),
                "category": finding.get("category", "code_quality"),
                "message": finding.get("message"),
                "explanation": finding.get("explanation"),
                "evidence": finding.get("evidence", {}),
                "kb_grounded": finding.get("kb_grounded", False),
                "graph_context": finding.get("graph_context", {}),
            }
            
            # Add auto-fix suggestion if available and enabled
            if auto_fix_enabled and finding.get("fix_suggestion"):
                comment["auto_fix"] = {
                    "available": True,
                    "suggestion": finding["fix_suggestion"],
                    "confidence": finding.get("fix_confidence", 0.7),
                }
            
            comments.append(comment)
        
        # Add static findings (lower priority, supplementary)
        for finding in static_findings:
            comment = {
                "file_path": finding.get("file_path"),
                "line_start": finding.get("line_start"),
                "line_end": finding.get("line_end"),
                "severity": finding.get("severity", "INFO"),
                "category": "static_analysis",
                "message": finding.get("message"),
                "tool": finding.get("source"),
                "rule_id": finding.get("rule_id"),
                "kb_grounded": False,
            }
            comments.append(comment)
        
        return comments

    async def run(
        self,
        *,
        repository_path: str,
        repository_id: str,
        organization_id: str,
        project_id: str,
        diff_content: str,
        analysis_id: str,
        incremental: bool = True,
    ) -> dict[str, Any]:
        """
        Compatibility entrypoint used by Celery task.

        This path executes the production LangGraph pipeline and returns
        normalized findings with explicit sources and confidence.
        """
        del organization_id, project_id, incremental  # Reserved for later richer orchestration.
        started = time.perf_counter()

        changed_files = self._extract_changed_files(diff_content)
        request = LangGraphAnalysisRequest(
            analysis_id=analysis_id,
            repo_id=repository_id,
            repo_path=repository_path,
            diff_text=diff_content,
            changed_files=changed_files,
            metadata={"source": "analysis_orchestrator"},
            # Context IDs for gateway observability (enables full trace logging)
            user_id=None,  # TODO: Extract from analysis metadata or auth context
            project_id=project_id,
            organization_id=organization_id,
        )

        result = await run_langgraph_analysis(request)

        graph_rag_findings: list[dict[str, Any]] = []
        for finding in result.llm_output.findings:
            graph_rag_findings.append(
                {
                    "source": "llm_langgraph",
                    "severity": finding.severity,
                    "category": finding.category,
                    "message": finding.message,
                    "suggestion": finding.suggestion,
                    "confidence": finding.confidence,
                    "file_path": finding.file_path,
                    "line_start": finding.line_start,
                    "line_end": finding.line_end,
                    "references": list(finding.references),
                    "auto_fix": finding.auto_fix,
                    "evidence": {
                        "retrieval_mode": result.retrieval.retrieval_mode,
                        "vector_hits": result.retrieval.vector_hits,
                        "graph_hits": result.retrieval.graph_hits,
                        "kb_hits": len(
                            [
                                ref
                                for ref in result.retrieval.references
                                if (ref.source or "").lower().startswith("kb")
                            ]
                        ),
                    },
                }
            )

        severity_counts = {"BLOCKER": 0, "WARN": 0, "INFO": 0}
        for item in graph_rag_findings:
            severity = str(item.get("severity", "WARN")).upper()
            if severity in severity_counts:
                severity_counts[severity] += 1

        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            "status": "completed" if result.llm_output.status != "failed" else "partial",
            "duration_ms": duration_ms,
            "total_findings": len(graph_rag_findings),
            "critical_findings": severity_counts["BLOCKER"],
            "high_findings": severity_counts["WARN"],
            "medium_findings": 0,
            "low_findings": severity_counts["INFO"],
            "graph_rag_findings": graph_rag_findings,
            "retrieval_trace": result.retrieval.to_dict(),
            "generation_trace": result.llm_output.to_dict(),
            "errors": list(result.errors),
        }

    def _extract_changed_files(self, diff_text: str) -> list[str]:
        changed: list[str] = []
        for line in diff_text.splitlines():
            if not line.startswith("+++ "):
                continue
            path = line[4:].strip()
            if path.startswith("b/"):
                path = path[2:]
            if path == "/dev/null" or not path:
                continue
            if path not in changed:
                changed.append(path)
        return changed

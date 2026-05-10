"""RAG Query API endpoints.

Provides REST API for RAG-based queries and analysis.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.core.rag_agents import RAGOrchestrator, AgentContext
from app.integrations.graph_database.neo4j_client import get_neo4j_client
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/rag", tags=["rag"])

_neo4j_client = None
_orchestrator: RAGOrchestrator | None = None


def _get_orchestrator() -> RAGOrchestrator:
    global _neo4j_client, _orchestrator
    if not settings.NEO4J_ENABLED:
        raise HTTPException(status_code=503, detail="Neo4j is disabled")
    try:
        if _neo4j_client is None:
            _neo4j_client = get_neo4j_client()
        if _orchestrator is None:
            _orchestrator = RAGOrchestrator(neo4j_client=_neo4j_client)
        return _orchestrator
    except Exception as exc:
        logger.warning("RAG orchestrator unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="Neo4j is unavailable") from exc


# Request/Response models

class RAGQueryRequest(BaseModel):
    query: str = Field(..., description="The query to process")
    repo_id: str = Field(..., description="Repository identifier")
    org_id: str | None = Field(None, description="Organization ID")
    agents: list[str] | None = Field(
        None,
        description="Specific agents to use (code_context, documentation, policy_rules)",
    )
    max_chunks: int = Field(10, ge=1, le=50, description="Maximum chunks per agent")
    min_relevance: float = Field(0.5, ge=0.0, le=1.0, description="Minimum relevance score")
    include_citations: bool = Field(True, description="Include source citations")


class DiffAnalysisRequest(BaseModel):
    repo_id: str = Field(..., description="Repository identifier")
    diff_text: str = Field(..., description="Unified diff text")
    changed_files: list[str] = Field(..., description="List of changed file paths")
    org_id: str | None = Field(None, description="Organization ID")
    analysis_id: str | None = Field(None, description="Analysis ID for tracking")
    commit_sha: str | None = Field(None, description="Commit SHA")
    pr_number: int | None = Field(None, description="PR number")


class AgentResultResponse(BaseModel):
    agent_type: str
    status: str
    content: str | None
    findings: list[dict[str, Any]]
    citations: list[dict[str, Any]]
    duration_ms: int
    chunks_retrieved: int
    chunks_used: int
    confidence: float
    relevance_score: float


class RAGQueryResponse(BaseModel):
    success: bool
    synthesis: AgentResultResponse | None
    agents: dict[str, AgentResultResponse]
    total_duration_ms: int
    agents_executed: int
    agents_skipped: int
    error: str | None = None


class AgentStatusResponse(BaseModel):
    enabled: bool
    agents: dict[str, dict[str, Any]]


# Endpoints

@router.post("/query", response_model=RAGQueryResponse)
async def execute_rag_query(request: RAGQueryRequest):
    """Execute a RAG query across agents.

    Uses the specified agents (or all if none specified) to retrieve
    context and generate a response.
    """
    try:
        orchestrator = _get_orchestrator()
        result = await orchestrator.query(
            repo_id=request.repo_id,
            query=request.query,
            org_id=request.org_id,
            agents=request.agents,
        )

        # Convert to response
        agents_response = {}
        for agent_type, agent_result in result.agent_results.items():
            agents_response[agent_type.value] = AgentResultResponse(
                agent_type=agent_result.agent_type.value,
                status=agent_result.status.value,
                content=agent_result.content,
                findings=agent_result.findings,
                citations=[c.to_dict() for c in agent_result.citations],
                duration_ms=agent_result.duration_ms,
                chunks_retrieved=agent_result.chunks_retrieved,
                chunks_used=agent_result.chunks_used,
                confidence=agent_result.confidence,
                relevance_score=agent_result.relevance_score,
            )

        synthesis_response = None
        if result.synthesis_result:
            synthesis_response = AgentResultResponse(
                agent_type=result.synthesis_result.agent_type.value,
                status=result.synthesis_result.status.value,
                content=result.synthesis_result.content,
                findings=result.synthesis_result.findings,
                citations=[c.to_dict() for c in result.synthesis_result.citations],
                duration_ms=result.synthesis_result.duration_ms,
                chunks_retrieved=result.synthesis_result.chunks_retrieved,
                chunks_used=result.synthesis_result.chunks_used,
                confidence=result.synthesis_result.confidence,
                relevance_score=result.synthesis_result.relevance_score,
            )

        return RAGQueryResponse(
            success=result.success,
            synthesis=synthesis_response,
            agents=agents_response,
            total_duration_ms=result.total_duration_ms,
            agents_executed=result.agents_executed,
            agents_skipped=result.agents_skipped,
            error=result.error,
        )

    except Exception as e:
        logger.error(f"RAG query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query/code", response_model=RAGQueryResponse)
async def execute_code_query(request: RAGQueryRequest):
    """Execute a code-focused RAG query.

    Uses only the code context agent for code-specific queries.
    """
    try:
        # Force only code agent
        orchestrator = _get_orchestrator()
        result = await orchestrator.query(
            repo_id=request.repo_id,
            query=request.query,
            org_id=request.org_id,
            agents=["code_context"],
        )

        return _build_rag_response(result)

    except Exception as e:
        logger.error(f"Code query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/query/documentation", response_model=RAGQueryResponse)
async def execute_documentation_query(request: RAGQueryRequest):
    """Execute a documentation-focused RAG query.

    Uses only the documentation agent for doc-specific queries.
    """
    try:
        orchestrator = _get_orchestrator()
        result = await orchestrator.query(
            repo_id=request.repo_id,
            query=request.query,
            org_id=request.org_id,
            agents=["documentation"],
        )

        return _build_rag_response(result)

    except Exception as e:
        logger.error(f"Documentation query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze/diff", response_model=RAGQueryResponse)
async def analyze_diff(request: DiffAnalysisRequest):
    """Analyze a diff with the full RAG pipeline.

    Uses all agents to provide comprehensive review context.
    """
    try:
        orchestrator = _get_orchestrator()
        result = await orchestrator.analyze_diff(
            repo_id=request.repo_id,
            diff_text=request.diff_text,
            changed_files=request.changed_files,
            org_id=request.org_id,
            analysis_id=request.analysis_id,
            commit_sha=request.commit_sha,
            pr_number=request.pr_number,
        )

        return _build_rag_response(result)

    except Exception as e:
        logger.error(f"Diff analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agents/status", response_model=AgentStatusResponse)
async def get_agents_status():
    """Get the status of all RAG agents.

    Returns which agents are enabled and their configuration.
    """
    from app.settings import settings

    agents_status = {
        "code_context": {
            "enabled": settings.RAG_AGENT_CODE_CONTEXT_ENABLED,
            "store": "neo4j",
        },
        "documentation": {
            "enabled": settings.RAG_AGENT_DOCUMENTATION_ENABLED,
            "store": "neo4j",
        },
        "policy_rules": {
            "enabled": settings.RAG_AGENT_POLICY_RULES_ENABLED,
            "store": "neo4j",
        },
        "synthesis": {
            "enabled": settings.RAG_AGENT_SYNTHESIS_ENABLED,
            "store": None,
        },
    }

    return AgentStatusResponse(
        enabled=settings.RAG_AGENTS_ENABLED,
        agents=agents_status,
    )


def _build_rag_response(result) -> RAGQueryResponse:
    """Build RAGQueryResponse from orchestrator result."""
    agents_response = {}
    for agent_type, agent_result in result.agent_results.items():
        agents_response[agent_type.value] = AgentResultResponse(
            agent_type=agent_result.agent_type.value,
            status=agent_result.status.value,
            content=agent_result.content,
            findings=agent_result.findings,
            citations=[c.to_dict() for c in agent_result.citations],
            duration_ms=agent_result.duration_ms,
            chunks_retrieved=agent_result.chunks_retrieved,
            chunks_used=agent_result.chunks_used,
            confidence=agent_result.confidence,
            relevance_score=agent_result.relevance_score,
        )

    synthesis_response = None
    if result.synthesis_result:
        synthesis_response = AgentResultResponse(
            agent_type=result.synthesis_result.agent_type.value,
            status=result.synthesis_result.status.value,
            content=result.synthesis_result.content,
            findings=result.synthesis_result.findings,
            citations=[c.to_dict() for c in result.synthesis_result.citations],
            duration_ms=result.synthesis_result.duration_ms,
            chunks_retrieved=result.synthesis_result.chunks_retrieved,
            chunks_used=result.synthesis_result.chunks_used,
            confidence=result.synthesis_result.confidence,
            relevance_score=result.synthesis_result.relevance_score,
        )

    return RAGQueryResponse(
        success=result.success,
        synthesis=synthesis_response,
        agents=agents_response,
        total_duration_ms=result.total_duration_ms,
        agents_executed=result.agents_executed,
        agents_skipped=result.agents_skipped,
        error=result.error,
    )

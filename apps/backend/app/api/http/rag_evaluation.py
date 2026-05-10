from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.middleware.auth import AuthenticatedPrincipal, require_permission
from app.data.repos.repo_profiles_repo import RepoProfilesRepo
from app.integrations.graph_database.neo4j_client import get_neo4j_client
from app.core.knowledge_base.rag_engines import build_graph_rag_engine
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/rag", tags=["rag-evaluation"])


class RAGMetric(BaseModel):
    name: str
    value: float
    unit: str
    description: str
    threshold: float | None = None
    status: str  # "good", "warning", "critical"


class RAGEvaluationResponse(BaseModel):
    repo_id: str
    evaluation_timestamp: str
    metrics: list[RAGMetric]
    overall_score: float
    test_queries_count: int
    avg_latency_ms: float
    error_rate: float
    context_quality_score: float


class RAGTestResult(BaseModel):
    query: str
    expected_context: str | None
    retrieved_context: str | None
    latency_ms: float
    success: bool
    relevance_score: float | None
    bleu_score: float | None
    rouge_score: float | None


class RAGBenchmarkResponse(BaseModel):
    repo_id: str
    benchmark_id: str
    test_results: list[RAGTestResult]
    summary: RAGEvaluationResponse


# Test queries for evaluation
TEST_QUERIES = [
    "How do I handle authentication in this project?",
    "What are the security best practices?",
    "How do I configure the database connection?",
    "What is the error handling pattern?",
    "How do I deploy this application?",
    "What are the API endpoints available?",
    "How do I run tests?",
    "What are the configuration options?",
    "How do I contribute to this project?",
    "What dependencies does this project use?",
]


def calculate_bleu_score(reference: str, candidate: str) -> float:
    """Simplified BLEU score calculation"""
    if not reference or not candidate:
        return 0.0
    
    ref_words = set(reference.lower().split())
    cand_words = set(candidate.lower().split())
    
    if not ref_words:
        return 0.0
    
    intersection = ref_words.intersection(cand_words)
    return len(intersection) / len(ref_words)


def calculate_rouge_score(reference: str, candidate: str) -> float:
    """Simplified ROUGE score calculation"""
    if not reference or not candidate:
        return 0.0
    
    ref_words = set(reference.lower().split())
    cand_words = set(candidate.lower().split())
    
    if not cand_words:
        return 0.0
    
    intersection = ref_words.intersection(cand_words)
    return len(intersection) / len(cand_words)


async def evaluate_rag_query(
    rag_engine: Any,
    repo_id: str,
    query: str
) -> RAGTestResult:
    """Evaluate a single RAG query"""
    start_time = time.perf_counter()
    success = False
    retrieved_context = None
    
    try:
        result = await rag_engine.retrieve_for_query(
            repo_id=repo_id,
            query=query,
            limit=8
        )
        
        retrieved_context = result.context_text
        success = retrieved_context is not None and len(retrieved_context.strip()) > 0
        
    except Exception as e:
        logger.error(f"RAG query failed: {e}")
        success = False
    
    latency_ms = (time.perf_counter() - start_time) * 1000
    
    # Calculate relevance score based on context length and success
    relevance_score = 0.8 if success and retrieved_context and len(retrieved_context) > 100 else 0.2
    
    # For this demo, we'll use simplified scoring
    # In a real system, you'd have golden reference data
    bleu_score = calculate_bleu_score(query, retrieved_context or "")
    rouge_score = calculate_rouge_score(query, retrieved_context or "")
    
    return RAGTestResult(
        query=query,
        expected_context=None,  # Would be provided in real evaluation
        retrieved_context=retrieved_context,
        latency_ms=latency_ms,
        success=success,
        relevance_score=relevance_score,
        bleu_score=bleu_score,
        rouge_score=rouge_score,
    )


@router.get("/repos/{repo_id}/evaluation", response_model=RAGEvaluationResponse)
async def evaluate_rag_performance(
    repo_id: str,
    test_queries: int = Query(default=5, ge=1, le=20),
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
) -> RAGEvaluationResponse:
    """
    Evaluate RAG performance for a repository using test queries.
    Returns metrics like latency, accuracy, and context quality.
    """
    neo4j_client = get_neo4j_client()
    rag_engine = build_graph_rag_engine(neo4j_client=neo4j_client)

    # Select test queries
    selected_queries = TEST_QUERIES[:test_queries]
    
    # Run evaluations
    test_results = []
    total_latency = 0.0
    successful_queries = 0
    total_relevance_score = 0.0
    
    for query in selected_queries:
        result = await evaluate_rag_query(rag_engine, repo_id, query)
        test_results.append(result)
        
        total_latency += result.latency_ms
        if result.success:
            successful_queries += 1
        if result.relevance_score:
            total_relevance_score += result.relevance_score
    
    # Calculate metrics
    avg_latency = total_latency / len(test_results) if test_results else 0
    error_rate = 1.0 - (successful_queries / len(test_results)) if test_results else 1.0
    context_quality = total_relevance_score / len(test_results) if test_results else 0.0
    
    # Overall score (weighted combination)
    overall_score = (
        (1.0 - error_rate) * 0.4 +  # Success rate weight
        min(1.0, 1000 / max(avg_latency, 100)) * 0.3 +  # Latency weight (lower is better)
        context_quality * 0.3  # Quality weight
    ) * 100
    
    metrics = [
        RAGMetric(
            name="Average Latency",
            value=avg_latency,
            unit="ms",
            description="Average response time for RAG queries",
            threshold=1000.0,
            status="good" if avg_latency < 500 else "warning" if avg_latency < 1000 else "critical"
        ),
        RAGMetric(
            name="Success Rate",
            value=(1.0 - error_rate) * 100,
            unit="%",
            description="Percentage of queries that returned valid context",
            threshold=90.0,
            status="good" if error_rate < 0.1 else "warning" if error_rate < 0.3 else "critical"
        ),
        RAGMetric(
            name="Context Quality",
            value=context_quality * 100,
            unit="%",
            description="Average relevance score of retrieved context",
            threshold=70.0,
            status="good" if context_quality > 0.7 else "warning" if context_quality > 0.4 else "critical"
        ),
        RAGMetric(
            name="Error Rate",
            value=error_rate * 100,
            unit="%",
            description="Percentage of failed queries",
            threshold=10.0,
            status="good" if error_rate < 0.1 else "warning" if error_rate < 0.3 else "critical"
        ),
    ]
    
    return RAGEvaluationResponse(
        repo_id=repo_id,
        evaluation_timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        metrics=metrics,
        overall_score=overall_score,
        test_queries_count=len(test_results),
        avg_latency_ms=avg_latency,
        error_rate=error_rate,
        context_quality_score=context_quality,
    )


@router.post("/repos/{repo_id}/benchmark", response_model=RAGBenchmarkResponse)
async def run_rag_benchmark(
    repo_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
) -> RAGBenchmarkResponse:
    """
    Run a comprehensive RAG benchmark with all test queries.
    Returns detailed results for each query.
    """
    neo4j_client = get_neo4j_client()
    rag_engine = build_graph_rag_engine(neo4j_client=neo4j_client)

    # Run all test queries
    test_results = []
    for query in TEST_QUERIES:
        result = await evaluate_rag_query(rag_engine, repo_id, query)
        test_results.append(result)
    
    # Generate summary
    total_latency = sum(r.latency_ms for r in test_results)
    successful_queries = sum(1 for r in test_results if r.success)
    total_relevance = sum(r.relevance_score or 0 for r in test_results)
    
    avg_latency = total_latency / len(test_results)
    error_rate = 1.0 - (successful_queries / len(test_results))
    context_quality = total_relevance / len(test_results)
    
    overall_score = (
        (1.0 - error_rate) * 0.4 +
        min(1.0, 1000 / max(avg_latency, 100)) * 0.3 +
        context_quality * 0.3
    ) * 100
    
    metrics = [
        RAGMetric(
            name="Average Latency",
            value=avg_latency,
            unit="ms",
            description="Average response time for RAG queries",
            threshold=1000.0,
            status="good" if avg_latency < 500 else "warning" if avg_latency < 1000 else "critical"
        ),
        RAGMetric(
            name="Success Rate",
            value=(1.0 - error_rate) * 100,
            unit="%",
            description="Percentage of queries that returned valid context",
            threshold=90.0,
            status="good" if error_rate < 0.1 else "warning" if error_rate < 0.3 else "critical"
        ),
        RAGMetric(
            name="Context Quality",
            value=context_quality * 100,
            unit="%",
            description="Average relevance score of retrieved context",
            threshold=70.0,
            status="good" if context_quality > 0.7 else "warning" if context_quality > 0.4 else "critical"
        ),
    ]
    
    summary = RAGEvaluationResponse(
        repo_id=repo_id,
        evaluation_timestamp=time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        metrics=metrics,
        overall_score=overall_score,
        test_queries_count=len(test_results),
        avg_latency_ms=avg_latency,
        error_rate=error_rate,
        context_quality_score=context_quality,
    )
    
    return RAGBenchmarkResponse(
        repo_id=repo_id,
        benchmark_id=f"bench_{int(time.time())}",
        test_results=test_results,
        summary=summary,
    )
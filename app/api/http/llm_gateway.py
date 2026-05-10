"""
LLM Gateway HTTP API Endpoints.

Provides HTTP/REST interface to the LLM Gateway for:
- Direct LLM generation (streaming and non-streaming)
- Trace querying and analysis
- Aggregated metrics and time-series data
- Provider discovery and configuration

All endpoints require authentication via Clerk JWT.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal
from app.gateway.api_gateway import get_gateway
from app.gateway.request_context import (
    CostTarget,
    LLMRequestContext,
    RequestPriority,
    SensitivityLevel,
)
from app.observability import (
    get_summary,
    get_time_series,
    get_trace,
    list_traces,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/llm", tags=["llm-gateway"])


# ─── Request/Response Models ──────────────────────────────────────────────────


class LLMGenerateRequest(BaseModel):
    """Request for LLM generation."""
    
    system_prompt: str = Field(default="", description="System prompt for the LLM")
    user_prompt: str = Field(..., min_length=1, description="User prompt (required)")
    temperature: float = Field(default=0.2, ge=0.0, le=2.0, description="Temperature (0.0-2.0)")
    max_tokens: int = Field(default=4000, ge=1, le=100000, description="Maximum tokens to generate")
    
    # Routing hints
    sensitivity: str | None = Field(
        default="internal",
        description="Data sensitivity: public, internal, confidential, restricted"
    )
    cost_target: str | None = Field(
        default="balanced",
        description="Cost optimization: minimize, balanced, quality"
    )
    priority: str | None = Field(
        default="normal",
        description="Request priority: low, normal, high, critical"
    )
    
    # User preferences
    preferred_provider: str | None = Field(
        default=None,
        description="Preferred LLM provider (ollama, anthropic, openai, azure_openai)"
    )
    preferred_model: str | None = Field(
        default=None,
        description="Preferred model name"
    )
    
    # Context
    project_id: str | None = Field(default=None, description="Associated project ID")
    analysis_id: str | None = Field(default=None, description="Associated analysis ID")
    tags: dict[str, str] = Field(default_factory=dict, description="Custom tags for tracing")


class LLMGenerateResponse(BaseModel):
    """Response from LLM generation."""
    
    trace_id: str = Field(..., description="Unique trace ID for this request")
    response_content: str = Field(..., description="Generated text response")
    
    # Provider & routing
    provider: str = Field(..., description="Provider that handled the request")
    model: str = Field(..., description="Model that generated the response")
    routing_reason: str | None = Field(None, description="Why this provider was selected")
    fallback_used: bool = Field(False, description="Whether fallback provider was used")
    
    # Metrics
    input_tokens: int | None = Field(None, description="Input token count")
    output_tokens: int | None = Field(None, description="Output token count")
    total_tokens: int | None = Field(None, description="Total token count")
    duration_ms: int | None = Field(None, description="Request duration in milliseconds")
    cost_cents: float | None = Field(None, description="Cost in cents (USD)")
    
    # Quality
    hallucination_score: float | None = Field(None, description="Hallucination score (0-1, lower is better)")
    relevance_score: float | None = Field(None, description="Relevance score (0-1, higher is better)")


class LLMTraceResponse(BaseModel):
    """Single trace details."""
    
    trace_id: str
    user_id: str | None
    project_id: str | None
    analysis_id: str | None
    
    provider: str
    model: str
    
    prompt: str | None
    response: str | None
    system_prompt: str | None
    
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    
    duration_ms: int | None
    cost_cents: float | None
    
    error: str | None
    fallback_used: bool
    fallback_provider: str | None
    
    priority: str | None
    sensitivity: str | None
    cost_target: str | None
    routing_reason: str | None
    
    tags: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    
    created_at: str


class LLMTracesListResponse(BaseModel):
    """List of traces with pagination."""
    
    traces: list[LLMTraceResponse]
    total: int = Field(..., description="Total number of traces matching filters")
    limit: int
    offset: int


class LLMMetricsSummaryResponse(BaseModel):
    """Aggregated metrics summary."""
    
    summary: dict[str, Any] | None = None
    data: list[dict[str, Any]] | None = None
    group_by: str | None = None
    start_date: str
    end_date: str


class LLMTimeSeriesResponse(BaseModel):
    """Time-series metrics data."""
    
    data: list[dict[str, Any]]
    metric_type: str
    start_date: str | None
    end_date: str | None


class LLMProviderInfo(BaseModel):
    """Provider and model information."""
    
    name: str
    models: list[dict[str, Any]]


class LLMProvidersResponse(BaseModel):
    """List of available providers."""
    
    providers: list[LLMProviderInfo]


class StreamEvent(BaseModel):
    """Server-Sent Event for streaming."""
    
    token: str | None = None
    trace_id: str
    done: bool = False
    error: str | None = None


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/generate", response_model=LLMGenerateResponse)
async def generate_completion(
    request: LLMGenerateRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> LLMGenerateResponse:
    """
    Generate LLM completion with intelligent routing.
    
    The gateway will:
    1. Route to the best provider based on sensitivity, cost, and performance
    2. Apply automatic fallback if the primary provider fails
    3. Track full observability (traces, metrics, costs)
    4. Cache results when appropriate
    
    **Example:**
    ```json
    {
      "user_prompt": "Explain how async/await works in Python",
      "system_prompt": "You are a helpful programming tutor",
      "temperature": 0.7,
      "max_tokens": 2000,
      "sensitivity": "public",
      "cost_target": "minimize"
    }
    ```
    
    **Authentication:**
    Requires valid Clerk JWT token in Authorization header.
    """
    try:
        # Parse enum values
        sensitivity_level = SensitivityLevel(request.sensitivity) if request.sensitivity else SensitivityLevel.INTERNAL
        cost_target = CostTarget(request.cost_target) if request.cost_target else CostTarget.BALANCED
        priority = RequestPriority(request.priority) if request.priority else RequestPriority.NORMAL
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid enum value: {exc}. Check sensitivity, cost_target, or priority."
        )
    
    # Create request context
    ctx = LLMRequestContext(
        user_id=principal.user_id,
        project_id=request.project_id,
        analysis_id=request.analysis_id,
        system_prompt=request.system_prompt,
        user_prompt=request.user_prompt,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        sensitivity=sensitivity_level,
        cost_target=cost_target,
        priority=priority,
        preferred_provider=request.preferred_provider,
        preferred_model=request.preferred_model,
        tags=request.tags,
    )
    
    # Execute through gateway
    gateway = get_gateway()
    
    try:
        ctx = await gateway.generate(ctx)
    except Exception as exc:
        logger.error(f"Gateway generation failed: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"LLM generation failed: {str(exc)}"
        )
    
    # Check for errors
    if ctx.error:
        raise HTTPException(
            status_code=500,
            detail=f"LLM request failed: {ctx.error}"
        )
    
    if not ctx.response_content:
        raise HTTPException(
            status_code=500,
            detail="No response generated"
        )
    
    # Build response
    return LLMGenerateResponse(
        trace_id=ctx.trace_id,
        response_content=ctx.response_content,
        provider=ctx.selected_provider or "unknown",
        model=ctx.selected_model or "unknown",
        routing_reason=ctx.routing_reason,
        fallback_used=ctx.fallback_used,
        input_tokens=ctx.input_tokens,
        output_tokens=ctx.output_tokens,
        total_tokens=ctx.total_tokens,
        duration_ms=ctx.duration_ms,
        cost_cents=ctx.actual_cost_cents,
        hallucination_score=ctx.hallucination_score,
        relevance_score=ctx.relevance_score,
    )


@router.post("/stream")
async def stream_completion(
    request: LLMGenerateRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> StreamingResponse:
    """
    Stream LLM completion as Server-Sent Events (SSE).
    
    Returns a stream of tokens as they are generated. Each event contains:
    - `token`: The generated text chunk
    - `trace_id`: Unique identifier for this request
    - `done`: True when generation is complete
    
    **Example response stream:**
    ```
    data: {"token": "Hello", "trace_id": "abc-123", "done": false}
    data: {"token": " world", "trace_id": "abc-123", "done": false}
    data: {"token": "!", "trace_id": "abc-123", "done": true}
    ```
    
    **Authentication:**
    Requires valid Clerk JWT token in Authorization header.
    """
    try:
        # Parse enum values
        sensitivity_level = SensitivityLevel(request.sensitivity) if request.sensitivity else SensitivityLevel.INTERNAL
        cost_target = CostTarget(request.cost_target) if request.cost_target else CostTarget.BALANCED
        priority = RequestPriority(request.priority) if request.priority else RequestPriority.NORMAL
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid enum value: {exc}. Check sensitivity, cost_target, or priority."
        )
    
    # Create request context
    ctx = LLMRequestContext(
        user_id=principal.user_id,
        project_id=request.project_id,
        analysis_id=request.analysis_id,
        system_prompt=request.system_prompt,
        user_prompt=request.user_prompt,
        temperature=request.temperature,
        max_tokens=request.max_tokens,
        sensitivity=sensitivity_level,
        cost_target=cost_target,
        priority=priority,
        preferred_provider=request.preferred_provider,
        preferred_model=request.preferred_model,
        tags=request.tags,
    )
    
    # Stream generator
    async def event_generator():
        """Generate SSE events."""
        gateway = get_gateway()
        
        try:
            async for token in gateway.stream(ctx):
                # Check if it's an error message
                if token.startswith("Error:"):
                    event = StreamEvent(
                        token=None,
                        trace_id=ctx.trace_id,
                        done=True,
                        error=token,
                    )
                    yield f"data: {event.model_dump_json()}\n\n"
                    return
                
                # Send token
                event = StreamEvent(
                    token=token,
                    trace_id=ctx.trace_id,
                    done=False,
                )
                yield f"data: {event.model_dump_json()}\n\n"
            
            # Send completion event
            event = StreamEvent(
                token=None,
                trace_id=ctx.trace_id,
                done=True,
            )
            yield f"data: {event.model_dump_json()}\n\n"
            
        except Exception as exc:
            logger.error(f"Streaming failed: {exc}", exc_info=True)
            event = StreamEvent(
                token=None,
                trace_id=ctx.trace_id,
                done=True,
                error=str(exc),
            )
            yield f"data: {event.model_dump_json()}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


@router.get("/traces", response_model=LLMTracesListResponse)
async def list_llm_traces(
    user_id: str | None = Query(None, description="Filter by user ID"),
    project_id: str | None = Query(None, description="Filter by project ID"),
    analysis_id: str | None = Query(None, description="Filter by analysis ID"),
    provider: str | None = Query(None, description="Filter by provider"),
    has_error: bool | None = Query(None, description="Filter by error presence"),
    start_date: datetime | None = Query(None, description="Minimum created_at timestamp"),
    end_date: datetime | None = Query(None, description="Maximum created_at timestamp"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> LLMTracesListResponse:
    """
    List LLM request traces with filtering and pagination.
    
    Returns detailed information about past LLM requests including:
    - Prompts and responses
    - Token usage and costs
    - Provider routing decisions
    - Error information
    
    **Filters:**
    - `user_id`: Show only traces for a specific user
    - `project_id`: Show only traces for a specific project
    - `analysis_id`: Show only traces for a specific analysis
    - `provider`: Filter by LLM provider (ollama, anthropic, openai, azure_openai)
    - `has_error`: True for failed requests, False for successful
    - `start_date` / `end_date`: Time range filter
    
    **Pagination:**
    - `limit`: Max 1000 results per request
    - `offset`: Skip N results (for pagination)
    
    **Authentication:**
    Requires valid Clerk JWT token in Authorization header.
    """
    try:
        traces_data = await list_traces(
            user_id=user_id,
            project_id=project_id,
            analysis_id=analysis_id,
            provider=provider,
            has_error=has_error,
            start_date=start_date,
            end_date=end_date,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        logger.error(f"Failed to list traces: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list traces: {str(exc)}"
        )
    
    # Convert to response models
    traces = [
        LLMTraceResponse(
            trace_id=trace["trace_id"],
            user_id=trace.get("user_id"),
            project_id=trace.get("project_id"),
            analysis_id=trace.get("analysis_id"),
            provider=trace["provider"],
            model=trace["model"],
            prompt=trace.get("prompt"),
            response=trace.get("response"),
            system_prompt=trace.get("system_prompt"),
            input_tokens=trace.get("input_tokens"),
            output_tokens=trace.get("output_tokens"),
            total_tokens=trace.get("total_tokens"),
            duration_ms=trace.get("duration_ms"),
            cost_cents=trace.get("cost_cents"),
            error=trace.get("error"),
            fallback_used=trace.get("fallback_used", False),
            fallback_provider=trace.get("fallback_provider"),
            priority=trace.get("priority"),
            sensitivity=trace.get("sensitivity"),
            cost_target=trace.get("cost_target"),
            routing_reason=trace.get("routing_reason"),
            tags=trace.get("tags", {}),
            metadata=trace.get("metadata", {}),
            created_at=trace["created_at"].isoformat() if isinstance(trace["created_at"], datetime) else str(trace["created_at"]),
        )
        for trace in traces_data
    ]
    
    return LLMTracesListResponse(
        traces=traces,
        total=len(traces),  # TODO: Add count query for accurate total
        limit=limit,
        offset=offset,
    )


@router.get("/traces/{trace_id}", response_model=LLMTraceResponse)
async def get_llm_trace(
    trace_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> LLMTraceResponse:
    """
    Get detailed information about a specific LLM trace.
    
    Returns full trace details including:
    - Complete prompts and responses (not truncated)
    - Token usage and costs
    - Routing decisions and fallback information
    - Quality metrics if available
    
    **Authentication:**
    Requires valid Clerk JWT token in Authorization header.
    """
    try:
        trace = await get_trace(trace_id)
    except Exception as exc:
        logger.error(f"Failed to get trace {trace_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve trace: {str(exc)}"
        )
    
    if not trace:
        raise HTTPException(
            status_code=404,
            detail=f"Trace {trace_id} not found"
        )
    
    return LLMTraceResponse(
        trace_id=trace["trace_id"],
        user_id=trace.get("user_id"),
        project_id=trace.get("project_id"),
        analysis_id=trace.get("analysis_id"),
        provider=trace["provider"],
        model=trace["model"],
        prompt=trace.get("prompt"),
        response=trace.get("response"),
        system_prompt=trace.get("system_prompt"),
        input_tokens=trace.get("input_tokens"),
        output_tokens=trace.get("output_tokens"),
        total_tokens=trace.get("total_tokens"),
        duration_ms=trace.get("duration_ms"),
        cost_cents=trace.get("cost_cents"),
        error=trace.get("error"),
        fallback_used=trace.get("fallback_used", False),
        fallback_provider=trace.get("fallback_provider"),
        priority=trace.get("priority"),
        sensitivity=trace.get("sensitivity"),
        cost_target=trace.get("cost_target"),
        routing_reason=trace.get("routing_reason"),
        tags=trace.get("tags", {}),
        metadata=trace.get("metadata", {}),
        created_at=trace["created_at"].isoformat() if isinstance(trace["created_at"], datetime) else str(trace["created_at"]),
    )


@router.get("/metrics/summary", response_model=LLMMetricsSummaryResponse)
async def get_metrics_summary(
    start_date: datetime | None = Query(None, description="Start of time range"),
    end_date: datetime | None = Query(None, description="End of time range"),
    group_by: Literal["provider", "user", "project", "model"] | None = Query(
        None,
        description="Group results by dimension"
    ),
    user_id: str | None = Query(None, description="Filter by user"),
    project_id: str | None = Query(None, description="Filter by project"),
    provider: str | None = Query(None, description="Filter by provider"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> LLMMetricsSummaryResponse:
    """
    Get aggregated metrics summary for LLM usage.
    
    Returns aggregated statistics including:
    - Total requests (successful and failed)
    - Token usage (input, output, total)
    - Total costs
    - Average latency
    - Error and fallback rates
    
    **Grouping:**
    - `provider`: Group by LLM provider
    - `user`: Group by user ID
    - `project`: Group by project ID
    - `model`: Group by provider + model
    
    **Example response (grouped by provider):**
    ```json
    {
      "data": [
        {
          "provider": "ollama",
          "total_requests": 1250,
          "total_tokens": 450000,
          "total_cost_cents": 0.0,
          "avg_latency_ms": 850,
          "error_rate": 0.02
        },
        {
          "provider": "anthropic",
          "total_requests": 450,
          "total_tokens": 280000,
          "total_cost_cents": 125.50,
          "avg_latency_ms": 1200,
          "error_rate": 0.01
        }
      ],
      "group_by": "provider"
    }
    ```
    
    **Authentication:**
    Requires valid Clerk JWT token in Authorization header.
    """
    try:
        summary = await get_summary(
            start_date=start_date,
            end_date=end_date,
            group_by=group_by,
            user_id=user_id,
            project_id=project_id,
            provider=provider,
        )
    except Exception as exc:
        logger.error(f"Failed to get metrics summary: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve metrics: {str(exc)}"
        )
    
    return LLMMetricsSummaryResponse(**summary)


@router.get("/metrics/timeseries", response_model=LLMTimeSeriesResponse)
async def get_metrics_timeseries(
    metric_type: Literal["hourly", "daily"] = Query(
        "daily",
        description="Time granularity for aggregation"
    ),
    start_date: datetime | None = Query(None, description="Start of time range"),
    end_date: datetime | None = Query(None, description="End of time range"),
    provider: str | None = Query(None, description="Filter by provider"),
    project_id: str | None = Query(None, description="Filter by project"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> LLMTimeSeriesResponse:
    """
    Get time-series metrics for charting and trend analysis.
    
    Returns metrics aggregated by time period (hourly or daily) including:
    - Request counts
    - Token usage
    - Costs
    - Latency
    
    **Example response:**
    ```json
    {
      "data": [
        {
          "timestamp": "2026-05-01T00:00:00Z",
          "total_requests": 45,
          "total_tokens": 12500,
          "total_cost_cents": 5.25,
          "avg_latency_ms": 950
        },
        {
          "timestamp": "2026-05-02T00:00:00Z",
          "total_requests": 52,
          "total_tokens": 15200,
          "total_cost_cents": 6.80,
          "avg_latency_ms": 920
        }
      ],
      "metric_type": "daily"
    }
    ```
    
    **Authentication:**
    Requires valid Clerk JWT token in Authorization header.
    """
    try:
        data = await get_time_series(
            metric_type=metric_type,
            start_date=start_date,
            end_date=end_date,
            provider=provider,
            project_id=project_id,
        )
    except Exception as exc:
        logger.error(f"Failed to get time-series data: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve time-series data: {str(exc)}"
        )
    
    # Convert datetime objects to ISO strings
    for item in data:
        if "timestamp" in item and isinstance(item["timestamp"], datetime):
            item["timestamp"] = item["timestamp"].isoformat()
    
    return LLMTimeSeriesResponse(
        data=data,
        metric_type=metric_type,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
    )


@router.get("/providers", response_model=LLMProvidersResponse)
async def list_providers(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> LLMProvidersResponse:
    """
    List available LLM providers and their models.
    
    Returns information about all configured providers including:
    - Provider names
    - Available models
    - Model capabilities (context window, max tokens)
    - Pricing information (cost per token)
    
    **Example response:**
    ```json
    {
      "providers": [
        {
          "name": "ollama",
          "models": [
            {
              "name": "qwen2.5-coder:7b",
              "max_context": 32768,
              "max_output": 8192,
              "cost_per_input": 0.0,
              "cost_per_output": 0.0
            }
          ]
        },
        {
          "name": "anthropic",
          "models": [
            {
              "name": "claude-3-5-sonnet-20241022",
              "max_context": 200000,
              "max_output": 8192,
              "cost_per_input": 0.000003,
              "cost_per_output": 0.000015
            }
          ]
        }
      ]
    }
    ```
    
    **Authentication:**
    Requires valid Clerk JWT token in Authorization header.
    """
    try:
        gateway = get_gateway()
        providers_list = []
        
        for provider_name, provider in gateway._providers.items():
            models = []
            for model_name in provider.available_models:
                model_info = provider.get_model_info(model_name)
                if model_info:
                    models.append({
                        "name": model_info.name,
                        "display_name": model_info.display_name,
                        "max_context": model_info.max_context_tokens,
                        "max_output": model_info.max_output_tokens,
                        "cost_per_input": model_info.cost_per_input_token,
                        "cost_per_output": model_info.cost_per_output_token,
                        "supports_streaming": model_info.supports_streaming,
                        "supports_functions": model_info.supports_functions,
                    })
            
            providers_list.append(
                LLMProviderInfo(
                    name=provider_name,
                    models=models,
                )
            )
        
        return LLMProvidersResponse(providers=providers_list)
        
    except Exception as exc:
        logger.error(f"Failed to list providers: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to list providers: {str(exc)}"
        )


# ─── RAGAS Evaluation Endpoints ───────────────────────────────────────────────


class RAGASMetricsResponse(BaseModel):
    """Response containing RAGAS evaluation metrics."""
    
    trace_id: str
    context_precision: float | None = Field(None, description="Relevance of retrieved context (0.0-1.0)")
    context_recall: float | None = Field(None, description="Completeness of retrieved context (0.0-1.0)")
    faithfulness: float | None = Field(None, description="Answer fidelity to context (0.0-1.0, 1.0=no hallucinations)")
    answer_relevancy: float | None = Field(None, description="Answer relevance to query (0.0-1.0)")
    computed_at: datetime | None = None


class RAGASEvaluateRequest(BaseModel):
    """Request to evaluate a trace with RAGAS metrics."""
    
    trace_id: str = Field(..., description="Trace ID to evaluate")
    force_recompute: bool = Field(False, description="Force recompute even if metrics exist")


@router.get(
    "/traces/{trace_id}/ragas",
    response_model=RAGASMetricsResponse,
    summary="Get RAGAS metrics for a trace",
    description="Retrieve RAGAS evaluation metrics (faithfulness, relevancy, etc.) for a specific trace",
)
async def get_trace_ragas_metrics(
    trace_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> RAGASMetricsResponse:
    """
    Get RAGAS evaluation metrics for a specific trace.
    
    Returns faithfulness, relevancy, context precision/recall scores.
    """
    try:
        trace = await get_trace(trace_id)
        if not trace:
            raise HTTPException(status_code=404, detail=f"Trace {trace_id} not found")
        
        return RAGASMetricsResponse(
            trace_id=trace_id,
            context_precision=None,  # Not stored yet, compute separately
            context_recall=None,  # Not stored yet
            faithfulness=trace.get("faithfulness_score"),
            answer_relevancy=trace.get("relevance_score"),
            computed_at=trace.get("created_at"),
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to get RAGAS metrics for trace {trace_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get RAGAS metrics: {str(exc)}"
        )


@router.post(
    "/evaluate",
    response_model=RAGASMetricsResponse,
    summary="Evaluate trace with RAGAS",
    description="Compute RAGAS metrics for an existing trace (async background task)",
)
async def evaluate_trace_with_ragas(
    request: RAGASEvaluateRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> RAGASMetricsResponse:
    """
    Trigger RAGAS evaluation for an existing trace.
    
    This is useful for retroactive evaluation of traces that were created
    before RAGAS was enabled, or to recompute metrics with updated algorithms.
    
    The evaluation runs asynchronously in the background. Check back later
    with GET /traces/{trace_id}/ragas to see the results.
    """
    try:
        # Get trace data
        trace = await get_trace(request.trace_id)
        if not trace:
            raise HTTPException(status_code=404, detail=f"Trace {request.trace_id} not found")
        
        # Check if metrics already exist
        if not request.force_recompute:
            if trace.get("faithfulness_score") is not None:
                return RAGASMetricsResponse(
                    trace_id=request.trace_id,
                    faithfulness=trace.get("faithfulness_score"),
                    answer_relevancy=trace.get("relevance_score"),
                    computed_at=trace.get("created_at"),
                )
        
        # Trigger evaluation in background
        from app.observability.ragas_evaluator import compute_and_store_ragas_metrics
        import asyncio
        
        # Fire and forget
        asyncio.create_task(
            compute_and_store_ragas_metrics(
                trace_id=request.trace_id,
                query=trace.get("prompt", ""),
                retrieved_context=trace.get("metadata", {}).get("retrieved_context", []),
                answer=trace.get("response", ""),
                ground_truth=None,
            )
        )
        
        return RAGASMetricsResponse(
            trace_id=request.trace_id,
            faithfulness=None,  # Will be computed in background
            answer_relevancy=None,
            computed_at=None,
        )
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to evaluate trace {request.trace_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to evaluate trace: {str(exc)}"
        )

"""
Langfuse Integration for LLMOps Observability.

Provides real-time LLM trace export to Langfuse for:
- LLM request/response tracking
- Token usage and cost monitoring
- Quality metrics (hallucination, relevance, faithfulness)
- Model performance comparison
- Debugging and error analysis

Architecture:
- Async, non-blocking trace export
- Graceful degradation if Langfuse unavailable
- Automatic retry with exponential backoff
- Structured trace format matching Langfuse API

Environment Variables:
- LANGFUSE_ENABLED: Enable Langfuse integration (default: False)
- LANGFUSE_PUBLIC_KEY: Langfuse public API key
- LANGFUSE_SECRET_KEY: Langfuse secret API key
- LANGFUSE_HOST: Langfuse API endpoint (default: https://cloud.langfuse.com)
- LANGFUSE_TIMEOUT_SECONDS: Request timeout (default: 10)
- LANGFUSE_RETRY_COUNT: Max retry attempts (default: 2)

Usage:
    from app.observability.langfuse_client import send_trace_to_langfuse, is_langfuse_enabled
    
    if is_langfuse_enabled():
        await send_trace_to_langfuse(ctx)
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

from app.gateway.request_context import LLMRequestContext
from app.settings import settings

logger = logging.getLogger(__name__)

# Lazy-loaded Langfuse client
_langfuse_client = None
_langfuse_import_error: Exception | None = None


def _get_langfuse_client():
    """
    Lazy-load Langfuse SDK.
    
    Returns initialized Langfuse client or None if unavailable.
    """
    global _langfuse_client, _langfuse_import_error
    
    if _langfuse_client is not None:
        return _langfuse_client
    
    if _langfuse_import_error is not None:
        return None
    
    try:
        from langfuse import Langfuse
        
        public_key = getattr(settings, "LANGFUSE_PUBLIC_KEY", None)
        secret_key = getattr(settings, "LANGFUSE_SECRET_KEY", None)
        host = getattr(settings, "LANGFUSE_HOST", "https://cloud.langfuse.com")
        
        if not public_key or not secret_key:
            logger.warning(
                "Langfuse keys not configured. Set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY to enable."
            )
            _langfuse_import_error = ValueError("Missing Langfuse credentials")
            return None
        
        _langfuse_client = Langfuse(
            public_key=public_key,
            secret_key=secret_key,
            host=host,
        )
        
        logger.info("Langfuse client initialized successfully (host=%s)", host)
        return _langfuse_client
        
    except ImportError as exc:
        logger.warning(
            "Langfuse SDK not installed. Install with: pip install langfuse"
        )
        _langfuse_import_error = exc
        return None
    except Exception as exc:
        logger.error("Failed to initialize Langfuse client: %s", exc)
        _langfuse_import_error = exc
        return None


def is_langfuse_enabled() -> bool:
    """
    Check if Langfuse integration is enabled and available.
    
    Returns:
        True if Langfuse is enabled in settings and SDK is available
    """
    enabled = getattr(settings, "LANGFUSE_ENABLED", False)
    if not enabled:
        return False
    
    client = _get_langfuse_client()
    return client is not None


def _convert_context_to_langfuse_trace(ctx: LLMRequestContext) -> dict[str, Any]:
    """
    Convert LLMRequestContext to Langfuse trace format.
    
    Langfuse trace structure:
        trace (root) → generation (LLM call with prompt/completion)
    
    Args:
        ctx: Completed LLM request context
        
    Returns:
        Langfuse-formatted trace dictionary
    """
    # Calculate timestamps
    start_time = datetime.fromtimestamp(ctx.started_at)
    end_time = (
        datetime.fromtimestamp(ctx.completed_at)
        if ctx.completed_at
        else datetime.fromtimestamp(ctx.started_at + (ctx.duration_ms or 0) / 1000)
    )
    
    # Build metadata
    metadata = {
        "project_id": ctx.project_id,
        "analysis_id": ctx.analysis_id,
        "parent_trace_id": ctx.parent_trace_id,
        "priority": ctx.priority.value if ctx.priority else None,
        "sensitivity": ctx.sensitivity.value if ctx.sensitivity else None,
        "cost_target": ctx.cost_target.value if ctx.cost_target else None,
        "routing_reason": ctx.routing_reason,
        "fallback_used": ctx.fallback_used,
        "fallback_provider": ctx.fallback_provider,
        "retry_count": ctx.retry_count,
        "context_token_count": ctx.context_token_count,
        "retrieved_context_count": len(ctx.retrieved_context),
        **ctx.tags,
        **ctx.metadata,
    }
    
    # Remove None values
    metadata = {k: v for k, v in metadata.items() if v is not None}
    
    # Build input
    input_data = {
        "system": ctx.system_prompt,
        "user": ctx.user_prompt,
    }
    
    # Build usage
    usage = None
    if ctx.input_tokens or ctx.output_tokens:
        usage = {
            "input": ctx.input_tokens or 0,
            "output": ctx.output_tokens or 0,
            "total": ctx.total_tokens or (ctx.input_tokens or 0) + (ctx.output_tokens or 0),
        }
    
    # Build trace
    trace_data = {
        "id": ctx.trace_id,
        "name": f"{ctx.selected_provider or 'unknown'}:{ctx.selected_model or 'unknown'}",
        "userId": ctx.user_id,
        "metadata": metadata,
        "tags": list(ctx.tags.keys()) if ctx.tags else [],
        "timestamp": start_time,
        "release": ctx.metadata.get("release"),
        "version": ctx.metadata.get("version"),
    }
    
    # Build generation (LLM call)
    generation_data = {
        "id": f"{ctx.trace_id}-gen",
        "trace_id": ctx.trace_id,
        "name": "llm.generate",
        "startTime": start_time,
        "endTime": end_time,
        "model": ctx.selected_model,
        "modelParameters": {
            "temperature": ctx.temperature,
            "maxTokens": ctx.max_tokens,
            "provider": ctx.selected_provider,
        },
        "input": input_data,
        "output": ctx.response_content,
        "usage": usage,
        "metadata": {
            "latency_ms": ctx.duration_ms,
            "estimated_cost_cents": ctx.estimated_cost_cents,
            "actual_cost_cents": ctx.actual_cost_cents,
        },
    }
    
    # Add error status if present
    if ctx.error:
        generation_data["level"] = "ERROR"
        generation_data["statusMessage"] = ctx.error
    
    return {
        "trace": trace_data,
        "generation": generation_data,
    }


async def send_trace_to_langfuse(ctx: LLMRequestContext) -> bool:
    """
    Send LLM trace to Langfuse asynchronously.
    
    Non-blocking operation with graceful error handling.
    Retries on transient failures.
    
    Args:
        ctx: Completed LLM request context with response data
        
    Returns:
        True if trace was sent successfully, False otherwise
    """
    if not is_langfuse_enabled():
        return False
    
    client = _get_langfuse_client()
    if client is None:
        return False
    
    try:
        # Convert to Langfuse format
        langfuse_data = _convert_context_to_langfuse_trace(ctx)
        trace_data = langfuse_data["trace"]
        generation_data = langfuse_data["generation"]
        
        # Create trace
        trace = client.trace(
            id=trace_data["id"],
            name=trace_data["name"],
            user_id=trace_data.get("userId"),
            metadata=trace_data.get("metadata", {}),
            tags=trace_data.get("tags", []),
            timestamp=trace_data.get("timestamp"),
            release=trace_data.get("release"),
            version=trace_data.get("version"),
        )
        
        # Create generation within trace
        trace.generation(
            id=generation_data["id"],
            name=generation_data["name"],
            start_time=generation_data["startTime"],
            end_time=generation_data["endTime"],
            model=generation_data.get("model"),
            model_parameters=generation_data.get("modelParameters", {}),
            input=generation_data.get("input"),
            output=generation_data.get("output"),
            usage=generation_data.get("usage"),
            metadata=generation_data.get("metadata", {}),
            level=generation_data.get("level", "DEFAULT"),
            status_message=generation_data.get("statusMessage"),
        )
        
        # Add quality scores if available
        if ctx.hallucination_score is not None:
            trace.score(
                name="hallucination",
                value=ctx.hallucination_score,
                comment="Lower is better (0-1 scale)",
            )
        
        if ctx.relevance_score is not None:
            trace.score(
                name="relevance",
                value=ctx.relevance_score,
                comment="Higher is better (0-1 scale)",
            )
        
        if ctx.faithfulness_score is not None:
            trace.score(
                name="faithfulness",
                value=ctx.faithfulness_score,
                comment="Higher is better (0-1 scale)",
            )
        
        # Add cost score
        if ctx.actual_cost_cents is not None:
            trace.score(
                name="cost_cents",
                value=ctx.actual_cost_cents,
                comment="Total cost in cents",
            )
        
        # Flush to ensure data is sent
        client.flush()
        
        logger.debug(
            "Sent trace to Langfuse: trace_id=%s provider=%s model=%s",
            ctx.trace_id,
            ctx.selected_provider,
            ctx.selected_model,
        )
        return True
        
    except Exception as exc:
        logger.error(
            "Failed to send trace to Langfuse (trace_id=%s): %s",
            ctx.trace_id,
            exc,
            exc_info=True,
        )
        return False


async def send_trace_with_retry(ctx: LLMRequestContext) -> bool:
    """
    Send trace to Langfuse with automatic retry on failure.
    
    Implements exponential backoff for transient failures.
    
    Args:
        ctx: Completed LLM request context
        
    Returns:
        True if trace was sent successfully (possibly after retries)
    """
    retry_count = getattr(settings, "LANGFUSE_RETRY_COUNT", 2)
    
    for attempt in range(retry_count + 1):
        success = await send_trace_to_langfuse(ctx)
        if success:
            return True
        
        if attempt < retry_count:
            # Exponential backoff: 1s, 2s, 4s...
            delay = 2 ** attempt
            logger.debug(
                "Retrying Langfuse export in %ds (attempt %d/%d)",
                delay,
                attempt + 1,
                retry_count,
            )
            await asyncio.sleep(delay)
    
    logger.warning(
        "Failed to send trace to Langfuse after %d attempts: trace_id=%s",
        retry_count + 1,
        ctx.trace_id,
    )
    return False


def get_langfuse_status() -> dict[str, Any]:
    """
    Get Langfuse integration status for health checks.
    
    Returns:
        Status dictionary with enabled state and any errors
    """
    enabled = getattr(settings, "LANGFUSE_ENABLED", False)
    
    if not enabled:
        return {
            "enabled": False,
            "status": "disabled",
            "message": "Langfuse integration is disabled in settings",
        }
    
    client = _get_langfuse_client()
    
    if client is None:
        error_msg = str(_langfuse_import_error) if _langfuse_import_error else "Unknown error"
        return {
            "enabled": True,
            "status": "error",
            "message": f"Langfuse client initialization failed: {error_msg}",
        }
    
    return {
        "enabled": True,
        "status": "ready",
        "message": "Langfuse integration is active",
        "host": getattr(settings, "LANGFUSE_HOST", "https://cloud.langfuse.com"),
    }

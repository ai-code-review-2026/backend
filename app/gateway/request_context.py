"""
LLM Request Context - Unified context for all LLM operations.

Captures:
- Request metadata (trace_id, user, timestamps)
- LLM parameters (prompt, model preferences, constraints)
- Routing hints (priority, sensitivity, cost_target)
- Observability (parent_span, tags, metrics)
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class RequestPriority(str, Enum):
    """Request priority for routing decisions."""
    
    LOW = "low"           # Batch jobs, non-urgent
    NORMAL = "normal"     # Default priority
    HIGH = "high"         # User-facing requests
    CRITICAL = "critical" # Real-time, must succeed


class SensitivityLevel(str, Enum):
    """Data sensitivity for routing to appropriate providers."""
    
    PUBLIC = "public"         # Public data, any provider OK
    INTERNAL = "internal"     # Company data, prefer private LLMs
    CONFIDENTIAL = "confidential"  # Sensitive code, local-only
    RESTRICTED = "restricted" # Secrets, credentials - local mandatory


class CostTarget(str, Enum):
    """Cost optimization preference."""
    
    MINIMIZE = "minimize"   # Cheapest possible
    BALANCED = "balanced"   # Balance cost/quality
    QUALITY = "quality"     # Best quality, cost secondary


@dataclass
class LLMRequestContext:
    """
    Unified context for LLM operations.
    
    Flow:
        1. Create context with user prompt + preferences
        2. Gateway enriches with trace_id, routing decisions
        3. Provider executes and updates with response metadata
        4. Observability logs complete trace
    
    Usage:
        ctx = LLMRequestContext(
            user_prompt="Review this code",
            system_prompt="You are a code reviewer",
            sensitivity=SensitivityLevel.CONFIDENTIAL,
        )
        response = await gateway.generate(ctx)
    """
    
    # ─── Request Identification ────────────────────────────────────────
    trace_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str | None = None
    project_id: str | None = None
    analysis_id: str | None = None
    parent_trace_id: str | None = None  # For chained LLM calls
    
    # ─── LLM Prompt & Configuration ────────────────────────────────────
    system_prompt: str = ""
    user_prompt: str = ""
    temperature: float = 0.2
    max_tokens: int = 4000
    stop_sequences: list[str] | None = None
    
    # ─── Routing Hints ─────────────────────────────────────────────────
    priority: RequestPriority = RequestPriority.NORMAL
    sensitivity: SensitivityLevel = SensitivityLevel.INTERNAL
    cost_target: CostTarget = CostTarget.BALANCED
    
    # User can specify preferred provider/model
    preferred_provider: str | None = None
    preferred_model: str | None = None
    
    # Constraints
    max_cost_cents: float | None = None  # Maximum acceptable cost
    max_latency_ms: int | None = None    # Maximum acceptable latency
    
    # ─── Context & Retrieval ───────────────────────────────────────────
    retrieved_context: list[dict[str, Any]] = field(default_factory=list)
    context_token_count: int = 0
    
    # ─── Routing Decision (filled by Gateway) ──────────────────────────
    selected_provider: str | None = None
    selected_model: str | None = None
    routing_reason: str | None = None
    
    # ─── Execution Tracking ────────────────────────────────────────────
    started_at: float = field(default_factory=time.time)
    completed_at: float | None = None
    duration_ms: int | None = None
    
    # ─── Response ──────────────────────────────────────────────────────
    response_content: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None
    
    # ─── Cost & Quality ────────────────────────────────────────────────
    estimated_cost_cents: float | None = None
    actual_cost_cents: float | None = None
    
    # Quality metrics (if evaluated)
    hallucination_score: float | None = None  # 0-1, lower is better
    relevance_score: float | None = None      # 0-1, higher is better
    faithfulness_score: float | None = None   # 0-1, higher is better
    
    # ─── Error Handling ────────────────────────────────────────────────
    error: str | None = None
    retry_count: int = 0
    fallback_used: bool = False
    fallback_provider: str | None = None
    
    # ─── Observability ─────────────────────────────────────────────────
    tags: dict[str, str] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)
    
    def mark_completed(self, duration_ms: int) -> None:
        """Mark request as completed."""
        self.completed_at = time.time()
        self.duration_ms = duration_ms
    
    def mark_failed(self, error: str) -> None:
        """Mark request as failed."""
        self.completed_at = time.time()
        self.duration_ms = int((self.completed_at - self.started_at) * 1000)
        self.error = error
    
    def to_trace_dict(self) -> dict[str, Any]:
        """Convert to trace dictionary for observability."""
        return {
            "trace_id": self.trace_id,
            "user_id": self.user_id,
            "project_id": self.project_id,
            "analysis_id": self.analysis_id,
            "parent_trace_id": self.parent_trace_id,
            
            # Prompt (truncated for storage)
            "system_prompt": self.system_prompt[:500],
            "user_prompt": self.user_prompt[:1000],
            
            # Routing
            "priority": self.priority,
            "sensitivity": self.sensitivity,
            "cost_target": self.cost_target,
            "selected_provider": self.selected_provider,
            "selected_model": self.selected_model,
            "routing_reason": self.routing_reason,
            
            # Response (truncated)
            "response_content": self.response_content[:1000] if self.response_content else None,
            
            # Tokens & Cost
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "total_tokens": self.total_tokens,
            "estimated_cost_cents": self.estimated_cost_cents,
            "actual_cost_cents": self.actual_cost_cents,
            
            # Performance
            "duration_ms": self.duration_ms,
            
            # Quality
            "hallucination_score": self.hallucination_score,
            "relevance_score": self.relevance_score,
            "faithfulness_score": self.faithfulness_score,
            
            # Error handling
            "error": self.error,
            "retry_count": self.retry_count,
            "fallback_used": self.fallback_used,
            "fallback_provider": self.fallback_provider,
            
            # Context
            "context_token_count": self.context_token_count,
            "retrieved_context_count": len(self.retrieved_context),
            
            # Metadata
            "tags": self.tags,
            "metadata": self.metadata,
        }

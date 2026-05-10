"""
Model Selector - Intelligent provider and model selection.

Selection Strategy:
1. Sensitivity-based routing (RESTRICTED → Ollama only)
2. Cost optimization (MINIMIZE → cheapest models)
3. Performance requirements (CRITICAL → fastest providers)
4. Context window constraints (>100K → Claude)
5. User preferences (preferred_provider/model)

Scoring System:
- sensitivity_score: 0-100 (higher = more sensitive, prefer local)
- cost_score: 0-100 (higher = cheaper)
- performance_score: 0-100 (higher = faster)
- context_score: 0-100 (higher = better for large context)

Final score = weighted sum of all scores based on request parameters.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.gateway.request_context import (
    CostTarget,
    LLMRequestContext,
    RequestPriority,
    SensitivityLevel,
)

if TYPE_CHECKING:
    from app.providers.base import BaseProvider

logger = logging.getLogger(__name__)


@dataclass
class RoutingDecision:
    """Result of model selection routing."""
    
    provider: str
    model: str
    reason: str
    estimated_cost: float  # cents
    estimated_latency_ms: int
    confidence: float  # 0-1, how confident in this decision
    
    # Scoring breakdown (for debugging)
    sensitivity_score: float = 0.0
    cost_score: float = 0.0
    performance_score: float = 0.0
    context_score: float = 0.0
    total_score: float = 0.0


@dataclass
class ProviderCapability:
    """Provider capabilities and characteristics."""
    
    name: str
    models: list[str]
    is_local: bool  # True for Ollama, False for cloud
    avg_latency_ms: int
    max_context_window: int
    cost_per_1k_input: float  # cents
    cost_per_1k_output: float  # cents
    reliability: float  # 0-1, based on historical uptime


# Provider characteristics database
PROVIDER_CAPABILITIES: dict[str, ProviderCapability] = {
    "ollama": ProviderCapability(
        name="ollama",
        models=["deepseek-coder:6.7b", "qwen2.5-coder:7b", "llama3.2:3b"],
        is_local=True,
        avg_latency_ms=500,  # Fast local inference
        max_context_window=32000,
        cost_per_1k_input=0.0,
        cost_per_1k_output=0.0,
        reliability=0.99,  # Always available
    ),
    "anthropic": ProviderCapability(
        name="anthropic",
        models=["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
        is_local=False,
        avg_latency_ms=2000,
        max_context_window=200000,  # Claude's huge context
        cost_per_1k_input=0.3,  # $3/M tokens → 0.3 cents/1K
        cost_per_1k_output=1.5,  # $15/M tokens → 1.5 cents/1K
        reliability=0.98,
    ),
    "openai": ProviderCapability(
        name="openai",
        models=["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
        is_local=False,
        avg_latency_ms=1500,
        max_context_window=128000,
        cost_per_1k_input=0.25,  # $2.5/M tokens
        cost_per_1k_output=1.0,  # $10/M tokens
        reliability=0.97,
    ),
    "azure": ProviderCapability(
        name="azure",
        models=["gpt-4o", "gpt-4o-mini"],
        is_local=False,
        avg_latency_ms=1800,
        max_context_window=128000,
        cost_per_1k_input=0.25,
        cost_per_1k_output=1.0,
        reliability=0.99,  # Enterprise SLA
    ),
}


# Model-specific cost/performance tuning
MODEL_METADATA = {
    # Ollama models (free)
    "deepseek-coder:6.7b": {
        "quality": 0.75,
        "speed_multiplier": 1.0,
        "best_for": "code_review",
    },
    "qwen2.5-coder:7b": {
        "quality": 0.80,
        "speed_multiplier": 1.1,
        "best_for": "code_generation",
    },
    "llama3.2:3b": {
        "quality": 0.65,
        "speed_multiplier": 0.8,
        "best_for": "quick_checks",
    },
    
    # Anthropic models
    "claude-3-5-sonnet-20241022": {
        "quality": 0.98,
        "speed_multiplier": 1.0,
        "best_for": "critical_review",
    },
    "claude-3-5-haiku-20241022": {
        "quality": 0.85,
        "speed_multiplier": 0.6,
        "best_for": "balanced_tasks",
    },
    "claude-3-opus-20240229": {
        "quality": 1.0,
        "speed_multiplier": 1.5,
        "best_for": "highest_quality",
    },
    
    # OpenAI models
    "gpt-4o": {
        "quality": 0.95,
        "speed_multiplier": 1.0,
        "best_for": "general_tasks",
    },
    "gpt-4o-mini": {
        "quality": 0.80,
        "speed_multiplier": 0.7,
        "best_for": "cost_optimization",
    },
    "gpt-4-turbo": {
        "quality": 0.93,
        "speed_multiplier": 0.9,
        "best_for": "complex_reasoning",
    },
}


class ModelSelector:
    """
    Intelligent model selection based on request context.
    
    Decision Flow:
    1. Apply hard constraints (sensitivity, context length, cost)
    2. Score each valid provider/model combination
    3. Select highest-scoring option
    4. Return routing decision with reasoning
    
    Scoring weights based on request parameters:
    - CRITICAL priority → performance_score * 2
    - MINIMIZE cost → cost_score * 2
    - RESTRICTED sensitivity → sensitivity_score * 3
    - Large context → context_score * 2
    """
    
    def __init__(self, providers: dict[str, BaseProvider]) -> None:
        """
        Initialize model selector.
        
        Args:
            providers: Available LLM providers (key = name, value = provider instance)
        """
        self._providers = providers
    
    async def select(self, ctx: LLMRequestContext) -> RoutingDecision:
        """
        Select optimal provider and model.
        
        Args:
            ctx: Request context with routing hints
        
        Returns:
            Routing decision with selected provider, model, and reasoning
        """
        
        # Step 1: Honor user preference if specified
        if ctx.preferred_provider and ctx.preferred_model:
            provider_cap = PROVIDER_CAPABILITIES.get(ctx.preferred_provider)
            if provider_cap and ctx.preferred_model in provider_cap.models:
                logger.info(
                    f"[{ctx.trace_id}] Using user preference: "
                    f"{ctx.preferred_provider}:{ctx.preferred_model}"
                )
                return await self._build_decision(
                    ctx,
                    ctx.preferred_provider,
                    ctx.preferred_model,
                    reason="user_preference",
                )
        
        # Step 2: Apply sensitivity constraints
        if ctx.sensitivity in (SensitivityLevel.RESTRICTED, SensitivityLevel.CONFIDENTIAL):
            logger.info(
                f"[{ctx.trace_id}] {ctx.sensitivity} data → forcing Ollama"
            )
            return await self._select_ollama_model(ctx)
        
        # Step 3: Check context window requirements
        estimated_input_tokens = len(ctx.system_prompt + ctx.user_prompt) // 4
        if estimated_input_tokens > 100_000:
            # Only Claude can handle this
            logger.info(
                f"[{ctx.trace_id}] Large context ({estimated_input_tokens} tokens) → Claude"
            )
            if "anthropic" in self._providers:
                return await self._build_decision(
                    ctx,
                    "anthropic",
                    "claude-3-5-sonnet-20241022",
                    reason="large_context_window",
                )
        
        # Step 4: Score all available options
        candidates: list[tuple[float, str, str]] = []
        
        for provider_name, provider_cap in PROVIDER_CAPABILITIES.items():
            if provider_name not in self._providers:
                continue  # Provider not available
            
            for model in provider_cap.models:
                score = self._calculate_score(ctx, provider_cap, model)
                candidates.append((score, provider_name, model))
        
        if not candidates:
            # Fallback: use first available provider
            first_provider = next(iter(self._providers.values()))
            return await self._build_decision(
                ctx,
                first_provider.name,
                first_provider.get_default_model(),
                reason="fallback_default",
            )
        
        # Step 5: Select best candidate
        candidates.sort(reverse=True, key=lambda x: x[0])
        best_score, best_provider, best_model = candidates[0]
        
        logger.info(
            f"[{ctx.trace_id}] Selected {best_provider}:{best_model} "
            f"(score: {best_score:.2f})"
        )
        
        decision = await self._build_decision(
            ctx, best_provider, best_model, reason="optimal_score"
        )
        decision.total_score = best_score
        
        return decision
    
    def _calculate_score(
        self,
        ctx: LLMRequestContext,
        provider_cap: ProviderCapability,
        model: str,
    ) -> float:
        """
        Calculate score for provider/model combination.
        
        Returns:
            Score (0-100), higher is better
        """
        
        # Base scores
        sensitivity_score = self._score_sensitivity(ctx.sensitivity, provider_cap)
        cost_score = self._score_cost(ctx.cost_target, provider_cap)
        performance_score = self._score_performance(ctx.priority, provider_cap, model)
        context_score = self._score_context(ctx, provider_cap)
        
        # Apply weights based on request parameters
        weights = self._get_weights(ctx)
        
        total_score = (
            sensitivity_score * weights["sensitivity"] +
            cost_score * weights["cost"] +
            performance_score * weights["performance"] +
            context_score * weights["context"]
        )
        
        return total_score
    
    def _score_sensitivity(
        self, sensitivity: SensitivityLevel, provider_cap: ProviderCapability
    ) -> float:
        """Score based on data sensitivity (0-100)."""
        
        if sensitivity == SensitivityLevel.RESTRICTED:
            return 100.0 if provider_cap.is_local else 0.0
        
        if sensitivity == SensitivityLevel.CONFIDENTIAL:
            return 100.0 if provider_cap.is_local else 20.0
        
        if sensitivity == SensitivityLevel.INTERNAL:
            return 80.0 if provider_cap.is_local else 60.0
        
        # PUBLIC - any provider is fine
        return 70.0
    
    def _score_cost(self, cost_target: CostTarget, provider_cap: ProviderCapability) -> float:
        """Score based on cost optimization (0-100)."""
        
        if cost_target == CostTarget.MINIMIZE:
            # Free providers get max score
            if provider_cap.cost_per_1k_input == 0.0:
                return 100.0
            # Cheaper providers score higher
            # Normalize: $0.001/1K → 90, $0.01/1K → 10
            cost_score = max(0, 100 - (provider_cap.cost_per_1k_input * 1000))
            return cost_score
        
        if cost_target == CostTarget.QUALITY:
            # Cost doesn't matter much for quality target
            return 50.0
        
        # BALANCED - slight preference for cheaper
        if provider_cap.cost_per_1k_input == 0.0:
            return 85.0
        return max(20, 70 - (provider_cap.cost_per_1k_input * 100))
    
    def _score_performance(
        self,
        priority: RequestPriority,
        provider_cap: ProviderCapability,
        model: str,
    ) -> float:
        """Score based on performance requirements (0-100)."""
        
        model_meta = MODEL_METADATA.get(model, {"speed_multiplier": 1.0})
        effective_latency = provider_cap.avg_latency_ms * model_meta["speed_multiplier"]
        
        if priority == RequestPriority.CRITICAL:
            # Fast providers score highest
            # <1000ms → 100, >3000ms → 20
            if effective_latency < 1000:
                return 100.0
            return max(20, 100 - (effective_latency - 1000) / 40)
        
        if priority == RequestPriority.LOW:
            # Performance doesn't matter much
            return 60.0
        
        # NORMAL/HIGH - moderate performance preference
        if effective_latency < 1500:
            return 85.0
        return max(40, 85 - (effective_latency - 1500) / 50)
    
    def _score_context(
        self, ctx: LLMRequestContext, provider_cap: ProviderCapability
    ) -> float:
        """Score based on context window requirements (0-100)."""
        
        estimated_tokens = len(ctx.system_prompt + ctx.user_prompt) // 4
        estimated_tokens += ctx.context_token_count
        
        # Check if context fits
        if estimated_tokens > provider_cap.max_context_window:
            return 0.0  # Cannot handle this request
        
        # Score based on utilization (prefer not to max out context)
        utilization = estimated_tokens / provider_cap.max_context_window
        
        if utilization < 0.5:
            return 90.0  # Plenty of room
        if utilization < 0.7:
            return 70.0  # Comfortable
        if utilization < 0.9:
            return 50.0  # Getting tight
        return 30.0  # Very tight, risky
    
    def _get_weights(self, ctx: LLMRequestContext) -> dict[str, float]:
        """
        Get scoring weights based on request parameters.
        
        Returns:
            Dictionary with weights for each score component
        """
        
        weights = {
            "sensitivity": 1.0,
            "cost": 1.0,
            "performance": 1.0,
            "context": 0.5,
        }
        
        # Adjust based on priority
        if ctx.priority == RequestPriority.CRITICAL:
            weights["performance"] = 2.5
            weights["sensitivity"] = 0.8  # Relax for critical requests
        elif ctx.priority == RequestPriority.LOW:
            weights["cost"] = 1.8
            weights["performance"] = 0.5
        
        # Adjust based on cost target
        if ctx.cost_target == CostTarget.MINIMIZE:
            weights["cost"] = 2.5
            weights["performance"] = 0.5
        elif ctx.cost_target == CostTarget.QUALITY:
            weights["cost"] = 0.3
            weights["performance"] = 1.2
        
        # Adjust based on sensitivity
        if ctx.sensitivity in (SensitivityLevel.RESTRICTED, SensitivityLevel.CONFIDENTIAL):
            weights["sensitivity"] = 3.0  # Override everything else
        
        # Large context requirement
        if ctx.context_token_count > 50_000:
            weights["context"] = 2.0
        
        return weights
    
    async def _select_ollama_model(self, ctx: LLMRequestContext) -> RoutingDecision:
        """Select best Ollama model based on context."""
        
        # Default to deepseek-coder for code tasks
        model = "deepseek-coder:6.7b"
        reason = "sensitive_data_local_required"
        
        # If quick/low priority, use faster model
        if ctx.priority == RequestPriority.LOW:
            model = "llama3.2:3b"
            reason = "sensitive_data_local_fast"
        
        # If large context, use qwen
        if ctx.context_token_count > 10_000:
            model = "qwen2.5-coder:7b"
            reason = "sensitive_data_local_large_context"
        
        return await self._build_decision(ctx, "ollama", model, reason=reason)
    
    async def _build_decision(
        self,
        ctx: LLMRequestContext,
        provider_name: str,
        model: str,
        reason: str,
    ) -> RoutingDecision:
        """Build routing decision with cost/latency estimates."""
        
        provider_cap = PROVIDER_CAPABILITIES.get(
            provider_name,
            ProviderCapability(
                name=provider_name,
                models=[model],
                is_local=False,
                avg_latency_ms=2000,
                max_context_window=100000,
                cost_per_1k_input=0.3,
                cost_per_1k_output=1.5,
                reliability=0.95,
            ),
        )
        
        # Estimate tokens and cost
        estimated_input_tokens = len(ctx.system_prompt + ctx.user_prompt) // 4
        estimated_input_tokens += ctx.context_token_count
        estimated_output_tokens = ctx.max_tokens
        
        estimated_cost = (
            (estimated_input_tokens / 1000) * provider_cap.cost_per_1k_input +
            (estimated_output_tokens / 1000) * provider_cap.cost_per_1k_output
        )
        
        model_meta = MODEL_METADATA.get(model, {"speed_multiplier": 1.0})
        estimated_latency = int(
            provider_cap.avg_latency_ms * model_meta["speed_multiplier"]
        )
        
        return RoutingDecision(
            provider=provider_name,
            model=model,
            reason=reason,
            estimated_cost=estimated_cost,
            estimated_latency_ms=estimated_latency,
            confidence=0.85,  # Default confidence
        )

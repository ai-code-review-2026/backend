"""
Cost Optimizer - Suggest cheaper alternatives while maintaining quality.

Strategy:
1. Compare selected model against cheaper alternatives
2. Check if cheaper model meets quality threshold
3. Respect critical requests (never downgrade)
4. Track cost savings for metrics

Quality Thresholds:
- CRITICAL priority: No downgrade allowed
- HIGH priority: Only downgrade if quality >= 0.9
- NORMAL priority: Allow downgrade if quality >= 0.75
- LOW priority: Always suggest cheapest option

Cost Comparison:
- Calculate estimated cost for all suitable models
- Rank by cost while respecting quality constraints
- Return cheapest option that meets requirements
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.gateway.request_context import (
    CostTarget,
    LLMRequestContext,
    RequestPriority,
)
from app.routing.model_selector import (
    MODEL_METADATA,
    PROVIDER_CAPABILITIES,
    RoutingDecision,
)

if TYPE_CHECKING:
    from app.providers.base import BaseProvider

logger = logging.getLogger(__name__)


@dataclass
class CostAlternative:
    """Alternative routing option with cost savings."""
    
    provider: str
    model: str
    estimated_cost: float  # cents
    savings_cents: float
    savings_percent: float
    quality_score: float  # 0-1
    reason: str


class CostOptimizer:
    """
    Optimize LLM costs by suggesting cheaper alternatives.
    
    Decision Flow:
    1. Check if optimization is appropriate (respect priority)
    2. Find cheaper alternatives that meet quality threshold
    3. Compare costs and quality
    4. Return best cost-optimized option
    
    Quality Preservation:
    - CRITICAL: Never downgrade
    - HIGH: Only minor downgrades (quality >= 0.9)
    - NORMAL: Moderate downgrades OK (quality >= 0.75)
    - LOW: Maximize cost savings (quality >= 0.6)
    """
    
    def __init__(self, providers: dict[str, BaseProvider]) -> None:
        """
        Initialize cost optimizer.
        
        Args:
            providers: Available LLM providers
        """
        self._providers = providers
    
    async def optimize(
        self,
        ctx: LLMRequestContext,
        current_routing: RoutingDecision,
    ) -> RoutingDecision | None:
        """
        Find cheaper alternative if appropriate.
        
        Args:
            ctx: Request context
            current_routing: Current routing decision from model selector
        
        Returns:
            Cheaper routing decision, or None if current is optimal
        """
        
        # Step 1: Check if optimization is appropriate
        if not self._should_optimize(ctx, current_routing):
            logger.debug(
                f"[{ctx.trace_id}] Cost optimization skipped: "
                f"priority={ctx.priority}, cost_target={ctx.cost_target}"
            )
            return None
        
        # Step 2: Find cheaper alternatives
        alternatives = await self._find_alternatives(ctx, current_routing)
        
        if not alternatives:
            logger.debug(
                f"[{ctx.trace_id}] No cheaper alternatives found"
            )
            return None
        
        # Step 3: Select best alternative
        best_alternative = self._select_best_alternative(
            ctx, current_routing, alternatives
        )
        
        if not best_alternative:
            return None
        
        logger.info(
            f"[{ctx.trace_id}] Cost optimization: "
            f"{current_routing.provider}:{current_routing.model} → "
            f"{best_alternative.provider}:{best_alternative.model} "
            f"(save ${best_alternative.savings_cents/100:.4f}, "
            f"-{best_alternative.savings_percent:.1f}%)"
        )
        
        # Build optimized routing decision
        return RoutingDecision(
            provider=best_alternative.provider,
            model=best_alternative.model,
            reason=f"cost_optimized_{best_alternative.reason}",
            estimated_cost=best_alternative.estimated_cost,
            estimated_latency_ms=current_routing.estimated_latency_ms,
            confidence=0.80,  # Slightly lower confidence for optimized
        )
    
    def _should_optimize(
        self,
        ctx: LLMRequestContext,
        current_routing: RoutingDecision,
    ) -> bool:
        """Check if cost optimization should be attempted."""
        
        # Never downgrade critical requests
        if ctx.priority == RequestPriority.CRITICAL:
            return False
        
        # Don't optimize if user explicitly wants quality
        if ctx.cost_target == CostTarget.QUALITY:
            return False
        
        # Don't optimize if user specified a preference
        if ctx.preferred_provider or ctx.preferred_model:
            return False
        
        # Don't optimize if current cost is already minimal
        if current_routing.estimated_cost < 0.1:  # Less than 0.1 cents
            return False
        
        # Don't optimize if already using Ollama (free)
        if current_routing.provider == "ollama":
            return False
        
        return True
    
    async def _find_alternatives(
        self,
        ctx: LLMRequestContext,
        current_routing: RoutingDecision,
    ) -> list[CostAlternative]:
        """
        Find cheaper alternatives that meet quality threshold.
        
        Returns:
            List of cost alternatives, sorted by savings (highest first)
        """
        
        alternatives: list[CostAlternative] = []
        
        current_model_meta = MODEL_METADATA.get(
            current_routing.model,
            {"quality": 0.85},
        )
        current_quality = current_model_meta.get("quality", 0.85)
        
        # Determine minimum acceptable quality
        min_quality = self._get_min_quality_threshold(ctx.priority)
        
        # Estimate tokens for cost calculation
        estimated_input_tokens = len(ctx.system_prompt + ctx.user_prompt) // 4
        estimated_input_tokens += ctx.context_token_count
        estimated_output_tokens = ctx.max_tokens
        
        # Check all available providers/models
        for provider_name, provider_cap in PROVIDER_CAPABILITIES.items():
            if provider_name not in self._providers:
                continue
            
            for model in provider_cap.models:
                # Skip if this is the current selection
                if (provider_name == current_routing.provider and 
                    model == current_routing.model):
                    continue
                
                # Check quality threshold
                model_meta = MODEL_METADATA.get(model, {"quality": 0.7})
                model_quality = model_meta.get("quality", 0.7)
                
                if model_quality < min_quality:
                    continue  # Not good enough
                
                # Calculate cost
                estimated_cost = (
                    (estimated_input_tokens / 1000) * provider_cap.cost_per_1k_input +
                    (estimated_output_tokens / 1000) * provider_cap.cost_per_1k_output
                )
                
                # Only include if actually cheaper
                if estimated_cost >= current_routing.estimated_cost:
                    continue
                
                savings = current_routing.estimated_cost - estimated_cost
                savings_percent = (savings / max(current_routing.estimated_cost, 0.01)) * 100
                
                # Determine reason for this alternative
                reason = self._get_alternative_reason(
                    provider_name,
                    model,
                    current_routing,
                    model_quality,
                    current_quality,
                )
                
                alternatives.append(
                    CostAlternative(
                        provider=provider_name,
                        model=model,
                        estimated_cost=estimated_cost,
                        savings_cents=savings,
                        savings_percent=savings_percent,
                        quality_score=model_quality,
                        reason=reason,
                    )
                )
        
        # Sort by savings (highest first)
        alternatives.sort(key=lambda x: x.savings_cents, reverse=True)
        
        return alternatives
    
    def _get_min_quality_threshold(self, priority: RequestPriority) -> float:
        """Get minimum acceptable quality score based on priority."""
        
        thresholds = {
            RequestPriority.CRITICAL: 1.0,  # Never downgrade (impossible to beat)
            RequestPriority.HIGH: 0.90,
            RequestPriority.NORMAL: 0.75,
            RequestPriority.LOW: 0.60,
        }
        
        return thresholds.get(priority, 0.75)
    
    def _select_best_alternative(
        self,
        ctx: LLMRequestContext,
        current_routing: RoutingDecision,
        alternatives: list[CostAlternative],
    ) -> CostAlternative | None:
        """
        Select best alternative based on cost/quality tradeoff.
        
        Strategy:
        - MINIMIZE cost_target: Take cheapest option
        - BALANCED cost_target: Balance savings vs quality loss
        - HIGH priority: Only take if savings > 30% AND quality close
        """
        
        if not alternatives:
            return None
        
        # MINIMIZE cost target: take cheapest (already sorted)
        if ctx.cost_target == CostTarget.MINIMIZE:
            return alternatives[0]
        
        # BALANCED cost target: prefer good savings with minimal quality loss
        # Score each alternative: savings_percent * quality_score
        scored_alternatives = [
            (alt, alt.savings_percent * alt.quality_score)
            for alt in alternatives
        ]
        scored_alternatives.sort(key=lambda x: x[1], reverse=True)
        
        best_alternative = scored_alternatives[0][0]
        
        # For HIGH priority, require significant savings
        if ctx.priority == RequestPriority.HIGH:
            if best_alternative.savings_percent < 30.0:
                logger.debug(
                    f"[{ctx.trace_id}] Alternative savings too small for HIGH priority "
                    f"({best_alternative.savings_percent:.1f}% < 30%)"
                )
                return None
        
        return best_alternative
    
    def _get_alternative_reason(
        self,
        provider: str,
        model: str,
        current_routing: RoutingDecision,
        alt_quality: float,
        current_quality: float,
    ) -> str:
        """Generate reason string for alternative selection."""
        
        quality_diff = current_quality - alt_quality
        
        if provider == "ollama":
            return "free_local_model"
        
        if quality_diff < 0.05:
            return "equivalent_quality_cheaper"
        
        if quality_diff < 0.15:
            return "minor_quality_tradeoff"
        
        return "significant_cost_savings"
    
    async def compare_costs(
        self,
        ctx: LLMRequestContext,
        providers_to_compare: list[str] | None = None,
    ) -> dict[str, dict[str, float]]:
        """
        Compare estimated costs across all providers/models.
        
        Useful for analytics and cost reporting.
        
        Args:
            ctx: Request context
            providers_to_compare: Optional list of provider names to compare
        
        Returns:
            Dict mapping provider -> model -> estimated_cost_cents
        """
        
        if providers_to_compare is None:
            providers_to_compare = list(self._providers.keys())
        
        # Estimate tokens
        estimated_input_tokens = len(ctx.system_prompt + ctx.user_prompt) // 4
        estimated_input_tokens += ctx.context_token_count
        estimated_output_tokens = ctx.max_tokens
        
        results: dict[str, dict[str, float]] = {}
        
        for provider_name in providers_to_compare:
            if provider_name not in PROVIDER_CAPABILITIES:
                continue
            
            provider_cap = PROVIDER_CAPABILITIES[provider_name]
            results[provider_name] = {}
            
            for model in provider_cap.models:
                cost = (
                    (estimated_input_tokens / 1000) * provider_cap.cost_per_1k_input +
                    (estimated_output_tokens / 1000) * provider_cap.cost_per_1k_output
                )
                results[provider_name][model] = cost
        
        return results
    
    def calculate_savings(
        self,
        original_cost: float,
        optimized_cost: float,
    ) -> dict[str, float]:
        """
        Calculate cost savings metrics.
        
        Returns:
            Dict with absolute_savings, percent_savings, roi
        """
        
        savings = original_cost - optimized_cost
        percent = (savings / max(original_cost, 0.01)) * 100
        
        return {
            "absolute_savings_cents": savings,
            "percent_savings": percent,
            "original_cost_cents": original_cost,
            "optimized_cost_cents": optimized_cost,
        }

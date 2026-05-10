"""
LLM API Gateway - Intelligent routing, fallback, and observability layer.

Architecture:
    Request → Gateway → Model Selector → Cost Optimizer → Rate Limiter
           → Provider → Response → Trace Service → Metrics

Features:
- Multi-provider abstraction (Ollama, Anthropic, OpenAI, Azure)
- Intelligent routing (sensitivity-aware, cost-optimized)
- Automatic fallback on provider failure
- Rate limiting per provider
- Prompt caching
- Full observability (traces, metrics, costs)
- Streaming support

Usage:
    from app.gateway.api_gateway import get_gateway
    
    gateway = get_gateway()
    ctx = LLMRequestContext(
        user_prompt="Analyze this code",
        sensitivity=SensitivityLevel.CONFIDENTIAL,
    )
    response = await gateway.generate(ctx)
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, AsyncGenerator, Protocol

from app.gateway.request_context import (
    CostTarget,
    LLMRequestContext,
    RequestPriority,
    SensitivityLevel,
)

if TYPE_CHECKING:
    from app.routing import CostOptimizer, FallbackManager, ModelSelector

logger = logging.getLogger(__name__)


class LLMProvider(Protocol):
    """
    Protocol for LLM providers.
    
    All providers must implement:
    - generate() for standard completion
    - stream() for streaming completion
    - get_cost() for cost estimation
    """
    
    async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
        """Generate completion, returns updated context."""
        ...
    
    async def stream(self, ctx: LLMRequestContext) -> AsyncGenerator[str, None]:
        """Stream completion tokens."""
        ...
    
    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        """Estimate cost in cents."""
        ...
    
    @property
    def name(self) -> str:
        """Provider name."""
        ...
    
    @property
    def available_models(self) -> list[str]:
        """List of available models."""
        ...


class LLMGateway:
    """
    LLM Gateway - Central orchestrator for all LLM operations.
    
    Responsibilities:
    1. Provider selection (based on sensitivity, cost, performance)
    2. Automatic fallback (if primary provider fails)
    3. Rate limiting (per provider)
    4. Prompt caching (avoid duplicate calls)
    5. Observability (trace every request)
    6. Cost tracking (per request, per user, per project)
    
    Provider Selection Strategy:
    
    Sensitivity-based routing:
    - RESTRICTED/CONFIDENTIAL → Ollama (local only)
    - INTERNAL → Prefer Ollama, fallback to cloud
    - PUBLIC → Any provider
    
    Cost-based routing:
    - MINIMIZE → Cheapest model (Ollama > OpenAI > Anthropic)
    - BALANCED → Balance quality/cost (Claude Haiku, GPT-4o-mini)
    - QUALITY → Best model (Claude Sonnet, GPT-4)
    
    Performance-based routing:
    - CRITICAL priority → Fastest provider
    - Context > 100K tokens → Claude (200K window)
    - Quick review → Local Ollama
    
    Fallback Chain:
    1. Primary provider (selected by routing)
    2. Secondary provider (if primary fails)
    3. Tertiary provider (last resort)
    4. Error (if all fail)
    
    Example:
        Primary: Anthropic Claude (high quality)
        Secondary: OpenAI GPT-4 (backup)
        Tertiary: Ollama (always available)
    """
    
    def __init__(
        self,
        providers: dict[str, LLMProvider],
        model_selector: ModelSelector,
        cost_optimizer: CostOptimizer,
        fallback_manager: FallbackManager,
        rate_limiter: RateLimiter,
        prompt_cache: PromptCache,
        trace_service: TraceService,
        metrics_service: MetricsService,
    ) -> None:
        self._providers = providers
        self._model_selector = model_selector
        self._cost_optimizer = cost_optimizer
        self._fallback_manager = fallback_manager
        self._rate_limiter = rate_limiter
        self._prompt_cache = prompt_cache
        self._trace_service = trace_service
        self._metrics_service = metrics_service
    
    async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
        """
        Generate LLM completion with intelligent routing.
        
        Flow:
        1. Check prompt cache (avoid duplicate calls)
        2. Select provider + model (routing logic)
        3. Optimize cost (suggest cheaper alternatives if appropriate)
        4. Check rate limit (per provider)
        5. Execute request (with fallback on failure)
        6. Log trace (observability)
        7. Update metrics (cost, latency, tokens)
        8. Cache result (for future requests)
        
        Args:
            ctx: Request context with prompt, preferences, constraints
        
        Returns:
            Updated context with response, tokens, cost, metrics
        """
        from app.api.websockets.progress_broadcaster import broadcast_llm_progress
        
        # Broadcast: Routing started
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="routing_started",
            data={
                "sensitivity": ctx.sensitivity.value if ctx.sensitivity else None,
                "cost_target": ctx.cost_target.value if ctx.cost_target else None,
                "priority": ctx.priority.value if ctx.priority else None,
            }
        )
        
        # Step 1: Check cache
        cached = await self._prompt_cache.get(ctx)
        
        # Broadcast: Cache checked
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="cache_checked",
            data={"hit": cached is not None}
        )
        
        if cached:
            logger.info(f"[{ctx.trace_id}] Cache HIT")
            ctx.tags["cache_hit"] = "true"
            await self._metrics_service.record_cache_hit(ctx)
            return cached
        
        # Step 2: Select provider + model
        routing = await self._model_selector.select(ctx)
        ctx.selected_provider = routing.provider
        ctx.selected_model = routing.model
        ctx.routing_reason = routing.reason
        
        logger.info(
            f"[{ctx.trace_id}] Routing → {routing.provider}:{routing.model} "
            f"(reason: {routing.reason})"
        )
        
        # Broadcast: Routing completed
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="routing_completed",
            data={
                "provider": routing.provider,
                "model": routing.model,
                "reason": routing.reason,
            }
        )
        
        # Step 3: Cost optimization
        if ctx.cost_target == CostTarget.MINIMIZE:
            optimized = await self._cost_optimizer.optimize(ctx, routing)
            if optimized and optimized.estimated_cost < routing.estimated_cost:
                logger.info(
                    f"[{ctx.trace_id}] Cost optimization: "
                    f"{routing.provider}:{routing.model} → {optimized.provider}:{optimized.model} "
                    f"(${routing.estimated_cost:.4f} → ${optimized.estimated_cost:.4f})"
                )
                routing = optimized
                ctx.selected_provider = routing.provider
                ctx.selected_model = routing.model
        
        # Step 4: Rate limiting
        allowed = await self._rate_limiter.check_and_acquire(
            provider=ctx.selected_provider,
            user_id=ctx.user_id,
        )
        
        # Broadcast: Rate limit checked
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="rate_limit_checked",
            data={"allowed": allowed, "provider": ctx.selected_provider}
        )
        
        if not allowed:
            ctx.mark_failed("Rate limit exceeded")
            await broadcast_llm_progress(
                trace_id=ctx.trace_id,
                event="error",
                data={"error": "rate_limit_exceeded", "provider": ctx.selected_provider}
            )
            await self._trace_service.log_trace(ctx)
            return ctx
        
        # Step 5: Execute with fallback
        provider = self._providers.get(ctx.selected_provider)
        if not provider:
            error_msg = f"Provider {ctx.selected_provider} not available"
            ctx.mark_failed(error_msg)
            await broadcast_llm_progress(
                trace_id=ctx.trace_id,
                event="error",
                data={"error": "provider_not_available", "provider": ctx.selected_provider}
            )
            await self._trace_service.log_trace(ctx)
            return ctx
        
        # Broadcast: Provider selected
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="provider_selected",
            data={"provider": ctx.selected_provider, "model": ctx.selected_model}
        )
        
        # Broadcast: Generation started
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="generation_started",
            data={"provider": ctx.selected_provider, "model": ctx.selected_model}
        )
        
        try:
            ctx = await provider.generate(ctx)
            ctx.mark_completed(ctx.duration_ms or 0)
            
            # Broadcast: Generation completed
            await broadcast_llm_progress(
                trace_id=ctx.trace_id,
                event="generation_completed",
                data={
                    "provider": ctx.selected_provider,
                    "model": ctx.selected_model,
                    "input_tokens": ctx.input_tokens,
                    "output_tokens": ctx.output_tokens,
                    "duration_ms": ctx.duration_ms,
                    "cost_cents": ctx.actual_cost_cents,
                }
            )
        except Exception as exc:
            logger.warning(
                f"[{ctx.trace_id}] Provider {ctx.selected_provider} failed: {exc}"
            )
            
            # Broadcast: Error
            await broadcast_llm_progress(
                trace_id=ctx.trace_id,
                event="error",
                data={
                    "error": "provider_failed",
                    "provider": ctx.selected_provider,
                    "message": str(exc),
                }
            )
            
            # Attempt fallback
            fallback_provider = await self._fallback_manager.get_fallback(
                failed_provider=ctx.selected_provider,
                ctx=ctx,
            )
            
            if fallback_provider:
                logger.info(
                    f"[{ctx.trace_id}] Falling back to {fallback_provider.name}"
                )
                ctx.fallback_used = True
                ctx.fallback_provider = fallback_provider.name
                ctx.retry_count += 1
                
                # Broadcast: Fallback attempt
                await broadcast_llm_progress(
                    trace_id=ctx.trace_id,
                    event="provider_selected",
                    data={
                        "provider": fallback_provider.name,
                        "model": ctx.selected_model,
                        "fallback": True,
                    }
                )
                
                await broadcast_llm_progress(
                    trace_id=ctx.trace_id,
                    event="generation_started",
                    data={
                        "provider": fallback_provider.name,
                        "model": ctx.selected_model,
                        "fallback": True,
                    }
                )
                
                try:
                    ctx = await fallback_provider.generate(ctx)
                    ctx.mark_completed(ctx.duration_ms or 0)
                    
                    # Broadcast: Fallback generation completed
                    await broadcast_llm_progress(
                        trace_id=ctx.trace_id,
                        event="generation_completed",
                        data={
                            "provider": fallback_provider.name,
                            "model": ctx.selected_model,
                            "input_tokens": ctx.input_tokens,
                            "output_tokens": ctx.output_tokens,
                            "duration_ms": ctx.duration_ms,
                            "cost_cents": ctx.actual_cost_cents,
                            "fallback": True,
                        }
                    )
                except Exception as fallback_exc:
                    ctx.mark_failed(f"Fallback failed: {fallback_exc}")
                    await broadcast_llm_progress(
                        trace_id=ctx.trace_id,
                        event="error",
                        data={
                            "error": "fallback_failed",
                            "provider": fallback_provider.name,
                            "message": str(fallback_exc),
                        }
                    )
            else:
                ctx.mark_failed(f"No fallback available: {exc}")
                await broadcast_llm_progress(
                    trace_id=ctx.trace_id,
                    event="error",
                    data={"error": "no_fallback_available", "message": str(exc)}
                )
        
        # Step 6: Log trace
        await self._trace_service.log_trace(ctx)
        
        # Broadcast: Trace logged
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="trace_logged",
            data={"trace_id": ctx.trace_id}
        )
        
        # Step 7: Update metrics
        await self._metrics_service.record_request(ctx)
        
        # Step 8: Cache result (if successful)
        if ctx.response_content and not ctx.error:
            await self._prompt_cache.set(ctx)
        
        return ctx
    
    async def stream(
        self, ctx: LLMRequestContext
    ) -> AsyncGenerator[str, None]:
        """
        Stream LLM completion.
        
        Note: Streaming bypasses cache and some optimizations
        for real-time response.
        """
        from app.api.websockets.progress_broadcaster import broadcast_llm_progress
        
        # Broadcast: Routing started
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="routing_started",
            data={
                "streaming": True,
                "sensitivity": ctx.sensitivity.value if ctx.sensitivity else None,
            }
        )
        
        # Select provider
        routing = await self._model_selector.select(ctx)
        ctx.selected_provider = routing.provider
        ctx.selected_model = routing.model
        
        # Broadcast: Routing completed
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="routing_completed",
            data={
                "provider": routing.provider,
                "model": routing.model,
                "streaming": True,
            }
        )
        
        # Rate limiting
        allowed = await self._rate_limiter.check_and_acquire(
            provider=ctx.selected_provider,
            user_id=ctx.user_id,
        )
        
        # Broadcast: Rate limit checked
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="rate_limit_checked",
            data={"allowed": allowed, "provider": ctx.selected_provider}
        )
        
        if not allowed:
            await broadcast_llm_progress(
                trace_id=ctx.trace_id,
                event="error",
                data={"error": "rate_limit_exceeded"}
            )
            yield f"Error: Rate limit exceeded"
            return
        
        # Stream
        provider = self._providers.get(ctx.selected_provider)
        if not provider:
            await broadcast_llm_progress(
                trace_id=ctx.trace_id,
                event="error",
                data={"error": "provider_not_available", "provider": ctx.selected_provider}
            )
            yield f"Error: Provider {ctx.selected_provider} not available"
            return
        
        # Broadcast: Provider selected and generation started
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="provider_selected",
            data={"provider": ctx.selected_provider, "model": ctx.selected_model}
        )
        
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="generation_started",
            data={"provider": ctx.selected_provider, "model": ctx.selected_model, "streaming": True}
        )
        
        try:
            token_count = 0
            async for token in provider.stream(ctx):
                token_count += 1
                yield token
                
                # Broadcast token progress every 10 tokens to avoid flooding
                if token_count % 10 == 0:
                    await broadcast_llm_progress(
                        trace_id=ctx.trace_id,
                        event="tokens_streaming",
                        data={"tokens_received": token_count}
                    )
            
            # Broadcast: Generation completed
            await broadcast_llm_progress(
                trace_id=ctx.trace_id,
                event="generation_completed",
                data={
                    "provider": ctx.selected_provider,
                    "model": ctx.selected_model,
                    "tokens_received": token_count,
                    "streaming": True,
                }
            )
        except Exception as exc:
            await broadcast_llm_progress(
                trace_id=ctx.trace_id,
                event="error",
                data={"error": "streaming_failed", "message": str(exc)}
            )
            yield f"Error: {exc}"
        finally:
            # Log trace even for streaming
            await self._trace_service.log_trace(ctx)
            
            # Broadcast: Trace logged
            await broadcast_llm_progress(
                trace_id=ctx.trace_id,
                event="trace_logged",
                data={"trace_id": ctx.trace_id}
            )


# ─── Dependency Injection ────────────────────────────────────────────────────


_gateway_instance: LLMGateway | None = None


def get_gateway() -> LLMGateway:
    """Get singleton gateway instance."""
    global _gateway_instance
    
    if _gateway_instance is None:
        # Import here to avoid circular dependency
        from app.gateway.dependency_container import create_gateway
        
        _gateway_instance = create_gateway()
    
    return _gateway_instance


# ─── Service Implementations ─────────────────────────────────────────────────

from typing import Any


class RateLimiter:
    """
    Rate limiter for LLM requests.
    
    TODO: Implement per-provider, per-user rate limiting.
    For now, always allows requests.
    """
    async def check_and_acquire(self, provider: str, user_id: str | None) -> bool:
        # Always allow for now - implement proper rate limiting later
        return True


class PromptCache:
    """
    Prompt cache for avoiding duplicate LLM calls.
    
    TODO: Implement Redis-based prompt caching.
    For now, no caching.
    """
    async def get(self, ctx: LLMRequestContext) -> LLMRequestContext | None:
        # No caching for now
        return None
    
    async def set(self, ctx: LLMRequestContext) -> None:
        # No caching for now
        pass


class TraceService:
    """
    Trace service for logging individual LLM requests.
    
    Delegates to app.observability.trace_service.
    """
    async def log_trace(self, ctx: LLMRequestContext) -> None:
        from app.observability import log_trace
        
        try:
            await log_trace(ctx)
        except Exception as exc:
            logger.error(f"Failed to log trace {ctx.trace_id}: {exc}")
            # Don't raise - observability failures shouldn't break the main flow


class MetricsService:
    """
    Metrics service for aggregated LLM metrics.
    
    Delegates to app.observability.metrics_service.
    """
    async def record_cache_hit(self, ctx: LLMRequestContext) -> None:
        # Cache hits are tracked separately - could be added to metrics later
        logger.debug(f"Cache hit for trace {ctx.trace_id}")
    
    async def record_request(self, ctx: LLMRequestContext) -> None:
        from app.observability import record_request
        
        try:
            await record_request(ctx)
        except Exception as exc:
            logger.error(f"Failed to record metrics for trace {ctx.trace_id}: {exc}")
            # Don't raise - observability failures shouldn't break the main flow

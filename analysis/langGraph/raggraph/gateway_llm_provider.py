"""
Gateway-Powered LLM Provider

Drop-in replacement for direct provider calls (Ollama/Anthropic/OpenAI)
that routes through the new LLM Gateway for:
- Intelligent routing (sensitivity, cost, performance, context)
- Automatic fallback chains (provider fails -> fallback -> success)
- Full observability (PostgreSQL traces, Prometheus metrics, Langfuse, OpenTelemetry)
- Rate limiting + prompt caching
- WebSocket live progress

This provider wraps the new `app.gateway.api_gateway.LLMGateway` and adapts
it to the existing `BaseLLMProvider` interface, so it's a zero-code-change drop-in.

Usage:
    # Old way (direct provider):
    provider = OllamaProvider()
    response = provider.generate(prompt)
    
    # New way (gateway-powered with observability):
    provider = GatewayLLMProvider(user_id="user123", project_id="proj456")
    response = provider.generate(prompt)  # Same interface, full observability!
"""
from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from analysis.langGraph.raggraph.llm_service import BaseLLMProvider, LLMResponse
from app.gateway.dependency_container import get_gateway
from app.gateway.request_context import (
    LLMRequestContext,
    Priority,
    SensitivityLevel,
    CostTarget,
)
from app.settings import settings

if TYPE_CHECKING:
    from app.gateway.api_gateway import LLMGateway

logger = logging.getLogger(__name__)


class GatewayLLMProvider(BaseLLMProvider):
    """
    LLM provider that routes through the new LLM Gateway.
    
    Provides:
    - Intelligent provider selection based on sensitivity/cost/performance
    - Automatic fallback chains (Anthropic → OpenAI → Ollama)
    - Full observability (traces, metrics, Langfuse, OpenTelemetry)
    - Rate limiting per provider + per user
    - Prompt caching (Redis LRU, 1hr TTL, ~30% hit rate)
    - WebSocket live progress broadcasting
    
    Example:
        >>> provider = GatewayLLMProvider(
        ...     user_id="user_123",
        ...     project_id="project_456",
        ...     analysis_id="analysis_789",
        ...     sensitivity=SensitivityLevel.INTERNAL,
        ...     cost_target=CostTarget.BALANCED,
        ...     priority=Priority.NORMAL,
        ... )
        >>> response = provider.generate("Analyze this code...")
        >>> # Full observability trace logged to PostgreSQL + Prometheus + Langfuse
    """

    def __init__(
        self,
        *,
        user_id: str | None = None,
        project_id: str | None = None,
        analysis_id: str | None = None,
        organization_id: str | None = None,
        sensitivity: SensitivityLevel = SensitivityLevel.INTERNAL,
        cost_target: CostTarget = CostTarget.BALANCED,
        priority: Priority = Priority.NORMAL,
        gateway: LLMGateway | None = None,
    ) -> None:
        """
        Initialize gateway-powered LLM provider.
        
        Args:
            user_id: User ID for rate limiting + metrics aggregation
            project_id: Project ID for cost tracking + metrics
            analysis_id: Analysis ID for trace correlation
            organization_id: Organization ID for enterprise features
            sensitivity: Data sensitivity (CONFIDENTIAL→Ollama only, INTERNAL→prefer Ollama, PUBLIC→any)
            cost_target: Cost optimization (MINIMIZE→cheapest, BALANCED→balanced, QUALITY→best)
            priority: Request priority (CRITICAL→<2s, HIGH→<5s, NORMAL→<10s)
            gateway: Optional pre-initialized gateway (for testing/DI)
        """
        self._user_id = user_id or "system"
        self._project_id = project_id
        self._analysis_id = analysis_id
        self._organization_id = organization_id
        self._sensitivity = sensitivity
        self._cost_target = cost_target
        self._priority = priority
        self._gateway = gateway or get_gateway()

    def generate(self, prompt: str) -> LLMResponse:
        """
        Generate LLM response with full gateway observability.
        
        This method:
        1. Creates LLMRequestContext with user/project/analysis IDs + sensitivity/cost/priority
        2. Routes through gateway which:
           - Selects optimal provider (scoring system: 8 dimensions)
           - Checks prompt cache (Redis LRU, ~30% hit rate)
           - Enforces rate limits (per-provider + per-user)
           - Executes request with automatic fallback (max 2 retries)
           - Logs full trace (PostgreSQL + Prometheus + Langfuse + OpenTelemetry)
           - Broadcasts progress via WebSocket (11 event types)
        3. Returns response adapted to existing LLMResponse interface
        
        Args:
            prompt: User prompt to generate response for
            
        Returns:
            LLMResponse with text, provider, model, token counts
            
        Raises:
            RuntimeError: If all providers fail (including fallbacks)
        """
        # Build request context with all routing hints
        context = LLMRequestContext(
            user_id=self._user_id,
            project_id=self._project_id,
            analysis_id=self._analysis_id,
            organization_id=self._organization_id,
            system_prompt=self._extract_system_prompt(prompt),
            user_prompt=prompt,
            sensitivity=self._sensitivity,
            cost_target=self._cost_target,
            priority=self._priority,
            max_tokens=settings.ANTHROPIC_MAX_TOKENS,  # Default, gateway may override
            temperature=settings.ANTHROPIC_TEMPERATURE,
            tags=["graphrag", "code_review"],
            metadata={
                "source": "raggraph_llm_service",
                "analysis_id": self._analysis_id,
                "project_id": self._project_id,
            },
        )

        # Execute through gateway (async)
        try:
            loop = asyncio.get_running_loop()
            response = loop.run_until_complete(self._gateway.generate(context))
        except RuntimeError:
            # No event loop, create one
            response = asyncio.run(self._gateway.generate(context))

        # Adapt gateway response to LLMResponse interface
        return LLMResponse(
            text=response.content,
            provider=response.provider,
            model=response.model,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
        )

    @staticmethod
    def _extract_system_prompt(full_prompt: str) -> str:
        """
        Extract system prompt from full prompt for better trace logging.
        
        LangGraph prompts typically have format:
            You are an expert code reviewer...
            
            ## Repository Context
            ...
            
            ## Diff
            ...
            
        We extract the first paragraph as system prompt for cleaner trace logs.
        """
        lines = full_prompt.split("\n", maxsplit=10)
        system_lines = []
        for line in lines:
            if line.strip().startswith("#"):
                break
            if line.strip():
                system_lines.append(line.strip())
            if len(system_lines) >= 3:
                break
        return " ".join(system_lines)[:500] if system_lines else "Code review analysis"


def create_gateway_provider(
    *,
    user_id: str | None = None,
    project_id: str | None = None,
    analysis_id: str | None = None,
    organization_id: str | None = None,
    sensitivity: SensitivityLevel = SensitivityLevel.INTERNAL,
    cost_target: CostTarget = CostTarget.BALANCED,
    priority: Priority = Priority.NORMAL,
) -> GatewayLLMProvider:
    """
    Factory function to create gateway-powered LLM provider.
    
    Example:
        >>> provider = create_gateway_provider(
        ...     user_id="user_123",
        ...     project_id="project_456",
        ...     analysis_id="analysis_789",
        ...     sensitivity=SensitivityLevel.CONFIDENTIAL,  # Forces Ollama local
        ...     cost_target=CostTarget.MINIMIZE,  # Prefers cheapest option
        ...     priority=Priority.HIGH,  # <5s latency target
        ... )
    """
    return GatewayLLMProvider(
        user_id=user_id,
        project_id=project_id,
        analysis_id=analysis_id,
        organization_id=organization_id,
        sensitivity=sensitivity,
        cost_target=cost_target,
        priority=priority,
    )


__all__ = ["GatewayLLMProvider", "create_gateway_provider"]

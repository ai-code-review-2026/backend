"""
Base Provider Protocol - Abstract interface for all LLM providers.

All providers must implement:
- generate() - Standard completion
- stream() - Streaming completion  
- estimate_cost() - Cost calculation
- Properties: name, available_models, max_context_window
"""

from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncGenerator

from app.gateway.request_context import LLMRequestContext


@dataclass
class ProviderModel:
    """Model metadata."""
    
    name: str
    display_name: str
    max_context_tokens: int
    max_output_tokens: int
    cost_per_input_token: float  # USD
    cost_per_output_token: float  # USD
    supports_streaming: bool = True
    supports_functions: bool = False


class BaseProvider(ABC):
    """
    Abstract base class for LLM providers.
    
    All providers must implement:
    1. generate() - Execute completion request
    2. stream() - Stream completion tokens
    3. estimate_cost() - Calculate cost
    4. Properties for provider metadata
    
    Providers handle:
    - API calls to their service
    - Token counting
    - Cost calculation
    - Error handling (retry, timeout)
    - Response parsing
    
    Gateway handles:
    - Routing to appropriate provider
    - Fallback on failure
    - Rate limiting
    - Observability
    """
    
    def __init__(self, name: str, models: dict[str, ProviderModel]) -> None:
        self._name = name
        self._models = models
    
    @abstractmethod
    async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
        """
        Generate completion.
        
        Must update ctx with:
        - response_content
        - input_tokens
        - output_tokens
        - total_tokens
        - duration_ms
        - actual_cost_cents
        
        Args:
            ctx: Request context with prompt and configuration
        
        Returns:
            Updated context with response and metrics
        """
        pass
    
    @abstractmethod
    async def stream(self, ctx: LLMRequestContext) -> AsyncGenerator[str, None]:
        """
        Stream completion tokens.
        
        Yields completion text incrementally.
        Must update ctx.response_content with full response at end.
        """
        pass
    
    def estimate_cost(self, input_tokens: int, output_tokens: int, model: str) -> float:
        """
        Estimate cost in cents.
        
        Args:
            input_tokens: Number of input tokens
            output_tokens: Number of output tokens (estimated)
            model: Model name
        
        Returns:
            Cost in cents (USD)
        """
        model_info = self._models.get(model)
        if not model_info:
            return 0.0
        
        cost_usd = (
            input_tokens * model_info.cost_per_input_token +
            output_tokens * model_info.cost_per_output_token
        )
        return cost_usd * 100  # Convert to cents
    
    def count_tokens(self, text: str) -> int:
        """
        Count tokens in text (approximate).
        
        Default implementation: ~4 chars per token.
        Override for provider-specific tokenizer.
        """
        return len(text) // 4
    
    @property
    def name(self) -> str:
        """Provider name."""
        return self._name
    
    @property
    def available_models(self) -> list[str]:
        """List of available model names."""
        return list(self._models.keys())
    
    def get_model_info(self, model: str) -> ProviderModel | None:
        """Get model metadata."""
        return self._models.get(model)
    
    def get_default_model(self) -> str:
        """Get default model for this provider."""
        return next(iter(self._models.keys()))
    
    def _start_timer(self) -> float:
        """Start performance timer."""
        return time.perf_counter()
    
    def _calculate_duration_ms(self, started: float) -> int:
        """Calculate duration in milliseconds."""
        return int((time.perf_counter() - started) * 1000)

"""
Fallback Manager - Provider fallback logic on failure.

Fallback Strategy:
- Primary provider fails → Try secondary from predefined chain
- Consider original failure reason (rate limit, timeout, error)
- Track fallback usage for reliability metrics
- Avoid infinite loops (max 2 fallback attempts)

Fallback Chains:
1. Anthropic → OpenAI → Ollama (quality-focused)
2. OpenAI → Anthropic → Ollama (balanced)
3. Azure → OpenAI → Ollama (enterprise)
4. Ollama → None (no cloud fallback for local-only)

Chain Selection:
- Based on original provider + sensitivity level
- RESTRICTED/CONFIDENTIAL: No cloud fallback from Ollama
- PUBLIC/INTERNAL: Cloud fallback allowed
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING

from app.gateway.request_context import LLMRequestContext, SensitivityLevel

if TYPE_CHECKING:
    from app.providers.base import BaseProvider

logger = logging.getLogger(__name__)


class FailureReason(str, Enum):
    """Categorized failure reasons for intelligent fallback."""
    
    RATE_LIMIT = "rate_limit"
    TIMEOUT = "timeout"
    API_ERROR = "api_error"
    AUTHENTICATION = "authentication"
    INVALID_REQUEST = "invalid_request"
    SERVICE_UNAVAILABLE = "service_unavailable"
    CONTEXT_LENGTH_EXCEEDED = "context_length_exceeded"
    UNKNOWN = "unknown"


@dataclass
class FallbackChain:
    """Predefined fallback chain for a provider."""
    
    primary: str
    secondary: str | None
    tertiary: str | None
    description: str


# Predefined fallback chains
FALLBACK_CHAINS: dict[str, FallbackChain] = {
    "anthropic": FallbackChain(
        primary="anthropic",
        secondary="openai",
        tertiary="ollama",
        description="Claude → GPT-4 → Local (quality-focused)",
    ),
    "openai": FallbackChain(
        primary="openai",
        secondary="anthropic",
        tertiary="ollama",
        description="GPT-4 → Claude → Local (balanced)",
    ),
    "azure": FallbackChain(
        primary="azure",
        secondary="openai",
        tertiary="ollama",
        description="Azure → OpenAI → Local (enterprise)",
    ),
    "ollama": FallbackChain(
        primary="ollama",
        secondary=None,  # Local has no cloud fallback by default
        tertiary=None,
        description="Local only (no cloud fallback)",
    ),
}


@dataclass
class FallbackDecision:
    """Result of fallback selection."""
    
    provider: str
    model: str
    reason: str
    chain_position: int  # 1 = secondary, 2 = tertiary
    original_failure: str


class FallbackManager:
    """
    Manage provider fallback logic.
    
    Responsibilities:
    1. Determine appropriate fallback provider
    2. Respect sensitivity constraints (no cloud fallback for RESTRICTED)
    3. Track fallback usage metrics
    4. Prevent infinite fallback loops
    
    Fallback Rules:
    - If primary is cloud and fails with rate limit → try other cloud
    - If primary is cloud and fails with timeout → try Ollama (faster)
    - If primary is Ollama and data is RESTRICTED → no fallback
    - If primary is Ollama and data is PUBLIC → try cloud
    - Never fallback more than twice (max 3 total attempts)
    """
    
    def __init__(self, providers: dict[str, BaseProvider]) -> None:
        """
        Initialize fallback manager.
        
        Args:
            providers: Available LLM providers
        """
        self._providers = providers
        self._fallback_counts: dict[str, int] = {}  # Track usage per provider
    
    async def get_fallback(
        self,
        failed_provider: str,
        ctx: LLMRequestContext,
        failure_reason: FailureReason = FailureReason.UNKNOWN,
    ) -> BaseProvider | None:
        """
        Get fallback provider after primary failure.
        
        Args:
            failed_provider: Name of provider that failed
            ctx: Request context (for sensitivity check)
            failure_reason: Categorized failure reason
        
        Returns:
            Fallback provider instance, or None if no fallback available
        """
        
        # Check retry count (max 2 fallbacks = 3 total attempts)
        if ctx.retry_count >= 2:
            logger.warning(
                f"[{ctx.trace_id}] Max retry count reached ({ctx.retry_count}), "
                "no further fallback"
            )
            return None
        
        # Get fallback chain for this provider
        chain = FALLBACK_CHAINS.get(failed_provider)
        if not chain:
            logger.warning(
                f"[{ctx.trace_id}] No fallback chain defined for {failed_provider}"
            )
            return None
        
        # Determine next provider in chain
        next_provider_name = self._select_next_provider(
            chain=chain,
            ctx=ctx,
            failure_reason=failure_reason,
        )
        
        if not next_provider_name:
            logger.info(
                f"[{ctx.trace_id}] No suitable fallback for {failed_provider} "
                f"(sensitivity={ctx.sensitivity})"
            )
            return None
        
        # Check if fallback provider is available
        fallback_provider = self._providers.get(next_provider_name)
        if not fallback_provider:
            logger.warning(
                f"[{ctx.trace_id}] Fallback provider {next_provider_name} not available"
            )
            # Try tertiary
            if chain.tertiary and chain.tertiary in self._providers:
                fallback_provider = self._providers[chain.tertiary]
                next_provider_name = chain.tertiary
            else:
                return None
        
        # Track fallback usage
        self._fallback_counts[next_provider_name] = (
            self._fallback_counts.get(next_provider_name, 0) + 1
        )
        
        logger.info(
            f"[{ctx.trace_id}] Fallback: {failed_provider} → {next_provider_name} "
            f"(reason: {failure_reason}, attempt: {ctx.retry_count + 1})"
        )
        
        return fallback_provider
    
    def _select_next_provider(
        self,
        chain: FallbackChain,
        ctx: LLMRequestContext,
        failure_reason: FailureReason,
    ) -> str | None:
        """
        Select next provider in fallback chain.
        
        Considers:
        - Retry count (secondary vs tertiary)
        - Sensitivity constraints
        - Failure reason (timeout → prefer faster provider)
        """
        
        # Determine position in chain based on retry count
        if ctx.retry_count == 0:
            # First fallback: use secondary
            next_provider = chain.secondary
        elif ctx.retry_count == 1:
            # Second fallback: use tertiary
            next_provider = chain.tertiary
        else:
            # No more fallbacks
            return None
        
        if not next_provider:
            return None
        
        # Check sensitivity constraints
        if ctx.sensitivity in (SensitivityLevel.RESTRICTED, SensitivityLevel.CONFIDENTIAL):
            # Cannot use cloud providers for sensitive data
            if next_provider in ("anthropic", "openai", "azure"):
                logger.debug(
                    f"[{ctx.trace_id}] Skipping cloud fallback {next_provider} "
                    f"due to {ctx.sensitivity} sensitivity"
                )
                # Try tertiary if available and local
                if chain.tertiary == "ollama":
                    return "ollama"
                return None
        
        # Special handling based on failure reason
        if failure_reason == FailureReason.TIMEOUT:
            # Prefer faster provider (Ollama) on timeout
            if next_provider != "ollama" and chain.tertiary == "ollama":
                logger.debug(
                    f"[{ctx.trace_id}] Timeout failure, preferring fast local fallback"
                )
                return "ollama"
        
        if failure_reason == FailureReason.CONTEXT_LENGTH_EXCEEDED:
            # Need provider with larger context window
            if next_provider == "anthropic":
                # Claude has largest context window
                return "anthropic"
        
        if failure_reason == FailureReason.RATE_LIMIT:
            # Try different cloud provider first, then local
            if next_provider in ("openai", "anthropic", "azure"):
                return next_provider
            # If secondary is rate limited too, go straight to ollama
            if chain.tertiary == "ollama":
                return "ollama"
        
        return next_provider
    
    def get_fallback_chain(self, provider: str) -> FallbackChain | None:
        """Get fallback chain for a provider."""
        return FALLBACK_CHAINS.get(provider)
    
    def get_fallback_stats(self) -> dict[str, int]:
        """
        Get fallback usage statistics.
        
        Returns:
            Dict mapping provider name -> fallback count
        """
        return self._fallback_counts.copy()
    
    def reset_stats(self) -> None:
        """Reset fallback usage statistics."""
        self._fallback_counts.clear()
    
    def classify_failure(self, error: Exception) -> FailureReason:
        """
        Classify exception into failure reason category.
        
        Args:
            error: Exception from provider
        
        Returns:
            Categorized failure reason
        """
        
        error_str = str(error).lower()
        
        # Check for rate limiting
        if any(term in error_str for term in ["rate limit", "quota", "429", "too many requests"]):
            return FailureReason.RATE_LIMIT
        
        # Check for timeout
        if any(term in error_str for term in ["timeout", "timed out", "deadline"]):
            return FailureReason.TIMEOUT
        
        # Check for authentication
        if any(term in error_str for term in ["auth", "unauthorized", "401", "403", "api key"]):
            return FailureReason.AUTHENTICATION
        
        # Check for service availability
        if any(term in error_str for term in ["503", "502", "unavailable", "down"]):
            return FailureReason.SERVICE_UNAVAILABLE
        
        # Check for context length
        if any(term in error_str for term in ["context length", "token limit", "too long"]):
            return FailureReason.CONTEXT_LENGTH_EXCEEDED
        
        # Check for invalid request
        if any(term in error_str for term in ["400", "invalid", "bad request", "validation"]):
            return FailureReason.INVALID_REQUEST
        
        # Check for general API error
        if any(term in error_str for term in ["500", "error", "failed"]):
            return FailureReason.API_ERROR
        
        return FailureReason.UNKNOWN
    
    def should_fallback(
        self,
        failure_reason: FailureReason,
        retry_count: int,
    ) -> bool:
        """
        Determine if fallback should be attempted.
        
        Some failures don't warrant fallback (e.g., invalid request).
        
        Args:
            failure_reason: Categorized failure reason
            retry_count: Number of retries already attempted
        
        Returns:
            True if fallback should be attempted
        """
        
        # Don't retry if already exhausted attempts
        if retry_count >= 2:
            return False
        
        # Don't retry on invalid requests (won't work on other providers either)
        if failure_reason in (
            FailureReason.INVALID_REQUEST,
            FailureReason.AUTHENTICATION,
        ):
            return False
        
        # Do retry on transient failures
        if failure_reason in (
            FailureReason.RATE_LIMIT,
            FailureReason.TIMEOUT,
            FailureReason.SERVICE_UNAVAILABLE,
        ):
            return True
        
        # Retry on context length if we have providers with larger windows
        if failure_reason == FailureReason.CONTEXT_LENGTH_EXCEEDED:
            return True
        
        # Default: attempt fallback for unknown/API errors
        return True
    
    def get_recommended_model(
        self,
        fallback_provider: str,
        original_model: str,
    ) -> str:
        """
        Get recommended model for fallback provider.
        
        Try to match quality/capability of original model.
        
        Args:
            fallback_provider: Name of fallback provider
            original_model: Original model that failed
        
        Returns:
            Recommended model name for fallback provider
        """
        
        # Map original models to equivalent fallback models
        model_equivalents = {
            # Anthropic models
            "claude-3-5-sonnet-20241022": {
                "openai": "gpt-4o",
                "azure": "gpt-4o",
                "ollama": "qwen2.5-coder:7b",
            },
            "claude-3-5-haiku-20241022": {
                "openai": "gpt-4o-mini",
                "azure": "gpt-4o-mini",
                "ollama": "deepseek-coder:6.7b",
            },
            
            # OpenAI models
            "gpt-4o": {
                "anthropic": "claude-3-5-sonnet-20241022",
                "azure": "gpt-4o",
                "ollama": "qwen2.5-coder:7b",
            },
            "gpt-4o-mini": {
                "anthropic": "claude-3-5-haiku-20241022",
                "azure": "gpt-4o-mini",
                "ollama": "deepseek-coder:6.7b",
            },
            
            # Ollama models
            "qwen2.5-coder:7b": {
                "anthropic": "claude-3-5-sonnet-20241022",
                "openai": "gpt-4o",
                "azure": "gpt-4o",
            },
            "deepseek-coder:6.7b": {
                "anthropic": "claude-3-5-haiku-20241022",
                "openai": "gpt-4o-mini",
                "azure": "gpt-4o-mini",
            },
        }
        
        # Look up equivalent model
        equivalents = model_equivalents.get(original_model, {})
        recommended = equivalents.get(fallback_provider)
        
        if recommended:
            return recommended
        
        # Default fallback models per provider
        defaults = {
            "anthropic": "claude-3-5-sonnet-20241022",
            "openai": "gpt-4o",
            "azure": "gpt-4o",
            "ollama": "deepseek-coder:6.7b",
        }
        
        return defaults.get(fallback_provider, "gpt-4o")

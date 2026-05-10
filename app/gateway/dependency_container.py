"""
Dependency Container - Wire all gateway components.

Creates and configures:
- LLM providers (Ollama, Anthropic, OpenAI, Azure)
- Routing components (selector, optimizer, fallback)
- Infrastructure (rate limiter, cache, observability)
"""

from __future__ import annotations

import logging

from app.gateway.api_gateway import LLMGateway
from app.settings import settings

logger = logging.getLogger(__name__)


def create_gateway() -> LLMGateway:
    """
    Create fully configured gateway instance.
    
    Initialization order:
    1. Providers (Ollama, Anthropic, OpenAI, Azure)
    2. Observability (trace service, metrics service)
    3. Routing (model selector, cost optimizer, fallback manager)
    4. Infrastructure (rate limiter, prompt cache)
    5. Gateway (wire everything together)
    """
    
    # ─── Step 1: Initialize Providers ──────────────────────────────────
    from app.providers import (
        OllamaProvider,
        AnthropicProvider,
        OpenAIProvider,
        AzureOpenAIProvider,
    )
    
    providers = {}
    
    # Ollama (always available for local fallback)
    if settings.OLLAMA_ENABLED:
        providers["ollama"] = OllamaProvider(
            base_url=settings.OLLAMA_BASE_URL,
            default_model=settings.OLLAMA_MODEL,
        )
        logger.info("Initialized Ollama provider")
    
    # Anthropic Claude
    if settings.ANTHROPIC_API_KEY:
        providers["anthropic"] = AnthropicProvider(
            api_key=settings.ANTHROPIC_API_KEY,
            default_model=settings.ANTHROPIC_MODEL,
        )
        logger.info("Initialized Anthropic provider")
    
    # OpenAI
    if settings.OPENAI_API_KEY:
        providers["openai"] = OpenAIProvider(
            api_key=settings.OPENAI_API_KEY,
            default_model=settings.OPENAI_MODEL,
        )
        logger.info("Initialized OpenAI provider")
    
    # Azure OpenAI
    if settings.AZURE_OPENAI_API_KEY:
        providers["azure_openai"] = AzureOpenAIProvider(
            api_key=settings.AZURE_OPENAI_API_KEY,
            endpoint=settings.AZURE_OPENAI_ENDPOINT,
            deployment_name=settings.AZURE_OPENAI_DEPLOYMENT_NAME,
        )
        logger.info("Initialized Azure OpenAI provider")
    
    if not providers:
        logger.warning("No LLM providers configured! Gateway will not function.")
    
    # ─── Step 2: Initialize Observability ──────────────────────────────
    from app.observability.trace_service import TraceService
    from app.observability.metrics_service import MetricsService
    
    trace_service = TraceService()
    metrics_service = MetricsService()
    
    # ─── Step 3: Initialize Routing ────────────────────────────────────
    from app.routing.model_selector import ModelSelector
    from app.routing.cost_optimizer import CostOptimizer
    from app.routing.fallback_manager import FallbackManager
    
    model_selector = ModelSelector(providers=providers)
    cost_optimizer = CostOptimizer(providers=providers)
    fallback_manager = FallbackManager(providers=providers)
    
    # ─── Step 4: Initialize Infrastructure ─────────────────────────────
    from app.routing.rate_limiter import RateLimiter
    from app.routing.prompt_cache import PromptCache
    
    rate_limiter = RateLimiter()
    prompt_cache = PromptCache()
    
    # ─── Step 5: Create Gateway ────────────────────────────────────────
    gateway = LLMGateway(
        providers=providers,
        model_selector=model_selector,
        cost_optimizer=cost_optimizer,
        fallback_manager=fallback_manager,
        rate_limiter=rate_limiter,
        prompt_cache=prompt_cache,
        trace_service=trace_service,
        metrics_service=metrics_service,
    )
    
    logger.info(
        f"Gateway initialized with {len(providers)} providers: "
        f"{list(providers.keys())}"
    )
    
    return gateway

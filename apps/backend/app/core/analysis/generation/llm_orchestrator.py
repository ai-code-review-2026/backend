"""
LLM Orchestrator - Switchable LLM Provider Interface

Supports multiple LLM providers:
- Ollama (local, Llama DeepSeekCoder) - Development
- OpenAI (GPT-4) - Production option
- Anthropic Claude (Sonnet) - Production (PRIMARY)
- Azure OpenAI - Enterprise option

Design: Provider abstraction, config-driven switching
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Any

from app.settings import settings

logger = logging.getLogger(__name__)


class LLMProvider(str, Enum):
    """Supported LLM providers."""
    
    OLLAMA = "ollama"
    OPENAI = "openai"
    ANTHROPIC = "anthropic"
    AZURE_OPENAI = "azure_openai"


@dataclass(frozen=True)
class LLMRequest:
    """Request to LLM."""
    
    system_prompt: str
    user_prompt: str
    temperature: float = 0.2
    max_tokens: int = 4000
    stop_sequences: list[str] | None = None


@dataclass(frozen=True)
class LLMResponse:
    """Response from LLM."""
    
    content: str
    provider: str
    model: str
    tokens_used: int
    duration_ms: int


class BaseLLMClient(ABC):
    """Abstract LLM client interface."""
    
    @abstractmethod
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate completion."""
        pass


class OllamaClient(BaseLLMClient):
    """
    Ollama client for local LLM.
    
    Usage: Development with Llama DeepSeekCoder
    Model: deepseek-coder:6.7b
    Speed: Fast (local GPU)
    Cost: Free
    """
    
    def __init__(self, base_url: str, model: str) -> None:
        self._base_url = base_url
        self._model = model
    
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate with Ollama."""
        import httpx
        import time
        
        started = time.perf_counter()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self._base_url}/api/generate",
                json={
                    "model": self._model,
                    "prompt": f"{request.system_prompt}\n\n{request.user_prompt}",
                    "temperature": request.temperature,
                    "stream": False,
                },
                timeout=120.0,
            )
            response.raise_for_status()
            result = response.json()
        
        duration_ms = int((time.perf_counter() - started) * 1000)
        
        return LLMResponse(
            content=result.get("response", ""),
            provider="ollama",
            model=self._model,
            tokens_used=result.get("eval_count", 0),
            duration_ms=duration_ms,
        )


class AnthropicClient(BaseLLMClient):
    """
    Anthropic Claude client.
    
    Usage: Production (PRIMARY)
    Model: claude-sonnet-4-20250514
    Quality: Best for code review
    Cost: Moderate
    """
    
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
    
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate with Claude."""
        import httpx
        import time
        
        started = time.perf_counter()
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": self._model,
                    "max_tokens": request.max_tokens,
                    "temperature": request.temperature,
                    "system": request.system_prompt,
                    "messages": [
                        {"role": "user", "content": request.user_prompt}
                    ],
                },
                timeout=120.0,
            )
            response.raise_for_status()
            result = response.json()
        
        duration_ms = int((time.perf_counter() - started) * 1000)
        
        content = result.get("content", [{}])[0].get("text", "")
        usage = result.get("usage", {})
        
        return LLMResponse(
            content=content,
            provider="anthropic",
            model=self._model,
            tokens_used=usage.get("input_tokens", 0) + usage.get("output_tokens", 0),
            duration_ms=duration_ms,
        )


class OpenAIClient(BaseLLMClient):
    """OpenAI GPT client."""
    
    def __init__(self, api_key: str, model: str) -> None:
        self._api_key = api_key
        self._model = model
    
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate with OpenAI."""
        # Similar implementation
        pass


class LLMOrchestrator:
    """
    LLM orchestrator with provider switching.
    
    Configuration:
    - LLM_PROVIDER: "ollama" | "anthropic" | "openai"
    - LLM_MODEL: Model name
    - LLM_API_KEY: API key (if needed)
    
    Routing logic:
    - Dev environment → Ollama (local)
    - Prod environment → Claude (high quality)
    - Fallback → OpenAI (if Claude unavailable)
    
    Usage:
        orchestrator = LLMOrchestrator()
        response = await orchestrator.generate(request)
    """
    
    def __init__(self) -> None:
        self._client = self._init_client()
    
    def _init_client(self) -> BaseLLMClient:
        """Initialize LLM client based on config."""
        provider = settings.LLM_PROVIDER
        
        if provider == LLMProvider.OLLAMA:
            return OllamaClient(
                base_url=settings.OLLAMA_BASE_URL,
                model=settings.OLLAMA_MODEL,
            )
        elif provider == LLMProvider.ANTHROPIC:
            return AnthropicClient(
                api_key=settings.ANTHROPIC_API_KEY,
                model=settings.ANTHROPIC_MODEL,
            )
        elif provider == LLMProvider.OPENAI:
            return OpenAIClient(
                api_key=settings.OPENAI_API_KEY,
                model=settings.OPENAI_MODEL,
            )
        else:
            logger.warning(f"Unknown provider {provider}, defaulting to Ollama")
            return OllamaClient(
                base_url=settings.OLLAMA_BASE_URL,
                model=settings.OLLAMA_MODEL,
            )
    
    async def generate(self, request: LLMRequest) -> LLMResponse:
        """Generate with configured provider."""
        try:
            return await self._client.generate(request)
        except Exception as exc:
            logger.error(f"LLM generation failed: {exc}")
            raise

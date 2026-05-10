"""
LLM Providers - Unified interface to multiple LLM services.

Available providers:
- Ollama: Local models (DeepSeek Coder, Qwen, Llama)
- Anthropic: Claude models (Sonnet 4, Haiku)
- OpenAI: GPT models (gpt-4o, gpt-4o-mini)
- Azure OpenAI: Enterprise GPT deployment

All providers implement BaseProvider protocol:
- generate() - Standard completion
- stream() - Streaming completion
- estimate_cost() - Cost calculation
- Properties: name, available_models, model metadata
"""

from app.providers.anthropic_provider import AnthropicProvider
from app.providers.azure_openai_provider import AzureOpenAIProvider
from app.providers.base import BaseProvider, ProviderModel
from app.providers.ollama_provider import OllamaProvider
from app.providers.openai_provider import OpenAIProvider

__all__ = [
    "BaseProvider",
    "ProviderModel",
    "OllamaProvider",
    "AnthropicProvider",
    "OpenAIProvider",
    "AzureOpenAIProvider",
]

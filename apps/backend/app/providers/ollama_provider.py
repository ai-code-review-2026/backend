"""
Ollama Provider - Local LLM inference.

Models:
- deepseek-coder:6.7b (code-specialized)
- llama3.2:3b (general, fast)
- qwen2.5-coder:7b (code-specialized, high quality)

Advantages:
- Free (no API costs)
- Fast (local GPU)
- Private (no data leaves server)
- Always available (no rate limits)

Use cases:
- CONFIDENTIAL/RESTRICTED data
- Development environment
- Cost minimization
- High-frequency requests
"""

from __future__ import annotations

import logging
from typing import AsyncGenerator

import httpx

from app.gateway.request_context import LLMRequestContext
from app.providers.base import BaseProvider, ProviderModel

logger = logging.getLogger(__name__)


# Model configurations
OLLAMA_MODELS = {
    "deepseek-coder:6.7b": ProviderModel(
        name="deepseek-coder:6.7b",
        display_name="DeepSeek Coder 6.7B",
        max_context_tokens=16000,
        max_output_tokens=4000,
        cost_per_input_token=0.0,  # Free
        cost_per_output_token=0.0,
        supports_streaming=True,
        supports_functions=False,
    ),
    "qwen2.5-coder:7b": ProviderModel(
        name="qwen2.5-coder:7b",
        display_name="Qwen 2.5 Coder 7B",
        max_context_tokens=32000,
        max_output_tokens=4000,
        cost_per_input_token=0.0,
        cost_per_output_token=0.0,
        supports_streaming=True,
        supports_functions=False,
    ),
    "llama3.2:3b": ProviderModel(
        name="llama3.2:3b",
        display_name="Llama 3.2 3B",
        max_context_tokens=8000,
        max_output_tokens=2000,
        cost_per_input_token=0.0,
        cost_per_output_token=0.0,
        supports_streaming=True,
        supports_functions=False,
    ),
}


class OllamaProvider(BaseProvider):
    """Ollama local LLM provider."""
    
    def __init__(self, base_url: str, default_model: str) -> None:
        super().__init__("ollama", OLLAMA_MODELS)
        self._base_url = base_url.rstrip("/")
        self._default_model = default_model
    
    async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
        """Generate completion with Ollama."""
        model = ctx.preferred_model or self._default_model
        started = self._start_timer()
        
        # Combine system + user prompt
        full_prompt = f"{ctx.system_prompt}\n\n{ctx.user_prompt}"
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self._base_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": full_prompt,
                        "temperature": ctx.temperature,
                        "stream": False,
                        "options": {
                            "num_predict": ctx.max_tokens,
                        },
                    },
                )
                response.raise_for_status()
                result = response.json()
            
            # Extract response
            content = result.get("response", "")
            
            # Token counts (Ollama provides these)
            prompt_tokens = result.get("prompt_eval_count", 0)
            completion_tokens = result.get("eval_count", 0)
            
            # Update context
            ctx.response_content = content
            ctx.input_tokens = prompt_tokens
            ctx.output_tokens = completion_tokens
            ctx.total_tokens = prompt_tokens + completion_tokens
            ctx.duration_ms = self._calculate_duration_ms(started)
            ctx.actual_cost_cents = 0.0  # Free
            
            logger.info(
                f"[{ctx.trace_id}] Ollama {model}: "
                f"{prompt_tokens} in + {completion_tokens} out, "
                f"{ctx.duration_ms}ms"
            )
            
        except httpx.HTTPStatusError as exc:
            logger.error(f"[{ctx.trace_id}] Ollama HTTP error: {exc}")
            ctx.error = f"Ollama API error: {exc.response.status_code}"
            raise
        except httpx.RequestError as exc:
            logger.error(f"[{ctx.trace_id}] Ollama connection error: {exc}")
            ctx.error = f"Ollama connection failed: {exc}"
            raise
        except Exception as exc:
            logger.error(f"[{ctx.trace_id}] Ollama unexpected error: {exc}")
            ctx.error = f"Ollama error: {exc}"
            raise
        
        return ctx
    
    async def stream(self, ctx: LLMRequestContext) -> AsyncGenerator[str, None]:
        """Stream completion from Ollama."""
        from app.api.websockets.progress_broadcaster import broadcast_llm_progress
        
        model = ctx.preferred_model or self._default_model
        full_prompt = f"{ctx.system_prompt}\n\n{ctx.user_prompt}"
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": full_prompt,
                        "temperature": ctx.temperature,
                        "stream": True,
                        "options": {
                            "num_predict": ctx.max_tokens,
                        },
                    },
                ) as response:
                    response.raise_for_status()
                    
                    full_response = []
                    token_count = 0
                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        
                        try:
                            import json
                            chunk = json.loads(line)
                            token = chunk.get("response", "")
                            if token:
                                full_response.append(token)
                                token_count += 1
                                yield token
                                
                                # Broadcast every 10 tokens to avoid flooding
                                if token_count % 10 == 0:
                                    await broadcast_llm_progress(
                                        trace_id=ctx.trace_id,
                                        event="tokens_streaming",
                                        data={
                                            "provider": "ollama",
                                            "model": model,
                                            "tokens_received": token_count,
                                        }
                                    )
                        except json.JSONDecodeError:
                            continue
                    
                    # Update context with full response
                    ctx.response_content = "".join(full_response)
                    ctx.output_tokens = token_count
        
        except Exception as exc:
            logger.error(f"[{ctx.trace_id}] Ollama streaming error: {exc}")
            yield f"\n[Error: {exc}]"

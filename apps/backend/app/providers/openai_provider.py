"""
OpenAI GPT Provider - Industry-standard models with broad capabilities.

Models:
- gpt-4o (128K context, $2.50/$10 per M tokens)
- gpt-4o-mini (128K context, $0.15/$0.60 per M tokens)

Advantages:
- Strong general reasoning
- Fast inference
- Excellent API reliability
- Good cost/performance balance

Use cases:
- Standard code reviews
- Quick analysis
- General-purpose tasks
- Cost-sensitive workloads (gpt-4o-mini)
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

import httpx

from app.gateway.request_context import LLMRequestContext
from app.providers.base import BaseProvider, ProviderModel

logger = logging.getLogger(__name__)


# Model configurations
OPENAI_MODELS = {
    "gpt-4o": ProviderModel(
        name="gpt-4o",
        display_name="GPT-4o",
        max_context_tokens=128000,
        max_output_tokens=16384,
        cost_per_input_token=2.50 / 1_000_000,  # $2.50 per M tokens
        cost_per_output_token=10.0 / 1_000_000,  # $10 per M tokens
        supports_streaming=True,
        supports_functions=True,
    ),
    "gpt-4o-mini": ProviderModel(
        name="gpt-4o-mini",
        display_name="GPT-4o Mini",
        max_context_tokens=128000,
        max_output_tokens=16384,
        cost_per_input_token=0.15 / 1_000_000,  # $0.15 per M tokens
        cost_per_output_token=0.60 / 1_000_000,  # $0.60 per M tokens
        supports_streaming=True,
        supports_functions=True,
    ),
}


class OpenAIProvider(BaseProvider):
    """OpenAI GPT provider using Chat Completions API."""
    
    def __init__(self, api_key: str, default_model: str = "gpt-4o-mini") -> None:
        super().__init__("openai", OPENAI_MODELS)
        self._api_key = api_key
        self._default_model = default_model
        self._base_url = "https://api.openai.com/v1"
    
    def _build_messages(self, ctx: LLMRequestContext) -> list[dict[str, str]]:
        """Build messages array for OpenAI API."""
        messages = []
        
        # Add system prompt if provided
        if ctx.system_prompt:
            messages.append({
                "role": "system",
                "content": ctx.system_prompt,
            })
        
        # Add user prompt
        if ctx.user_prompt:
            messages.append({
                "role": "user",
                "content": ctx.user_prompt,
            })
        
        return messages
    
    async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
        """Generate completion with OpenAI GPT."""
        model = ctx.preferred_model or self._default_model
        started = self._start_timer()
        
        # Build request payload
        payload = {
            "model": model,
            "messages": self._build_messages(ctx),
            "max_tokens": ctx.max_tokens,
            "temperature": ctx.temperature,
        }
        
        # Add stop sequences if provided
        if ctx.stop_sequences:
            payload["stop"] = ctx.stop_sequences
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self._base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
                result = response.json()
            
            # Extract response content
            choices = result.get("choices", [])
            content = ""
            if choices:
                content = choices[0].get("message", {}).get("content", "")
            
            # Extract token usage
            usage = result.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            
            # Calculate cost
            cost_cents = self.estimate_cost(input_tokens, output_tokens, model)
            
            # Update context
            ctx.response_content = content
            ctx.input_tokens = input_tokens
            ctx.output_tokens = output_tokens
            ctx.total_tokens = input_tokens + output_tokens
            ctx.duration_ms = self._calculate_duration_ms(started)
            ctx.actual_cost_cents = cost_cents
            
            logger.info(
                f"[{ctx.trace_id}] OpenAI {model}: "
                f"{input_tokens} in + {output_tokens} out, "
                f"{ctx.duration_ms}ms, ${cost_cents/100:.4f}"
            )
            
        except httpx.HTTPStatusError as exc:
            error_detail = "Unknown error"
            try:
                error_body = exc.response.json()
                error_detail = error_body.get("error", {}).get("message", str(exc))
            except Exception:
                error_detail = str(exc)
            
            logger.error(
                f"[{ctx.trace_id}] OpenAI HTTP error: {exc.response.status_code} - {error_detail}"
            )
            ctx.error = f"OpenAI API error: {error_detail}"
            raise
        except httpx.RequestError as exc:
            logger.error(f"[{ctx.trace_id}] OpenAI connection error: {exc}")
            ctx.error = f"OpenAI connection failed: {exc}"
            raise
        except Exception as exc:
            logger.error(f"[{ctx.trace_id}] OpenAI unexpected error: {exc}")
            ctx.error = f"OpenAI error: {exc}"
            raise
        
        return ctx
    
    async def stream(self, ctx: LLMRequestContext) -> AsyncGenerator[str, None]:
        """Stream completion from OpenAI GPT."""
        from app.api.websockets.progress_broadcaster import broadcast_llm_progress
        
        model = ctx.preferred_model or self._default_model
        
        # Build request payload
        payload = {
            "model": model,
            "messages": self._build_messages(ctx),
            "max_tokens": ctx.max_tokens,
            "temperature": ctx.temperature,
            "stream": True,
        }
        
        # Add stop sequences if provided
        if ctx.stop_sequences:
            payload["stop"] = ctx.stop_sequences
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    
                    full_response = []
                    token_count = 0
                    
                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        
                        # Remove "data: " prefix
                        data = line[6:]
                        
                        # Skip [DONE] marker
                        if data == "[DONE]":
                            continue
                        
                        try:
                            chunk = json.loads(data)
                            choices = chunk.get("choices", [])
                            
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content", "")
                                
                                if content:
                                    full_response.append(content)
                                    token_count += 1
                                    yield content
                                    
                                    # Broadcast every 10 tokens to avoid flooding
                                    if token_count % 10 == 0:
                                        await broadcast_llm_progress(
                                            trace_id=ctx.trace_id,
                                            event="tokens_streaming",
                                            data={
                                                "provider": "openai",
                                                "model": model,
                                                "tokens_received": token_count,
                                            }
                                        )
                        
                        except json.JSONDecodeError:
                            continue
                    
                    # Update context with full response
                    ctx.response_content = "".join(full_response)
                    
                    # Estimate tokens since streaming doesn't provide usage
                    ctx.input_tokens = self.count_tokens(
                        ctx.system_prompt + ctx.user_prompt
                    )
                    ctx.output_tokens = self.count_tokens(ctx.response_content)
                    ctx.total_tokens = ctx.input_tokens + ctx.output_tokens
                    ctx.actual_cost_cents = self.estimate_cost(
                        ctx.input_tokens, ctx.output_tokens, model
                    )
        
        except Exception as exc:
            logger.error(f"[{ctx.trace_id}] OpenAI streaming error: {exc}")
            yield f"\n[Error: {exc}]"
    
    def count_tokens(self, text: str) -> int:
        """
        Count tokens for OpenAI models.
        
        OpenAI uses tiktoken with ~4 chars per token average.
        This is a rough estimate - for exact counts, use tiktoken library.
        """
        return len(text) // 4

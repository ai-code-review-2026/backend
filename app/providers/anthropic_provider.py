"""
Anthropic Claude Provider - State-of-the-art reasoning models.

Models:
- claude-sonnet-4-20250514 (200K context, $3/$15 per M tokens)
- claude-3-5-haiku-20241022 (200K context, $1/$5 per M tokens)

Advantages:
- Best-in-class reasoning and code understanding
- Large context window (200K tokens)
- Strong security and safety features
- Excellent for complex code analysis

Use cases:
- Complex architectural reviews
- Security analysis
- Deep code understanding
- High-stakes production reviews
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
ANTHROPIC_MODELS = {
    "claude-sonnet-4-20250514": ProviderModel(
        name="claude-sonnet-4-20250514",
        display_name="Claude Sonnet 4",
        max_context_tokens=200000,
        max_output_tokens=8192,
        cost_per_input_token=3.0 / 1_000_000,  # $3 per M tokens
        cost_per_output_token=15.0 / 1_000_000,  # $15 per M tokens
        supports_streaming=True,
        supports_functions=True,
    ),
    "claude-3-5-haiku-20241022": ProviderModel(
        name="claude-3-5-haiku-20241022",
        display_name="Claude 3.5 Haiku",
        max_context_tokens=200000,
        max_output_tokens=8192,
        cost_per_input_token=1.0 / 1_000_000,  # $1 per M tokens
        cost_per_output_token=5.0 / 1_000_000,  # $5 per M tokens
        supports_streaming=True,
        supports_functions=True,
    ),
}


class AnthropicProvider(BaseProvider):
    """Anthropic Claude provider using Messages API."""
    
    def __init__(self, api_key: str, default_model: str = "claude-sonnet-4-20250514") -> None:
        super().__init__("anthropic", ANTHROPIC_MODELS)
        self._api_key = api_key
        self._default_model = default_model
        self._base_url = "https://api.anthropic.com/v1"
        self._api_version = "2023-06-01"
    
    def _build_messages(self, ctx: LLMRequestContext) -> list[dict[str, str]]:
        """Build messages array for Anthropic API."""
        messages = []
        
        # Add user prompt
        if ctx.user_prompt:
            messages.append({
                "role": "user",
                "content": ctx.user_prompt,
            })
        
        return messages
    
    async def generate(self, ctx: LLMRequestContext) -> LLMRequestContext:
        """Generate completion with Anthropic Claude."""
        model = ctx.preferred_model or self._default_model
        started = self._start_timer()
        
        # Build request payload
        payload = {
            "model": model,
            "messages": self._build_messages(ctx),
            "max_tokens": ctx.max_tokens,
            "temperature": ctx.temperature,
        }
        
        # Add system prompt if provided
        if ctx.system_prompt:
            payload["system"] = ctx.system_prompt
        
        # Add stop sequences if provided
        if ctx.stop_sequences:
            payload["stop_sequences"] = ctx.stop_sequences
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self._base_url}/messages",
                    headers={
                        "x-api-key": self._api_key,
                        "anthropic-version": self._api_version,
                        "content-type": "application/json",
                    },
                    json=payload,
                )
                response.raise_for_status()
                result = response.json()
            
            # Extract response content
            content_blocks = result.get("content", [])
            content = ""
            for block in content_blocks:
                if block.get("type") == "text":
                    content += block.get("text", "")
            
            # Extract token usage
            usage = result.get("usage", {})
            input_tokens = usage.get("input_tokens", 0)
            output_tokens = usage.get("output_tokens", 0)
            
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
                f"[{ctx.trace_id}] Anthropic {model}: "
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
                f"[{ctx.trace_id}] Anthropic HTTP error: {exc.response.status_code} - {error_detail}"
            )
            ctx.error = f"Anthropic API error: {error_detail}"
            raise
        except httpx.RequestError as exc:
            logger.error(f"[{ctx.trace_id}] Anthropic connection error: {exc}")
            ctx.error = f"Anthropic connection failed: {exc}"
            raise
        except Exception as exc:
            logger.error(f"[{ctx.trace_id}] Anthropic unexpected error: {exc}")
            ctx.error = f"Anthropic error: {exc}"
            raise
        
        return ctx
    
    async def stream(self, ctx: LLMRequestContext) -> AsyncGenerator[str, None]:
        """Stream completion from Anthropic Claude."""
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
        
        # Add system prompt if provided
        if ctx.system_prompt:
            payload["system"] = ctx.system_prompt
        
        # Add stop sequences if provided
        if ctx.stop_sequences:
            payload["stop_sequences"] = ctx.stop_sequences
        
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self._base_url}/messages",
                    headers={
                        "x-api-key": self._api_key,
                        "anthropic-version": self._api_version,
                        "content-type": "application/json",
                    },
                    json=payload,
                ) as response:
                    response.raise_for_status()
                    
                    full_response = []
                    input_tokens = 0
                    output_tokens = 0
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
                            event = json.loads(data)
                            event_type = event.get("type")
                            
                            # Handle message start (contains usage info)
                            if event_type == "message_start":
                                usage = event.get("message", {}).get("usage", {})
                                input_tokens = usage.get("input_tokens", 0)
                            
                            # Handle content deltas
                            elif event_type == "content_block_delta":
                                delta = event.get("delta", {})
                                if delta.get("type") == "text_delta":
                                    text = delta.get("text", "")
                                    if text:
                                        full_response.append(text)
                                        token_count += 1
                                        yield text
                                        
                                        # Broadcast every 10 tokens to avoid flooding
                                        if token_count % 10 == 0:
                                            await broadcast_llm_progress(
                                                trace_id=ctx.trace_id,
                                                event="tokens_streaming",
                                                data={
                                                    "provider": "anthropic",
                                                    "model": model,
                                                    "tokens_received": token_count,
                                                }
                                            )
                            
                            # Handle message delta (final token counts)
                            elif event_type == "message_delta":
                                usage = event.get("usage", {})
                                output_tokens = usage.get("output_tokens", 0)
                        
                        except json.JSONDecodeError:
                            continue
                    
                    # Update context with full response and metrics
                    ctx.response_content = "".join(full_response)
                    ctx.input_tokens = input_tokens
                    ctx.output_tokens = output_tokens
                    ctx.total_tokens = input_tokens + output_tokens
                    ctx.actual_cost_cents = self.estimate_cost(input_tokens, output_tokens, model)
        
        except Exception as exc:
            logger.error(f"[{ctx.trace_id}] Anthropic streaming error: {exc}")
            yield f"\n[Error: {exc}]"
    
    def count_tokens(self, text: str) -> int:
        """
        Count tokens for Anthropic models.
        
        Anthropic uses a similar tokenizer to OpenAI's.
        Rough estimate: ~3.5 chars per token for English text.
        """
        return len(text) // 4  # Conservative estimate

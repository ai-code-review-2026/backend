"""
Azure OpenAI Provider - Enterprise-grade OpenAI with Azure infrastructure.

Models:
- Same as OpenAI (gpt-4o, gpt-4o-mini) but deployed via Azure
- Pricing matches OpenAI standard rates

Advantages:
- Enterprise SLAs and support
- Private network integration
- Data residency control
- Azure AD authentication
- Integration with Azure ecosystem

Use cases:
- Enterprise deployments
- Regulated industries
- Organizations already on Azure
- Teams requiring strict data governance
"""

from __future__ import annotations

import json
import logging
from typing import AsyncGenerator

import httpx

from app.gateway.request_context import LLMRequestContext
from app.providers.base import BaseProvider, ProviderModel

logger = logging.getLogger(__name__)


# Model configurations (same pricing as OpenAI)
AZURE_OPENAI_MODELS = {
    "gpt-4o": ProviderModel(
        name="gpt-4o",
        display_name="Azure GPT-4o",
        max_context_tokens=128000,
        max_output_tokens=16384,
        cost_per_input_token=2.50 / 1_000_000,  # $2.50 per M tokens
        cost_per_output_token=10.0 / 1_000_000,  # $10 per M tokens
        supports_streaming=True,
        supports_functions=True,
    ),
    "gpt-4o-mini": ProviderModel(
        name="gpt-4o-mini",
        display_name="Azure GPT-4o Mini",
        max_context_tokens=128000,
        max_output_tokens=16384,
        cost_per_input_token=0.15 / 1_000_000,  # $0.15 per M tokens
        cost_per_output_token=0.60 / 1_000_000,  # $0.60 per M tokens
        supports_streaming=True,
        supports_functions=True,
    ),
}


class AzureOpenAIProvider(BaseProvider):
    """Azure OpenAI provider using Azure OpenAI Service API."""
    
    def __init__(
        self,
        api_key: str,
        endpoint: str,
        deployment_name: str,
        api_version: str = "2024-02-15-preview",
        default_model: str = "gpt-4o-mini",
    ) -> None:
        super().__init__("azure_openai", AZURE_OPENAI_MODELS)
        self._api_key = api_key
        self._endpoint = endpoint.rstrip("/")
        self._deployment_name = deployment_name
        self._api_version = api_version
        self._default_model = default_model
    
    def _build_url(self, endpoint_path: str) -> str:
        """Build Azure OpenAI endpoint URL."""
        return (
            f"{self._endpoint}/openai/deployments/{self._deployment_name}"
            f"/{endpoint_path}?api-version={self._api_version}"
        )
    
    def _build_messages(self, ctx: LLMRequestContext) -> list[dict[str, str]]:
        """Build messages array for Azure OpenAI API."""
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
        """Generate completion with Azure OpenAI."""
        model = ctx.preferred_model or self._default_model
        started = self._start_timer()
        
        # Build request payload
        payload = {
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
                    self._build_url("chat/completions"),
                    headers={
                        "api-key": self._api_key,
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
                f"[{ctx.trace_id}] Azure OpenAI {self._deployment_name}: "
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
                f"[{ctx.trace_id}] Azure OpenAI HTTP error: {exc.response.status_code} - {error_detail}"
            )
            ctx.error = f"Azure OpenAI API error: {error_detail}"
            raise
        except httpx.RequestError as exc:
            logger.error(f"[{ctx.trace_id}] Azure OpenAI connection error: {exc}")
            ctx.error = f"Azure OpenAI connection failed: {exc}"
            raise
        except Exception as exc:
            logger.error(f"[{ctx.trace_id}] Azure OpenAI unexpected error: {exc}")
            ctx.error = f"Azure OpenAI error: {exc}"
            raise
        
        return ctx
    
    async def stream(self, ctx: LLMRequestContext) -> AsyncGenerator[str, None]:
        """Stream completion from Azure OpenAI."""
        from app.api.websockets.progress_broadcaster import broadcast_llm_progress
        
        model = ctx.preferred_model or self._default_model
        
        # Build request payload
        payload = {
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
                    self._build_url("chat/completions"),
                    headers={
                        "api-key": self._api_key,
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
                                                "provider": "azure_openai",
                                                "model": self._deployment_name,
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
            logger.error(f"[{ctx.trace_id}] Azure OpenAI streaming error: {exc}")
            yield f"\n[Error: {exc}]"
    
    def count_tokens(self, text: str) -> int:
        """
        Count tokens for Azure OpenAI models.
        
        Azure uses the same tokenizer as OpenAI (~4 chars per token).
        This is a rough estimate - for exact counts, use tiktoken library.
        """
        return len(text) // 4

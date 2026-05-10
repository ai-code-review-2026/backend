#!/usr/bin/env python3
"""
Test script for rate_limiter.py and prompt_cache.py

Validates:
- Rate limiter per-provider limits
- Rate limiter per-user limits
- Prompt cache key generation
- Prompt cache serialization/deserialization
- Redis connection handling
- Metrics tracking
"""

import asyncio
import sys
from pathlib import Path

# Add app directory to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.routing import get_rate_limiter, get_prompt_cache, RateLimitResult
from app.gateway.request_context import LLMRequestContext, SensitivityLevel, CostTarget


async def test_rate_limiter():
    """Test rate limiter functionality."""
    print("\n=== Testing Rate Limiter ===")
    
    limiter = get_rate_limiter()
    print(f"✓ Rate limiter initialized: {type(limiter).__name__}")
    
    # Test provider rate limits
    print("\n1. Testing provider rate limits:")
    
    # Anthropic (50 req/min)
    result = await limiter.check_and_acquire(provider="anthropic")
    print(f"  Anthropic request: allowed={result.allowed}")
    assert result.allowed, "First request should be allowed"
    
    # OpenAI (60 req/min)
    result = await limiter.check_and_acquire(provider="openai")
    print(f"  OpenAI request: allowed={result.allowed}")
    assert result.allowed, "First request should be allowed"
    
    # Ollama (unlimited)
    result = await limiter.check_and_acquire(provider="ollama")
    print(f"  Ollama request: allowed={result.allowed}, reason={result.reason}")
    assert result.allowed, "Ollama should always allow requests"
    
    # Test user rate limits
    print("\n2. Testing user rate limits:")
    result = await limiter.check_and_acquire(provider="anthropic", user_id="test_user_1")
    print(f"  User request: allowed={result.allowed}")
    assert result.allowed, "First user request should be allowed"
    
    # Test metrics
    print("\n3. Rate limiter metrics:")
    metrics = limiter.get_metrics()
    for key, value in metrics.items():
        print(f"  {key}: {value}")
    
    print("✓ Rate limiter tests passed")


def test_prompt_cache():
    """Test prompt cache functionality."""
    print("\n=== Testing Prompt Cache ===")
    
    cache = get_prompt_cache()
    print(f"✓ Prompt cache initialized: {type(cache).__name__}")
    
    # Test cache key generation
    print("\n1. Testing cache key generation:")
    ctx1 = LLMRequestContext(
        system_prompt="You are a code reviewer",
        user_prompt="Review this Python code",
        temperature=0.2,
        preferred_model="gpt-4",
    )
    key1 = cache._build_cache_key(ctx1)
    print(f"  Key 1: {key1[:32]}...")
    
    # Same prompt should generate same key
    ctx2 = LLMRequestContext(
        system_prompt="You are a code reviewer",
        user_prompt="Review this Python code",
        temperature=0.2,
        preferred_model="gpt-4",
    )
    key2 = cache._build_cache_key(ctx2)
    print(f"  Key 2: {key2[:32]}...")
    assert key1 == key2, "Same prompt should generate same cache key"
    
    # Different prompt should generate different key
    ctx3 = LLMRequestContext(
        system_prompt="You are a code reviewer",
        user_prompt="Review this JavaScript code",  # Different
        temperature=0.2,
        preferred_model="gpt-4",
    )
    key3 = cache._build_cache_key(ctx3)
    print(f"  Key 3: {key3[:32]}...")
    assert key1 != key3, "Different prompt should generate different cache key"
    
    # Test serialization/deserialization
    print("\n2. Testing serialization:")
    ctx = LLMRequestContext(
        user_id="test_user",
        project_id="test_project",
        system_prompt="System prompt",
        user_prompt="User prompt",
        temperature=0.5,
        response_content="Test response",
        input_tokens=100,
        output_tokens=50,
        total_tokens=150,
        actual_cost_cents=0.025,
        duration_ms=500,
        selected_provider="anthropic",
        selected_model="claude-sonnet-4",
    )
    
    serialized = cache._serialize_context(ctx)
    print(f"  Serialized keys: {list(serialized.keys())}")
    
    deserialized = cache._deserialize_context(serialized)
    print(f"  Deserialized trace_id: {deserialized.trace_id}")
    assert deserialized.user_id == ctx.user_id
    assert deserialized.response_content == ctx.response_content
    assert deserialized.metadata.get("from_cache") == True
    
    # Test cache operations (will work only if Redis is available)
    print("\n3. Testing cache operations:")
    
    # Try to get (should be None)
    cached = cache.get(ctx)
    print(f"  Initial cache get: {cached}")
    
    # Set cache
    cache.set(ctx)
    print(f"  Cache set completed")
    
    # Try to get again (may return cached value if Redis is available)
    cached = cache.get(ctx)
    if cached:
        print(f"  Cache hit! Response: {cached.response_content[:50]}...")
    else:
        print(f"  Cache miss (Redis may not be available)")
    
    # Test metrics
    print("\n4. Prompt cache metrics:")
    metrics = cache.get_metrics()
    for key, value in metrics.items():
        print(f"  {key}: {value}")
    
    print("✓ Prompt cache tests passed")


def main():
    """Run all tests."""
    print("=" * 60)
    print("Testing Rate Limiter and Prompt Cache")
    print("=" * 60)
    
    try:
        # Test prompt cache (synchronous)
        test_prompt_cache()
        
        # Test rate limiter (async)
        asyncio.run(test_rate_limiter())
        
        print("\n" + "=" * 60)
        print("ALL TESTS PASSED ✓")
        print("=" * 60)
        
    except AssertionError as e:
        print(f"\n✗ Test failed: {e}")
        raise
    except Exception as e:
        print(f"\n✗ Unexpected error: {e}")
        raise


if __name__ == "__main__":
    main()

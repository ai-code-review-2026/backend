"""
Example: Using the LLM Observability Infrastructure

This script demonstrates how to use the observability services to:
1. Log LLM traces
2. Record aggregated metrics
3. Query traces and metrics

Run:
    poetry run python scripts/example_observability.py
"""

import asyncio
import time
from datetime import datetime, timedelta

from app.gateway.request_context import (
    CostTarget,
    LLMRequestContext,
    RequestPriority,
    SensitivityLevel,
)
from app.observability import (
    delete_old_traces,
    get_provider_distribution,
    get_summary,
    get_time_series,
    get_trace,
    get_traces_by_analysis,
    init_observability,
    list_traces,
    log_trace,
    record_request,
)


async def example_log_trace():
    """Example: Log a single LLM trace."""
    print("\n=== Example 1: Log a Trace ===")
    
    # Create a mock LLM request context
    ctx = LLMRequestContext(
        user_id="user_demo_123",
        project_id="project_demo_456",
        analysis_id="analysis_demo_789",
        system_prompt="You are a helpful code reviewer.",
        user_prompt="Review this Python function for bugs and suggest improvements.",
        temperature=0.2,
        max_tokens=2000,
        priority=RequestPriority.HIGH,
        sensitivity=SensitivityLevel.INTERNAL,
        cost_target=CostTarget.BALANCED,
    )
    
    # Simulate provider selection
    ctx.selected_provider = "ollama"
    ctx.selected_model = "deepseek-coder:6.7b"
    ctx.routing_reason = "local_preferred_for_internal_sensitivity"
    
    # Simulate response
    ctx.response_content = (
        "The function looks good overall. Here are some suggestions:\n"
        "1. Add type hints for better code clarity\n"
        "2. Consider adding docstring\n"
        "3. Handle edge case where input is None"
    )
    ctx.input_tokens = 150
    ctx.output_tokens = 75
    ctx.total_tokens = 225
    ctx.actual_cost_cents = 0.0  # Ollama is free
    ctx.mark_completed(1500)  # 1.5 seconds
    
    # Log the trace
    await log_trace(ctx)
    print(f"✓ Logged trace: {ctx.trace_id}")
    
    # Retrieve it back
    retrieved = await get_trace(ctx.trace_id)
    print(f"✓ Retrieved trace: {retrieved['trace_id']}")
    print(f"  - Provider: {retrieved['provider']}")
    print(f"  - Model: {retrieved['model']}")
    print(f"  - Tokens: {retrieved['total_tokens']}")
    print(f"  - Duration: {retrieved['duration_ms']}ms")
    print(f"  - Cost: ${retrieved['cost_cents']/100:.4f}")
    
    return ctx


async def example_record_metrics(ctx: LLMRequestContext):
    """Example: Record metrics for a request."""
    print("\n=== Example 2: Record Metrics ===")
    
    # Record metrics (updates both Prometheus and PostgreSQL)
    await record_request(ctx)
    print(f"✓ Recorded metrics for trace: {ctx.trace_id}")


async def example_query_traces():
    """Example: Query traces with filters."""
    print("\n=== Example 3: Query Traces ===")
    
    # List recent traces for a user
    traces = await list_traces(
        user_id="user_demo_123",
        limit=10,
    )
    print(f"✓ Found {len(traces)} traces for user_demo_123")
    
    if traces:
        print("\nRecent traces:")
        for trace in traces[:3]:
            print(f"  - {trace['trace_id'][:12]}... | "
                  f"{trace['provider']}:{trace['model']} | "
                  f"{trace['duration_ms']}ms | "
                  f"{trace['total_tokens']} tokens")


async def example_get_summary():
    """Example: Get aggregated metrics summary."""
    print("\n=== Example 4: Get Metrics Summary ===")
    
    # Get summary for last 30 days, grouped by provider
    start_date = datetime.utcnow() - timedelta(days=30)
    summary = await get_summary(
        start_date=start_date,
        group_by="provider",
    )
    
    print("Metrics summary (last 30 days):")
    if "data" in summary:
        for item in summary["data"]:
            provider = item.get("provider", "unknown")
            total_req = item.get("total_requests", 0)
            total_tokens = item.get("total_tokens", 0)
            total_cost = item.get("total_cost_cents", 0) / 100
            avg_latency = item.get("avg_latency_ms", 0)
            error_rate = item.get("error_rate", 0) * 100
            
            print(f"\n{provider}:")
            print(f"  - Requests: {total_req}")
            print(f"  - Tokens: {total_tokens:,}")
            print(f"  - Cost: ${total_cost:.2f}")
            print(f"  - Avg Latency: {avg_latency:.0f}ms")
            print(f"  - Error Rate: {error_rate:.1f}%")


async def example_time_series():
    """Example: Get time-series data for charting."""
    print("\n=== Example 5: Time-Series Data ===")
    
    # Get daily metrics for the last 7 days
    start_date = datetime.utcnow() - timedelta(days=7)
    time_series = await get_time_series(
        metric_type="daily",
        start_date=start_date,
    )
    
    print(f"Daily metrics (last 7 days): {len(time_series)} data points")
    
    if time_series:
        print("\nSample data points:")
        for row in time_series[:3]:
            date = row["timestamp"].strftime("%Y-%m-%d")
            requests = row["total_requests"]
            tokens = row["total_tokens"]
            cost = row["total_cost_cents"] / 100
            
            print(f"  - {date}: {requests} requests, {tokens:,} tokens, ${cost:.2f}")


async def example_provider_distribution():
    """Example: Get provider distribution."""
    print("\n=== Example 6: Provider Distribution ===")
    
    distribution = await get_provider_distribution()
    
    print("Provider distribution (last 30 days):")
    for provider, count in distribution.items():
        print(f"  - {provider}: {count} requests")


async def main():
    """Run all examples."""
    print("=" * 60)
    print("LLM Observability Infrastructure - Examples")
    print("=" * 60)
    
    # Initialize tables
    print("\nInitializing observability infrastructure...")
    init_observability()
    print("✓ Tables initialized")
    
    # Run examples
    ctx = await example_log_trace()
    await example_record_metrics(ctx)
    await example_query_traces()
    await example_get_summary()
    await example_time_series()
    await example_provider_distribution()
    
    print("\n" + "=" * 60)
    print("All examples completed successfully!")
    print("=" * 60)
    
    # Optional: Clean up demo data
    print("\nNote: Demo traces remain in database.")
    print("To clean up old traces, use:")
    print("  await delete_old_traces(days=90)")


if __name__ == "__main__":
    asyncio.run(main())

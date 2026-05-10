"""
Progress Broadcaster - Helper for broadcasting LLM progress from anywhere.

This module provides a simple, non-blocking interface for broadcasting
LLM generation progress events to connected WebSocket clients.

Usage:
    from app.api.websockets.progress_broadcaster import broadcast_llm_progress
    
    # From gateway
    await broadcast_llm_progress(
        trace_id="trace-123",
        event="routing_completed",
        data={"provider": "ollama", "model": "qwen2.5-coder:7b"}
    )
    
    # From providers (streaming)
    await broadcast_llm_progress(
        trace_id=ctx.trace_id,
        event="tokens_streaming",
        data={"tokens_received": 150, "elapsed_ms": 1200}
    )

Features:
- Non-blocking: Uses asyncio.create_task for fire-and-forget
- Error-resilient: Catches and logs exceptions without disrupting main flow
- Singleton pattern: Single broadcaster instance shared across app
- Graceful handling: Manages disconnected clients automatically
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


class ProgressBroadcaster:
    """
    Singleton broadcaster for LLM progress events.
    
    This class provides a thin wrapper around the WebSocket ConnectionManager
    to enable easy broadcasting from anywhere in the application without
    tight coupling to WebSocket infrastructure.
    """

    _instance: ProgressBroadcaster | None = None

    def __init__(self) -> None:
        self._manager = None

    @classmethod
    def get_instance(cls) -> ProgressBroadcaster:
        """
        Get or create the singleton broadcaster instance.
        
        Returns:
            The singleton ProgressBroadcaster instance
        """
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _get_manager(self):
        """
        Lazy-load the connection manager to avoid circular imports.
        
        Returns:
            The ConnectionManager instance from llm_progress
        """
        if self._manager is None:
            try:
                from app.api.websockets.llm_progress import get_connection_manager

                self._manager = get_connection_manager()
            except Exception as exc:
                logger.warning(
                    f"Failed to load connection manager: {exc}. "
                    "WebSocket broadcasting will be disabled."
                )
                # Return a no-op manager
                return None
        return self._manager

    async def broadcast(
        self, trace_id: str, event: str, data: Dict[str, Any] | None = None
    ) -> None:
        """
        Broadcast a progress event to all clients monitoring a trace.
        
        This method is safe to call even if no WebSocket clients are connected.
        Errors are caught and logged without disrupting the caller.
        
        Args:
            trace_id: The LLM trace ID to broadcast to
            event: Event name (e.g., "routing_completed", "tokens_streaming")
            data: Optional event-specific data dictionary
        """
        manager = self._get_manager()
        if manager is None:
            # Manager not available - silently skip
            return

        try:
            await manager.broadcast(trace_id, event, data)
        except Exception as exc:
            # Log but don't propagate - broadcasting is best-effort
            logger.warning(
                f"Failed to broadcast event '{event}' for trace {trace_id}: {exc}"
            )

    def broadcast_nowait(
        self, trace_id: str, event: str, data: Dict[str, Any] | None = None
    ) -> None:
        """
        Broadcast without blocking (fire-and-forget).
        
        This method creates an asyncio task for the broadcast operation and
        returns immediately. Useful for synchronous contexts or when you don't
        want to await the broadcast.
        
        Args:
            trace_id: The LLM trace ID to broadcast to
            event: Event name
            data: Optional event-specific data dictionary
        """
        try:
            # Create task in a non-blocking way
            asyncio.create_task(self.broadcast(trace_id, event, data))
        except RuntimeError:
            # No event loop running - this can happen during testing or shutdown
            logger.debug(
                f"Cannot broadcast event '{event}' - no event loop running"
            )
        except Exception as exc:
            logger.warning(
                f"Failed to create broadcast task for trace {trace_id}: {exc}"
            )

    def get_stats(self) -> Dict[str, Any] | None:
        """
        Get statistics about active WebSocket connections.
        
        Returns:
            Dictionary with connection statistics, or None if manager unavailable
        """
        manager = self._get_manager()
        if manager is None:
            return None
        return manager.get_stats()


def get_progress_broadcaster() -> ProgressBroadcaster:
    """
    Get the singleton progress broadcaster instance.
    
    Returns:
        The singleton ProgressBroadcaster instance
    """
    return ProgressBroadcaster.get_instance()


async def broadcast_llm_progress(
    trace_id: str, event: str, data: Dict[str, Any] | None = None
) -> None:
    """
    Convenience function for broadcasting LLM progress.
    
    This is the main function to use throughout the codebase for broadcasting
    progress events. It's async-safe and handles all error cases gracefully.
    
    Args:
        trace_id: The LLM trace ID to broadcast to
        event: Event name (see llm_progress.py for standard events)
        data: Optional event-specific data
    
    Example:
        await broadcast_llm_progress(
            trace_id=ctx.trace_id,
            event="routing_started",
            data={"sensitivity": "confidential"}
        )
    """
    broadcaster = get_progress_broadcaster()
    await broadcaster.broadcast(trace_id, event, data)


def broadcast_llm_progress_nowait(
    trace_id: str, event: str, data: Dict[str, Any] | None = None
) -> None:
    """
    Non-blocking convenience function for broadcasting LLM progress.
    
    Use this variant when you're in a synchronous context or don't want to
    await the broadcast. The broadcast will happen in the background.
    
    Args:
        trace_id: The LLM trace ID to broadcast to
        event: Event name
        data: Optional event-specific data
    
    Example:
        broadcast_llm_progress_nowait(
            trace_id=ctx.trace_id,
            event="cache_checked",
            data={"hit": True}
        )
    """
    broadcaster = get_progress_broadcaster()
    broadcaster.broadcast_nowait(trace_id, event, data)

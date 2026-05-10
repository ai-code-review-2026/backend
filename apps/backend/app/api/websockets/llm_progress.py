"""
WebSocket endpoint for real-time LLM generation progress tracking.

Route: /ws/llm/{trace_id}

Events emitted:
- routing_started: Initial routing phase begins
- routing_completed: Provider and model selected
- rate_limit_checked: Rate limit verification completed
- cache_checked: Cache lookup result
- provider_selected: Final provider choice confirmed
- generation_started: LLM generation begins
- tokens_streaming: Token streaming in progress (with token count)
- generation_completed: Generation finished
- trace_logged: Trace saved to database
- error: Error occurred during any phase

Event format:
{
    "event": "event_name",
    "timestamp": "2024-01-01T00:00:00.000Z",
    "data": {
        // Event-specific data
    }
}

Usage:
    Connect: ws://localhost:8000/ws/llm/{trace_id}
    
    Example messages:
    {
        "event": "routing_completed",
        "timestamp": "2024-01-01T12:00:00.000Z",
        "data": {
            "provider": "ollama",
            "model": "qwen2.5-coder:7b",
            "reason": "sensitivity-based routing"
        }
    }
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import WebSocket, WebSocketDisconnect
from fastapi.routing import APIRouter

logger = logging.getLogger(__name__)

router = APIRouter()


class ConnectionManager:
    """
    Manages WebSocket connections for LLM progress tracking.
    
    Stores connections by trace_id to allow multiple clients to monitor
    the same LLM generation process (e.g., for team collaboration).
    """

    def __init__(self) -> None:
        # Dictionary: trace_id -> List of WebSocket connections
        self.active_connections: Dict[str, List[WebSocket]] = {}
        # Dictionary: WebSocket -> trace_id for cleanup
        self.connection_trace_map: Dict[WebSocket, str] = {}

    async def connect(self, websocket: WebSocket, trace_id: str) -> None:
        """
        Accept and register a new WebSocket connection for a trace.
        
        Args:
            websocket: The WebSocket connection to register
            trace_id: The LLM trace ID to monitor
        """
        await websocket.accept()

        if trace_id not in self.active_connections:
            self.active_connections[trace_id] = []

        self.active_connections[trace_id].append(websocket)
        self.connection_trace_map[websocket] = trace_id

        logger.info(f"Client connected to trace {trace_id}")

        # Send connection acknowledgment
        await self._send_to_websocket(
            websocket,
            {
                "event": "connected",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "data": {"trace_id": trace_id},
            },
        )

    def disconnect(self, websocket: WebSocket) -> None:
        """
        Disconnect and clean up a WebSocket connection.
        
        Args:
            websocket: The WebSocket connection to disconnect
        """
        if websocket in self.connection_trace_map:
            trace_id = self.connection_trace_map[websocket]

            # Remove from active connections
            if trace_id in self.active_connections:
                try:
                    self.active_connections[trace_id].remove(websocket)
                except ValueError:
                    pass  # Already removed

                # Clean up empty trace_id entries
                if not self.active_connections[trace_id]:
                    del self.active_connections[trace_id]
                    logger.info(f"No more clients for trace {trace_id}")

            # Remove from connection map
            del self.connection_trace_map[websocket]

            logger.info(f"Client disconnected from trace {trace_id}")

    async def broadcast(
        self, trace_id: str, event: str, data: Dict[str, Any] | None = None
    ) -> None:
        """
        Broadcast a progress event to all clients monitoring a trace.
        
        Args:
            trace_id: The trace ID to broadcast to
            event: Event name (e.g., "routing_completed")
            data: Optional event-specific data
        """
        if trace_id not in self.active_connections:
            # No clients connected for this trace - this is normal
            return

        message = {
            "event": event,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data or {},
        }

        disconnected = []
        for websocket in self.active_connections[trace_id]:
            try:
                await self._send_to_websocket(websocket, message)
            except Exception as exc:
                logger.warning(
                    f"Failed to send to client on trace {trace_id}: {exc}"
                )
                disconnected.append(websocket)

        # Clean up disconnected clients
        for ws in disconnected:
            self.disconnect(ws)

    async def _send_to_websocket(
        self, websocket: WebSocket, message: Dict[str, Any]
    ) -> None:
        """
        Send a JSON message to a WebSocket.
        
        Args:
            websocket: The WebSocket to send to
            message: The message dictionary to send
        """
        await websocket.send_text(json.dumps(message))

    def get_connection_count(self, trace_id: str) -> int:
        """
        Get the number of active connections for a trace.
        
        Args:
            trace_id: The trace ID to check
            
        Returns:
            Number of active connections
        """
        return len(self.active_connections.get(trace_id, []))

    def get_stats(self) -> Dict[str, Any]:
        """
        Get statistics about active connections.
        
        Returns:
            Dictionary with connection statistics
        """
        return {
            "total_traces": len(self.active_connections),
            "total_connections": len(self.connection_trace_map),
            "traces": {
                trace_id: len(connections)
                for trace_id, connections in self.active_connections.items()
            },
        }


# Global connection manager instance
manager = ConnectionManager()


@router.websocket("/ws/llm/{trace_id}")
async def llm_progress_websocket(websocket: WebSocket, trace_id: str) -> None:
    """
    WebSocket endpoint for monitoring LLM generation progress.
    
    Path Parameters:
        trace_id: The LLM trace ID to monitor
    
    Connection Flow:
        1. Client connects with trace_id
        2. Server accepts and sends "connected" event
        3. Server broadcasts progress events as they occur
        4. Client can send "ping" for keepalive (server responds with "pong")
        5. Connection closes when generation completes or client disconnects
    
    Example Client Usage:
        ```javascript
        const ws = new WebSocket('ws://localhost:8000/ws/llm/trace-123');
        
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            console.log(`Event: ${msg.event}`, msg.data);
            
            if (msg.event === 'generation_completed') {
                ws.close();
            }
        };
        
        // Keepalive
        setInterval(() => {
            ws.send(JSON.stringify({ type: 'ping' }));
        }, 30000);
        ```
    """
    try:
        await manager.connect(websocket, trace_id)

        # Listen for client messages (mainly for keepalive)
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(
                    json.dumps(
                        {
                            "event": "error",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "data": {"error": "invalid_json"},
                        }
                    )
                )
                continue

            message_type = message.get("type")

            if message_type == "ping":
                # Respond to keepalive
                await websocket.send_text(
                    json.dumps(
                        {
                            "event": "pong",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "data": {},
                        }
                    )
                )
            else:
                # Unknown message type - acknowledge but don't process
                await websocket.send_text(
                    json.dumps(
                        {
                            "event": "ack",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                            "data": {"received": str(message_type or "unknown")},
                        }
                    )
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as exc:
        logger.exception(f"WebSocket error for trace {trace_id}: {exc}")
        manager.disconnect(websocket)


def get_connection_manager() -> ConnectionManager:
    """
    Get the global connection manager instance.
    
    Returns:
        The singleton ConnectionManager instance
    """
    return manager

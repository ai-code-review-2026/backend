from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class NotificationRealtimeHub:
    """In-memory hub for user-scoped notification WebSocket delivery."""

    def __init__(self) -> None:
        self._user_connections: dict[str, set[WebSocket]] = {}
        self._connection_users: dict[WebSocket, str] = {}
        self._lock = asyncio.Lock()

    async def register(self, websocket: WebSocket, user_id: str) -> None:
        await websocket.accept()
        async with self._lock:
            self._user_connections.setdefault(user_id, set()).add(websocket)
            self._connection_users[websocket] = user_id

        await self._safe_send(
            websocket,
            {
                "type": "connection:ready",
                "user_id": user_id,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )

    async def unregister(self, websocket: WebSocket) -> None:
        async with self._lock:
            user_id = self._connection_users.pop(websocket, None)
            if not user_id:
                return

            user_sockets = self._user_connections.get(user_id)
            if not user_sockets:
                return
            user_sockets.discard(websocket)
            if not user_sockets:
                self._user_connections.pop(user_id, None)

    async def emit_to_user(self, user_id: str, message: dict[str, Any]) -> None:
        async with self._lock:
            sockets = list(self._user_connections.get(user_id, set()))

        if not sockets:
            return

        disconnected: list[WebSocket] = []
        for websocket in sockets:
            ok = await self._safe_send(websocket, message)
            if not ok:
                disconnected.append(websocket)

        for websocket in disconnected:
            await self.unregister(websocket)

    async def emit_to_users(self, user_ids: list[str], message: dict[str, Any]) -> None:
        for user_id in set(user_ids):
            await self.emit_to_user(user_id, message)

    async def _safe_send(self, websocket: WebSocket, message: dict[str, Any]) -> bool:
        try:
            await websocket.send_text(json.dumps(message))
            return True
        except Exception as exc:  # noqa: BLE001
            logger.debug("Realtime send failed: %s", exc)
            return False


notification_realtime_hub = NotificationRealtimeHub()


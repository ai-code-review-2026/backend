from __future__ import annotations

import json
from typing import Any, Dict, Set
from datetime import datetime, timezone

from fastapi import WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.routing import APIRouter

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal
from app.data.repos.review_sessions_repo import ReviewSessionsRepo, UpdateReviewSessionInput

router = APIRouter()

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        # Dictionary: session_id -> set of WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Dictionary: WebSocket -> (user_id, session_id)
        self.connection_info: Dict[WebSocket, tuple[str, str]] = {}

    async def connect(self, websocket: WebSocket, session_id: str, user_id: str):
        """Connect a user to a review session"""
        await websocket.accept()

        if session_id not in self.active_connections:
            self.active_connections[session_id] = set()

        self.active_connections[session_id].add(websocket)
        self.connection_info[websocket] = (user_id, session_id)

        # Add user to session participants if not already there
        repo = ReviewSessionsRepo()
        repo.add_participant(session_id, user_id)

        # Notify other participants
        await self.broadcast_to_session(session_id, {
            "type": "user_joined",
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, exclude=[websocket])

    def disconnect(self, websocket: WebSocket):
        """Disconnect a user from their session"""
        if websocket in self.connection_info:
            user_id, session_id = self.connection_info[websocket]

            # Remove from active connections
            if session_id in self.active_connections:
                self.active_connections[session_id].discard(websocket)
                if not self.active_connections[session_id]:
                    del self.active_connections[session_id]

            del self.connection_info[websocket]

            # Notify other participants
            if session_id in self.active_connections:
                import asyncio
                asyncio.create_task(self.broadcast_to_session(session_id, {
                    "type": "user_left",
                    "user_id": user_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }))

    async def broadcast_to_session(self, session_id: str, message: dict, exclude: list[WebSocket] = None):
        """Broadcast a message to all users in a session"""
        exclude = exclude or []
        if session_id in self.active_connections:
            disconnected = []
            for websocket in self.active_connections[session_id]:
                if websocket in exclude:
                    continue
                try:
                    await websocket.send_text(json.dumps(message))
                except:
                    disconnected.append(websocket)

            # Clean up disconnected websockets
            for ws in disconnected:
                self.disconnect(ws)

    async def send_to_user(self, session_id: str, user_id: str, message: dict):
        """Send a message to a specific user in a session"""
        if session_id in self.active_connections:
            for websocket in list(self.active_connections[session_id]):
                if websocket in self.connection_info:
                    ws_user_id, _ = self.connection_info[websocket]
                    if ws_user_id == user_id:
                        try:
                            await websocket.send_text(json.dumps(message))
                        except:
                            self.disconnect(websocket)

    def get_session_participants(self, session_id: str) -> list[str]:
        """Get list of active user IDs in a session"""
        participants = []
        if session_id in self.active_connections:
            for websocket in self.active_connections[session_id]:
                if websocket in self.connection_info:
                    user_id, _ = self.connection_info[websocket]
                    participants.append(user_id)
        return participants

# Global connection manager
manager = ConnectionManager()

@router.websocket("/reviews/sessions/{session_id}/ws")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time review collaboration"""
    try:
        # Note: WebSocket authentication is tricky with FastAPI
        # In production, you'd validate JWT token from query params or headers
        # For now, we'll accept the connection and validate later

        # Get user_id from query params (in production, extract from JWT)
        user_id = websocket.query_params.get("user_id")
        if not user_id:
            await websocket.close(code=4001, reason="Missing user_id")
            return

        # Verify session exists
        repo = ReviewSessionsRepo()
        session = repo.get_session_by_id(session_id)
        if not session:
            await websocket.close(code=4004, reason="Session not found")
            return

        await manager.connect(websocket, session_id, user_id)

        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)

            # Process different message types
            await handle_websocket_message(session_id, user_id, message, websocket)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        manager.disconnect(websocket)

async def handle_websocket_message(session_id: str, user_id: str, message: dict, websocket: WebSocket):
    """Handle incoming WebSocket messages"""
    message_type = message.get("type")

    if message_type == "cursor_update":
        # Update user's cursor position
        file_path = message.get("file_path")
        line = message.get("line")

        if file_path and line is not None:
            # Update cursor position in database
            repo = ReviewSessionsRepo()
            repo.update_cursor_position(session_id, user_id, file_path, line)

            # Broadcast to other participants
            await manager.broadcast_to_session(session_id, {
                "type": "cursor_update",
                "user_id": user_id,
                "file_path": file_path,
                "line": line,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }, exclude=[websocket])

    elif message_type == "file_change":
        # User switched to a different file
        file_path = message.get("file_path")

        if file_path:
            # Update current file in session
            repo = ReviewSessionsRepo()
            update_data = UpdateReviewSessionInput(current_file=file_path)
            repo.update_session(session_id, update_data)

            # Broadcast to other participants
            await manager.broadcast_to_session(session_id, {
                "type": "file_change",
                "user_id": user_id,
                "file_path": file_path,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }, exclude=[websocket])

    elif message_type == "comment_draft":
        # User is typing a comment (don't save, just notify)
        await manager.broadcast_to_session(session_id, {
            "type": "comment_draft",
            "user_id": user_id,
            "file_path": message.get("file_path"),
            "line_start": message.get("line_start"),
            "content": message.get("content", ""),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, exclude=[websocket])

    elif message_type == "comment_created":
        # A comment was created through the REST API
        # This is just a notification to update UI
        await manager.broadcast_to_session(session_id, {
            "type": "comment_created",
            "comment_id": message.get("comment_id"),
            "file_path": message.get("file_path"),
            "line_start": message.get("line_start"),
            "author_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, exclude=[websocket])

    elif message_type == "session_note":
        # Update session notes
        notes = message.get("notes", "")
        repo = ReviewSessionsRepo()
        update_data = UpdateReviewSessionInput(session_notes=notes)
        repo.update_session(session_id, update_data)

        # Broadcast to other participants
        await manager.broadcast_to_session(session_id, {
            "type": "session_note_updated",
            "user_id": user_id,
            "notes": notes,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }, exclude=[websocket])

    elif message_type == "ping":
        # Heartbeat/keepalive
        await websocket.send_text(json.dumps({
            "type": "pong",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }))

    else:
        # Unknown message type
        await websocket.send_text(json.dumps({
            "type": "error",
            "message": f"Unknown message type: {message_type}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }))

# Helper function to broadcast comment creation from REST API
async def notify_comment_created(session_id: str, comment_data: dict):
    """Call this from REST API when a comment is created during live session"""
    await manager.broadcast_to_session(session_id, {
        "type": "comment_created",
        **comment_data,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

# Helper function to get active sessions
def get_active_session_info():
    """Get information about active sessions for monitoring"""
    return {
        "active_sessions": len(manager.active_connections),
        "total_connections": sum(len(connections) for connections in manager.active_connections.values()),
        "sessions": {
            session_id: {
                "participant_count": len(connections),
                "participants": manager.get_session_participants(session_id)
            }
            for session_id, connections in manager.active_connections.items()
        }
    }
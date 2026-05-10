from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import jwt
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.routing import APIRouter
from jwt import InvalidTokenError

from app.api.middleware.auth import get_clerk_jwk_client
from app.services.notification_realtime import notification_realtime_hub
from app.settings import settings

router = APIRouter()


def _decode_websocket_token(token: str) -> dict[str, Any]:
    signing_key = get_clerk_jwk_client().get_signing_key_from_jwt(token)
    issuer = (settings.CLERK_ISSUER_URL or "").rstrip("/") or None
    audience = settings.CLERK_AUDIENCE.strip() if settings.CLERK_AUDIENCE else None
    options = {"verify_aud": audience is not None}

    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=audience,
        issuer=issuer,
        options=options,
        leeway=settings.CLERK_JWT_LEEWAY_SECONDS,
    )


def _resolve_user_id(websocket: WebSocket) -> str | None:
    token = websocket.query_params.get("token")
    query_user_id = websocket.query_params.get("user_id")

    if settings.CLERK_AUTH_ENABLED:
        if not token:
            return None
        try:
            claims = _decode_websocket_token(token)
        except InvalidTokenError:
            return None
        except Exception:
            return None
        sub = claims.get("sub")
        return str(sub).strip() if isinstance(sub, str) and sub.strip() else None

    # Dev/local fallback when Clerk auth is disabled.
    if query_user_id and query_user_id.strip():
        return query_user_id.strip()
    return None


@router.websocket("/ws/notifications")
async def notifications_websocket_endpoint(websocket: WebSocket) -> None:
    user_id = _resolve_user_id(websocket)
    if not user_id:
        await websocket.close(code=4001, reason="authentication_required")
        return

    await notification_realtime_hub.register(websocket, user_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
            except json.JSONDecodeError:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "error",
                            "message": "invalid_json",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                )
                continue

            message_type = payload.get("type")
            if message_type == "ping":
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "pong",
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                )
            else:
                # Server is source of truth for notification events. Keep this channel
                # simple and one-way to clients except heartbeat.
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "ack",
                            "received": str(message_type or "unknown"),
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                )
    except WebSocketDisconnect:
        await notification_realtime_hub.unregister(websocket)
    except Exception:
        await notification_realtime_hub.unregister(websocket)


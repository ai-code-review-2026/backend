from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from typing import Any, List

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal
from app.settings import settings
from app.services.notifications import NotificationService

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    user_id: str
    type: str
    title: str
    message: str
    data: dict
    read: bool
    created_at: str
    read_at: str | None


class NotificationsListResponse(BaseModel):
    notifications: List[NotificationResponse]
    total: int


class UnreadCountResponse(BaseModel):
    count: int


class PushPublicKeyResponse(BaseModel):
    enabled: bool
    public_key: str | None


class MarkReadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notification_ids: List[str] | None = None


class MarkReadResponse(BaseModel):
    success: bool
    updated_count: int


NotificationPreferenceSection = dict[str, Any] | bool | None


@router.get("", response_model=NotificationsListResponse)
async def get_notifications(
    unread_only: bool = Query(False, description="Filter to unread notifications only"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of notifications to return"),
    offset: int = Query(0, ge=0, description="Number of notifications to skip"),
    role: str | None = Query(None, description="Optional role filter (admin/reviewer/developer)"),
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> NotificationsListResponse:
    """
    Get notifications for the current user.

    Returns a list of notifications ordered by creation date (most recent first).
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    service = NotificationService()
    notifications = await service.get_user_notifications(
        user_id=principal.user_id,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
        role_filter=role,
    )

    return NotificationsListResponse(
        notifications=[
            NotificationResponse(
                id=n["id"],
                user_id=n["user_id"],
                type=n["type"],
                title=n["title"],
                message=n["message"],
                data=n.get("data", {}),
                read=n["read"],
                created_at=n["created_at"].isoformat() if isinstance(n["created_at"], datetime) else str(n["created_at"]),
                read_at=n["read_at"].isoformat() if n.get("read_at") and isinstance(n["read_at"], datetime) else (str(n["read_at"]) if n.get("read_at") else None),
            )
            for n in notifications
        ],
        total=len(notifications),
    )


@router.get("/unread-count", response_model=UnreadCountResponse)
async def get_unread_count(
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> UnreadCountResponse:
    """
    Get the count of unread notifications for the current user.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    service = NotificationService()
    notifications = await service.get_user_notifications(
        user_id=principal.user_id,
        unread_only=True,
        limit=1000,  # Get up to 1000 to count
        offset=0,
    )
    return UnreadCountResponse(count=len(notifications))


@router.post("/mark-read", response_model=MarkReadResponse)
async def mark_notifications_read(
    request: MarkReadRequest,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> MarkReadResponse:
    """
    Mark specific notifications as read.

    If notification_ids is provided, only those notifications will be marked as read.
    If notification_ids is None or empty, all notifications for the user will be marked as read.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    service = NotificationService()
    success = await service.mark_notifications_read(
        user_id=principal.user_id,
        notification_ids=request.notification_ids,
    )

    return MarkReadResponse(
        success=success,
        updated_count=len(request.notification_ids) if request.notification_ids else -1,
    )


@router.post("/mark-all-read", response_model=MarkReadResponse)
async def mark_all_notifications_read(
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> MarkReadResponse:
    """
    Mark all notifications for the current user as read.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    service = NotificationService()
    success = await service.mark_notifications_read(
        user_id=principal.user_id,
        notification_ids=None,  # None means all
    )

    return MarkReadResponse(
        success=success,
        updated_count=-1,  # All notifications
    )


@router.patch("/{notification_id}/read", response_model=MarkReadResponse)
async def mark_notification_read(
    notification_id: str,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> MarkReadResponse:
    """
    Mark a single notification as read.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    service = NotificationService()
    success = await service.mark_notifications_read(
        user_id=principal.user_id,
        notification_ids=[notification_id],
    )

    return MarkReadResponse(
        success=success,
        updated_count=1,
    )


@router.patch("/{notification_id}/archive")
async def archive_notification(
    notification_id: str,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
):
    """
    Archive a notification (mark as read and hide from default view).
    For now, we just mark it as read. Future enhancement: add archived status.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    service = NotificationService()
    success = await service.mark_notifications_read(
        user_id=principal.user_id,
        notification_ids=[notification_id],
    )

    return {"success": success, "message": "Notification archived"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
):
    """
    Delete a specific notification.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    from sqlalchemy import text
    from app.data.database import get_engine
    
    engine = get_engine()
    with engine.begin() as conn:
        # Verify notification belongs to user before deleting
        result = conn.execute(
            text(
                """
                DELETE FROM notifications 
                WHERE id = :notification_id AND user_id = :user_id
                RETURNING id
                """
            ),
            {"notification_id": notification_id, "user_id": principal.user_id},
        )
        deleted = result.fetchone()
    
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found or does not belong to user",
        )
    
    return {"success": True, "message": "Notification deleted"}


@router.delete("")
async def delete_all_notifications(
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
):
    """
    Delete all notifications for the current user.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    from sqlalchemy import text
    from app.data.database import get_engine
    
    engine = get_engine()
    with engine.begin() as conn:
        result = conn.execute(
            text("DELETE FROM notifications WHERE user_id = :user_id"),
            {"user_id": principal.user_id},
        )
        deleted_count = result.rowcount
    
    return {"success": True, "deleted_count": deleted_count, "message": "All notifications deleted"}


@router.post("/read-all", response_model=MarkReadResponse)
async def mark_all_read_alternative(
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> MarkReadResponse:
    """
    Alternative endpoint for marking all as read (for frontend compatibility).
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    return await mark_all_notifications_read(principal)


# ─── Notification Preferences ─────────────────────────────────────────────────


class NotificationPreferencesRequest(BaseModel):
    """Request model for updating notification preferences."""
    model_config = ConfigDict(extra="forbid")

    email: NotificationPreferenceSection = Field(None, description="Email notification settings")
    push: NotificationPreferenceSection = Field(None, description="Push notification settings")
    inApp: NotificationPreferenceSection = Field(None, description="In-app notification settings")
    schedule: NotificationPreferenceSection = Field(None, description="Notification schedule settings")
    slack: NotificationPreferenceSection = Field(None, description="Slack integration settings")
    teams: NotificationPreferenceSection = Field(None, description="Teams integration settings")


class NotificationPreferencesResponse(BaseModel):
    """Response model for notification preferences."""
    email: dict
    push: dict
    inApp: dict
    schedule: dict
    slack: dict | None = None
    teams: dict | None = None


DEFAULT_NOTIFICATION_PREFERENCES = {
    "email": {
        "enabled": True,
        "new_review_assigned": True,
        "review_completed": True,
        "comment_replies": True,
        "mention": True,
        "weekly_digest": False,
        "daily_summary": True,
        "security_alerts": True,
    },
    "push": {
        "enabled": True,
        "new_review_assigned": True,
        "review_completed": False,
        "comment_replies": True,
        "mention": True,
        "realtime_updates": True,
    },
    "inApp": {
        "enabled": True,
        "sound": False,
        "desktop": True,
        "show_preview": True,
    },
    "schedule": {
        "quiet_hours_enabled": False,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00",
        "weekend_notifications": False,
    },
    "slack": None,
    "teams": None,
}

_NOTIFICATION_SECTION_KEYS: dict[str, tuple[str, ...]] = {
    "email": ("email",),
    "push": ("push",),
    "inApp": ("inApp", "in_app"),
    "schedule": ("schedule",),
    "slack": ("slack",),
    "teams": ("teams",),
}

_NOTIFICATION_BOOL_KEYS: dict[str, str] = {
    "email": "enabled",
    "push": "enabled",
    "inApp": "enabled",
    "schedule": "quiet_hours_enabled",
}


def _clone_default_notification_preferences() -> dict[str, Any]:
    return deepcopy(DEFAULT_NOTIFICATION_PREFERENCES)


def _normalize_notification_section(section: str, value: Any) -> dict[str, Any] | None:
    default_value = DEFAULT_NOTIFICATION_PREFERENCES.get(section)

    if isinstance(default_value, dict):
        normalized = deepcopy(default_value)
        if isinstance(value, dict):
            normalized.update(value)
        elif isinstance(value, bool):
            bool_key = _NOTIFICATION_BOOL_KEYS.get(section)
            if bool_key:
                normalized[bool_key] = value
        return normalized

    if value is None:
        return None

    if isinstance(value, dict):
        return deepcopy(value)

    if isinstance(value, bool):
        return {"enabled": value}

    return None


def _load_notification_preferences(raw_preferences: Any) -> dict[str, Any]:
    if isinstance(raw_preferences, str):
        try:
            raw_preferences = json.loads(raw_preferences)
        except json.JSONDecodeError:
            raw_preferences = {}

    if not isinstance(raw_preferences, dict):
        return _clone_default_notification_preferences()

    merged = _clone_default_notification_preferences()
    for canonical_key, aliases in _NOTIFICATION_SECTION_KEYS.items():
        raw_value = next((raw_preferences.get(alias) for alias in aliases if alias in raw_preferences), None)
        normalized_value = _normalize_notification_section(canonical_key, raw_value)
        merged[canonical_key] = normalized_value
    return merged


@router.get("/preferences", response_model=NotificationPreferencesResponse)
async def get_notification_preferences(
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> NotificationPreferencesResponse:
    """
    Get notification preferences for the current user.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    from sqlalchemy import text
    from app.data.database import get_engine
    import json

    engine = get_engine()
    with engine.connect() as conn:
        result = conn.execute(
            text("SELECT notification_preferences FROM users WHERE id = :user_id"),
            {"user_id": principal.user_id},
        )
        row = result.mappings().first()

    if row:
        prefs = _load_notification_preferences(row.get("notification_preferences"))
        return NotificationPreferencesResponse(**prefs)

    return NotificationPreferencesResponse(**_clone_default_notification_preferences())


@router.put("/preferences")
async def update_notification_preferences(
    request: NotificationPreferencesRequest,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
):
    """
    Update notification preferences for the current user.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    from sqlalchemy import text
    from app.data.database import get_engine
    import json

    # Build preferences dict from request
    prefs = {}
    if request.email is not None:
        prefs["email"] = request.email
    if request.push is not None:
        prefs["push"] = request.push
    if request.inApp is not None:
        prefs["inApp"] = request.inApp
    if request.schedule is not None:
        prefs["schedule"] = request.schedule
    if request.slack is not None:
        prefs["slack"] = request.slack
    if request.teams is not None:
        prefs["teams"] = request.teams

    engine = get_engine()
    with engine.begin() as conn:
        # Get current preferences first
        result = conn.execute(
            text("SELECT notification_preferences FROM users WHERE id = :user_id"),
            {"user_id": principal.user_id},
        )
        row = result.mappings().first()

        current_prefs = _load_notification_preferences(row.get("notification_preferences") if row else None)

        # Merge with new preferences
        for key, value in prefs.items():
            current_section = current_prefs.get(key)
            if isinstance(current_section, dict):
                merged_section = deepcopy(current_section)
                if isinstance(value, dict):
                    merged_section.update(value)
                elif isinstance(value, bool):
                    bool_key = _NOTIFICATION_BOOL_KEYS.get(key, "enabled")
                    merged_section[bool_key] = value
                current_prefs[key] = merged_section
            elif isinstance(value, dict):
                current_prefs[key] = deepcopy(value)
            elif isinstance(value, bool):
                current_prefs[key] = {"enabled": value}
            else:
                current_prefs[key] = value

        # Update in database
        conn.execute(
            text(
                """
                UPDATE users 
                SET notification_preferences = CAST(:prefs AS jsonb)
                WHERE id = :user_id
                """
            ),
            {"user_id": principal.user_id, "prefs": json.dumps(current_prefs)},
        )

    return {"success": True, "preferences": current_prefs}


@router.patch("/preferences")
async def patch_notification_preferences(
    request: NotificationPreferencesRequest,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
):
    """
    Partial update notification preferences (alias for PUT).
    """
    return await update_notification_preferences(request, principal)


@router.post("/preferences/reset")
async def reset_notification_preferences(
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
):
    """
    Reset notification preferences to defaults for the current user.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    from sqlalchemy import text
    from app.data.database import get_engine
    import json

    engine = get_engine()
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                UPDATE users 
                SET notification_preferences = CAST(:prefs AS jsonb)
                WHERE id = :user_id
                """
            ),
            {
                "user_id": principal.user_id,
                "prefs": json.dumps(_clone_default_notification_preferences()),
            },
        )

    return {"success": True, "preferences": _clone_default_notification_preferences()}


class PushSubscriptionKeys(BaseModel):
    model_config = ConfigDict(extra="forbid")
    p256dh: str
    auth: str


class PushSubscriptionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str
    keys: PushSubscriptionKeys
    expirationTime: int | None = None


@router.post("/push-subscriptions")
async def register_push_subscription(
    request: PushSubscriptionRequest,
    http_request: Request,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
):
    """
    Register or update browser push subscription for current user.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    service = NotificationService()
    success = service.register_push_subscription(
        user_id=principal.user_id,
        subscription=request.model_dump(),
        user_agent=http_request.headers.get("user-agent"),
    )
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_subscription")
    return {"success": True}


class DeletePushSubscriptionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    endpoint: str


@router.delete("/push-subscriptions")
async def delete_push_subscription(
    request: DeletePushSubscriptionRequest,
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
):
    """
    Delete browser push subscription for current user.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    service = NotificationService()
    deleted = service.unregister_push_subscription(
        user_id=principal.user_id,
        endpoint=request.endpoint,
    )
    return {"success": deleted}


@router.get("/push-public-key", response_model=PushPublicKeyResponse)
async def get_push_public_key(
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> PushPublicKeyResponse:
    """
    Return VAPID public key so clients can subscribe for web push.
    """
    if principal is None or not getattr(principal, "user_id", None):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="authentication_required",
        )
    enabled = bool(settings.PUSH_NOTIFICATIONS_ENABLED and settings.VAPID_PUBLIC_KEY)
    return PushPublicKeyResponse(enabled=enabled, public_key=settings.VAPID_PUBLIC_KEY if enabled else None)

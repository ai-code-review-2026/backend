"""
Mobile-specific API endpoints.
Lightweight responses optimised for the Capacitor mobile app.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.api.middleware.auth import (
    AuthenticatedPrincipal,
    normalize_role_code,
    permissions_for_roles,
    require_auth as require_authenticated,
)
from app.data.database import get_engine

router = APIRouter(prefix="/mobile", tags=["mobile"])
_mobile_bearer_scheme = HTTPBearer(auto_error=False)


# Response models

class PlatformHealthResponse(BaseModel):
    status: str                    # "healthy" | "degraded" | "down"
    queue_depth: int
    failure_rate: float            # percentage
    active_workers: int
    analyses_last_hour: int
    avg_analysis_duration_s: float
    neo4j_connected: bool
    redis_connected: bool
    celery_workers_online: int
    pending_analyses: int
    running_analyses: int


class AnalysisMobileSummary(BaseModel):
    id: str
    status: str
    title: str | None = None
    repo_name: str | None = None
    project_name: str | None = None
    risk_level: str | None = None
    review_classification: str | None = None
    merge_readiness: bool | None = None
    findings_count: int | None = None
    findings_by_severity: dict[str, int] | None = None
    pr_summary: str | None = None
    change_type: str | None = None
    test_suggestions: list[str] | None = None
    auto_fix_available: bool = False
    created_at: str | None = None


class MobileAnalysisItem(BaseModel):
    id: str
    status: str
    mobile_status: str
    title: str | None = None
    repo_name: str | None = None
    project_name: str | None = None
    risk_level: str | None = None
    review_classification: str | None = None
    merge_readiness: bool | None = None
    created_at: str
    findings_count: int = 0


class MobileAnalysesResponse(BaseModel):
    items: list[MobileAnalysisItem]
    total: int


class MobileNotificationItem(BaseModel):
    id: str
    type: str
    title: str
    body: str
    read: bool
    created_at: str
    analysis_id: str | None = None


class MobileNotificationsResponse(BaseModel):
    notifications: list[MobileNotificationItem]
    total: int


class MobileStatisticsResponse(BaseModel):
    total_analyses: int = 0
    completed_analyses: int = 0
    pending_analyses: int = 0
    findings_this_week: int = 0
    approved_prs: int = 0
    return_prs: int = 0


class PushSubscribeRequest(BaseModel):
    token: str
    platform: str  # "android" | "ios"


class MobileCountsResponse(BaseModel):
    new_attention: int = 0
    return_: int = 0
    approved: int = 0
    waiting_reviewer: int = 0
    drafts: int = 0
    waiting_author: int = 0

    class Config:
        populate_by_name = True


class MobileAuthenticatedUser(BaseModel):
    id: str
    email: str
    display_name: str | None = None
    role: str
    permissions: list[str]


def _principal_to_mobile_user(principal: AuthenticatedPrincipal) -> MobileAuthenticatedUser:
    role = normalize_role_code(principal.role)
    if role == "admin":
        role = "tech_lead"
    return MobileAuthenticatedUser(
        id=principal.user_id,
        email=principal.email,
        display_name=principal.display_name,
        role=role,
        permissions=principal.permissions or permissions_for_roles([role]),
    )


def require_mobile_authenticated(
    credentials: HTTPAuthorizationCredentials | None = Security(_mobile_bearer_scheme),
    principal: AuthenticatedPrincipal | None = Depends(require_authenticated),
) -> AuthenticatedPrincipal:
    """Require a real Clerk bearer token for every native mobile endpoint."""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Mobile Clerk session required")

    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Mobile Clerk session required")

    if principal.user_id == "local-dev-user" or principal.email.endswith("@local.dev"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Mobile Clerk session required")

    return principal


# Helpers

def _check_redis() -> bool:
    """Quick Redis ping."""
    try:
        from app.settings import settings
        import redis
        r = redis.from_url(str(settings.redis_url), socket_connect_timeout=2)
        return r.ping()
    except Exception:
        return False


def _celery_stats() -> dict[str, Any]:
    """Get Celery worker stats via Inspect."""
    try:
        from app.workers.celery_app import celery_app
        insp = celery_app.control.inspect(timeout=2)
        active = insp.active() or {}
        reserved = insp.reserved() or {}
        workers_online = len(active)
        running = sum(len(v) for v in active.values())
        pending = sum(len(v) for v in reserved.values())
        return {"workers_online": workers_online, "running": running, "pending": pending}
    except Exception:
        return {"workers_online": 0, "running": 0, "pending": 0}


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _as_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return []
        return parsed if isinstance(parsed, list) else []
    return []


def _normalize_risk(value: Any, blocker_count: int = 0, warn_count: int = 0) -> str:
    raw = str(value or "").strip().upper()
    mapping = {
        "CRITICAL": "CRITICAL",
        "HIGH": "HIGH",
        "MEDIUM": "MEDIUM",
        "LOW": "LOW",
        "BLOCKER": "CRITICAL",
        "WARN": "MEDIUM",
        "INFO": "LOW",
    }
    if raw in mapping:
        return mapping[raw]
    if blocker_count > 0:
        return "CRITICAL"
    if warn_count >= 3:
        return "HIGH"
    if warn_count > 0:
        return "MEDIUM"
    return "LOW"


def _payload_risk(payload: dict[str, Any], blocker_count: int = 0, warn_count: int = 0) -> str:
    summary = _as_dict(payload.get("summary"))
    risk = summary.get("risk_level")
    if not risk:
        risk_findings = _as_list(payload.get("risk_findings"))
        severities = [_as_dict(item).get("severity") for item in risk_findings]
        if "critical" in severities:
            risk = "critical"
        elif "high" in severities:
            risk = "high"
        elif "medium" in severities:
            risk = "medium"
    return _normalize_risk(risk, blocker_count, warn_count)


def _payload_merge_ready(payload: dict[str, Any]) -> bool | None:
    merge = _as_dict(payload.get("merge_readiness"))
    status = str(merge.get("status") or "").strip().lower()
    if not status:
        return None
    return status == "ready"


def _payload_review_classification(payload: dict[str, Any], merge_ready: bool | None) -> str | None:
    merge = _as_dict(payload.get("merge_readiness"))
    status = str(merge.get("status") or "").strip()
    if status:
        return status
    if merge_ready is True:
        return "approved"
    if merge_ready is False:
        return "needs_attention"
    return None


def _payload_test_suggestions(payload: dict[str, Any]) -> list[str] | None:
    suggestions: list[str] = []
    for item in _as_list(payload.get("generated_tests"))[:5]:
        data = _as_dict(item)
        name = data.get("test_name")
        rationale = data.get("rationale")
        if name and rationale:
            suggestions.append(f"{name}: {rationale}")
        elif rationale:
            suggestions.append(str(rationale))
        elif name:
            suggestions.append(str(name))
        for scenario in _as_list(data.get("scenarios"))[:2]:
            if len(suggestions) >= 5:
                break
            suggestions.append(str(scenario))
    return suggestions or None


def _mobile_status(status: str | None, risk: str, merge_ready: bool | None, payload: dict[str, Any]) -> str:
    normalized_status = str(status or "").upper()
    if normalized_status in {"RECEIVED", "QUEUED", "RUNNING"}:
        return "waiting_reviewer"
    if normalized_status == "FAILED":
        return "return"
    if merge_ready is True:
        return "approved"
    merge_status = str(_as_dict(payload.get("merge_readiness")).get("status") or "").lower()
    if merge_status in {"blocked", "needs_attention"}:
        return "return"
    if risk in {"CRITICAL", "HIGH"}:
        return "new_attention"
    return "waiting_author"


def _format_created_at(value: Any) -> str:
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value or "")


def _analysis_title(metadata: dict[str, Any], repo: str | None, pr_number: Any, summary: str | None) -> str:
    for key in ("pr_title", "pull_request_title", "title"):
        value = metadata.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    if summary:
        return str(summary)[:120]
    if pr_number:
        return f"{repo or 'Repository'} PR #{pr_number}"
    return repo or "Analysis"


def _row_to_mobile_item(row: Any) -> MobileAnalysisItem:
    metadata = _as_dict(row.get("metadata_json"))
    payload = _as_dict(row.get("payload_json"))
    blocker_count = int(row.get("blocker_count") or 0)
    warn_count = int(row.get("warn_count") or 0)
    risk = _payload_risk(payload, blocker_count, warn_count)
    merge_ready = _payload_merge_ready(payload)
    mobile_status = _mobile_status(row.get("status"), risk, merge_ready, payload)
    findings_count = int(row.get("db_findings_count") or row.get("findings_count") or 0)
    repo = str(row.get("repo") or "")
    return MobileAnalysisItem(
        id=str(row.get("id")),
        status=str(row.get("status") or "UNKNOWN"),
        mobile_status=mobile_status,
        title=_analysis_title(metadata, repo, row.get("pr_number"), row.get("summary")),
        repo_name=repo or None,
        project_name=metadata.get("project_name") or metadata.get("project") or None,
        risk_level=risk,
        review_classification=_payload_review_classification(payload, merge_ready),
        merge_readiness=merge_ready,
        created_at=_format_created_at(row.get("created_at")),
        findings_count=findings_count,
    )


def _load_mobile_analysis_rows(limit: int) -> list[Any]:
    from sqlalchemy import text

    engine = get_engine()
    with engine.connect() as conn:
        return conn.execute(
            text(
                """
                SELECT
                    a.id,
                    a.status,
                    a.created_at,
                    a.repo,
                    a.pr_number,
                    a.summary,
                    a.change_type,
                    a.metadata_json,
                    a.findings_count,
                    a.blocker_count,
                    a.warn_count,
                    a.info_count,
                    aro.payload_json,
                    (
                        SELECT COUNT(*)
                        FROM findings f
                        WHERE f.analysis_id = a.id
                    ) AS db_findings_count,
                    (
                        SELECT jsonb_object_agg(severity, cnt)
                        FROM (
                            SELECT severity, COUNT(*) AS cnt
                            FROM findings
                            WHERE analysis_id = a.id
                            GROUP BY severity
                        ) sub
                    ) AS findings_by_severity
                FROM analyses a
                LEFT JOIN analysis_review_outputs aro ON aro.analysis_id = a.id
                ORDER BY a.created_at DESC
                LIMIT :limit
                """
            ),
            {"limit": limit},
        ).mappings().all()


# Endpoints

@router.get("/auth/me", response_model=MobileAuthenticatedUser)
async def mobile_auth_me(
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    return _principal_to_mobile_user(principal)


@router.post("/auth/logout")
async def mobile_auth_logout(
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    return {"success": True}


@router.get("/health", response_model=PlatformHealthResponse)
async def mobile_platform_health(
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    """
    Lightweight platform health snapshot for the Tech Lead mobile view.
    Gathers: Celery queue state, Redis ping, analysis failure rate.
    """
    if normalize_role_code(principal.role) not in {"tech_lead", "admin"}:
        raise HTTPException(status_code=403, detail="Platform health is available only for Tech Leads")

    engine = get_engine()
    celery_info = _celery_stats()
    redis_ok = _check_redis()

    # Query analysis stats from the last hour
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            row = conn.execute(text("""
                SELECT
                    COUNT(*) FILTER (WHERE status = 'COMPLETED')         AS completed,
                    COUNT(*) FILTER (WHERE status = 'FAILED')            AS failed,
                    COUNT(*) FILTER (WHERE status IN ('RECEIVED','QUEUED')) AS pending,
                    COUNT(*) FILTER (WHERE status = 'RUNNING')           AS running,
                    AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))
                        FILTER (WHERE status = 'COMPLETED')              AS avg_duration
                FROM analyses
                WHERE created_at >= NOW() - INTERVAL '1 hour'
            """)).fetchone()
            completed = row[0] or 0
            failed = row[1] or 0
            pending = row[2] or 0
            running = row[3] or 0
            avg_duration = float(row[4] or 0)
    except Exception:
        completed = failed = pending = running = 0
        avg_duration = 0.0

    total = completed + failed
    failure_rate = round((failed / total * 100) if total > 0 else 0.0, 1)
    queue_depth = (celery_info["pending"] or 0) + pending

    if failure_rate >= 20 or not redis_ok or celery_info["workers_online"] == 0:
        status = "degraded"
    else:
        status = "healthy"

    return PlatformHealthResponse(
        status=status,
        queue_depth=queue_depth,
        failure_rate=failure_rate,
        active_workers=celery_info["workers_online"],
        analyses_last_hour=completed + failed,
        avg_analysis_duration_s=avg_duration,
        neo4j_connected=False,   # Will be True when Neo4j Sprint is complete
        redis_connected=redis_ok,
        celery_workers_online=celery_info["workers_online"],
        pending_analyses=pending,
        running_analyses=celery_info["running"] or running,
    )


@router.get("/analyses", response_model=MobileAnalysesResponse)
async def mobile_analyses(
    status: str | None = Query(default=None),
    limit: int = Query(default=30, ge=1, le=100),
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    """List analyses for the native APK All PRs screen."""
    try:
        items = [_row_to_mobile_item(row) for row in _load_mobile_analysis_rows(limit)]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if status:
        items = [item for item in items if item.mobile_status == status]
    return MobileAnalysesResponse(items=items, total=len(items))


@router.get("/analyses/{analysis_id}/summary", response_model=AnalysisMobileSummary)
async def mobile_analysis_summary(
    analysis_id: str,
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    """Lightweight analysis summary from analyses plus analysis_review_outputs."""
    try:
        rows = _load_mobile_analysis_rows(500)
        row = next((candidate for candidate in rows if str(candidate.get("id")) == analysis_id), None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if row is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    metadata = _as_dict(row.get("metadata_json"))
    payload = _as_dict(row.get("payload_json"))
    summary_payload = _as_dict(payload.get("summary"))
    merge_ready = _payload_merge_ready(payload)
    risk = _payload_risk(payload, int(row.get("blocker_count") or 0), int(row.get("warn_count") or 0))
    findings_by_severity = _as_dict(row.get("findings_by_severity"))
    pr_summary = summary_payload.get("short_summary") or summary_payload.get("detailed_summary") or row.get("summary")

    return AnalysisMobileSummary(
        id=str(row.get("id")),
        status=str(row.get("status") or "UNKNOWN"),
        title=_analysis_title(metadata, row.get("repo"), row.get("pr_number"), row.get("summary")),
        repo_name=row.get("repo"),
        project_name=metadata.get("project_name") or metadata.get("project") or None,
        risk_level=risk,
        review_classification=_payload_review_classification(payload, merge_ready),
        merge_readiness=merge_ready,
        findings_count=int(row.get("db_findings_count") or row.get("findings_count") or 0),
        findings_by_severity=dict(findings_by_severity) if findings_by_severity else None,
        pr_summary=str(pr_summary) if pr_summary else None,
        change_type=summary_payload.get("change_type") or row.get("change_type"),
        test_suggestions=_payload_test_suggestions(payload),
        auto_fix_available=bool(payload.get("auto_fix_available", False)),
        created_at=_format_created_at(row.get("created_at")),
    )


@router.get("/analyses/counts", response_model=dict)
async def mobile_analyses_counts(
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    """
    Count analyses per mobile status tab for the All PRs badges.
    """
    try:
        items = [_row_to_mobile_item(row) for row in _load_mobile_analysis_rows(500)]
    except Exception:
        return {}

    counts = {
        "new_attention": 0,
        "return": 0,
        "approved": 0,
        "waiting_reviewer": 0,
        "drafts": 0,
        "waiting_author": 0,
    }
    for item in items:
        counts[item.mobile_status] = counts.get(item.mobile_status, 0) + 1
    return counts


@router.get("/notifications", response_model=MobileNotificationsResponse)
async def mobile_notifications(
    limit: int = Query(default=50, ge=1, le=100),
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    """Return in-app notifications in the shape used by the APK."""
    from app.services.notifications import NotificationService

    notifications = await NotificationService().get_user_notifications(
        user_id=principal.user_id,
        unread_only=False,
        limit=limit,
        offset=0,
    )
    items: list[MobileNotificationItem] = []
    for notification in notifications:
        data = _as_dict(notification.get("data"))
        analysis_id = data.get("analysis_id") or data.get("analysisId")
        items.append(
            MobileNotificationItem(
                id=str(notification.get("id")),
                type=str(notification.get("type") or "info"),
                title=str(notification.get("title") or "Notification"),
                body=str(notification.get("message") or ""),
                read=bool(notification.get("read")),
                created_at=_format_created_at(notification.get("created_at")),
                analysis_id=str(analysis_id) if analysis_id else None,
            )
        )
    return MobileNotificationsResponse(notifications=items, total=len(items))


@router.post("/notifications/mark-all-read")
async def mobile_mark_all_notifications_read(
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    from app.services.notifications import NotificationService

    success = await NotificationService().mark_notifications_read(user_id=principal.user_id, notification_ids=None)
    return {"success": success}


@router.patch("/notifications/{notification_id}/read")
async def mobile_mark_notification_read(
    notification_id: str,
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    from app.services.notifications import NotificationService

    success = await NotificationService().mark_notifications_read(
        user_id=principal.user_id,
        notification_ids=[notification_id],
    )
    return {"success": success}


@router.get("/statistics", response_model=MobileStatisticsResponse)
async def mobile_statistics(
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    """Small statistics payload for the native dashboard screen."""
    from sqlalchemy import text

    stats = MobileStatisticsResponse()
    try:
        with get_engine().connect() as conn:
            row = conn.execute(
                text(
                    """
                    SELECT
                        COUNT(*) AS total_analyses,
                        COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed_analyses,
                        COUNT(*) FILTER (WHERE status IN ('RECEIVED', 'QUEUED', 'RUNNING')) AS pending_analyses
                    FROM analyses
                    """
                )
            ).mappings().first()
            if row:
                stats.total_analyses = int(row.get("total_analyses") or 0)
                stats.completed_analyses = int(row.get("completed_analyses") or 0)
                stats.pending_analyses = int(row.get("pending_analyses") or 0)

            findings_row = conn.execute(
                text(
                    """
                    SELECT COUNT(*) AS findings_this_week
                    FROM findings f
                    JOIN analyses a ON a.id = f.analysis_id
                    WHERE a.created_at >= NOW() - INTERVAL '7 days'
                    """
                )
            ).mappings().first()
            if findings_row:
                stats.findings_this_week = int(findings_row.get("findings_this_week") or 0)
    except Exception:
        return stats

    try:
        counts = await mobile_analyses_counts(principal)
        stats.approved_prs = int(counts.get("approved", 0))
        stats.return_prs = int(counts.get("return", 0))
    except Exception:
        pass
    return stats


@router.post("/push/subscribe")
async def subscribe_push_token(
    body: PushSubscribeRequest,
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    """
    Store a push notification token (FCM/APNS) for the authenticated user.
    """
    engine = get_engine()
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("""
                INSERT INTO push_subscriptions (user_id, token, platform, created_at, updated_at)
                VALUES (:uid, :token, :platform, NOW(), NOW())
                ON CONFLICT (user_id, token)
                DO UPDATE SET platform = EXCLUDED.platform, updated_at = NOW()
            """), {
                "uid": principal.user_id,
                "token": body.token,
                "platform": body.platform,
            })
        return {"success": True, "message": "Push token registered"}
    except Exception as exc:
        # Table may not exist yet; return success to not break the app
        return {"success": False, "message": str(exc)}


@router.delete("/push/unsubscribe")
async def unsubscribe_push_token(
    token: str,
    principal: AuthenticatedPrincipal = Depends(require_mobile_authenticated),
):
    """Remove a push token (on sign-out or token refresh)."""
    engine = get_engine()
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text("""
                DELETE FROM push_subscriptions
                WHERE user_id = :uid AND token = :token
            """), {"uid": principal.user_id, "token": token})
        return {"success": True}
    except Exception:
        return {"success": False}

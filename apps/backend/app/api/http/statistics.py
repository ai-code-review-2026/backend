"""
Statistics API endpoints.

Provides aggregated statistics for code quality, review velocity, and team performance.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field

from app.api.middleware.auth import AuthenticatedPrincipal, enforce_permission, get_current_principal
from app.data.database import get_engine

router = APIRouter(prefix="/api/v1/statistics", tags=["statistics"])


class TrendDataPoint(BaseModel):
    """Single data point for trend charts."""
    date: str
    value: float


class QualityMetrics(BaseModel):
    """Code quality metrics."""
    overall_score: float = Field(ge=0, le=100)
    security_score: float = Field(ge=0, le=100)
    maintainability_score: float = Field(ge=0, le=100)
    reliability_score: float = Field(ge=0, le=100)
    
    total_findings: int
    blocker_count: int
    critical_count: int
    major_count: int
    minor_count: int
    
    findings_by_category: dict[str, int]
    trend: list[TrendDataPoint]


class VelocityMetrics(BaseModel):
    """Review velocity metrics."""
    avg_review_time_hours: float
    avg_time_to_first_review_hours: float
    reviews_per_day: float
    analyses_per_day: float
    
    total_reviews: int
    total_analyses: int
    completed_analyses: int
    failed_analyses: int
    
    trend: list[TrendDataPoint]


class TeamMetrics(BaseModel):
    """Team performance metrics."""
    active_reviewers: int
    total_team_members: int
    
    reviews_by_reviewer: dict[str, int]
    avg_reviews_per_member: float
    
    top_contributors: list[dict[str, Any]]
    bottlenecks: list[dict[str, Any]]


class StatisticsResponse(BaseModel):
    """Combined statistics response."""
    model_config = ConfigDict(extra="forbid")
    
    time_range: str
    generated_at: str
    
    quality: QualityMetrics | None = None
    velocity: VelocityMetrics | None = None
    team: TeamMetrics | None = None


def _parse_time_range(time_range: str) -> tuple[datetime, datetime]:
    """Parse time range string to start/end dates."""
    now = datetime.now(timezone.utc)
    
    if time_range == "7d":
        start = now - timedelta(days=7)
    elif time_range == "30d":
        start = now - timedelta(days=30)
    elif time_range == "90d":
        start = now - timedelta(days=90)
    elif time_range == "1y":
        start = now - timedelta(days=365)
    else:
        # Default to 30 days
        start = now - timedelta(days=30)
    
    return start, now


def _compute_quality_metrics(engine, start: datetime, end: datetime) -> QualityMetrics:
    """Compute quality metrics for the given time range."""
    from sqlalchemy import text
    
    # First get findings aggregated by severity and category
    findings_agg_query = text("""
        SELECT 
            f.severity,
            f.category,
            COUNT(*) as count
        FROM findings f
        JOIN analyses a ON f.analysis_id = a.id
        WHERE a.created_at BETWEEN :start AND :end
        GROUP BY f.severity, f.category
    """)
    
    total_findings = 0
    blocker_count = 0
    critical_count = 0
    major_count = 0
    minor_count = 0
    findings_by_category: dict[str, int] = {}
    
    try:
        with engine.connect() as conn:
            result = conn.execute(findings_agg_query, {"start": start, "end": end})
            rows = result.mappings().all()
            
            for row in rows:
                category = row.get("category") or "other"
                severity = row.get("severity") or "INFO"
                count = row.get("count") or 0
                
                # Update category count
                findings_by_category[category] = findings_by_category.get(category, 0) + count
                
                # Update severity counts
                total_findings += count
                if severity == "BLOCKER":
                    blocker_count += count
                elif severity in ("CRITICAL", "WARN"):
                    critical_count += count
                elif severity == "MAJOR":
                    major_count += count
                else:  # INFO and others
                    minor_count += count
    except Exception:
        # Table might not exist or be empty
        pass
    
    # Compute scores (simplified scoring model)
    if total_findings == 0:
        overall_score = 100.0
        security_score = 100.0
        maintainability_score = 100.0
        reliability_score = 100.0
    else:
        # Penalty based on findings severity
        penalty = (blocker_count * 10 + critical_count * 5 + major_count * 2 + minor_count * 1)
        overall_score = max(0, 100 - min(penalty, 100))
        
        security_findings = findings_by_category.get("security", 0)
        security_penalty = security_findings * 15
        security_score = max(0, 100 - min(security_penalty, 100))
        
        maintainability_findings = findings_by_category.get("maintainability", 0) + findings_by_category.get("style", 0)
        maintainability_score = max(0, 100 - maintainability_findings * 2)
        
        reliability_findings = findings_by_category.get("reliability", 0)
        reliability_score = max(0, 100 - reliability_findings * 3)
    
    # Get trend data
    trend_query = text("""
        SELECT 
            DATE(a.created_at) as date,
            COUNT(f.id) as finding_count
        FROM analyses a
        LEFT JOIN findings f ON f.analysis_id = a.id
        WHERE a.created_at BETWEEN :start AND :end
        GROUP BY DATE(a.created_at)
        ORDER BY date
    """)
    
    trend: list[TrendDataPoint] = []
    try:
        with engine.connect() as conn:
            result = conn.execute(trend_query, {"start": start, "end": end})
            for row in result.mappings():
                trend.append(TrendDataPoint(
                    date=row["date"].isoformat() if row.get("date") else "",
                    value=float(row.get("finding_count") or 0)
                ))
    except Exception:
        pass
    
    return QualityMetrics(
        overall_score=overall_score,
        security_score=security_score,
        maintainability_score=maintainability_score,
        reliability_score=reliability_score,
        total_findings=total_findings,
        blocker_count=blocker_count,
        critical_count=critical_count,
        major_count=major_count,
        minor_count=minor_count,
        findings_by_category=findings_by_category,
        trend=trend,
    )


def _compute_velocity_metrics(engine, start: datetime, end: datetime) -> VelocityMetrics:
    """Compute velocity metrics for the given time range."""
    from sqlalchemy import text
    
    # Get analysis statistics
    analyses_query = text("""
        SELECT 
            COUNT(*) as total_analyses,
            SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed,
            AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) as avg_time_hours
        FROM analyses
        WHERE created_at BETWEEN :start AND :end
    """)
    
    total_analyses = 0
    completed = 0
    failed = 0
    avg_time_hours = 0.0
    
    try:
        with engine.connect() as conn:
            result = conn.execute(analyses_query, {"start": start, "end": end})
            row = result.mappings().first()
            
            if row:
                total_analyses = row.get("total_analyses") or 0
                completed = row.get("completed") or 0
                failed = row.get("failed") or 0
                avg_time_hours = float(row.get("avg_time_hours") or 0)
    except Exception:
        pass
    
    # Get review statistics (if table exists)
    total_reviews = 0
    avg_review_time = 0.0
    
    reviews_query = text("""
        SELECT 
            COUNT(*) as total_reviews,
            AVG(EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - assigned_at)) / 3600) as avg_review_time
        FROM review_assignments
        WHERE assigned_at BETWEEN :start AND :end
    """)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(reviews_query, {"start": start, "end": end})
            row = result.mappings().first()
            
            if row:
                total_reviews = row.get("total_reviews") or 0
                avg_review_time = float(row.get("avg_review_time") or 0)
    except Exception:
        # Table might not exist
        pass
    
    # Calculate daily rates
    days = max(1, (end - start).days)
    analyses_per_day = total_analyses / days if days > 0 else 0
    reviews_per_day = total_reviews / days if days > 0 else 0
    
    # Get trend data
    trend_query = text("""
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as analysis_count
        FROM analyses
        WHERE created_at BETWEEN :start AND :end
        GROUP BY DATE(created_at)
        ORDER BY date
    """)
    
    trend: list[TrendDataPoint] = []
    try:
        with engine.connect() as conn:
            result = conn.execute(trend_query, {"start": start, "end": end})
            for row in result.mappings():
                trend.append(TrendDataPoint(
                    date=row["date"].isoformat() if row.get("date") else "",
                    value=float(row.get("analysis_count") or 0)
                ))
    except Exception:
        pass
    
    return VelocityMetrics(
        avg_review_time_hours=avg_review_time,
        avg_time_to_first_review_hours=max(0, avg_review_time * 0.3),
        reviews_per_day=reviews_per_day,
        analyses_per_day=analyses_per_day,
        total_reviews=total_reviews,
        total_analyses=total_analyses,
        completed_analyses=completed,
        failed_analyses=failed,
        trend=trend,
    )


def _compute_team_metrics(engine, start: datetime, end: datetime) -> TeamMetrics:
    """Compute team metrics for the given time range."""
    from sqlalchemy import text
    
    # Get user statistics
    users_query = text("""
        SELECT 
            COUNT(*) as total_users,
            SUM(CASE WHEN is_active THEN 1 ELSE 0 END) as active_users
        FROM users
    """)
    
    total_users = 0
    active_users = 0
    
    try:
        with engine.connect() as conn:
            result = conn.execute(users_query)
            row = result.mappings().first()
            
            if row:
                total_users = row.get("total_users") or 0
                active_users = row.get("active_users") or 0
    except Exception:
        pass
    
    # Get reviews by reviewer
    reviews_by_reviewer: dict[str, int] = {}
    top_contributors: list[dict[str, Any]] = []
    
    reviews_query = text("""
        SELECT 
            reviewer_id,
            COUNT(*) as review_count
        FROM review_assignments
        WHERE assigned_at BETWEEN :start AND :end
        GROUP BY reviewer_id
        ORDER BY review_count DESC
        LIMIT 10
    """)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(reviews_query, {"start": start, "end": end})
            for row in result.mappings():
                reviewer_id = row.get("reviewer_id") or "unknown"
                count = row.get("review_count") or 0
                reviews_by_reviewer[reviewer_id] = count
                top_contributors.append({
                    "reviewer_id": reviewer_id,
                    "review_count": count,
                })
    except Exception:
        # Table might not exist
        pass
    
    # Calculate averages
    active_reviewers = len(reviews_by_reviewer)
    avg_reviews = sum(reviews_by_reviewer.values()) / max(1, active_reviewers) if active_reviewers > 0 else 0
    
    # Identify bottlenecks (reviewers with many pending assignments)
    bottlenecks: list[dict[str, Any]] = []
    
    bottleneck_query = text("""
        SELECT 
            reviewer_id,
            COUNT(*) as pending_count
        FROM review_assignments
        WHERE status IN ('pending', 'in_progress')
        GROUP BY reviewer_id
        HAVING COUNT(*) > 3
        ORDER BY pending_count DESC
        LIMIT 5
    """)
    
    try:
        with engine.connect() as conn:
            result = conn.execute(bottleneck_query)
            for row in result.mappings():
                bottlenecks.append({
                    "reviewer_id": row.get("reviewer_id"),
                    "pending_reviews": row.get("pending_count"),
                })
    except Exception:
        pass
    
    return TeamMetrics(
        active_reviewers=active_reviewers,
        total_team_members=total_users,
        reviews_by_reviewer=reviews_by_reviewer,
        avg_reviews_per_member=avg_reviews,
        top_contributors=top_contributors,
        bottlenecks=bottlenecks,
    )


@router.get("", response_model=StatisticsResponse)
async def get_statistics(
    time_range: str = Query("30d", description="Time range: 7d, 30d, 90d, 1y"),
    category: str = Query("all", description="Category: all, quality, velocity, team"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> StatisticsResponse:
    """
    Get dashboard statistics.
    
    Returns quality, velocity, and team metrics for the specified time range.
    Use category parameter to fetch specific metrics only.
    """
    enforce_permission(principal, "analyses.read")
    
    engine = get_engine()
    start, end = _parse_time_range(time_range)
    
    quality = None
    velocity = None
    team = None
    
    if category in ("all", "quality"):
        quality = _compute_quality_metrics(engine, start, end)
    
    if category in ("all", "velocity"):
        velocity = _compute_velocity_metrics(engine, start, end)
    
    if category in ("all", "team"):
        team = _compute_team_metrics(engine, start, end)
    
    return StatisticsResponse(
        time_range=time_range,
        generated_at=datetime.now(timezone.utc).isoformat(),
        quality=quality,
        velocity=velocity,
        team=team,
    )

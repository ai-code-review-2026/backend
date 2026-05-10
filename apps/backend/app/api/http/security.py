"""
Security API endpoints.

Provides security issue tracking and dashboard data.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal, enforce_permission
from app.data.database import get_engine

router = APIRouter(prefix="/api/v1/security", tags=["security"])


class SecurityIssue(BaseModel):
    """Security issue model."""
    model_config = ConfigDict(extra="forbid")

    id: str
    analysis_id: str
    repository: str
    file_path: str | None
    line_start: int | None
    line_end: int | None
    
    severity: Literal["critical", "high", "medium", "low", "info"]
    status: Literal["open", "in_progress", "resolved", "ignored", "false_positive"]
    
    title: str
    description: str
    rule_id: str | None
    cwe_id: str | None = None
    
    recommendation: str | None = None
    evidence: dict[str, Any] = Field(default_factory=dict)
    
    detected_at: str
    resolved_at: str | None = None
    resolved_by: str | None = None


class SecurityIssueListResponse(BaseModel):
    """Response model for security issues list."""
    items: list[SecurityIssue]
    total: int
    page: int
    limit: int
    pages: int
    
    # Summary stats
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int


class SecurityDashboardResponse(BaseModel):
    """Security dashboard summary."""
    model_config = ConfigDict(extra="forbid")
    
    total_issues: int
    open_issues: int
    resolved_issues: int
    
    issues_by_severity: dict[str, int]
    issues_by_repository: dict[str, int]
    
    avg_resolution_time_hours: float | None
    recent_scans: int
    
    trend_data: list[dict[str, Any]]


class UpdateIssueStatusRequest(BaseModel):
    """Request to update issue status."""
    model_config = ConfigDict(extra="forbid")
    
    status: Literal["open", "in_progress", "resolved", "ignored", "false_positive"]
    resolution_comment: str | None = None


def _finding_to_security_issue(row: dict) -> SecurityIssue:
    """Convert a finding row to SecurityIssue model."""
    # Map severity
    severity_map = {
        "BLOCKER": "critical",
        "WARN": "high",
        "INFO": "low",
    }
    severity = severity_map.get(row.get("severity", "INFO"), "medium")
    
    # Default status based on analysis
    status = "open"  # Could be enhanced with actual status tracking
    
    return SecurityIssue(
        id=row.get("id", ""),
        analysis_id=row.get("analysis_id", ""),
        repository=row.get("repo", ""),
        file_path=row.get("file_path"),
        line_start=row.get("line_start"),
        line_end=row.get("line_end"),
        severity=severity,
        status=status,
        title=row.get("message", "Security Issue")[:100],
        description=row.get("message", ""),
        rule_id=row.get("rule_id"),
        cwe_id=row.get("cwe_id"),
        recommendation=row.get("suggestion"),
        evidence=row.get("evidence") or {},
        detected_at=row["created_at"].isoformat() if isinstance(row.get("created_at"), datetime) else str(row.get("created_at", "")),
        resolved_at=None,
        resolved_by=None,
    )


@router.get("/issues", response_model=SecurityIssueListResponse)
async def list_security_issues(
    status: str = Query("active", description="Filter by status: active, resolved, all"),
    severity: str | None = Query(None, description="Filter by severity"),
    repository: str | None = Query(None, description="Filter by repository"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> SecurityIssueListResponse:
    """
    List security issues from code analysis.
    
    Retrieves findings with category='security' and provides filtering options.
    """
    enforce_permission(principal, "analyses.read")

    engine = get_engine()
    from sqlalchemy import text

    # Build conditions
    conditions = ["f.category = 'security'"]
    params: dict[str, Any] = {
        "limit": limit,
        "offset": (page - 1) * limit,
    }
    
    if severity:
        severity_map = {
            "critical": "BLOCKER",
            "high": "WARN",
            "medium": "WARN",
            "low": "INFO",
        }
        db_severity = severity_map.get(severity.lower())
        if db_severity:
            conditions.append("f.severity = :severity")
            params["severity"] = db_severity
    
    if repository:
        conditions.append("a.repo = :repository")
        params["repository"] = repository
    
    where_clause = " AND ".join(conditions)
    
    # Get total count and severity breakdown
    count_query = text(f"""
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN f.severity = 'BLOCKER' THEN 1 ELSE 0 END) as critical_count,
            SUM(CASE WHEN f.severity = 'WARN' THEN 1 ELSE 0 END) as high_count,
            SUM(CASE WHEN f.severity = 'INFO' THEN 1 ELSE 0 END) as low_count
        FROM findings f
        JOIN analyses a ON f.analysis_id = a.id
        WHERE {where_clause}
    """)
    
    # Get issues
    issues_query = text(f"""
        SELECT 
            f.id,
            f.analysis_id,
            a.repo,
            f.file_path,
            f.line_start,
            f.line_end,
            f.severity,
            f.message,
            f.suggestion,
            f.rule_id,
            f.evidence_json,
            f.created_at
        FROM findings f
        JOIN analyses a ON f.analysis_id = a.id
        WHERE {where_clause}
        ORDER BY 
            CASE f.severity 
                WHEN 'BLOCKER' THEN 1 
                WHEN 'WARN' THEN 2 
                ELSE 3 
            END,
            f.created_at DESC
        LIMIT :limit OFFSET :offset
    """)
    
    items: list[SecurityIssue] = []
    total = 0
    critical_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0
    
    with engine.connect() as conn:
        # Get counts
        count_result = conn.execute(count_query, params)
        count_row = count_result.mappings().first()
        
        if count_row:
            total = count_row.get("total") or 0
            critical_count = count_row.get("critical_count") or 0
            high_count = count_row.get("high_count") or 0
            low_count = count_row.get("low_count") or 0
        
        # Get issues
        result = conn.execute(issues_query, params)
        for row in result.mappings():
            row_dict = dict(row)
            # Parse evidence JSON
            evidence = row_dict.get("evidence_json")
            if isinstance(evidence, str):
                import json
                try:
                    row_dict["evidence"] = json.loads(evidence)
                except Exception:
                    row_dict["evidence"] = {}
            else:
                row_dict["evidence"] = evidence or {}
            
            items.append(_finding_to_security_issue(row_dict))
    
    pages = (total + limit - 1) // limit if total > 0 else 1
    
    return SecurityIssueListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
        critical_count=critical_count,
        high_count=high_count,
        medium_count=medium_count,
        low_count=low_count,
    )


@router.get("/dashboard", response_model=SecurityDashboardResponse)
async def get_security_dashboard(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> SecurityDashboardResponse:
    """
    Get security dashboard summary.
    
    Provides overview statistics for the security dashboard.
    """
    enforce_permission(principal, "analyses.read")

    engine = get_engine()
    from sqlalchemy import text

    # Get overall stats
    stats_query = text("""
        SELECT 
            COUNT(*) as total_issues,
            SUM(CASE WHEN f.severity = 'BLOCKER' THEN 1 ELSE 0 END) as critical,
            SUM(CASE WHEN f.severity = 'WARN' THEN 1 ELSE 0 END) as high,
            SUM(CASE WHEN f.severity = 'INFO' THEN 1 ELSE 0 END) as low
        FROM findings f
        WHERE f.category = 'security'
    """)
    
    # Get issues by repository
    repo_query = text("""
        SELECT 
            a.repo,
            COUNT(*) as issue_count
        FROM findings f
        JOIN analyses a ON f.analysis_id = a.id
        WHERE f.category = 'security'
        GROUP BY a.repo
        ORDER BY issue_count DESC
        LIMIT 10
    """)
    
    # Get recent scans count
    scans_query = text("""
        SELECT COUNT(DISTINCT a.id) as scan_count
        FROM analyses a
        WHERE a.created_at > NOW() - INTERVAL '7 days'
    """)
    
    # Get trend data (last 30 days)
    trend_query = text("""
        SELECT 
            DATE(f.created_at) as date,
            COUNT(*) as issue_count
        FROM findings f
        WHERE f.category = 'security'
        AND f.created_at > NOW() - INTERVAL '30 days'
        GROUP BY DATE(f.created_at)
        ORDER BY date
    """)
    
    total_issues = 0
    issues_by_severity: dict[str, int] = {}
    issues_by_repository: dict[str, int] = {}
    recent_scans = 0
    trend_data: list[dict[str, Any]] = []
    
    with engine.connect() as conn:
        # Get stats
        result = conn.execute(stats_query)
        row = result.mappings().first()
        
        if row:
            total_issues = row.get("total_issues") or 0
            issues_by_severity = {
                "critical": row.get("critical") or 0,
                "high": row.get("high") or 0,
                "medium": 0,
                "low": row.get("low") or 0,
            }
        
        # Get issues by repo
        result = conn.execute(repo_query)
        for row in result.mappings():
            repo = row.get("repo") or "unknown"
            count = row.get("issue_count") or 0
            issues_by_repository[repo] = count
        
        # Get recent scans
        result = conn.execute(scans_query)
        row = result.mappings().first()
        if row:
            recent_scans = row.get("scan_count") or 0
        
        # Get trend
        result = conn.execute(trend_query)
        for row in result.mappings():
            trend_data.append({
                "date": row["date"].isoformat() if row.get("date") else "",
                "count": row.get("issue_count") or 0,
            })
    
    return SecurityDashboardResponse(
        total_issues=total_issues,
        open_issues=total_issues,  # All are considered open without status tracking
        resolved_issues=0,
        issues_by_severity=issues_by_severity,
        issues_by_repository=issues_by_repository,
        avg_resolution_time_hours=None,  # Not tracked
        recent_scans=recent_scans,
        trend_data=trend_data,
    )


@router.patch("/issues/{issue_id}/status", response_model=SecurityIssue)
async def update_issue_status(
    issue_id: str,
    request: UpdateIssueStatusRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> SecurityIssue:
    """
    Update security issue status.
    
    Note: Currently findings don't have status tracking, this is a placeholder
    for future enhancement.
    """
    enforce_permission(principal, "analyses.write")

    engine = get_engine()
    from sqlalchemy import text

    # Get the finding
    query = text("""
        SELECT 
            f.id,
            f.analysis_id,
            a.repo,
            f.file_path,
            f.line_start,
            f.line_end,
            f.severity,
            f.message,
            f.suggestion,
            f.rule_id,
            f.evidence_json,
            f.created_at
        FROM findings f
        JOIN analyses a ON f.analysis_id = a.id
        WHERE f.id = :issue_id
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query, {"issue_id": issue_id})
        row = result.mappings().first()
        
        if not row:
            raise HTTPException(status_code=404, detail="Security issue not found")
        
        row_dict = dict(row)
        evidence = row_dict.get("evidence_json")
        if isinstance(evidence, str):
            import json
            try:
                row_dict["evidence"] = json.loads(evidence)
            except Exception:
                row_dict["evidence"] = {}
        else:
            row_dict["evidence"] = evidence or {}
        
        issue = _finding_to_security_issue(row_dict)
        
        # Update status (in-memory only for now, would need schema change for persistence)
        return SecurityIssue(
            id=issue.id,
            analysis_id=issue.analysis_id,
            repository=issue.repository,
            file_path=issue.file_path,
            line_start=issue.line_start,
            line_end=issue.line_end,
            severity=issue.severity,
            status=request.status,
            title=issue.title,
            description=issue.description,
            rule_id=issue.rule_id,
            cwe_id=issue.cwe_id,
            recommendation=issue.recommendation,
            evidence=issue.evidence,
            detected_at=issue.detected_at,
            resolved_at=datetime.now(timezone.utc).isoformat() if request.status == "resolved" else None,
            resolved_by=principal.user_id if request.status == "resolved" else None,
        )

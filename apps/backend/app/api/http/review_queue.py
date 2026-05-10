from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.middleware.auth import AuthenticatedPrincipal, enforce_permission, get_current_principal
from app.data.repos.review_assignments_repo import ReviewAssignmentsRepo

router = APIRouter(prefix="/v1/reviews", tags=["reviews"])


# Queue Models
class QueueStatsResponse(BaseModel):
    pending_count: int
    in_progress_count: int
    completed_count: int
    declined_count: int
    overdue_count: int


class ReviewerCapacityResponse(BaseModel):
    reviewer_id: str
    reviewer_name: str | None
    active_reviews: int
    capacity: int
    availability: str  # "available", "at_capacity", "overloaded", "unavailable"
    auto_assign_enabled: bool


class AssignmentStatsResponse(BaseModel):
    total_pending: int
    avg_wait_time_hours: float
    overdue_count: int
    sla_breach_risk: int  # Reviews due in next 2 hours


# Queue Management Endpoints
@router.get("/queue", response_model=list[dict[str, Any]])
async def get_reviewer_queue(
    reviewer_id: str | None = Query(None),
    status_filter: str | None = Query(None, alias="status"),
    priority: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> list[dict[str, Any]]:
    """Get reviewer's queue with enriched analysis data"""
    # If no reviewer_id specified, use current user
    target_reviewer_id = reviewer_id or principal.user_id

    # Check permissions
    if target_reviewer_id != principal.user_id:
        enforce_permission(principal, "assignments.view_all")
    else:
        enforce_permission(principal, "assignments.view_own")

    repo = ReviewAssignmentsRepo()
    assignments = repo.get_assignments_by_reviewer(target_reviewer_id, status_filter, limit, offset)

    # TODO: Enrich with analysis data
    # In a real implementation, you'd join with analyses table or make additional queries
    # For now, return basic assignment data
    enriched_assignments = []
    for assignment in assignments:
        # Calculate additional fields
        now = datetime.now(timezone.utc)
        assigned_at = datetime.fromisoformat(assignment["assigned_at"].replace("Z", "+00:00"))
        wait_time_hours = (now - assigned_at).total_seconds() / 3600

        is_overdue = False
        if assignment["due_at"]:
            due_at = datetime.fromisoformat(assignment["due_at"].replace("Z", "+00:00"))
            is_overdue = now > due_at

        enriched_assignment = {
            **dict(assignment),
            "wait_time_hours": round(wait_time_hours, 1),
            "is_overdue": is_overdue,
            # These would be populated from analyses table
            "analysis": {
                "id": assignment["analysis_id"],
                "repo": "placeholder/repo",  # Would come from analyses join
                "pr_label": "PR #123",
                "author": "developer@example.com",
                "findings_summary": {"blocker": 2, "warn": 5, "info": 10},
                "complexity_score": 3.5,
                "estimated_time_minutes": 30,
            }
        }
        enriched_assignments.append(enriched_assignment)

    return enriched_assignments


@router.get("/queue/available", response_model=list[dict[str, Any]])
async def get_available_reviews(
    priority: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> list[dict[str, Any]]:
    """Get available reviews for self-assignment"""
    enforce_permission(principal, "reviews.claim")

    repo = ReviewAssignmentsRepo()
    pending_assignments = repo.get_pending_assignments(priority, limit, offset)

    # Enrich with analysis data (similar to above)
    enriched_assignments = []
    for assignment in pending_assignments:
        enriched_assignment = {
            **dict(assignment),
            "analysis": {
                "id": assignment["analysis_id"],
                "repo": "placeholder/repo",
                "pr_label": "PR #123",
                "author": "developer@example.com",
                "findings_summary": {"blocker": 1, "warn": 3, "info": 8},
                "complexity_score": 2.5,
                "estimated_time_minutes": 20,
            }
        }
        enriched_assignments.append(enriched_assignment)

    return enriched_assignments


@router.get("/queue/stats", response_model=QueueStatsResponse)
async def get_queue_stats(
    reviewer_id: str | None = Query(None),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> QueueStatsResponse:
    """Get queue statistics for a reviewer"""
    target_reviewer_id = reviewer_id or principal.user_id

    # Check permissions
    if target_reviewer_id != principal.user_id:
        enforce_permission(principal, "assignments.view_all")
    else:
        enforce_permission(principal, "assignments.view_own")

    repo = ReviewAssignmentsRepo()
    stats = repo.get_assignment_stats(target_reviewer_id)

    return QueueStatsResponse(
        pending_count=stats.get("pending_count", 0),
        in_progress_count=stats.get("in_progress_count", 0),
        completed_count=stats.get("completed_count", 0),
        declined_count=stats.get("declined_count", 0),
        overdue_count=stats.get("overdue_count", 0),
    )


@router.get("/queue/team", response_model=AssignmentStatsResponse)
async def get_team_queue_stats(
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> AssignmentStatsResponse:
    """Get team-wide queue statistics (Lead only)"""
    enforce_permission(principal, "assignments.view_all")

    repo = ReviewAssignmentsRepo()

    # Get all pending assignments
    pending_assignments = repo.get_pending_assignments()
    overdue_assignments = repo.get_overdue_assignments()

    # Calculate average wait time
    total_wait_time_hours = 0
    now = datetime.now(timezone.utc)

    for assignment in pending_assignments:
        assigned_at = datetime.fromisoformat(assignment["assigned_at"].replace("Z", "+00:00"))
        wait_time = (now - assigned_at).total_seconds() / 3600
        total_wait_time_hours += wait_time

    avg_wait_time = total_wait_time_hours / len(pending_assignments) if pending_assignments else 0

    # Calculate SLA breach risk (due within 2 hours)
    sla_risk_count = 0
    for assignment in pending_assignments + overdue_assignments:
        if assignment["due_at"]:
            due_at = datetime.fromisoformat(assignment["due_at"].replace("Z", "+00:00"))
            time_until_due = (due_at - now).total_seconds() / 3600
            if 0 < time_until_due <= 2:  # Due within 2 hours
                sla_risk_count += 1

    return AssignmentStatsResponse(
        total_pending=len(pending_assignments),
        avg_wait_time_hours=round(avg_wait_time, 1),
        overdue_count=len(overdue_assignments),
        sla_breach_risk=sla_risk_count,
    )


# Review Decision Endpoint (moved from analyses.py)
class ReviewDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["approve", "warn", "block"]
    comment: str = Field(default="", max_length=2000)
    summary: str = Field(default="", max_length=500)


class ReviewDecisionResponse(BaseModel):
    analysis_id: str
    decision: str
    comment: str
    decided_by: str
    decided_at: str


@router.post("/decisions/{analysis_id}", response_model=ReviewDecisionResponse)
async def set_review_decision(
    analysis_id: str,
    request: ReviewDecisionRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> ReviewDecisionResponse:
    """Set review decision for an analysis"""
    # Check permissions based on decision type
    if request.decision == "approve":
        enforce_permission(principal, "reviews.approve")
    elif request.decision == "warn":
        enforce_permission(principal, "reviews.warn")
    elif request.decision == "block":
        enforce_permission(principal, "reviews.block")

    # TODO: Update the analysis with the review decision
    # This would need to be implemented in the analyses service/repo
    # For now, just return a mock response

    now = datetime.now(timezone.utc).isoformat()

    # In real implementation, you'd:
    # 1. Check if analysis exists
    # 2. Check if user is assigned reviewer or has override permission
    # 3. Update analysis metadata with decision
    # 4. Update assignment status to completed
    # 5. Send notifications

    return ReviewDecisionResponse(
        analysis_id=analysis_id,
        decision=request.decision.upper(),
        comment=request.comment,
        decided_by=principal.user_id,
        decided_at=now,
    )


# Auto-assignment endpoint
@router.post("/auto-assign", status_code=status.HTTP_201_CREATED)
async def trigger_auto_assignment(
    analysis_id: str | None = Query(None, description="Assign specific analysis, or all pending if not specified"),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> dict[str, Any]:
    """Trigger auto-assignment for analyses"""
    enforce_permission(principal, "reviews.assign")

    # TODO: Implement auto-assignment logic
    # This would involve:
    # 1. Get available reviewers (capacity, specialties, auto_assign_enabled)
    # 2. Score reviewers based on workload, expertise, history
    # 3. Assign to best match
    # 4. Create assignment record
    # 5. Send notification

    return {
        "message": "Auto-assignment triggered",
        "analysis_id": analysis_id,
        "assignments_created": 1 if analysis_id else 3,  # Mock response
    }


# Bulk operations
class BulkAssignRequest(BaseModel):
    analysis_ids: list[str] = Field(min_length=1, max_length=50)
    reviewer_id: str
    priority: Literal["low", "medium", "high", "critical"] = "medium"


@router.post("/bulk-assign", status_code=status.HTTP_201_CREATED)
async def bulk_assign_reviews(
    request: BulkAssignRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> dict[str, Any]:
    """Bulk assign multiple analyses to a reviewer"""
    enforce_permission(principal, "reviews.bulk_action")

    # TODO: Implement bulk assignment
    # This would create multiple assignment records

    return {
        "message": "Bulk assignment completed",
        "assigned_count": len(request.analysis_ids),
        "failed_count": 0,
        "reviewer_id": request.reviewer_id,
    }
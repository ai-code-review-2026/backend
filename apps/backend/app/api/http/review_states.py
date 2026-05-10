from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.middleware.auth import AuthenticatedPrincipal, require_permission
from app.data.repos.review_state_repo import ReviewStateRepo
from app.data.models.review_state import (
    ReviewState, 
    ReviewStateTransition,
    get_valid_transitions,
    is_terminal_state,
    is_active_review_state,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/review-states", tags=["review-states"])


class ReviewStateResponse(BaseModel):
    id: str
    analysis_id: str
    current_state: str
    previous_state: str | None
    transition_reason: str | None
    transitioned_by: str | None
    transitioned_at: str
    metadata: Dict[str, Any]
    reviewers_assigned: List[str]
    reviewers_completed: List[str]
    blocking_comments: int
    change_requests: int
    time_in_current_state: float | None
    total_review_time: float | None
    sla_deadline: str | None
    is_overdue: bool
    is_terminal: bool
    is_active: bool
    valid_transitions: List[str]
    created_at: str
    updated_at: str


class StateTransitionRequest(BaseModel):
    to_state: str = Field(..., description="Target state to transition to")
    transition_reason: str = Field(..., description="Reason for the transition")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")


class UpdateProgressRequest(BaseModel):
    reviewers_assigned: List[str] | None = None
    reviewers_completed: List[str] | None = None
    blocking_comments: int | None = None
    change_requests: int | None = None
    sla_deadline: str | None = None
    is_overdue: bool | None = None


class StateHistoryResponse(BaseModel):
    id: str
    from_state: str | None
    to_state: str
    transition_reason: str
    transitioned_by: str | None
    transitioned_at: str
    metadata: Dict[str, Any]
    duration_in_previous_state: float | None


class ReviewStateStats(BaseModel):
    total_reviews: int
    by_state: Dict[str, int]
    overdue_count: int
    avg_review_time: float | None
    active_reviews: int


def _to_review_state_response(state_info) -> ReviewStateResponse:
    """Convert ReviewStateInfo to API response."""
    current_state = ReviewState(state_info.current_state)
    
    return ReviewStateResponse(
        id=state_info.id,
        analysis_id=state_info.analysis_id,
        current_state=state_info.current_state.value,
        previous_state=state_info.previous_state.value if state_info.previous_state else None,
        transition_reason=state_info.transition_reason.value if state_info.transition_reason else None,
        transitioned_by=state_info.transitioned_by,
        transitioned_at=state_info.transitioned_at.isoformat(),
        metadata=state_info.metadata,
        reviewers_assigned=state_info.reviewers_assigned,
        reviewers_completed=state_info.reviewers_completed,
        blocking_comments=state_info.blocking_comments,
        change_requests=state_info.change_requests,
        time_in_current_state=state_info.time_in_current_state,
        total_review_time=state_info.total_review_time,
        sla_deadline=state_info.sla_deadline.isoformat() if state_info.sla_deadline else None,
        is_overdue=state_info.is_overdue,
        is_terminal=is_terminal_state(current_state),
        is_active=is_active_review_state(current_state),
        valid_transitions=[s.value for s in get_valid_transitions(current_state)],
        created_at=state_info.created_at.isoformat(),
        updated_at=state_info.updated_at.isoformat(),
    )


@router.get("/analysis/{analysis_id}", response_model=ReviewStateResponse)
async def get_review_state(
    analysis_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
) -> ReviewStateResponse:
    """Get current review state for an analysis"""
    repo = ReviewStateRepo()
    state_info = repo.get_review_state(analysis_id)
    
    if not state_info:
        raise HTTPException(status_code=404, detail="Review state not found")
    
    return _to_review_state_response(state_info)


@router.post("/analysis/{analysis_id}/transition")
async def transition_review_state(
    analysis_id: str,
    request: StateTransitionRequest,
    principal: AuthenticatedPrincipal | None = Depends(require_permission("reviews.write")),
) -> ReviewStateResponse:
    """Transition a review to a new state"""
    try:
        to_state = ReviewState(request.to_state)
        transition_reason = ReviewStateTransition(request.transition_reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid state or transition reason: {e}")
    
    repo = ReviewStateRepo()
    
    try:
        success = repo.transition_state(
            analysis_id=analysis_id,
            to_state=to_state,
            transition_reason=transition_reason,
            transitioned_by=principal.user_id if principal else None,
            metadata=request.metadata,
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Review state not found")
        
        # Return updated state
        state_info = repo.get_review_state(analysis_id)
        if not state_info:
            raise HTTPException(status_code=500, detail="Failed to retrieve updated state")
        
        return _to_review_state_response(state_info)
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.patch("/analysis/{analysis_id}/progress")
async def update_review_progress(
    analysis_id: str,
    request: UpdateProgressRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("reviews.write")),
) -> ReviewStateResponse:
    """Update review progress metrics"""
    repo = ReviewStateRepo()
    
    # Parse SLA deadline if provided
    sla_deadline = None
    if request.sla_deadline:
        try:
            sla_deadline = datetime.fromisoformat(request.sla_deadline.replace('Z', '+00:00'))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid SLA deadline format")
    
    success = repo.update_review_progress(
        analysis_id=analysis_id,
        reviewers_assigned=request.reviewers_assigned,
        reviewers_completed=request.reviewers_completed,
        blocking_comments=request.blocking_comments,
        change_requests=request.change_requests,
        sla_deadline=sla_deadline,
        is_overdue=request.is_overdue,
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Review state not found")
    
    # Return updated state
    state_info = repo.get_review_state(analysis_id)
    if not state_info:
        raise HTTPException(status_code=500, detail="Failed to retrieve updated state")
    
    return _to_review_state_response(state_info)


@router.get("/analysis/{analysis_id}/history", response_model=List[StateHistoryResponse])
async def get_state_history(
    analysis_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
) -> List[StateHistoryResponse]:
    """Get full state transition history for an analysis"""
    repo = ReviewStateRepo()
    history = repo.get_state_history(analysis_id)
    
    return [
        StateHistoryResponse(
            id=item["id"],
            from_state=item["from_state"],
            to_state=item["to_state"],
            transition_reason=item["transition_reason"],
            transitioned_by=item["transitioned_by"],
            transitioned_at=item["transitioned_at"],
            metadata=item["metadata"],
            duration_in_previous_state=item["duration_in_previous_state"],
        )
        for item in history
    ]


@router.get("/by-state/{state}", response_model=List[ReviewStateResponse])
async def get_reviews_by_state(
    state: str,
    limit: int = Query(default=100, le=1000),
    offset: int = Query(default=0, ge=0),
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("reviews.read")),
) -> List[ReviewStateResponse]:
    """Get all reviews in a specific state"""
    try:
        review_state = ReviewState(state)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid state: {state}")
    
    repo = ReviewStateRepo()
    states = repo.get_reviews_by_state(review_state, limit=limit, offset=offset)
    
    return [_to_review_state_response(s) for s in states]


@router.get("/overdue", response_model=List[ReviewStateResponse])
async def get_overdue_reviews(
    limit: int = Query(default=100, le=1000),
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("reviews.read")),
) -> List[ReviewStateResponse]:
    """Get all overdue reviews"""
    repo = ReviewStateRepo()
    states = repo.get_overdue_reviews(limit=limit)
    
    return [_to_review_state_response(s) for s in states]


@router.get("/reviewer/{reviewer_id}/active", response_model=List[ReviewStateResponse])
async def get_reviewer_active_reviews(
    reviewer_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("reviews.read")),
) -> List[ReviewStateResponse]:
    """Get all active reviews assigned to a reviewer"""
    repo = ReviewStateRepo()
    states = repo.get_reviewer_active_reviews(reviewer_id)
    
    return [_to_review_state_response(s) for s in states]


@router.get("/stats", response_model=ReviewStateStats)
async def get_review_state_stats(
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("reviews.read")),
) -> ReviewStateStats:
    """Get review state statistics"""
    repo = ReviewStateRepo()
    
    # Get all states to compute statistics
    all_states = []
    for state in ReviewState:
        states = repo.get_reviews_by_state(state, limit=1000)
        all_states.extend(states)
    
    # Compute statistics
    by_state = {}
    overdue_count = 0
    active_count = 0
    total_review_times = []
    
    for state_info in all_states:
        state = state_info.current_state.value
        by_state[state] = by_state.get(state, 0) + 1
        
        if state_info.is_overdue:
            overdue_count += 1
        
        if is_active_review_state(ReviewState(state)):
            active_count += 1
        
        if state_info.total_review_time is not None:
            total_review_times.append(state_info.total_review_time)
    
    avg_review_time = None
    if total_review_times:
        avg_review_time = sum(total_review_times) / len(total_review_times)
    
    return ReviewStateStats(
        total_reviews=len(all_states),
        by_state=by_state,
        overdue_count=overdue_count,
        avg_review_time=avg_review_time,
        active_reviews=active_count,
    )


@router.post("/update-sla-status")
async def update_sla_status(
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("admin.write")),
) -> Dict[str, int]:
    """Update SLA status for all active reviews"""
    repo = ReviewStateRepo()
    updated_count = repo.update_sla_status()
    
    return {"updated_count": updated_count}


@router.get("/states", response_model=List[str])
async def get_available_states() -> List[str]:
    """Get all available review states"""
    return [state.value for state in ReviewState]


@router.get("/transitions", response_model=List[str])
async def get_available_transitions() -> List[str]:
    """Get all available transition reasons"""
    return [transition.value for transition in ReviewStateTransition]
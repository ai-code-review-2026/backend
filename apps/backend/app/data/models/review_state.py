from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from enum import Enum


class ReviewState(str, Enum):
    """Review workflow states"""
    # Initial states
    DRAFT = "draft"  # Author is still working on changes
    READY_FOR_REVIEW = "ready_for_review"  # Ready for reviewer assignment
    
    # Review assignment states  
    ASSIGNING_REVIEWERS = "assigning_reviewers"  # Auto or manual assignment in progress
    PENDING_REVIEW = "pending_review"  # Waiting for reviewers to start
    
    # Active review states
    IN_REVIEW = "in_review"  # One or more reviewers are actively reviewing
    WAITING_FOR_CHANGES = "waiting_for_changes"  # Reviewers requested changes
    
    # Resolution states
    CHANGES_REQUESTED = "changes_requested"  # Formal change requests created
    APPROVED = "approved"  # All reviewers have approved
    APPROVED_WITH_SUGGESTIONS = "approved_with_suggestions"  # Approved but with minor comments
    
    # Terminal states
    MERGED = "merged"  # Code has been merged
    CLOSED = "closed"  # Review closed without merge
    ABANDONED = "abandoned"  # Review abandoned by author
    
    # Error states
    BLOCKED = "blocked"  # Review blocked due to issues
    FAILED = "failed"  # Review failed due to system errors


class ReviewStateTransition(str, Enum):
    """Review state transition events"""
    # Author actions
    SUBMIT_FOR_REVIEW = "submit_for_review"
    REQUEST_REVIEW = "request_review"
    UPDATE_CHANGES = "update_changes"
    ADDRESS_FEEDBACK = "address_feedback"
    ABANDON = "abandon"
    
    # Reviewer actions  
    START_REVIEW = "start_review"
    REQUEST_CHANGES = "request_changes"
    APPROVE = "approve"
    APPROVE_WITH_SUGGESTIONS = "approve_with_suggestions"
    BLOCK = "block"
    REASSIGN = "reassign"
    
    # System actions
    AUTO_ASSIGN = "auto_assign"
    MERGE = "merge"
    CLOSE = "close"
    TIMEOUT = "timeout"
    ERROR = "error"
    RESTART_REVIEW = "restart_review"


@dataclass(frozen=True)
class ReviewStateInfo:
    """Information about a review state"""
    id: str
    analysis_id: str
    current_state: ReviewState
    previous_state: Optional[ReviewState]
    transition_reason: Optional[ReviewStateTransition]
    transitioned_by: Optional[str]  # User ID who triggered the transition
    transitioned_at: datetime
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    
    # Review progress tracking
    reviewers_assigned: List[str]  # User IDs of assigned reviewers
    reviewers_completed: List[str]  # User IDs of reviewers who completed
    blocking_comments: int  # Number of blocking comments
    change_requests: int  # Number of formal change requests
    
    # Timing metrics
    time_in_current_state: Optional[float]  # Seconds in current state
    total_review_time: Optional[float]  # Total time since review started
    sla_deadline: Optional[datetime]  # SLA deadline for this review
    is_overdue: bool  # Whether review is past SLA


# State machine transition rules
VALID_TRANSITIONS: Dict[ReviewState, List[ReviewState]] = {
    ReviewState.DRAFT: [
        ReviewState.READY_FOR_REVIEW,
        ReviewState.ABANDONED,
        ReviewState.CLOSED,
    ],
    ReviewState.READY_FOR_REVIEW: [
        ReviewState.ASSIGNING_REVIEWERS,
        ReviewState.PENDING_REVIEW,
        ReviewState.DRAFT,
        ReviewState.ABANDONED,
        ReviewState.CLOSED,
    ],
    ReviewState.ASSIGNING_REVIEWERS: [
        ReviewState.PENDING_REVIEW,
        ReviewState.FAILED,
        ReviewState.DRAFT,
        ReviewState.ABANDONED,
    ],
    ReviewState.PENDING_REVIEW: [
        ReviewState.IN_REVIEW,
        ReviewState.ASSIGNING_REVIEWERS,
        ReviewState.DRAFT,
        ReviewState.ABANDONED,
        ReviewState.CLOSED,
    ],
    ReviewState.IN_REVIEW: [
        ReviewState.WAITING_FOR_CHANGES,
        ReviewState.CHANGES_REQUESTED,
        ReviewState.APPROVED,
        ReviewState.APPROVED_WITH_SUGGESTIONS,
        ReviewState.BLOCKED,
        ReviewState.PENDING_REVIEW,  # For reassignment
        ReviewState.ABANDONED,
        ReviewState.CLOSED,
    ],
    ReviewState.WAITING_FOR_CHANGES: [
        ReviewState.IN_REVIEW,
        ReviewState.CHANGES_REQUESTED,
        ReviewState.DRAFT,
        ReviewState.ABANDONED,
        ReviewState.CLOSED,
    ],
    ReviewState.CHANGES_REQUESTED: [
        ReviewState.IN_REVIEW,
        ReviewState.WAITING_FOR_CHANGES,
        ReviewState.DRAFT,
        ReviewState.ABANDONED,
        ReviewState.CLOSED,
    ],
    ReviewState.APPROVED: [
        ReviewState.MERGED,
        ReviewState.IN_REVIEW,  # For re-review after changes
        ReviewState.CLOSED,
        ReviewState.ABANDONED,
    ],
    ReviewState.APPROVED_WITH_SUGGESTIONS: [
        ReviewState.MERGED,
        ReviewState.IN_REVIEW,  # For re-review if author wants
        ReviewState.APPROVED,  # Upgrade to full approval
        ReviewState.CLOSED,
        ReviewState.ABANDONED,
    ],
    ReviewState.BLOCKED: [
        ReviewState.IN_REVIEW,
        ReviewState.CHANGES_REQUESTED,
        ReviewState.FAILED,
        ReviewState.ABANDONED,
        ReviewState.CLOSED,
    ],
    ReviewState.MERGED: [],  # Terminal state
    ReviewState.CLOSED: [],  # Terminal state
    ReviewState.ABANDONED: [],  # Terminal state
    ReviewState.FAILED: [
        ReviewState.DRAFT,
        ReviewState.READY_FOR_REVIEW,
        ReviewState.ABANDONED,
    ],
}

# Transition event mappings
TRANSITION_EVENTS: Dict[ReviewStateTransition, List[ReviewState]] = {
    ReviewStateTransition.SUBMIT_FOR_REVIEW: [ReviewState.READY_FOR_REVIEW],
    ReviewStateTransition.REQUEST_REVIEW: [ReviewState.ASSIGNING_REVIEWERS, ReviewState.PENDING_REVIEW],
    ReviewStateTransition.AUTO_ASSIGN: [ReviewState.PENDING_REVIEW],
    ReviewStateTransition.START_REVIEW: [ReviewState.IN_REVIEW],
    ReviewStateTransition.REQUEST_CHANGES: [ReviewState.WAITING_FOR_CHANGES, ReviewState.CHANGES_REQUESTED],
    ReviewStateTransition.APPROVE: [ReviewState.APPROVED],
    ReviewStateTransition.APPROVE_WITH_SUGGESTIONS: [ReviewState.APPROVED_WITH_SUGGESTIONS],
    ReviewStateTransition.BLOCK: [ReviewState.BLOCKED],
    ReviewStateTransition.UPDATE_CHANGES: [ReviewState.IN_REVIEW],
    ReviewStateTransition.ADDRESS_FEEDBACK: [ReviewState.IN_REVIEW],
    ReviewStateTransition.MERGE: [ReviewState.MERGED],
    ReviewStateTransition.CLOSE: [ReviewState.CLOSED],
    ReviewStateTransition.ABANDON: [ReviewState.ABANDONED],
    ReviewStateTransition.ERROR: [ReviewState.FAILED],
    ReviewStateTransition.RESTART_REVIEW: [ReviewState.DRAFT, ReviewState.READY_FOR_REVIEW],
}


def can_transition(from_state: ReviewState, to_state: ReviewState) -> bool:
    """Check if a state transition is valid"""
    return to_state in VALID_TRANSITIONS.get(from_state, [])


def get_valid_transitions(current_state: ReviewState) -> List[ReviewState]:
    """Get all valid next states from current state"""
    return VALID_TRANSITIONS.get(current_state, [])


def get_transition_events_for_state(target_state: ReviewState) -> List[ReviewStateTransition]:
    """Get all events that can lead to a target state"""
    events = []
    for event, states in TRANSITION_EVENTS.items():
        if target_state in states:
            events.append(event)
    return events


def is_terminal_state(state: ReviewState) -> bool:
    """Check if a state is terminal (no outgoing transitions)"""
    return len(VALID_TRANSITIONS.get(state, [])) == 0


def is_active_review_state(state: ReviewState) -> bool:
    """Check if state represents an active review"""
    return state in [
        ReviewState.IN_REVIEW,
        ReviewState.WAITING_FOR_CHANGES,
        ReviewState.CHANGES_REQUESTED,
    ]
"""
Repository for managing review states and state machine transitions.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.data.database import get_engine
from app.data.models.review_state import (
    ReviewState, 
    ReviewStateTransition, 
    ReviewStateInfo,
    can_transition,
    is_terminal_state,
    is_active_review_state,
)


class ReviewStateRepo:
    """Repository for review state operations."""

    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def create_review_state(
        self, 
        analysis_id: str, 
        initial_state: ReviewState = ReviewState.DRAFT,
        transitioned_by: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Create a new review state record and return its ID."""
        state_id = str(uuid.uuid4())
        history_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        with self._engine.begin() as conn:
            # Insert into review_states table
            state_query = text("""
                INSERT INTO review_states (
                    id, analysis_id, current_state, previous_state, transition_reason,
                    transitioned_by, transitioned_at, metadata, reviewers_assigned,
                    reviewers_completed, blocking_comments, change_requests,
                    is_overdue, created_at, updated_at
                ) VALUES (
                    :id, :analysis_id, :current_state, NULL, :transition_reason,
                    :transitioned_by, :transitioned_at, :metadata, ARRAY[]::text[],
                    ARRAY[]::text[], 0, 0, false, :created_at, :updated_at
                )
            """)
            
            conn.execute(state_query, {
                "id": state_id,
                "analysis_id": analysis_id,
                "current_state": initial_state.value,
                "transition_reason": "submit_for_review",
                "transitioned_by": transitioned_by,
                "transitioned_at": now,
                "metadata": metadata or {},
                "created_at": now,
                "updated_at": now,
            })
            
            # Insert into review_state_history table
            history_query = text("""
                INSERT INTO review_state_history (
                    id, analysis_id, from_state, to_state, transition_reason,
                    transitioned_by, transitioned_at, metadata, created_at
                ) VALUES (
                    :id, :analysis_id, NULL, :to_state, :transition_reason,
                    :transitioned_by, :transitioned_at, :metadata, :created_at
                )
            """)
            
            conn.execute(history_query, {
                "id": history_id,
                "analysis_id": analysis_id,
                "to_state": initial_state.value,
                "transition_reason": "submit_for_review",
                "transitioned_by": transitioned_by,
                "transitioned_at": now,
                "metadata": metadata or {},
                "created_at": now,
            })
        
        return state_id

    def get_review_state(self, analysis_id: str) -> Optional[ReviewStateInfo]:
        """Get current review state for an analysis."""
        query = text("""
            SELECT * FROM review_states WHERE analysis_id = :analysis_id
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            row = result.mappings().first()
            
            if not row:
                return None
            
            return self._row_to_review_state(row)

    def transition_state(
        self,
        analysis_id: str,
        to_state: ReviewState,
        transition_reason: ReviewStateTransition,
        transitioned_by: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Transition a review to a new state."""
        # Get current state
        current_state_info = self.get_review_state(analysis_id)
        if not current_state_info:
            raise ValueError(f"No review state found for analysis {analysis_id}")
        
        current_state = ReviewState(current_state_info.current_state)
        
        # Validate transition
        if not can_transition(current_state, to_state):
            raise ValueError(
                f"Invalid transition from {current_state.value} to {to_state.value}"
            )
        
        now = datetime.now(timezone.utc)
        history_id = str(uuid.uuid4())
        
        # Calculate time in current state
        time_in_state = (now - current_state_info.transitioned_at).total_seconds()
        
        with self._engine.begin() as conn:
            # Update current state
            update_query = text("""
                UPDATE review_states SET
                    previous_state = current_state,
                    current_state = :new_state,
                    transition_reason = :transition_reason,
                    transitioned_by = :transitioned_by,
                    transitioned_at = :transitioned_at,
                    metadata = :metadata,
                    time_in_current_state = 0,
                    updated_at = :updated_at
                WHERE analysis_id = :analysis_id
            """)
            
            result = conn.execute(update_query, {
                "analysis_id": analysis_id,
                "new_state": to_state.value,
                "transition_reason": transition_reason.value,
                "transitioned_by": transitioned_by,
                "transitioned_at": now,
                "metadata": metadata or {},
                "updated_at": now,
            })
            
            if result.rowcount == 0:
                return False
            
            # Insert into history
            history_query = text("""
                INSERT INTO review_state_history (
                    id, analysis_id, from_state, to_state, transition_reason,
                    transitioned_by, transitioned_at, metadata, duration_in_previous_state,
                    created_at
                ) VALUES (
                    :id, :analysis_id, :from_state, :to_state, :transition_reason,
                    :transitioned_by, :transitioned_at, :metadata, :duration,
                    :created_at
                )
            """)
            
            conn.execute(history_query, {
                "id": history_id,
                "analysis_id": analysis_id,
                "from_state": current_state.value,
                "to_state": to_state.value,
                "transition_reason": transition_reason.value,
                "transitioned_by": transitioned_by,
                "transitioned_at": now,
                "metadata": metadata or {},
                "duration": time_in_state,
                "created_at": now,
            })
        
        return True

    def update_review_progress(
        self,
        analysis_id: str,
        reviewers_assigned: Optional[List[str]] = None,
        reviewers_completed: Optional[List[str]] = None,
        blocking_comments: Optional[int] = None,
        change_requests: Optional[int] = None,
        sla_deadline: Optional[datetime] = None,
        is_overdue: Optional[bool] = None,
    ) -> bool:
        """Update review progress metrics."""
        updates = []
        params = {"analysis_id": analysis_id, "updated_at": datetime.now(timezone.utc)}
        
        if reviewers_assigned is not None:
            updates.append("reviewers_assigned = :reviewers_assigned")
            params["reviewers_assigned"] = reviewers_assigned
        
        if reviewers_completed is not None:
            updates.append("reviewers_completed = :reviewers_completed")
            params["reviewers_completed"] = reviewers_completed
        
        if blocking_comments is not None:
            updates.append("blocking_comments = :blocking_comments")
            params["blocking_comments"] = blocking_comments
        
        if change_requests is not None:
            updates.append("change_requests = :change_requests")
            params["change_requests"] = change_requests
        
        if sla_deadline is not None:
            updates.append("sla_deadline = :sla_deadline")
            params["sla_deadline"] = sla_deadline
        
        if is_overdue is not None:
            updates.append("is_overdue = :is_overdue")
            params["is_overdue"] = is_overdue
        
        if not updates:
            return False
        
        updates.append("updated_at = :updated_at")
        
        query = text(f"""
            UPDATE review_states SET {', '.join(updates)}
            WHERE analysis_id = :analysis_id
        """)
        
        with self._engine.begin() as conn:
            result = conn.execute(query, params)
            return result.rowcount > 0

    def get_state_history(self, analysis_id: str) -> List[Dict[str, Any]]:
        """Get full state transition history for an analysis."""
        query = text("""
            SELECT * FROM review_state_history 
            WHERE analysis_id = :analysis_id
            ORDER BY transitioned_at ASC
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            return [
                {
                    "id": row["id"],
                    "from_state": row["from_state"],
                    "to_state": row["to_state"],
                    "transition_reason": row["transition_reason"],
                    "transitioned_by": row["transitioned_by"],
                    "transitioned_at": row["transitioned_at"].isoformat() if row["transitioned_at"] else None,
                    "metadata": row["metadata"] or {},
                    "duration_in_previous_state": float(row["duration_in_previous_state"]) if row["duration_in_previous_state"] else None,
                }
                for row in result.mappings()
            ]

    def get_reviews_by_state(
        self, 
        state: ReviewState, 
        limit: int = 100, 
        offset: int = 0
    ) -> List[ReviewStateInfo]:
        """Get all reviews in a specific state."""
        query = text("""
            SELECT * FROM review_states 
            WHERE current_state = :state
            ORDER BY transitioned_at DESC
            LIMIT :limit OFFSET :offset
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, {
                "state": state.value,
                "limit": limit,
                "offset": offset,
            })
            return [self._row_to_review_state(row) for row in result.mappings()]

    def get_overdue_reviews(self, limit: int = 100) -> List[ReviewStateInfo]:
        """Get all overdue reviews."""
        query = text("""
            SELECT * FROM review_states 
            WHERE is_overdue = true
            ORDER BY sla_deadline ASC
            LIMIT :limit
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, {"limit": limit})
            return [self._row_to_review_state(row) for row in result.mappings()]

    def get_reviewer_active_reviews(self, reviewer_id: str) -> List[ReviewStateInfo]:
        """Get all active reviews assigned to a reviewer."""
        query = text("""
            SELECT * FROM review_states 
            WHERE :reviewer_id = ANY(reviewers_assigned)
            AND current_state IN ('pending_review', 'in_review', 'waiting_for_changes', 'changes_requested')
            ORDER BY transitioned_at ASC
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, {"reviewer_id": reviewer_id})
            return [self._row_to_review_state(row) for row in result.mappings()]

    def update_sla_status(self) -> int:
        """Update SLA status for all active reviews. Returns count of updated records."""
        now = datetime.now(timezone.utc)
        
        query = text("""
            UPDATE review_states SET 
                is_overdue = true,
                updated_at = :now
            WHERE sla_deadline < :now 
            AND is_overdue = false
            AND current_state NOT IN ('merged', 'closed', 'abandoned')
        """)
        
        with self._engine.begin() as conn:
            result = conn.execute(query, {"now": now})
            return result.rowcount

    def _row_to_review_state(self, row) -> ReviewStateInfo:
        """Convert a database row to ReviewStateInfo."""
        return ReviewStateInfo(
            id=str(row["id"]),
            analysis_id=str(row["analysis_id"]),
            current_state=ReviewState(row["current_state"]),
            previous_state=ReviewState(row["previous_state"]) if row["previous_state"] else None,
            transition_reason=ReviewStateTransition(row["transition_reason"]) if row["transition_reason"] else None,
            transitioned_by=row["transitioned_by"],
            transitioned_at=row["transitioned_at"],
            metadata=row["metadata"] or {},
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            reviewers_assigned=list(row["reviewers_assigned"]) if row["reviewers_assigned"] else [],
            reviewers_completed=list(row["reviewers_completed"]) if row["reviewers_completed"] else [],
            blocking_comments=int(row["blocking_comments"]) if row["blocking_comments"] else 0,
            change_requests=int(row["change_requests"]) if row["change_requests"] else 0,
            time_in_current_state=float(row["time_in_current_state"]) if row["time_in_current_state"] else None,
            total_review_time=float(row["total_review_time"]) if row["total_review_time"] else None,
            sla_deadline=row["sla_deadline"],
            is_overdue=bool(row["is_overdue"]),
        )
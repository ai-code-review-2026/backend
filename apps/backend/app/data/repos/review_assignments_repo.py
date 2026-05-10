from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine


@dataclass
class CreateReviewAssignmentInput:
    """Input for creating a review assignment"""
    analysis_id: str
    reviewer_id: str
    assigner_id: str | None
    assignment_type: str  # 'auto', 'manual', 'self_assigned'
    priority: str = "medium"  # 'low', 'medium', 'high', 'critical'
    due_at: str | None = None  # ISO datetime


@dataclass
class UpdateReviewAssignmentInput:
    """Input for updating a review assignment"""
    status: str | None = None  # 'pending', 'in_progress', 'completed', 'declined'
    started_at: str | None = None
    completed_at: str | None = None
    declined_reason: str | None = None
    priority: str | None = None  # 'low', 'medium', 'high', 'critical'
    reviewer_id: str | None = None


class ReviewAssignmentsRepo:
    """Repository for review assignments"""

    def __init__(self, engine: Engine | None = None):
        self._engine = engine or get_engine()

    def create_assignment(self, input_data: CreateReviewAssignmentInput) -> str:
        """Create a new review assignment"""
        assignment_id = f"asg_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        query = text("""
            INSERT INTO review_assignments (
                id, analysis_id, reviewer_id, assigner_id, assignment_type,
                priority, assigned_at, due_at, status, created_at, updated_at
            )
            VALUES (
                :id, :analysis_id, :reviewer_id, :assigner_id, :assignment_type,
                :priority, :assigned_at, :due_at, :status, :created_at, :updated_at
            )
            RETURNING id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "id": assignment_id,
                    "analysis_id": input_data.analysis_id,
                    "reviewer_id": input_data.reviewer_id,
                    "assigner_id": input_data.assigner_id,
                    "assignment_type": input_data.assignment_type,
                    "priority": input_data.priority,
                    "assigned_at": now,
                    "due_at": input_data.due_at,
                    "status": "pending",
                    "created_at": now,
                    "updated_at": now,
                },
            )
            return result.scalar_one()

    def get_assignment_by_id(self, assignment_id: str) -> RowMapping | None:
        """Get assignment by ID"""
        query = text("""
            SELECT * FROM review_assignments WHERE id = :id
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"id": assignment_id})
            row = result.mappings().first()
            return row

    def get_assignments_by_reviewer(
        self,
        reviewer_id: str,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[RowMapping]:
        """Get assignments for a reviewer"""
        if status:
            query = text("""
                SELECT * FROM review_assignments
                WHERE reviewer_id = :reviewer_id AND status = :status
                ORDER BY priority DESC, due_at ASC NULLS LAST, created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            params = {"reviewer_id": reviewer_id, "status": status, "limit": limit, "offset": offset}
        else:
            query = text("""
                SELECT * FROM review_assignments
                WHERE reviewer_id = :reviewer_id
                ORDER BY priority DESC, due_at ASC NULLS LAST, created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            params = {"reviewer_id": reviewer_id, "limit": limit, "offset": offset}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return list(result.mappings().all())

    def get_assignments_by_analysis(self, analysis_id: str) -> list[RowMapping]:
        """Get all assignments for an analysis"""
        query = text("""
            SELECT * FROM review_assignments
            WHERE analysis_id = :analysis_id
            ORDER BY created_at DESC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            return list(result.mappings().all())

    def find_assignment_by_analysis_and_reviewer(
        self,
        analysis_id: str,
        reviewer_id: str,
        status: str | None = None,
    ) -> RowMapping | None:
        """Find assignment for specific analysis and reviewer"""
        if status:
            query = text("""
                SELECT * FROM review_assignments
                WHERE analysis_id = :analysis_id AND reviewer_id = :reviewer_id AND status = :status
                ORDER BY created_at DESC
                LIMIT 1
            """)
            params = {"analysis_id": analysis_id, "reviewer_id": reviewer_id, "status": status}
        else:
            query = text("""
                SELECT * FROM review_assignments
                WHERE analysis_id = :analysis_id AND reviewer_id = :reviewer_id
                ORDER BY created_at DESC
                LIMIT 1
            """)
            params = {"analysis_id": analysis_id, "reviewer_id": reviewer_id}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return result.mappings().first()

    def get_pending_assignments(
        self,
        priority: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[RowMapping]:
        """Get all pending assignments (for queue view)"""
        if priority:
            query = text("""
                SELECT * FROM review_assignments
                WHERE status = 'pending' AND priority = :priority
                ORDER BY due_at ASC NULLS LAST, created_at ASC
                LIMIT :limit OFFSET :offset
            """)
            params = {"priority": priority, "limit": limit, "offset": offset}
        else:
            query = text("""
                SELECT * FROM review_assignments
                WHERE status = 'pending'
                ORDER BY priority DESC, due_at ASC NULLS LAST, created_at ASC
                LIMIT :limit OFFSET :offset
            """)
            params = {"limit": limit, "offset": offset}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return list(result.mappings().all())

    def get_overdue_assignments(self) -> list[RowMapping]:
        """Get overdue assignments (past due_at and still pending/in_progress)"""
        query = text("""
            SELECT * FROM review_assignments
            WHERE status IN ('pending', 'in_progress')
            AND due_at IS NOT NULL
            AND due_at < NOW()
            ORDER BY due_at ASC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query)
            return list(result.mappings().all())

    def update_assignment(
        self,
        assignment_id: str,
        update_data: UpdateReviewAssignmentInput,
    ) -> bool:
        """Update an assignment"""
        now = datetime.now(timezone.utc).isoformat()
        updates = []
        params: dict[str, Any] = {"id": assignment_id, "updated_at": now}

        if update_data.status is not None:
            updates.append("status = :status")
            params["status"] = update_data.status

        if update_data.started_at is not None:
            updates.append("started_at = :started_at")
            params["started_at"] = update_data.started_at

        if update_data.completed_at is not None:
            updates.append("completed_at = :completed_at")
            params["completed_at"] = update_data.completed_at

        if update_data.declined_reason is not None:
            updates.append("declined_reason = :declined_reason")
            params["declined_reason"] = update_data.declined_reason

        if update_data.priority is not None:
            updates.append("priority = :priority")
            params["priority"] = update_data.priority

        if update_data.reviewer_id is not None:
            updates.append("reviewer_id = :reviewer_id")
            params["reviewer_id"] = update_data.reviewer_id

        if not updates:
            return False

        updates.append("updated_at = :updated_at")
        query = text(f"""
            UPDATE review_assignments
            SET {", ".join(updates)}
            WHERE id = :id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(query, params)
            return result.rowcount > 0

    def delete_assignment(self, assignment_id: str) -> bool:
        """Delete an assignment"""
        query = text("DELETE FROM review_assignments WHERE id = :id")

        with self._engine.begin() as conn:
            result = conn.execute(query, {"id": assignment_id})
            return result.rowcount > 0

    def count_active_assignments_by_reviewer(self, reviewer_id: str) -> int:
        """Count active (pending + in_progress) assignments for a reviewer"""
        query = text("""
            SELECT COUNT(*) as count
            FROM review_assignments
            WHERE reviewer_id = :reviewer_id
            AND status IN ('pending', 'in_progress')
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"reviewer_id": reviewer_id})
            row = result.mappings().first()
            return row["count"] if row else 0

    def get_assignment_stats(self, reviewer_id: str) -> dict[str, Any]:
        """Get assignment statistics for a reviewer"""
        query = text("""
            SELECT
                COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_count,
                COUNT(*) FILTER (WHERE status = 'declined') as declined_count,
                COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND due_at < NOW()) as overdue_count
            FROM review_assignments
            WHERE reviewer_id = :reviewer_id
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"reviewer_id": reviewer_id})
            row = result.mappings().first()
            return dict(row) if row else {}

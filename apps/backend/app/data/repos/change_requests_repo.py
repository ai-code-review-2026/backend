from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine


@dataclass
class CreateChangeRequestInput:
    """Input for creating a change request"""
    analysis_id: str
    reviewer_id: str
    title: str
    description: str
    category: str  # 'security', 'performance', 'quality', 'style', 'tests', 'documentation'
    priority: str = "medium"  # 'low', 'medium', 'high', 'critical'
    related_comments: list[str] = field(default_factory=list)
    related_findings: list[str] = field(default_factory=list)


@dataclass
class UpdateChangeRequestInput:
    """Input for updating a change request"""
    status: str | None = None  # 'open', 'in_progress', 'resolved', 'declined'
    resolved_by: str | None = None
    resolved_at: str | None = None
    resolution_comment: str | None = None


class ChangeRequestsRepo:
    """Repository for change requests"""

    def __init__(self, engine: Engine | None = None):
        self._engine = engine or get_engine()

    def create_change_request(self, input_data: CreateChangeRequestInput) -> str:
        """Create a new change request"""
        cr_id = f"cr_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        query = text("""
            INSERT INTO change_requests (
                id, analysis_id, reviewer_id, title, description, category, priority,
                related_comments, related_findings, status, created_at, updated_at
            )
            VALUES (
                :id, :analysis_id, :reviewer_id, :title, :description, :category, :priority,
                :related_comments, :related_findings, :status, :created_at, :updated_at
            )
            RETURNING id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "id": cr_id,
                    "analysis_id": input_data.analysis_id,
                    "reviewer_id": input_data.reviewer_id,
                    "title": input_data.title,
                    "description": input_data.description,
                    "category": input_data.category,
                    "priority": input_data.priority,
                    "related_comments": input_data.related_comments,
                    "related_findings": input_data.related_findings,
                    "status": "open",
                    "created_at": now,
                    "updated_at": now,
                },
            )
            return result.scalar_one()

    def get_change_request_by_id(self, cr_id: str) -> RowMapping | None:
        """Get change request by ID"""
        query = text("""
            SELECT * FROM change_requests WHERE id = :id
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"id": cr_id})
            row = result.mappings().first()
            return row

    def get_change_requests_by_analysis(
        self,
        analysis_id: str,
        status: str | None = None,
    ) -> list[RowMapping]:
        """Get change requests for an analysis"""
        if status:
            query = text("""
                SELECT * FROM change_requests
                WHERE analysis_id = :analysis_id AND status = :status
                ORDER BY priority DESC, created_at DESC
            """)
            params = {"analysis_id": analysis_id, "status": status}
        else:
            query = text("""
                SELECT * FROM change_requests
                WHERE analysis_id = :analysis_id
                ORDER BY priority DESC, created_at DESC
            """)
            params = {"analysis_id": analysis_id}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return list(result.mappings().all())

    def get_change_requests_by_reviewer(
        self,
        reviewer_id: str,
        status: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[RowMapping]:
        """Get change requests created by a reviewer"""
        if status:
            query = text("""
                SELECT * FROM change_requests
                WHERE reviewer_id = :reviewer_id AND status = :status
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            params = {"reviewer_id": reviewer_id, "status": status, "limit": limit, "offset": offset}
        else:
            query = text("""
                SELECT * FROM change_requests
                WHERE reviewer_id = :reviewer_id
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """)
            params = {"reviewer_id": reviewer_id, "limit": limit, "offset": offset}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return list(result.mappings().all())

    def get_open_change_requests(
        self,
        priority: str | None = None,
        category: str | None = None,
    ) -> list[RowMapping]:
        """Get all open change requests"""
        conditions = ["status IN ('open', 'in_progress')"]
        params: dict[str, Any] = {}

        if priority:
            conditions.append("priority = :priority")
            params["priority"] = priority

        if category:
            conditions.append("category = :category")
            params["category"] = category

        query = text(f"""
            SELECT * FROM change_requests
            WHERE {" AND ".join(conditions)}
            ORDER BY priority DESC, created_at ASC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return list(result.mappings().all())

    def update_change_request(
        self,
        cr_id: str,
        update_data: UpdateChangeRequestInput,
    ) -> bool:
        """Update a change request"""
        now = datetime.now(timezone.utc).isoformat()
        updates = []
        params: dict[str, Any] = {"id": cr_id, "updated_at": now}

        if update_data.status is not None:
            updates.append("status = :status")
            params["status"] = update_data.status

        if update_data.resolved_by is not None:
            updates.append("resolved_by = :resolved_by")
            params["resolved_by"] = update_data.resolved_by

        if update_data.resolved_at is not None:
            updates.append("resolved_at = :resolved_at")
            params["resolved_at"] = update_data.resolved_at

        if update_data.resolution_comment is not None:
            updates.append("resolution_comment = :resolution_comment")
            params["resolution_comment"] = update_data.resolution_comment

        if not updates:
            return False

        updates.append("updated_at = :updated_at")
        query = text(f"""
            UPDATE change_requests
            SET {", ".join(updates)}
            WHERE id = :id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(query, params)
            return result.rowcount > 0

    def delete_change_request(self, cr_id: str) -> bool:
        """Delete a change request"""
        query = text("DELETE FROM change_requests WHERE id = :id")

        with self._engine.begin() as conn:
            result = conn.execute(query, {"id": cr_id})
            return result.rowcount > 0

    def count_change_requests_by_analysis(self, analysis_id: str) -> dict[str, int]:
        """Count change requests by status for an analysis"""
        query = text("""
            SELECT
                COUNT(*) as total_count,
                COUNT(*) FILTER (WHERE status = 'open') as open_count,
                COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress_count,
                COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
                COUNT(*) FILTER (WHERE status = 'declined') as declined_count,
                COUNT(*) FILTER (WHERE priority = 'critical' AND status IN ('open', 'in_progress')) as critical_open_count
            FROM change_requests
            WHERE analysis_id = :analysis_id
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            row = result.mappings().first()
            return dict(row) if row else {}

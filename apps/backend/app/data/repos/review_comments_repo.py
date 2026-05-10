from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine


@dataclass
class CreateReviewCommentInput:
    """Input for creating a review comment"""
    analysis_id: str
    author_id: str
    file_path: str
    line_start: int
    content: str
    comment_type: str = "comment"  # 'comment', 'suggestion', 'question', 'praise', 'change_request'
    parent_id: str | None = None
    line_end: int | None = None
    code_snippet: str | None = None
    severity: str | None = None  # 'info', 'warn', 'blocker'
    is_blocking: bool = False


@dataclass
class UpdateReviewCommentInput:
    """Input for updating a review comment"""
    content: str | None = None
    status: str | None = None  # 'open', 'resolved', 'wontfix'
    resolved_by: str | None = None
    resolved_at: str | None = None


class ReviewCommentsRepo:
    """Repository for review comments"""

    def __init__(self, engine: Engine | None = None):
        self._engine = engine or get_engine()

    def create_comment(self, input_data: CreateReviewCommentInput) -> str:
        """Create a new review comment"""
        comment_id = f"cmt_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        query = text("""
            INSERT INTO review_comments (
                id, analysis_id, author_id, parent_id, file_path, line_start, line_end,
                code_snippet, content, comment_type, severity, status, is_blocking,
                reactions_json, created_at, updated_at
            )
            VALUES (
                :id, :analysis_id, :author_id, :parent_id, :file_path, :line_start, :line_end,
                :code_snippet, :content, :comment_type, :severity, :status, :is_blocking,
                :reactions_json, :created_at, :updated_at
            )
            RETURNING id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "id": comment_id,
                    "analysis_id": input_data.analysis_id,
                    "author_id": input_data.author_id,
                    "parent_id": input_data.parent_id,
                    "file_path": input_data.file_path,
                    "line_start": input_data.line_start,
                    "line_end": input_data.line_end,
                    "code_snippet": input_data.code_snippet,
                    "content": input_data.content,
                    "comment_type": input_data.comment_type,
                    "severity": input_data.severity,
                    "status": "open",
                    "is_blocking": input_data.is_blocking,
                    "reactions_json": "{}",
                    "created_at": now,
                    "updated_at": now,
                },
            )
            return result.scalar_one()

    def get_comment_by_id(self, comment_id: str) -> RowMapping | None:
        """Get comment by ID"""
        query = text("""
            SELECT * FROM review_comments WHERE id = :id
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"id": comment_id})
            row = result.mappings().first()
            return row

    def get_comments_by_analysis(
        self,
        analysis_id: str,
        status: str | None = None,
        file_path: str | None = None,
    ) -> list[RowMapping]:
        """Get comments for an analysis"""
        conditions = ["analysis_id = :analysis_id", "parent_id IS NULL"]
        params: dict[str, Any] = {"analysis_id": analysis_id}

        if status:
            conditions.append("status = :status")
            params["status"] = status

        if file_path:
            conditions.append("file_path = :file_path")
            params["file_path"] = file_path

        query = text(f"""
            SELECT * FROM review_comments
            WHERE {" AND ".join(conditions)}
            ORDER BY created_at DESC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return list(result.mappings().all())

    def get_comment_thread(self, parent_id: str) -> list[RowMapping]:
        """Get all replies in a comment thread"""
        query = text("""
            SELECT * FROM review_comments
            WHERE parent_id = :parent_id
            ORDER BY created_at ASC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"parent_id": parent_id})
            return list(result.mappings().all())

    def get_blocking_comments(self, analysis_id: str) -> list[RowMapping]:
        """Get all blocking comments for an analysis"""
        query = text("""
            SELECT * FROM review_comments
            WHERE analysis_id = :analysis_id
            AND is_blocking = true
            AND status = 'open'
            ORDER BY created_at DESC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            return list(result.mappings().all())

    def get_comments_by_author(
        self,
        author_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[RowMapping]:
        """Get comments by author"""
        query = text("""
            SELECT * FROM review_comments
            WHERE author_id = :author_id
            ORDER BY created_at DESC
            LIMIT :limit OFFSET :offset
        """)

        with self._engine.connect() as conn:
            result = conn.execute(
                query,
                {"author_id": author_id, "limit": limit, "offset": offset},
            )
            return list(result.mappings().all())

    def update_comment(
        self,
        comment_id: str,
        update_data: UpdateReviewCommentInput,
    ) -> bool:
        """Update a comment"""
        now = datetime.now(timezone.utc).isoformat()
        updates = []
        params: dict[str, Any] = {"id": comment_id, "updated_at": now}

        if update_data.content is not None:
            updates.append("content = :content")
            params["content"] = update_data.content

        if update_data.status is not None:
            updates.append("status = :status")
            params["status"] = update_data.status

        if update_data.resolved_by is not None:
            updates.append("resolved_by = :resolved_by")
            params["resolved_by"] = update_data.resolved_by

        if update_data.resolved_at is not None:
            updates.append("resolved_at = :resolved_at")
            params["resolved_at"] = update_data.resolved_at

        if not updates:
            return False

        updates.append("updated_at = :updated_at")
        query = text(f"""
            UPDATE review_comments
            SET {", ".join(updates)}
            WHERE id = :id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(query, params)
            return result.rowcount > 0

    def delete_comment(self, comment_id: str) -> bool:
        """Delete a comment (will cascade delete replies)"""
        query = text("DELETE FROM review_comments WHERE id = :id")

        with self._engine.begin() as conn:
            result = conn.execute(query, {"id": comment_id})
            return result.rowcount > 0

    def add_reaction(self, comment_id: str, reaction_type: str, user_id: str) -> bool:
        """Add a reaction to a comment"""
        # This is a simplified version - in production you'd want to track who reacted
        query = text("""
            UPDATE review_comments
            SET reactions_json = jsonb_set(
                COALESCE(reactions_json, '{}'::jsonb),
                ARRAY[:reaction_type],
                (COALESCE(reactions_json->>:reaction_type, '0')::int + 1)::text::jsonb
            ),
            updated_at = :updated_at
            WHERE id = :id
        """)

        now = datetime.now(timezone.utc).isoformat()

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "id": comment_id,
                    "reaction_type": reaction_type,
                    "updated_at": now,
                },
            )
            return result.rowcount > 0

    def count_comments_by_analysis(self, analysis_id: str) -> dict[str, int]:
        """Count comments by status for an analysis"""
        query = text("""
            SELECT
                COUNT(*) as total_count,
                COUNT(*) FILTER (WHERE status = 'open') as open_count,
                COUNT(*) FILTER (WHERE status = 'resolved') as resolved_count,
                COUNT(*) FILTER (WHERE is_blocking = true AND status = 'open') as blocking_count
            FROM review_comments
            WHERE analysis_id = :analysis_id
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            row = result.mappings().first()
            return dict(row) if row else {}

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine


@dataclass
class CreateReviewSessionInput:
    """Input for creating a review session"""
    analysis_id: str
    initiator_id: str
    participants: list[str]  # User IDs
    recording_enabled: bool = False


@dataclass
class UpdateReviewSessionInput:
    """Input for updating a review session"""
    status: str | None = None  # 'active', 'paused', 'completed'
    current_file: str | None = None
    cursor_positions: dict[str, Any] | None = None
    session_notes: str | None = None
    ended_at: str | None = None


class ReviewSessionsRepo:
    """Repository for review sessions (live collaboration)"""

    def __init__(self, engine: Engine | None = None):
        self._engine = engine or get_engine()

    def create_session(self, input_data: CreateReviewSessionInput) -> str:
        """Create a new review session"""
        session_id = f"ses_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        query = text("""
            INSERT INTO review_sessions (
                id, analysis_id, initiator_id, status, participants,
                started_at, current_file, cursor_positions, session_notes,
                recording_enabled, created_at, updated_at
            )
            VALUES (
                :id, :analysis_id, :initiator_id, :status, :participants,
                :started_at, :current_file, :cursor_positions, :session_notes,
                :recording_enabled, :created_at, :updated_at
            )
            RETURNING id
        """)

        import json

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "id": session_id,
                    "analysis_id": input_data.analysis_id,
                    "initiator_id": input_data.initiator_id,
                    "status": "active",
                    "participants": input_data.participants,
                    "started_at": now,
                    "current_file": None,
                    "cursor_positions": "{}",
                    "session_notes": None,
                    "recording_enabled": input_data.recording_enabled,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            return result.scalar_one()

    def get_session_by_id(self, session_id: str) -> RowMapping | None:
        """Get session by ID"""
        query = text("""
            SELECT * FROM review_sessions WHERE id = :id
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"id": session_id})
            row = result.mappings().first()
            return row

    def get_sessions_by_analysis(self, analysis_id: str) -> list[RowMapping]:
        """Get all sessions for an analysis"""
        query = text("""
            SELECT * FROM review_sessions
            WHERE analysis_id = :analysis_id
            ORDER BY created_at DESC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            return list(result.mappings().all())

    def get_active_sessions(self) -> list[RowMapping]:
        """Get all active sessions"""
        query = text("""
            SELECT * FROM review_sessions
            WHERE status = 'active'
            ORDER BY started_at ASC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query)
            return list(result.mappings().all())

    def get_active_session_by_analysis(self, analysis_id: str) -> RowMapping | None:
        """Get active session for an analysis (there should be only one)"""
        query = text("""
            SELECT * FROM review_sessions
            WHERE analysis_id = :analysis_id AND status = 'active'
            ORDER BY started_at DESC
            LIMIT 1
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            row = result.mappings().first()
            return row

    def get_sessions_by_participant(
        self,
        user_id: str,
        status: str | None = None,
    ) -> list[RowMapping]:
        """Get sessions where user is a participant"""
        if status:
            query = text("""
                SELECT * FROM review_sessions
                WHERE :user_id = ANY(participants) AND status = :status
                ORDER BY created_at DESC
            """)
            params = {"user_id": user_id, "status": status}
        else:
            query = text("""
                SELECT * FROM review_sessions
                WHERE :user_id = ANY(participants)
                ORDER BY created_at DESC
            """)
            params = {"user_id": user_id}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return list(result.mappings().all())

    def update_session(
        self,
        session_id: str,
        update_data: UpdateReviewSessionInput,
    ) -> bool:
        """Update a session"""
        now = datetime.now(timezone.utc).isoformat()
        updates = []
        params: dict[str, Any] = {"id": session_id, "updated_at": now}

        if update_data.status is not None:
            updates.append("status = :status")
            params["status"] = update_data.status

        if update_data.current_file is not None:
            updates.append("current_file = :current_file")
            params["current_file"] = update_data.current_file

        if update_data.cursor_positions is not None:
            import json
            updates.append("cursor_positions = :cursor_positions")
            params["cursor_positions"] = json.dumps(update_data.cursor_positions)

        if update_data.session_notes is not None:
            updates.append("session_notes = :session_notes")
            params["session_notes"] = update_data.session_notes

        if update_data.ended_at is not None:
            updates.append("ended_at = :ended_at")
            params["ended_at"] = update_data.ended_at

        if not updates:
            return False

        updates.append("updated_at = :updated_at")
        query = text(f"""
            UPDATE review_sessions
            SET {", ".join(updates)}
            WHERE id = :id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(query, params)
            return result.rowcount > 0

    def add_participant(self, session_id: str, user_id: str) -> bool:
        """Add a participant to a session"""
        query = text("""
            UPDATE review_sessions
            SET participants = array_append(participants, :user_id),
                updated_at = :updated_at
            WHERE id = :id
            AND :user_id != ALL(participants)  -- Don't add duplicates
        """)

        now = datetime.now(timezone.utc).isoformat()

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {"id": session_id, "user_id": user_id, "updated_at": now},
            )
            return result.rowcount > 0

    def remove_participant(self, session_id: str, user_id: str) -> bool:
        """Remove a participant from a session"""
        query = text("""
            UPDATE review_sessions
            SET participants = array_remove(participants, :user_id),
                updated_at = :updated_at
            WHERE id = :id
        """)

        now = datetime.now(timezone.utc).isoformat()

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {"id": session_id, "user_id": user_id, "updated_at": now},
            )
            return result.rowcount > 0

    def update_cursor_position(
        self,
        session_id: str,
        user_id: str,
        file_path: str,
        line: int,
    ) -> bool:
        """Update cursor position for a user in a session"""
        query = text("""
            UPDATE review_sessions
            SET cursor_positions = jsonb_set(
                COALESCE(cursor_positions, '{}'::jsonb),
                ARRAY[:user_id],
                jsonb_build_object('file', :file_path, 'line', :line)
            ),
            updated_at = :updated_at
            WHERE id = :id
        """)

        now = datetime.now(timezone.utc).isoformat()

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "id": session_id,
                    "user_id": user_id,
                    "file_path": file_path,
                    "line": line,
                    "updated_at": now,
                },
            )
            return result.rowcount > 0

    def complete_session(self, session_id: str, session_notes: str | None = None) -> bool:
        """Mark session as completed"""
        now = datetime.now(timezone.utc).isoformat()

        update_data = UpdateReviewSessionInput(
            status="completed",
            ended_at=now,
            session_notes=session_notes,
        )

        return self.update_session(session_id, update_data)

    def delete_session(self, session_id: str) -> bool:
        """Delete a session"""
        query = text("DELETE FROM review_sessions WHERE id = :id")

        with self._engine.begin() as conn:
            result = conn.execute(query, {"id": session_id})
            return result.rowcount > 0

    def get_session_stats(self, user_id: str | None = None) -> dict[str, Any]:
        """Get session statistics"""
        if user_id:
            query = text("""
                SELECT
                    COUNT(*) as total_sessions,
                    COUNT(*) FILTER (WHERE status = 'active') as active_sessions,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed_sessions,
                    COUNT(*) FILTER (WHERE initiator_id = :user_id) as initiated_sessions,
                    AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) FILTER (WHERE ended_at IS NOT NULL) / 60 as avg_duration_minutes
                FROM review_sessions
                WHERE :user_id = ANY(participants)
            """)
            params = {"user_id": user_id}
        else:
            query = text("""
                SELECT
                    COUNT(*) as total_sessions,
                    COUNT(*) FILTER (WHERE status = 'active') as active_sessions,
                    COUNT(*) FILTER (WHERE status = 'completed') as completed_sessions,
                    AVG(EXTRACT(EPOCH FROM (ended_at - started_at))) FILTER (WHERE ended_at IS NOT NULL) / 60 as avg_duration_minutes,
                    AVG(array_length(participants, 1)) as avg_participants
                FROM review_sessions
            """)
            params = {}

        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            row = result.mappings().first()
            return dict(row) if row else {}
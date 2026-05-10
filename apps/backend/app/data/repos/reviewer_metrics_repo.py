from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine


@dataclass
class CreateReviewerMetricsInput:
    """Input for creating reviewer metrics"""
    reviewer_id: str
    period_start: date
    period_end: date
    reviews_assigned: int = 0
    reviews_completed: int = 0
    reviews_declined: int = 0
    comments_created: int = 0
    change_requests_created: int = 0
    avg_review_time_minutes: int | None = None
    avg_comments_per_review: Decimal | None = None
    findings_identified: int = 0
    false_positives: int = 0
    approvals: int = 0
    warnings: int = 0
    blocks: int = 0
    overrides_received: int = 0
    reviews_within_sla: int = 0
    reviews_breached_sla: int = 0
    avg_response_time_minutes: int | None = None


@dataclass
class UpdateReviewerMetricsInput:
    """Input for updating reviewer metrics"""
    reviews_assigned: int | None = None
    reviews_completed: int | None = None
    reviews_declined: int | None = None
    comments_created: int | None = None
    change_requests_created: int | None = None
    avg_review_time_minutes: int | None = None
    avg_comments_per_review: Decimal | None = None
    findings_identified: int | None = None
    false_positives: int | None = None
    approvals: int | None = None
    warnings: int | None = None
    blocks: int | None = None
    overrides_received: int | None = None
    reviews_within_sla: int | None = None
    reviews_breached_sla: int | None = None
    avg_response_time_minutes: int | None = None


class ReviewerMetricsRepo:
    """Repository for reviewer metrics"""

    def __init__(self, engine: Engine | None = None):
        self._engine = engine or get_engine()

    def create_metrics(self, input_data: CreateReviewerMetricsInput) -> str:
        """Create new reviewer metrics record"""
        metrics_id = f"met_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        query = text("""
            INSERT INTO reviewer_metrics (
                id, reviewer_id, period_start, period_end,
                reviews_assigned, reviews_completed, reviews_declined,
                comments_created, change_requests_created,
                avg_review_time_minutes, avg_comments_per_review,
                findings_identified, false_positives,
                approvals, warnings, blocks, overrides_received,
                reviews_within_sla, reviews_breached_sla, avg_response_time_minutes,
                created_at, updated_at
            )
            VALUES (
                :id, :reviewer_id, :period_start, :period_end,
                :reviews_assigned, :reviews_completed, :reviews_declined,
                :comments_created, :change_requests_created,
                :avg_review_time_minutes, :avg_comments_per_review,
                :findings_identified, :false_positives,
                :approvals, :warnings, :blocks, :overrides_received,
                :reviews_within_sla, :reviews_breached_sla, :avg_response_time_minutes,
                :created_at, :updated_at
            )
            RETURNING id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "id": metrics_id,
                    "reviewer_id": input_data.reviewer_id,
                    "period_start": input_data.period_start,
                    "period_end": input_data.period_end,
                    "reviews_assigned": input_data.reviews_assigned,
                    "reviews_completed": input_data.reviews_completed,
                    "reviews_declined": input_data.reviews_declined,
                    "comments_created": input_data.comments_created,
                    "change_requests_created": input_data.change_requests_created,
                    "avg_review_time_minutes": input_data.avg_review_time_minutes,
                    "avg_comments_per_review": input_data.avg_comments_per_review,
                    "findings_identified": input_data.findings_identified,
                    "false_positives": input_data.false_positives,
                    "approvals": input_data.approvals,
                    "warnings": input_data.warnings,
                    "blocks": input_data.blocks,
                    "overrides_received": input_data.overrides_received,
                    "reviews_within_sla": input_data.reviews_within_sla,
                    "reviews_breached_sla": input_data.reviews_breached_sla,
                    "avg_response_time_minutes": input_data.avg_response_time_minutes,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            return result.scalar_one()

    def get_metrics_by_id(self, metrics_id: str) -> RowMapping | None:
        """Get metrics by ID"""
        query = text("""
            SELECT * FROM reviewer_metrics WHERE id = :id
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"id": metrics_id})
            row = result.mappings().first()
            return row

    def get_metrics_by_reviewer_and_period(
        self,
        reviewer_id: str,
        period_start: date,
        period_end: date,
    ) -> RowMapping | None:
        """Get metrics for a specific reviewer and period"""
        query = text("""
            SELECT * FROM reviewer_metrics
            WHERE reviewer_id = :reviewer_id
            AND period_start = :period_start
            AND period_end = :period_end
        """)

        with self._engine.connect() as conn:
            result = conn.execute(
                query,
                {
                    "reviewer_id": reviewer_id,
                    "period_start": period_start,
                    "period_end": period_end,
                },
            )
            row = result.mappings().first()
            return row

    def get_metrics_by_reviewer(
        self,
        reviewer_id: str,
        limit: int = 12,
        offset: int = 0,
    ) -> list[RowMapping]:
        """Get metrics history for a reviewer (ordered by period desc)"""
        query = text("""
            SELECT * FROM reviewer_metrics
            WHERE reviewer_id = :reviewer_id
            ORDER BY period_start DESC
            LIMIT :limit OFFSET :offset
        """)

        with self._engine.connect() as conn:
            result = conn.execute(
                query,
                {"reviewer_id": reviewer_id, "limit": limit, "offset": offset},
            )
            return list(result.mappings().all())

    def get_metrics_by_period(
        self,
        period_start: date,
        period_end: date,
    ) -> list[RowMapping]:
        """Get metrics for all reviewers in a period"""
        query = text("""
            SELECT * FROM reviewer_metrics
            WHERE period_start = :period_start AND period_end = :period_end
            ORDER BY reviews_completed DESC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(
                query,
                {"period_start": period_start, "period_end": period_end},
            )
            return list(result.mappings().all())

    def get_current_period_metrics(self, reviewer_id: str) -> RowMapping | None:
        """Get current month metrics for a reviewer"""
        query = text("""
            SELECT * FROM reviewer_metrics
            WHERE reviewer_id = :reviewer_id
            AND period_start <= CURRENT_DATE
            AND period_end >= CURRENT_DATE
            ORDER BY period_start DESC
            LIMIT 1
        """)

        with self._engine.connect() as conn:
            result = conn.execute(query, {"reviewer_id": reviewer_id})
            row = result.mappings().first()
            return row

    def update_metrics(
        self,
        reviewer_id: str,
        period_start: date,
        period_end: date,
        update_data: UpdateReviewerMetricsInput,
    ) -> bool:
        """Update metrics for a specific period"""
        now = datetime.now(timezone.utc).isoformat()
        updates = []
        params: dict[str, Any] = {
            "reviewer_id": reviewer_id,
            "period_start": period_start,
            "period_end": period_end,
            "updated_at": now,
        }

        if update_data.reviews_assigned is not None:
            updates.append("reviews_assigned = :reviews_assigned")
            params["reviews_assigned"] = update_data.reviews_assigned

        if update_data.reviews_completed is not None:
            updates.append("reviews_completed = :reviews_completed")
            params["reviews_completed"] = update_data.reviews_completed

        if update_data.reviews_declined is not None:
            updates.append("reviews_declined = :reviews_declined")
            params["reviews_declined"] = update_data.reviews_declined

        if update_data.comments_created is not None:
            updates.append("comments_created = :comments_created")
            params["comments_created"] = update_data.comments_created

        if update_data.change_requests_created is not None:
            updates.append("change_requests_created = :change_requests_created")
            params["change_requests_created"] = update_data.change_requests_created

        if update_data.avg_review_time_minutes is not None:
            updates.append("avg_review_time_minutes = :avg_review_time_minutes")
            params["avg_review_time_minutes"] = update_data.avg_review_time_minutes

        if update_data.avg_comments_per_review is not None:
            updates.append("avg_comments_per_review = :avg_comments_per_review")
            params["avg_comments_per_review"] = update_data.avg_comments_per_review

        if update_data.findings_identified is not None:
            updates.append("findings_identified = :findings_identified")
            params["findings_identified"] = update_data.findings_identified

        if update_data.false_positives is not None:
            updates.append("false_positives = :false_positives")
            params["false_positives"] = update_data.false_positives

        if update_data.approvals is not None:
            updates.append("approvals = :approvals")
            params["approvals"] = update_data.approvals

        if update_data.warnings is not None:
            updates.append("warnings = :warnings")
            params["warnings"] = update_data.warnings

        if update_data.blocks is not None:
            updates.append("blocks = :blocks")
            params["blocks"] = update_data.blocks

        if update_data.overrides_received is not None:
            updates.append("overrides_received = :overrides_received")
            params["overrides_received"] = update_data.overrides_received

        if update_data.reviews_within_sla is not None:
            updates.append("reviews_within_sla = :reviews_within_sla")
            params["reviews_within_sla"] = update_data.reviews_within_sla

        if update_data.reviews_breached_sla is not None:
            updates.append("reviews_breached_sla = :reviews_breached_sla")
            params["reviews_breached_sla"] = update_data.reviews_breached_sla

        if update_data.avg_response_time_minutes is not None:
            updates.append("avg_response_time_minutes = :avg_response_time_minutes")
            params["avg_response_time_minutes"] = update_data.avg_response_time_minutes

        if not updates:
            return False

        updates.append("updated_at = :updated_at")
        query = text(f"""
            UPDATE reviewer_metrics
            SET {", ".join(updates)}
            WHERE reviewer_id = :reviewer_id
            AND period_start = :period_start
            AND period_end = :period_end
        """)

        with self._engine.begin() as conn:
            result = conn.execute(query, params)
            return result.rowcount > 0

    def upsert_metrics_obj(self, metrics_obj) -> str:
        """
        Insert or update metrics using PostgreSQL UPSERT.
        Compatible with the ReviewerMetricsCalculator service.
        """
        metrics_id = f"met_{uuid.uuid4().hex[:16]}"
        now = datetime.now(timezone.utc).isoformat()

        query = text("""
            INSERT INTO reviewer_metrics (
                id, reviewer_id, period_start, period_end,
                reviews_assigned, reviews_completed, reviews_declined,
                comments_created, change_requests_created,
                avg_review_time_minutes, avg_comments_per_review,
                findings_identified, false_positives,
                approvals, warnings, blocks, overrides_received,
                reviews_within_sla, reviews_breached_sla, avg_response_time_minutes,
                created_at, updated_at
            )
            VALUES (
                :id, :reviewer_id, :period_start, :period_end,
                :reviews_assigned, :reviews_completed, :reviews_declined,
                :comments_created, :change_requests_created,
                :avg_review_time_minutes, :avg_comments_per_review,
                :findings_identified, :false_positives,
                :approvals, :warnings, :blocks, :overrides_received,
                :reviews_within_sla, :reviews_breached_sla, :avg_response_time_minutes,
                :created_at, :updated_at
            )
            ON CONFLICT (reviewer_id, period_start, period_end) DO UPDATE SET
                reviews_assigned = EXCLUDED.reviews_assigned,
                reviews_completed = EXCLUDED.reviews_completed,
                reviews_declined = EXCLUDED.reviews_declined,
                comments_created = EXCLUDED.comments_created,
                change_requests_created = EXCLUDED.change_requests_created,
                avg_review_time_minutes = EXCLUDED.avg_review_time_minutes,
                avg_comments_per_review = EXCLUDED.avg_comments_per_review,
                findings_identified = EXCLUDED.findings_identified,
                false_positives = EXCLUDED.false_positives,
                approvals = EXCLUDED.approvals,
                warnings = EXCLUDED.warnings,
                blocks = EXCLUDED.blocks,
                overrides_received = EXCLUDED.overrides_received,
                reviews_within_sla = EXCLUDED.reviews_within_sla,
                reviews_breached_sla = EXCLUDED.reviews_breached_sla,
                avg_response_time_minutes = EXCLUDED.avg_response_time_minutes,
                updated_at = :updated_at
            RETURNING id
        """)

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "id": metrics_id,
                    "reviewer_id": metrics_obj.reviewer_id,
                    "period_start": metrics_obj.period_start,
                    "period_end": metrics_obj.period_end,
                    "reviews_assigned": getattr(metrics_obj, 'reviews_assigned', 0),
                    "reviews_completed": getattr(metrics_obj, 'reviews_completed', 0),
                    "reviews_declined": getattr(metrics_obj, 'reviews_declined', 0),
                    "comments_created": getattr(metrics_obj, 'comments_created', 0),
                    "change_requests_created": getattr(metrics_obj, 'change_requests_created', 0),
                    "avg_review_time_minutes": getattr(metrics_obj, 'avg_review_time_minutes', None),
                    "avg_comments_per_review": getattr(metrics_obj, 'avg_comments_per_review', None),
                    "findings_identified": getattr(metrics_obj, 'findings_identified', 0),
                    "false_positives": getattr(metrics_obj, 'false_positives', 0),
                    "approvals": getattr(metrics_obj, 'approvals', 0),
                    "warnings": getattr(metrics_obj, 'warnings', 0),
                    "blocks": getattr(metrics_obj, 'blocks', 0),
                    "overrides_received": getattr(metrics_obj, 'overrides_received', 0),
                    "reviews_within_sla": getattr(metrics_obj, 'reviews_within_sla', 0),
                    "reviews_breached_sla": getattr(metrics_obj, 'reviews_breached_sla', 0),
                    "avg_response_time_minutes": getattr(metrics_obj, 'avg_response_time_minutes', None),
                    "created_at": now,
                    "updated_at": now,
                },
            )
            return result.scalar_one()

    def upsert_metrics(
        self,
        reviewer_id: str,
        period_start: date,
        period_end: date,
        metrics_data: CreateReviewerMetricsInput,
    ) -> str:
        """Insert or update metrics (for daily/weekly recalculations)"""
        existing = self.get_metrics_by_reviewer_and_period(reviewer_id, period_start, period_end)

        if existing:
            # Update existing
            update_data = UpdateReviewerMetricsInput(
                reviews_assigned=metrics_data.reviews_assigned,
                reviews_completed=metrics_data.reviews_completed,
                reviews_declined=metrics_data.reviews_declined,
                comments_created=metrics_data.comments_created,
                change_requests_created=metrics_data.change_requests_created,
                avg_review_time_minutes=metrics_data.avg_review_time_minutes,
                avg_comments_per_review=metrics_data.avg_comments_per_review,
                findings_identified=metrics_data.findings_identified,
                false_positives=metrics_data.false_positives,
                approvals=metrics_data.approvals,
                warnings=metrics_data.warnings,
                blocks=metrics_data.blocks,
                overrides_received=metrics_data.overrides_received,
                reviews_within_sla=metrics_data.reviews_within_sla,
                reviews_breached_sla=metrics_data.reviews_breached_sla,
                avg_response_time_minutes=metrics_data.avg_response_time_minutes,
            )
            self.update_metrics(reviewer_id, period_start, period_end, update_data)
            return existing["id"]
        else:
            # Create new
            return self.create_metrics(metrics_data)

    def get_metrics_for_period(
        self,
        reviewer_id: str,
        period_start: date,
        period_end: date,
    ) -> list[RowMapping]:
        """Get metrics for a reviewer within a date range"""
        query = text("""
            SELECT * FROM reviewer_metrics
            WHERE reviewer_id = :reviewer_id
            AND period_start >= :period_start
            AND period_end <= :period_end
            ORDER BY period_start ASC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(
                query,
                {
                    "reviewer_id": reviewer_id,
                    "period_start": period_start,
                    "period_end": period_end,
                },
            )
            return list(result.mappings().all())

    def get_metrics_range(
        self,
        reviewer_id: str,
        start_date: date,
        end_date: date,
    ) -> list[RowMapping]:
        """Get all metrics for a reviewer in a date range"""
        query = text("""
            SELECT * FROM reviewer_metrics
            WHERE reviewer_id = :reviewer_id
            AND period_start >= :start_date
            AND period_end <= :end_date
            ORDER BY period_start ASC
        """)

        with self._engine.connect() as conn:
            result = conn.execute(
                query,
                {
                    "reviewer_id": reviewer_id,
                    "start_date": start_date,
                    "end_date": end_date,
                },
            )
            return list(result.mappings().all())

    def get_leaderboard(
        self,
        period_start: date,
        period_end: date,
        metric: str = "reviews_completed",
        limit: int = 10,
    ) -> list[RowMapping]:
        """Get reviewer leaderboard for a metric"""
        # Validate metric to prevent SQL injection
        valid_metrics = [
            "reviews_completed", "avg_review_time_minutes", "avg_comments_per_review",
            "findings_identified", "approvals", "reviews_within_sla"
        ]
        if metric not in valid_metrics:
            raise ValueError(f"Invalid metric: {metric}")

        desc_metrics = ["reviews_completed", "findings_identified", "approvals", "reviews_within_sla"]
        order = "DESC" if metric in desc_metrics else "ASC"

        query = text(f"""
            SELECT rm.*, u.display_name, u.email
            FROM reviewer_metrics rm
            JOIN users u ON rm.reviewer_id = u.id
            WHERE rm.period_start = :period_start AND rm.period_end = :period_end
            AND rm.{metric} IS NOT NULL
            ORDER BY rm.{metric} {order}
            LIMIT :limit
        """)

        with self._engine.connect() as conn:
            result = conn.execute(
                query,
                {
                    "period_start": period_start,
                    "period_end": period_end,
                    "limit": limit,
                },
            )
            return list(result.mappings().all())

    def get_team_summary(
        self,
        period_start: date,
        period_end: date,
    ) -> dict[str, Any]:
        """Get team-wide summary metrics for a period"""
        query = text("""
            SELECT
                COUNT(DISTINCT reviewer_id) as reviewer_count,
                COALESCE(SUM(reviews_assigned), 0) as total_assigned,
                COALESCE(SUM(reviews_completed), 0) as total_completed,
                COALESCE(SUM(reviews_declined), 0) as total_declined,
                COALESCE(SUM(comments_created), 0) as total_comments,
                COALESCE(SUM(change_requests_created), 0) as total_change_requests,
                COALESCE(AVG(avg_review_time_minutes), 0) as avg_team_review_time,
                COALESCE(AVG(avg_response_time_minutes), 0) as avg_team_response_time,
                COALESCE(SUM(findings_identified), 0) as total_findings,
                COALESCE(SUM(approvals), 0) as total_approvals,
                COALESCE(SUM(warnings), 0) as total_warnings,
                COALESCE(SUM(blocks), 0) as total_blocks,
                COALESCE(SUM(reviews_within_sla)::float / NULLIF(SUM(reviews_within_sla + reviews_breached_sla), 0), 0) as team_sla_rate
            FROM reviewer_metrics
            WHERE period_start >= :period_start AND period_end <= :period_end
        """)

        with self._engine.connect() as conn:
            result = conn.execute(
                query,
                {"period_start": period_start, "period_end": period_end},
            )
            row = result.mappings().first()
            return dict(row) if row else {}

    def delete_metrics(self, reviewer_id: str, period_start: date, period_end: date) -> bool:
        """Delete metrics for a specific period"""
        query = text("""
            DELETE FROM reviewer_metrics
            WHERE reviewer_id = :reviewer_id
            AND period_start = :period_start
            AND period_end = :period_end
        """)

        with self._engine.begin() as conn:
            result = conn.execute(
                query,
                {
                    "reviewer_id": reviewer_id,
                    "period_start": period_start,
                    "period_end": period_end,
                },
            )
            return result.rowcount > 0
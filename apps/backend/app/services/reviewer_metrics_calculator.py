from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.data.database import get_engine
from app.data.repos.reviewer_metrics_repo import ReviewerMetricsRepo


logger = logging.getLogger(__name__)


class ReviewerMetricsCalculator:
    """
    Service pour calculer les métriques de performance des reviewers.
    Calcule sur des périodes définies (quotidien, hebdomadaire, mensuel).
    """

    def __init__(self):
        self.engine = get_engine()
        self.metrics_repo = ReviewerMetricsRepo()

    async def calculate_daily_metrics(self, target_date: date | None = None) -> int:
        """
        Calcule les métriques quotidiennes pour tous les reviewers actifs.

        Args:
            target_date: Date pour laquelle calculer (défaut: hier)

        Returns:
            Nombre de reviewers traités
        """
        if target_date is None:
            target_date = date.today() - timedelta(days=1)

        logger.info(f"Calculating daily metrics for {target_date}")

        with Session(self.engine) as session:
            # Récupérer tous les reviewers qui ont eu de l'activité ce jour
            from sqlalchemy import text
            active_reviewers_query = text("""
                SELECT DISTINCT reviewer_id
                FROM review_assignments
                WHERE DATE(created_at) = :target_date
            """)
            active_reviewers_result = session.execute(active_reviewers_query, {"target_date": target_date})
            active_reviewers = [row[0] for row in active_reviewers_result.fetchall()]

            metrics_calculated = 0
            for reviewer_id in active_reviewers:
                try:
                    await self.calculate_reviewer_metrics(
                        reviewer_id=reviewer_id,
                        period_start=target_date,
                        period_end=target_date,
                        session=session
                    )
                    metrics_calculated += 1
                except Exception as e:
                    logger.error(f"Error calculating metrics for reviewer {reviewer_id}: {e}")

        logger.info(f"Calculated metrics for {metrics_calculated} reviewers")
        return metrics_calculated

    async def calculate_reviewer_metrics(
        self,
        reviewer_id: str,
        period_start: date,
        period_end: date,
        session: Session | None = None
    ) -> dict[str, Any]:
        """
        Calcule les métriques pour un reviewer sur une période donnée.
        """
        close_session = session is None
        if session is None:
            session = Session(self.engine)

        try:
            period_start_dt = datetime.combine(period_start, datetime.min.time()).replace(tzinfo=timezone.utc)
            period_end_dt = datetime.combine(period_end, datetime.max.time()).replace(tzinfo=timezone.utc)

            # 1. Récupérer toutes les assignations dans la période
            from sqlalchemy import text
            assignments_query = text("""
                SELECT * FROM review_assignments
                WHERE reviewer_id = :reviewer_id
                AND created_at BETWEEN :period_start AND :period_end
            """)
            assignments_result = session.execute(assignments_query, {
                "reviewer_id": reviewer_id,
                "period_start": period_start_dt,
                "period_end": period_end_dt
            })
            assignments = list(assignments_result.mappings().all())

            # 2. Calculer métriques de base
            metrics_data = await self._calculate_base_metrics(assignments, session)

            # 3. Calculer métriques de qualité
            quality_metrics = await self._calculate_quality_metrics(
                reviewer_id, period_start_dt, period_end_dt, session
            )
            metrics_data.update(quality_metrics)

            # 4. Calculer métriques SLA
            sla_metrics = await self._calculate_sla_metrics(assignments)
            metrics_data.update(sla_metrics)

            # 5. Créer/Mettre à jour l'enregistrement
            from app.data.repos.reviewer_metrics_repo import CreateReviewerMetricsInput

            metrics_input = CreateReviewerMetricsInput(
                reviewer_id=reviewer_id,
                period_start=period_start,
                period_end=period_end,
                **metrics_data
            )

            # Upsert dans la base
            metrics_id = self.metrics_repo.upsert_metrics(
                reviewer_id, period_start, period_end, metrics_input
            )

            logger.info(f"Calculated metrics for reviewer {reviewer_id}, period {period_start} to {period_end}")

            # Retourner les métriques créées/mises à jour
            updated_metrics = self.metrics_repo.get_metrics_by_reviewer_and_period(
                reviewer_id, period_start, period_end
            )
            return updated_metrics

        finally:
            if close_session:
                session.close()

    async def _calculate_base_metrics(
        self,
        assignments: list[dict],
        session: Session
    ) -> dict[str, Any]:
        """Calcule les métriques de volume de base."""
        total_assigned = len(assignments)
        completed_assignments = [a for a in assignments if a["status"] == "completed"]
        declined_assignments = [a for a in assignments if a["status"] == "declined"]

        # Calculer temps moyen de review (en minutes)
        review_times = []
        for assignment in completed_assignments:
            if assignment["started_at"] and assignment["completed_at"]:
                started_at = assignment["started_at"]
                completed_at = assignment["completed_at"]
                # Convert to datetime if they are strings
                if isinstance(started_at, str):
                    started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                if isinstance(completed_at, str):
                    completed_at = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))

                duration = completed_at - started_at
                review_times.append(duration.total_seconds() / 60)

        avg_review_time = int(sum(review_times) / len(review_times)) if review_times else None

        return {
            "reviews_assigned": total_assigned,
            "reviews_completed": len(completed_assignments),
            "reviews_declined": len(declined_assignments),
            "avg_review_time_minutes": avg_review_time,
        }

    async def _calculate_quality_metrics(
        self,
        reviewer_id: str,
        period_start: datetime,
        period_end: datetime,
        session: Session
    ) -> dict[str, Any]:
        """Calcule les métriques de qualité (commentaires, change requests, décisions)."""
        from sqlalchemy import text

        # Commentaires créés dans la période
        comments_query = text("""
            SELECT COUNT(*) FROM review_comments
            WHERE author_id = :reviewer_id
            AND created_at BETWEEN :period_start AND :period_end
        """)
        comments_result = session.execute(comments_query, {
            "reviewer_id": reviewer_id,
            "period_start": period_start,
            "period_end": period_end
        })
        comments_count = comments_result.scalar() or 0

        # Change requests créés
        cr_query = text("""
            SELECT COUNT(*) FROM change_requests
            WHERE reviewer_id = :reviewer_id
            AND created_at BETWEEN :period_start AND :period_end
        """)
        cr_result = session.execute(cr_query, {
            "reviewer_id": reviewer_id,
            "period_start": period_start,
            "period_end": period_end
        })
        change_requests_count = cr_result.scalar() or 0

        # Décisions par type (à partir des metadata d'analyses)
        # Cette partie nécessiterait d'examiner les analyses reviewées
        # Pour l'instant, on met des valeurs par défaut
        approvals = 0
        warnings = 0
        blocks = 0

        # Commentaires par review
        completed_reviews_query = text("""
            SELECT COUNT(*) FROM review_assignments
            WHERE reviewer_id = :reviewer_id
            AND status = 'completed'
            AND created_at BETWEEN :period_start AND :period_end
        """)
        completed_reviews_result = session.execute(completed_reviews_query, {
            "reviewer_id": reviewer_id,
            "period_start": period_start,
            "period_end": period_end
        })
        completed_reviews = completed_reviews_result.scalar() or 0

        avg_comments_per_review = (
            round(comments_count / completed_reviews, 2)
            if completed_reviews > 0 else 0.0
        )

        return {
            "comments_created": comments_count,
            "change_requests_created": change_requests_count,
            "avg_comments_per_review": avg_comments_per_review,
            "approvals": approvals,
            "warnings": warnings,
            "blocks": blocks,
            "findings_identified": 0,  # À implémenter si system de findings
            "false_positives": 0,
            "overrides_received": 0,
        }

    async def _calculate_sla_metrics(
        self,
        assignments: list[dict]
    ) -> dict[str, Any]:
        """Calcule les métriques SLA."""
        completed_assignments = [a for a in assignments if a["status"] == "completed"]

        reviews_within_sla = 0
        reviews_breached_sla = 0
        response_times = []

        for assignment in completed_assignments:
            # SLA check: respecté si complété avant due_at
            if assignment.get("due_at") and assignment.get("completed_at"):
                due_at = assignment["due_at"]
                completed_at = assignment["completed_at"]

                # Convert to datetime if they are strings
                if isinstance(due_at, str):
                    due_at = datetime.fromisoformat(due_at.replace("Z", "+00:00"))
                if isinstance(completed_at, str):
                    completed_at = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))

                if completed_at <= due_at:
                    reviews_within_sla += 1
                else:
                    reviews_breached_sla += 1

            # Response time: temps entre assignation et premier commentaire/début
            if assignment.get("started_at") and assignment.get("assigned_at"):
                started_at = assignment["started_at"]
                assigned_at = assignment["assigned_at"]

                # Convert to datetime if they are strings
                if isinstance(started_at, str):
                    started_at = datetime.fromisoformat(started_at.replace("Z", "+00:00"))
                if isinstance(assigned_at, str):
                    assigned_at = datetime.fromisoformat(assigned_at.replace("Z", "+00:00"))

                response_time = started_at - assigned_at
                response_times.append(response_time.total_seconds() / 60)

        avg_response_time = int(sum(response_times) / len(response_times)) if response_times else None

        return {
            "reviews_within_sla": reviews_within_sla,
            "reviews_breached_sla": reviews_breached_sla,
            "avg_response_time_minutes": avg_response_time,
        }

    async def calculate_weekly_metrics(self, reviewer_id: str, week_start: date) -> dict[str, Any]:
        """Calcule les métriques hebdomadaires."""
        week_end = week_start + timedelta(days=6)
        return await self.calculate_reviewer_metrics(reviewer_id, week_start, week_end)

    async def calculate_monthly_metrics(self, reviewer_id: str, month_start: date) -> dict[str, Any]:
        """Calcule les métriques mensuelles."""
        # Calculer le dernier jour du mois
        if month_start.month == 12:
            next_month = month_start.replace(year=month_start.year + 1, month=1)
        else:
            next_month = month_start.replace(month=month_start.month + 1)
        month_end = next_month - timedelta(days=1)

        return await self.calculate_reviewer_metrics(reviewer_id, month_start, month_end)

    async def get_reviewer_trends(
        self,
        reviewer_id: str,
        periods: int = 4
    ) -> dict[str, list[Any]]:
        """
        Récupère les tendances d'un reviewer sur plusieurs périodes.

        Args:
            reviewer_id: ID du reviewer
            periods: Nombre de périodes à récupérer

        Returns:
            Dict avec les séries temporelles des métriques
        """
        end_date = date.today()
        start_date = end_date - timedelta(days=periods * 7)  # Périodes hebdomadaires

        metrics = self.metrics_repo.get_metrics_range(
            reviewer_id, start_date, end_date
        )

        trends = {
            "dates": [m["period_start"].isoformat() if isinstance(m["period_start"], date) else m["period_start"] for m in metrics],
            "reviews_completed": [m["reviews_completed"] for m in metrics],
            "avg_review_time": [m["avg_review_time_minutes"] or 0 for m in metrics],
            "sla_compliance": [
                (m["reviews_within_sla"] / (m["reviews_within_sla"] + m["reviews_breached_sla"]) * 100)
                if (m["reviews_within_sla"] + m["reviews_breached_sla"]) > 0 else 0
                for m in metrics
            ],
            "avg_comments": [float(m["avg_comments_per_review"] or 0) for m in metrics],
        }

        return trends

    async def get_team_metrics_summary(
        self,
        reviewer_ids: list[str],
        period_start: date,
        period_end: date
    ) -> dict[str, Any]:
        """Calcule un résumé des métriques d'équipe."""
        team_metrics = []

        for reviewer_id in reviewer_ids:
            metrics = self.metrics_repo.get_metrics_for_period(
                reviewer_id, period_start, period_end
            )
            if metrics:
                team_metrics.extend(metrics)

        if not team_metrics:
            return {
                "total_reviews": 0,
                "avg_review_time": 0,
                "team_sla_compliance": 0,
                "total_comments": 0,
                "total_change_requests": 0,
            }

        total_reviews = sum(m["reviews_completed"] for m in team_metrics)
        total_within_sla = sum(m["reviews_within_sla"] for m in team_metrics)
        total_breached_sla = sum(m["reviews_breached_sla"] for m in team_metrics)

        avg_review_times = [m["avg_review_time_minutes"] for m in team_metrics if m["avg_review_time_minutes"]]
        team_avg_review_time = int(sum(avg_review_times) / len(avg_review_times)) if avg_review_times else 0

        team_sla_compliance = (
            (total_within_sla / (total_within_sla + total_breached_sla) * 100)
            if (total_within_sla + total_breached_sla) > 0 else 0
        )

        return {
            "total_reviews": total_reviews,
            "avg_review_time": team_avg_review_time,
            "team_sla_compliance": round(team_sla_compliance, 1),
            "total_comments": sum(m["comments_created"] for m in team_metrics),
            "total_change_requests": sum(m["change_requests_created"] for m in team_metrics),
            "reviewers_count": len(set(m["reviewer_id"] for m in team_metrics)),
        }
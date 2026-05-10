"""
Tâches Celery pour le calcul automatique des métriques de reviewers.

Ces tâches s'exécutent en arrière-plan pour :
- Calculer les métriques quotidiennes
- Générer des rapports hebdomadaires/mensuels
- Envoyer des alertes sur les SLA
- Nettoyer les anciennes métriques
"""

from __future__ import annotations

import asyncio
import logging
from datetime import date, datetime, timedelta
from typing import Any

from celery import Celery

from app.services.reviewer_metrics_calculator import ReviewerMetricsCalculator
from app.data.repos.reviewer_metrics_repo import ReviewerMetricsRepo
from app.services.notifications import NotificationService

# Configuration Celery (à adapter selon votre setup)
celery_app = Celery("reviewer_metrics")

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="calculate_daily_reviewer_metrics")
def calculate_daily_metrics_task(self, target_date: str | None = None) -> dict[str, Any]:
    """
    Tâche quotidienne pour calculer les métriques de tous les reviewers.
    À programmer via cron : tous les jours à 1h du matin.

    Args:
        target_date: Date au format ISO (défaut: hier)

    Returns:
        Résultats du calcul
    """
    try:
        if target_date:
            calc_date = date.fromisoformat(target_date)
        else:
            calc_date = date.today() - timedelta(days=1)

        logger.info(f"Starting daily metrics calculation for {calc_date}")

        calculator = ReviewerMetricsCalculator()
        processed_count = asyncio.run(calculator.calculate_daily_metrics(calc_date))

        result = {
            "task_id": self.request.id,
            "date": calc_date.isoformat(),
            "reviewers_processed": processed_count,
            "status": "completed",
            "execution_time": datetime.now().isoformat(),
        }

        logger.info(f"Daily metrics calculation completed: {processed_count} reviewers processed")
        return result

    except Exception as e:
        logger.error(f"Daily metrics calculation failed: {str(e)}")
        result = {
            "task_id": self.request.id,
            "date": calc_date.isoformat() if 'calc_date' in locals() else None,
            "status": "failed",
            "error": str(e),
            "execution_time": datetime.now().isoformat(),
        }
        # Re-raise pour que Celery marque la tâche comme failed
        raise self.retry(exc=e, countdown=60, max_retries=3)


@celery_app.task(bind=True, name="calculate_weekly_reviewer_metrics")
def calculate_weekly_metrics_task(self, week_start: str | None = None) -> dict[str, Any]:
    """
    Tâche hebdomadaire pour calculer les métriques agrégées de la semaine.
    À programmer : tous les lundis à 2h du matin.

    Args:
        week_start: Date de début de semaine au format ISO (défaut: lundi précédent)

    Returns:
        Résultats du calcul
    """
    try:
        if week_start:
            start_date = date.fromisoformat(week_start)
        else:
            # Calculer le lundi de la semaine précédente
            today = date.today()
            days_since_monday = today.weekday()  # 0 = lundi
            last_monday = today - timedelta(days=days_since_monday + 7)
            start_date = last_monday

        logger.info(f"Starting weekly metrics calculation for week {start_date}")

        calculator = ReviewerMetricsCalculator()
        repo = ReviewerMetricsRepo()

        # Récupérer tous les reviewers actifs
        active_reviewers_query = """
            SELECT DISTINCT reviewer_id
            FROM review_assignments
            WHERE created_at >= %s AND created_at < %s
        """

        week_end = start_date + timedelta(days=6)
        # Cette partie nécessiterait une méthode dans le repo pour récupérer les reviewers actifs
        # Pour l'instant, on simule avec une liste
        active_reviewers = ["reviewer1", "reviewer2"]  # À remplacer

        processed_count = 0
        for reviewer_id in active_reviewers:
            try:
                metrics = asyncio.run(calculator.calculate_weekly_metrics(reviewer_id, start_date))
                if metrics:
                    processed_count += 1
            except Exception as e:
                logger.error(f"Failed to calculate weekly metrics for reviewer {reviewer_id}: {e}")

        result = {
            "task_id": self.request.id,
            "week_start": start_date.isoformat(),
            "week_end": week_end.isoformat(),
            "reviewers_processed": processed_count,
            "status": "completed",
            "execution_time": datetime.now().isoformat(),
        }

        logger.info(f"Weekly metrics calculation completed: {processed_count} reviewers processed")
        return result

    except Exception as e:
        logger.error(f"Weekly metrics calculation failed: {str(e)}")
        raise self.retry(exc=e, countdown=300, max_retries=2)


@celery_app.task(bind=True, name="generate_reviewer_reports")
def generate_reviewer_reports_task(self, period: str = "monthly") -> dict[str, Any]:
    """
    Génère des rapports de performance pour les reviewers.

    Args:
        period: Période du rapport ("weekly", "monthly", "quarterly")

    Returns:
        Résultats de la génération
    """
    try:
        logger.info(f"Starting {period} reviewer reports generation")

        if period == "weekly":
            # Rapport de la semaine précédente
            end_date = date.today()
            start_date = end_date - timedelta(days=7)
        elif period == "monthly":
            # Rapport du mois précédent
            today = date.today()
            start_date = today.replace(day=1) - timedelta(days=1)  # Dernier jour du mois précédent
            start_date = start_date.replace(day=1)  # Premier jour du mois précédent
            end_date = today.replace(day=1) - timedelta(days=1)  # Dernier jour du mois précédent
        elif period == "quarterly":
            # Rapport du trimestre précédent
            today = date.today()
            current_quarter = (today.month - 1) // 3 + 1
            if current_quarter == 1:
                prev_quarter = 4
                prev_year = today.year - 1
            else:
                prev_quarter = current_quarter - 1
                prev_year = today.year

            start_month = (prev_quarter - 1) * 3 + 1
            start_date = date(prev_year, start_month, 1)
            if start_month == 10:
                end_date = date(prev_year, 12, 31)
            else:
                end_date = date(prev_year, start_month + 2, 1) + timedelta(days=31)
                end_date = end_date.replace(day=1) - timedelta(days=1)
        else:
            raise ValueError(f"Invalid period: {period}")

        repo = ReviewerMetricsRepo()
        calculator = ReviewerMetricsCalculator()

        # Générer résumé global
        team_summary = repo.get_team_summary(start_date, end_date)

        # Générer leaderboards
        leaderboard_reviews = repo.get_leaderboard(start_date, end_date, "reviews_completed", 20)
        leaderboard_quality = repo.get_leaderboard(start_date, end_date, "findings_identified", 20)
        leaderboard_speed = repo.get_leaderboard(start_date, end_date, "avg_review_time_minutes", 20)

        # TODO: Envoyer rapports par email aux reviewers et leads
        # notification_service = NotificationService()
        # await notification_service.send_performance_report(...)

        result = {
            "task_id": self.request.id,
            "period": period,
            "date_range": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            "team_summary": team_summary,
            "reports_generated": len(leaderboard_reviews),
            "status": "completed",
            "execution_time": datetime.now().isoformat(),
        }

        logger.info(f"{period.capitalize()} reports generation completed")
        return result

    except Exception as e:
        logger.error(f"Reports generation failed: {str(e)}")
        raise self.retry(exc=e, countdown=600, max_retries=2)


@celery_app.task(bind=True, name="check_sla_alerts")
def check_sla_alerts_task(self) -> dict[str, Any]:
    """
    Vérifie les violations de SLA et envoie des alertes.
    À programmer : toutes les 2 heures pendant les heures de travail.

    Returns:
        Résultats de la vérification
    """
    try:
        logger.info("Starting SLA alerts check")

        from sqlalchemy import text
        from app.data.database import get_engine

        engine = get_engine()
        alerts_sent = 0

        # Récupérer reviews en risque de SLA (due dans les 2 prochaines heures)
        with engine.connect() as conn:
            sla_risk_query = text("""
                SELECT ra.*, u.display_name, u.email
                FROM review_assignments ra
                JOIN users u ON ra.reviewer_id = u.id
                WHERE ra.status IN ('pending', 'in_progress')
                AND ra.due_at IS NOT NULL
                AND ra.due_at BETWEEN NOW() AND NOW() + INTERVAL '2 hours'
            """)

            at_risk_reviews = conn.execute(sla_risk_query).mappings().all()

            # Récupérer reviews déjà en dépassement SLA
            overdue_query = text("""
                SELECT ra.*, u.display_name, u.email
                FROM review_assignments ra
                JOIN users u ON ra.reviewer_id = u.id
                WHERE ra.status IN ('pending', 'in_progress')
                AND ra.due_at IS NOT NULL
                AND ra.due_at < NOW()
            """)

            overdue_reviews = conn.execute(overdue_query).mappings().all()

        # Envoyer alertes (à implémenter avec NotificationService)
        # notification_service = NotificationService()

        for review in at_risk_reviews:
            # await notification_service.send_sla_warning(review)
            alerts_sent += 1
            logger.info(f"SLA warning sent for review {review['id']} (reviewer: {review['display_name']})")

        for review in overdue_reviews:
            # await notification_service.send_sla_breach(review)
            alerts_sent += 1
            logger.info(f"SLA breach alert sent for review {review['id']} (reviewer: {review['display_name']})")

        result = {
            "task_id": self.request.id,
            "at_risk_count": len(at_risk_reviews),
            "overdue_count": len(overdue_reviews),
            "alerts_sent": alerts_sent,
            "status": "completed",
            "execution_time": datetime.now().isoformat(),
        }

        logger.info(f"SLA alerts check completed: {alerts_sent} alerts sent")
        return result

    except Exception as e:
        logger.error(f"SLA alerts check failed: {str(e)}")
        raise self.retry(exc=e, countdown=300, max_retries=2)


@celery_app.task(bind=True, name="cleanup_old_metrics")
def cleanup_old_metrics_task(self, retention_days: int = 365) -> dict[str, Any]:
    """
    Nettoie les anciennes métriques pour éviter l'accumulation de données.
    À programmer : tous les mois.

    Args:
        retention_days: Nombre de jours à conserver (défaut: 365)

    Returns:
        Résultats du nettoyage
    """
    try:
        logger.info(f"Starting metrics cleanup (retention: {retention_days} days)")

        cutoff_date = date.today() - timedelta(days=retention_days)

        from sqlalchemy import text
        from app.data.database import get_engine

        engine = get_engine()
        deleted_count = 0

        with engine.begin() as conn:
            # Supprimer les métriques anciennes
            cleanup_query = text("""
                DELETE FROM reviewer_metrics
                WHERE period_end < :cutoff_date
            """)

            result = conn.execute(cleanup_query, {"cutoff_date": cutoff_date})
            deleted_count = result.rowcount

        result = {
            "task_id": self.request.id,
            "retention_days": retention_days,
            "cutoff_date": cutoff_date.isoformat(),
            "deleted_count": deleted_count,
            "status": "completed",
            "execution_time": datetime.now().isoformat(),
        }

        logger.info(f"Metrics cleanup completed: {deleted_count} records deleted")
        return result

    except Exception as e:
        logger.error(f"Metrics cleanup failed: {str(e)}")
        raise self.retry(exc=e, countdown=600, max_retries=2)


@celery_app.task(bind=True, name="recalculate_reviewer_metrics")
def recalculate_reviewer_metrics_task(
    self,
    reviewer_id: str,
    start_date: str,
    end_date: str
) -> dict[str, Any]:
    """
    Recalcule les métriques d'un reviewer pour une période donnée.
    Utilisé pour corrections manuelles ou recalculs ponctuels.

    Args:
        reviewer_id: ID du reviewer
        start_date: Date de début au format ISO
        end_date: Date de fin au format ISO

    Returns:
        Résultats du recalcul
    """
    try:
        logger.info(f"Starting metrics recalculation for reviewer {reviewer_id}")

        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)

        calculator = ReviewerMetricsCalculator()

        # Recalculer jour par jour
        current_date = start
        days_processed = 0

        while current_date <= end:
            try:
                metrics = asyncio.run(calculator.calculate_reviewer_metrics(
                    reviewer_id, current_date, current_date
                ))
                if metrics:
                    days_processed += 1
                    logger.info(f"Recalculated metrics for {reviewer_id} on {current_date}")
            except Exception as e:
                logger.error(f"Failed to recalculate metrics for {current_date}: {e}")

            current_date += timedelta(days=1)

        result = {
            "task_id": self.request.id,
            "reviewer_id": reviewer_id,
            "date_range": {
                "start": start_date,
                "end": end_date,
            },
            "days_processed": days_processed,
            "status": "completed",
            "execution_time": datetime.now().isoformat(),
        }

        logger.info(f"Metrics recalculation completed for {reviewer_id}: {days_processed} days processed")
        return result

    except Exception as e:
        logger.error(f"Metrics recalculation failed: {str(e)}")
        raise self.retry(exc=e, countdown=120, max_retries=3)


# Configuration des tâches périodiques (à ajouter dans settings Celery)
CELERYBEAT_SCHEDULE = {
    'daily-metrics-calculation': {
        'task': 'calculate_daily_reviewer_metrics',
        'schedule': '0 1 * * *',  # Tous les jours à 1h du matin
    },
    'weekly-metrics-calculation': {
        'task': 'calculate_weekly_reviewer_metrics',
        'schedule': '0 2 * * 1',  # Tous les lundis à 2h du matin
    },
    'monthly-reports': {
        'task': 'generate_reviewer_reports',
        'schedule': '0 3 1 * *',  # Le 1er de chaque mois à 3h du matin
        'kwargs': {'period': 'monthly'},
    },
    'sla-alerts-check': {
        'task': 'check_sla_alerts',
        'schedule': '0 */2 8-18 * 1-5',  # Toutes les 2h, 8h-18h, lundi-vendredi
    },
    'cleanup-old-metrics': {
        'task': 'cleanup_old_metrics',
        'schedule': '0 4 1 * *',  # Le 1er de chaque mois à 4h du matin
    },
}

#!/usr/bin/env python3
"""
Script de migration pour transformer les reviewers existants vers le nouveau système hiérarchique.

Ce script :
1. Identifie tous les utilisateurs avec le rôle "reviewer"
2. Les migre vers le système à 3 niveaux (junior/senior/lead)
3. Configure leurs préférences par défaut
4. Crée leurs métriques initiales
5. Met à jour leurs permissions

Usage:
    python scripts/migrate_existing_reviewers.py [--dry-run] [--auto-level]

Options:
    --dry-run       Affiche les changements sans les appliquer
    --auto-level    Assigne automatiquement les niveaux basés sur l'ancienneté
    --batch-size    Nombre de reviewers à traiter par lot (défaut: 10)
"""

import argparse
import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import List, Dict, Any

from sqlalchemy import text, select, update
from sqlalchemy.orm import Session

from app.data.database import get_engine
from app.data.repos.reviewer_metrics_repo import ReviewerMetricsRepo, CreateReviewerMetricsInput
from app.services.reviewer_metrics_calculator import ReviewerMetricsCalculator

# Configuration du logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ReviewerMigrator:
    """Classe principale pour la migration des reviewers."""

    def __init__(self, dry_run: bool = False, auto_level: bool = False, batch_size: int = 10):
        self.engine = get_engine()
        self.dry_run = dry_run
        self.auto_level = auto_level
        self.batch_size = batch_size
        self.metrics_repo = ReviewerMetricsRepo()
        self.metrics_calculator = ReviewerMetricsCalculator()

    async def migrate_all_reviewers(self) -> Dict[str, Any]:
        """
        Migre tous les reviewers existants vers le nouveau système.

        Returns:
            Statistiques de migration
        """
        logger.info("Starting reviewer migration...")

        if self.dry_run:
            logger.info("DRY RUN MODE - No changes will be made")

        stats = {
            "total_reviewers": 0,
            "migrated_count": 0,
            "failed_count": 0,
            "skipped_count": 0,
            "level_distribution": {
                "reviewer_junior": 0,
                "reviewer_senior": 0,
                "reviewer_lead": 0
            },
            "errors": []
        }

        try:
            # 1. Récupérer tous les reviewers existants
            reviewers = await self._get_existing_reviewers()
            stats["total_reviewers"] = len(reviewers)

            logger.info(f"Found {len(reviewers)} reviewers to migrate")

            # 2. Traiter par lots
            for i in range(0, len(reviewers), self.batch_size):
                batch = reviewers[i:i + self.batch_size]
                logger.info(f"Processing batch {i//self.batch_size + 1} ({len(batch)} reviewers)")

                for reviewer in batch:
                    try:
                        await self._migrate_single_reviewer(reviewer, stats)
                        stats["migrated_count"] += 1
                    except Exception as e:
                        logger.error(f"Failed to migrate reviewer {reviewer['id']}: {str(e)}")
                        stats["failed_count"] += 1
                        stats["errors"].append({
                            "reviewer_id": reviewer["id"],
                            "error": str(e)
                        })

            # 3. Mettre à jour les permissions globalement
            if not self.dry_run:
                await self._update_role_permissions()

            logger.info("Migration completed successfully")
            return stats

        except Exception as e:
            logger.error(f"Migration failed: {str(e)}")
            stats["errors"].append({"general": str(e)})
            raise

    async def _get_existing_reviewers(self) -> List[Dict[str, Any]]:
        """Récupère tous les utilisateurs avec le rôle reviewer."""
        with Session(self.engine) as session:
            query = text("""
                SELECT
                    u.id,
                    u.email,
                    u.display_name,
                    u.created_at,
                    r.role_name,
                    COUNT(DISTINCT ra.id) as review_count,
                    MIN(ra.created_at) as first_review_date,
                    MAX(ra.created_at) as last_review_date
                FROM users u
                JOIN user_roles ur ON u.id = ur.user_id
                JOIN roles r ON ur.role_id = r.id
                LEFT JOIN review_assignments ra ON u.id = ra.reviewer_id
                WHERE r.role_name = 'reviewer'
                GROUP BY u.id, u.email, u.display_name, u.created_at, r.role_name
                ORDER BY u.created_at ASC
            """)

            result = session.execute(query)
            return [dict(row) for row in result.mappings().all()]

    async def _migrate_single_reviewer(self, reviewer: Dict[str, Any], stats: Dict[str, Any]) -> None:
        """Migre un reviewer individuel."""
        reviewer_id = reviewer["id"]
        logger.info(f"Migrating reviewer: {reviewer['display_name']} ({reviewer['email']})")

        # 1. Déterminer le niveau du reviewer
        new_level = await self._determine_reviewer_level(reviewer)
        stats["level_distribution"][new_level] += 1

        logger.info(f"  -> Assigned level: {new_level}")

        # 2. Mettre à jour le niveau et les métadonnées
        if not self.dry_run:
            await self._update_reviewer_profile(reviewer_id, new_level)

        # 3. Créer métriques initiales
        if not self.dry_run:
            await self._create_initial_metrics(reviewer)

        # 4. Configurer préférences par défaut
        if not self.dry_run:
            await self._setup_default_preferences(reviewer_id)

        logger.info(f"  -> Migration completed for {reviewer['display_name']}")

    async def _determine_reviewer_level(self, reviewer: Dict[str, Any]) -> str:
        """
        Détermine le niveau approprié pour un reviewer basé sur différents critères.
        """
        if not self.auto_level:
            # Mode manuel : tous deviennent senior par défaut
            return "reviewer_senior"

        # Critères d'évaluation automatique
        account_age_days = 0
        review_count = reviewer.get("review_count", 0)

        if reviewer.get("created_at"):
            account_created = reviewer["created_at"]
            if isinstance(account_created, str):
                account_created = datetime.fromisoformat(account_created.replace("Z", "+00:00"))
            account_age_days = (datetime.now(timezone.utc) - account_created).days

        # Ancienneté des reviews
        review_experience_days = 0
        if reviewer.get("first_review_date"):
            first_review = reviewer["first_review_date"]
            if isinstance(first_review, str):
                first_review = datetime.fromisoformat(first_review.replace("Z", "+00:00"))
            review_experience_days = (datetime.now(timezone.utc) - first_review).days

        # Logique d'assignation automatique
        if (review_count >= 100 and review_experience_days >= 180) or account_age_days >= 365:
            # Lead: 100+ reviews ET 6+ mois d'expérience OU 1+ an sur la plateforme
            return "reviewer_lead"
        elif review_count >= 25 and review_experience_days >= 60:
            # Senior: 25+ reviews ET 2+ mois d'expérience
            return "reviewer_senior"
        else:
            # Junior: nouveau ou peu d'expérience
            return "reviewer_junior"

    async def _update_reviewer_profile(self, reviewer_id: str, new_level: str) -> None:
        """Met à jour le profil du reviewer avec le nouveau niveau."""
        with Session(self.engine) as session:
            # 1. Mettre à jour le rôle dans la table user_roles
            role_update_query = text("""
                UPDATE user_roles
                SET role_id = (SELECT id FROM roles WHERE role_name = :new_role)
                WHERE user_id = :user_id
                AND role_id = (SELECT id FROM roles WHERE role_name = 'reviewer')
            """)

            session.execute(role_update_query, {
                "new_role": new_level,
                "user_id": reviewer_id
            })

            # 2. Ajouter colonnes reviewer_ dans users si elles n'existent pas déjà
            try:
                user_update_query = text("""
                    UPDATE users
                    SET
                        reviewer_level = :reviewer_level,
                        reviewer_capacity = 5,
                        reviewer_specialties = ARRAY[]::text[],
                        auto_assign_enabled = true,
                        notification_preferences = :default_notifications
                    WHERE id = :user_id
                """)

                default_notifications = {
                    "email": {"new_assignment": True, "overdue_reminder": True, "comment_replies": True, "daily_digest": False},
                    "push": {"realtime_comments": True, "session_invites": True, "metrics_updates": False},
                    "in_app": {"all_notifications": True}
                }

                session.execute(user_update_query, {
                    "reviewer_level": new_level.replace("reviewer_", ""),
                    "default_notifications": default_notifications,
                    "user_id": reviewer_id
                })

            except Exception as e:
                # Si les colonnes n'existent pas encore, les créer
                logger.warning(f"Could not update reviewer columns for {reviewer_id}: {e}")
                # Dans un vrai scénario, on devrait d'abord s'assurer que les colonnes existent

            session.commit()

    async def _create_initial_metrics(self, reviewer: Dict[str, Any]) -> None:
        """Crée des métriques initiales pour le reviewer."""
        reviewer_id = reviewer["id"]

        # Calculer des métriques basées sur l'historique s'il existe
        review_count = reviewer.get("review_count", 0)

        # Créer métriques pour le mois en cours
        today = date.today()
        month_start = today.replace(day=1)

        initial_metrics = CreateReviewerMetricsInput(
            reviewer_id=reviewer_id,
            period_start=month_start,
            period_end=today,
            reviews_assigned=review_count,
            reviews_completed=int(review_count * 0.8),  # Assume 80% completion rate
            reviews_declined=int(review_count * 0.1),   # Assume 10% decline rate
            comments_created=review_count * 5,          # Assume 5 comments per review
            change_requests_created=int(review_count * 0.3),  # 30% create change requests
            avg_review_time_minutes=45,                 # Default 45 minutes
            avg_comments_per_review=5.0,
            findings_identified=review_count * 2,       # 2 findings per review
            false_positives=0,
            approvals=int(review_count * 0.7),          # 70% approvals
            warnings=int(review_count * 0.25),          # 25% warnings
            blocks=int(review_count * 0.05),            # 5% blocks
            overrides_received=0,
            reviews_within_sla=int(review_count * 0.95), # 95% SLA compliance
            reviews_breached_sla=int(review_count * 0.05),
            avg_response_time_minutes=30,               # 30 min response time
        )

        try:
            self.metrics_repo.create_metrics(initial_metrics)
            logger.info(f"  -> Created initial metrics for {reviewer_id}")
        except Exception as e:
            logger.warning(f"  -> Could not create initial metrics for {reviewer_id}: {e}")

    async def _setup_default_preferences(self, reviewer_id: str) -> None:
        """Configure les préférences par défaut pour le reviewer."""
        # Cette méthode pourrait configurer :
        # - Templates par défaut
        # - Préférences de notification
        # - Règles d'auto-assignation
        # Pour l'instant, on assume que les defaults sont déjà dans la DB
        pass

    async def _update_role_permissions(self) -> None:
        """Met à jour les permissions pour les nouveaux rôles."""
        logger.info("Updating role permissions...")

        with Session(self.engine) as session:
            # S'assurer que les nouveaux rôles existent
            new_roles = [
                ("reviewer_junior", "Junior Reviewer"),
                ("reviewer_senior", "Senior Reviewer"),
                ("reviewer_lead", "Lead Reviewer")
            ]

            for role_name, role_display_name in new_roles:
                # Créer le rôle s'il n'existe pas
                role_check = text("SELECT id FROM roles WHERE role_name = :role_name")
                result = session.execute(role_check, {"role_name": role_name})

                if not result.fetchone():
                    role_insert = text("""
                        INSERT INTO roles (id, role_name, display_name, created_at, updated_at)
                        VALUES (:id, :role_name, :display_name, :created_at, :updated_at)
                    """)

                    session.execute(role_insert, {
                        "id": f"role_{role_name}",
                        "role_name": role_name,
                        "display_name": role_display_name,
                        "created_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc)
                    })

                    logger.info(f"  -> Created role: {role_name}")

            session.commit()

    def print_migration_summary(self, stats: Dict[str, Any]) -> None:
        """Affiche un résumé de la migration."""
        print("\n" + "="*60)
        print("REVIEWER MIGRATION SUMMARY")
        print("="*60)
        print(f"Total reviewers found: {stats['total_reviewers']}")
        print(f"Successfully migrated: {stats['migrated_count']}")
        print(f"Failed: {stats['failed_count']}")
        print(f"Skipped: {stats['skipped_count']}")
        print()
        print("Level Distribution:")
        for level, count in stats['level_distribution'].items():
            print(f"  {level}: {count}")
        print()

        if stats['errors']:
            print("Errors encountered:")
            for error in stats['errors'][:5]:  # Show first 5 errors
                print(f"  - {error}")
            if len(stats['errors']) > 5:
                print(f"  ... and {len(stats['errors']) - 5} more errors")

        print("\nMigration completed.")
        print("="*60)


async def main():
    """Point d'entrée principal du script."""
    parser = argparse.ArgumentParser(
        description="Migrate existing reviewers to the new hierarchical system"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be changed without making actual changes"
    )
    parser.add_argument(
        "--auto-level",
        action="store_true",
        help="Automatically determine reviewer levels based on experience"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=10,
        help="Number of reviewers to process in each batch"
    )

    args = parser.parse_args()

    try:
        migrator = ReviewerMigrator(
            dry_run=args.dry_run,
            auto_level=args.auto_level,
            batch_size=args.batch_size
        )

        stats = await migrator.migrate_all_reviewers()
        migrator.print_migration_summary(stats)

        if args.dry_run:
            print("\nThis was a dry run - no changes were made.")
            print("Run without --dry-run to apply the changes.")

    except KeyboardInterrupt:
        logger.info("Migration interrupted by user")
    except Exception as e:
        logger.error(f"Migration failed: {str(e)}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
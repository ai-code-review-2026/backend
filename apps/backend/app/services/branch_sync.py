"""Service de synchronisation des branches avec GitHub."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from app.data.repos.branch_repo import BranchRepo, CreateBranchInput, UpdateBranchInput

logger = logging.getLogger(__name__)


@dataclass
class BranchSyncResult:
    """Résultat d'une synchronisation de branche."""

    branch_id: str | None
    action: str  # created, updated, deleted, skipped
    branch_name: str
    success: bool
    error: str | None = None


@dataclass
class GitHubBranchPayload:
    """Payload d'événement de branche GitHub."""

    ref: str
    ref_type: str
    repo_full_name: str
    sender_login: str | None
    default_branch: str | None
    master_branch: str | None


class BranchSyncService:
    """
    Service pour synchroniser les branches depuis GitHub vers la base de données locale.
    Gère les événements webhooks et la synchronisation périodique.
    """

    def __init__(self) -> None:
        self.branch_repo = BranchRepo()

    def handle_create_event(
        self,
        payload: dict[str, Any],
        repo_full_name: str,
        org_id: str | None = None,
    ) -> BranchSyncResult:
        """
        Gère l'événement 'create' de GitHub (création de branche ou tag).

        Args:
            payload: Payload de l'événement GitHub
            repo_full_name: Nom complet du repository (owner/repo)
            org_id: ID de l'organisation (optionnel)

        Returns:
            BranchSyncResult avec les détails de l'action
        """
        ref_type = payload.get("ref_type", "")
        ref = payload.get("ref", "")

        # On ne gère que les branches, pas les tags
        if ref_type != "branch":
            return BranchSyncResult(
                branch_id=None,
                action="skipped",
                branch_name=ref,
                success=True,
                error=f"Skipped ref_type: {ref_type}",
            )

        sender = payload.get("sender", {})
        sender_login = sender.get("login") if isinstance(sender, dict) else None

        # Déterminer le type de branche
        branch_type = self._determine_branch_type(ref)

        try:
            # Vérifier si la branche existe déjà
            existing = self.branch_repo.get_by_repo_and_name(repo_full_name, ref)
            if existing:
                # Réactiver si elle était marquée inactive
                if not existing["is_active"]:
                    self.branch_repo.update(UpdateBranchInput(
                        branch_id=existing["id"],
                        is_active=True,
                    ))
                    return BranchSyncResult(
                        branch_id=existing["id"],
                        action="reactivated",
                        branch_name=ref,
                        success=True,
                    )
                return BranchSyncResult(
                    branch_id=existing["id"],
                    action="skipped",
                    branch_name=ref,
                    success=True,
                    error="Branch already exists",
                )

            # Créer la nouvelle branche
            branch_id = f"branch_{uuid.uuid4().hex}"
            branch = self.branch_repo.create(CreateBranchInput(
                branch_id=branch_id,
                repo_id=repo_full_name,
                org_id=org_id,
                branch_name=ref,
                branch_type=branch_type,
                branch_pattern=self._get_branch_pattern(branch_type),
                created_by=None,  # Créé via webhook, pas d'utilisateur
                description=f"Created via GitHub webhook by {sender_login or 'unknown'}",
                is_protected=branch_type in ("main", "develop"),
                is_default=False,
            ))

            logger.info(
                "Branch created from webhook: %s/%s (type=%s)",
                repo_full_name,
                ref,
                branch_type,
            )

            return BranchSyncResult(
                branch_id=branch["id"],
                action="created",
                branch_name=ref,
                success=True,
            )

        except Exception as e:
            logger.exception("Failed to create branch from webhook: %s/%s", repo_full_name, ref)
            return BranchSyncResult(
                branch_id=None,
                action="failed",
                branch_name=ref,
                success=False,
                error=str(e),
            )

    def handle_delete_event(
        self,
        payload: dict[str, Any],
        repo_full_name: str,
    ) -> BranchSyncResult:
        """
        Gère l'événement 'delete' de GitHub (suppression de branche ou tag).

        Args:
            payload: Payload de l'événement GitHub
            repo_full_name: Nom complet du repository

        Returns:
            BranchSyncResult avec les détails de l'action
        """
        ref_type = payload.get("ref_type", "")
        ref = payload.get("ref", "")

        if ref_type != "branch":
            return BranchSyncResult(
                branch_id=None,
                action="skipped",
                branch_name=ref,
                success=True,
                error=f"Skipped ref_type: {ref_type}",
            )

        try:
            existing = self.branch_repo.get_by_repo_and_name(repo_full_name, ref)
            if not existing:
                return BranchSyncResult(
                    branch_id=None,
                    action="skipped",
                    branch_name=ref,
                    success=True,
                    error="Branch not found in database",
                )

            # Ne pas supprimer physiquement, marquer comme inactive avec status "deleted"
            self.branch_repo.update(UpdateBranchInput(
                branch_id=existing["id"],
                is_active=False,
                merge_status="deleted",
            ))

            logger.info("Branch marked as deleted from webhook: %s/%s", repo_full_name, ref)

            return BranchSyncResult(
                branch_id=existing["id"],
                action="deleted",
                branch_name=ref,
                success=True,
            )

        except Exception as e:
            logger.exception("Failed to delete branch from webhook: %s/%s", repo_full_name, ref)
            return BranchSyncResult(
                branch_id=None,
                action="failed",
                branch_name=ref,
                success=False,
                error=str(e),
            )

    def handle_push_event(
        self,
        payload: dict[str, Any],
        repo_full_name: str,
        org_id: str | None = None,
    ) -> BranchSyncResult:
        """
        Gère l'événement 'push' de GitHub pour mettre à jour les métadonnées de commit.

        Args:
            payload: Payload de l'événement push GitHub
            repo_full_name: Nom complet du repository
            org_id: ID de l'organisation (optionnel)

        Returns:
            BranchSyncResult avec les détails de l'action
        """
        ref = payload.get("ref", "")

        # Extraire le nom de branche de refs/heads/branch-name
        if not ref.startswith("refs/heads/"):
            return BranchSyncResult(
                branch_id=None,
                action="skipped",
                branch_name=ref,
                success=True,
                error="Not a branch push",
            )

        branch_name = ref.removeprefix("refs/heads/")

        # Extraire les informations du dernier commit
        head_commit = payload.get("head_commit", {})
        commit_sha = head_commit.get("id") if isinstance(head_commit, dict) else None
        commit_message = head_commit.get("message") if isinstance(head_commit, dict) else None
        commit_author = None
        if isinstance(head_commit, dict):
            author = head_commit.get("author", {})
            if isinstance(author, dict):
                commit_author = author.get("email") or author.get("name")

        commit_timestamp = None
        if isinstance(head_commit, dict) and head_commit.get("timestamp"):
            try:
                commit_timestamp = datetime.fromisoformat(
                    head_commit["timestamp"].replace("Z", "+00:00")
                )
            except (ValueError, TypeError):
                pass

        try:
            existing = self.branch_repo.get_by_repo_and_name(repo_full_name, branch_name)

            if not existing:
                # Créer la branche si elle n'existe pas
                branch_type = self._determine_branch_type(branch_name)
                branch_id = f"branch_{uuid.uuid4().hex}"

                self.branch_repo.create(CreateBranchInput(
                    branch_id=branch_id,
                    repo_id=repo_full_name,
                    org_id=org_id,
                    branch_name=branch_name,
                    branch_type=branch_type,
                    branch_pattern=self._get_branch_pattern(branch_type),
                    is_protected=branch_type in ("main", "develop"),
                    is_default=payload.get("repository", {}).get("default_branch") == branch_name,
                ))

                existing = self.branch_repo.get_by_id(branch_id)
                action = "created"
            else:
                action = "updated"

            # Mettre à jour les métadonnées de commit
            self.branch_repo.update(UpdateBranchInput(
                branch_id=existing["id"],
                last_commit_sha=commit_sha,
                last_commit_author=commit_author,
                last_commit_message=commit_message[:500] if commit_message else None,
                last_commit_at=commit_timestamp,
                last_synced_at=datetime.now(timezone.utc),
            ))

            logger.debug(
                "Branch %s from push event: %s/%s (commit=%s)",
                action,
                repo_full_name,
                branch_name,
                commit_sha[:7] if commit_sha else "unknown",
            )

            return BranchSyncResult(
                branch_id=existing["id"],
                action=action,
                branch_name=branch_name,
                success=True,
            )

        except Exception as e:
            logger.exception("Failed to process push event: %s/%s", repo_full_name, branch_name)
            return BranchSyncResult(
                branch_id=None,
                action="failed",
                branch_name=branch_name,
                success=False,
                error=str(e),
            )

    def handle_pull_request_event(
        self,
        payload: dict[str, Any],
        repo_full_name: str,
        org_id: str | None = None,
    ) -> dict[str, BranchSyncResult]:
        """
        Gère l'événement 'pull_request' pour mettre à jour les branches source et target.

        Returns:
            Dict avec les résultats pour source et target branches
        """
        results = {}
        pr = payload.get("pull_request", {})

        if not isinstance(pr, dict):
            return {"error": BranchSyncResult(
                branch_id=None,
                action="failed",
                branch_name="unknown",
                success=False,
                error="Invalid pull_request payload",
            )}

        # Traiter la branche source (head)
        head = pr.get("head", {})
        if isinstance(head, dict):
            head_ref = head.get("ref")
            head_sha = head.get("sha")
            if head_ref:
                results["source"] = self._sync_pr_branch(
                    repo_full_name=repo_full_name,
                    branch_name=head_ref,
                    commit_sha=head_sha,
                    org_id=org_id,
                )

        # Traiter la branche target (base)
        base = pr.get("base", {})
        if isinstance(base, dict):
            base_ref = base.get("ref")
            base_sha = base.get("sha")
            if base_ref:
                results["target"] = self._sync_pr_branch(
                    repo_full_name=repo_full_name,
                    branch_name=base_ref,
                    commit_sha=base_sha,
                    org_id=org_id,
                )

        return results

    def _sync_pr_branch(
        self,
        repo_full_name: str,
        branch_name: str,
        commit_sha: str | None,
        org_id: str | None,
    ) -> BranchSyncResult:
        """Synchronise une branche depuis un événement PR."""
        try:
            existing = self.branch_repo.get_by_repo_and_name(repo_full_name, branch_name)

            if not existing:
                # Créer la branche
                branch_type = self._determine_branch_type(branch_name)
                branch_id = f"branch_{uuid.uuid4().hex}"

                self.branch_repo.create(CreateBranchInput(
                    branch_id=branch_id,
                    repo_id=repo_full_name,
                    org_id=org_id,
                    branch_name=branch_name,
                    branch_type=branch_type,
                    branch_pattern=self._get_branch_pattern(branch_type),
                    is_protected=branch_type in ("main", "develop"),
                ))

                existing = self.branch_repo.get_by_id(branch_id)
                action = "created"
            else:
                action = "updated"

            # Mettre à jour avec le SHA
            if commit_sha:
                self.branch_repo.update(UpdateBranchInput(
                    branch_id=existing["id"],
                    last_commit_sha=commit_sha,
                    last_synced_at=datetime.now(timezone.utc),
                ))

            return BranchSyncResult(
                branch_id=existing["id"],
                action=action,
                branch_name=branch_name,
                success=True,
            )

        except Exception as e:
            return BranchSyncResult(
                branch_id=None,
                action="failed",
                branch_name=branch_name,
                success=False,
                error=str(e),
            )

    def _determine_branch_type(self, branch_name: str) -> str:
        """Détermine le type de branche basé sur son nom."""
        name_lower = branch_name.lower()

        if name_lower in ("main", "master"):
            return "main"
        elif name_lower in ("develop", "development", "dev"):
            return "develop"
        elif name_lower.startswith(("feature/", "feat/")):
            return "feature"
        elif name_lower.startswith(("hotfix/", "fix/")):
            return "hotfix"
        elif name_lower.startswith(("release/", "rel/")):
            return "release"
        else:
            return "custom"

    def _get_branch_pattern(self, branch_type: str) -> str | None:
        """Retourne le pattern de branche pour un type donné."""
        patterns = {
            "feature": "feature/*",
            "hotfix": "hotfix/*",
            "release": "release/*",
        }
        return patterns.get(branch_type)

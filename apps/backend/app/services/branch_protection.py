from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.data.repos.branch_protection_repo import BranchProtectionRepo
from app.data.repos.branch_repo import BranchRepo


@dataclass
class ValidationResult:
    """Résultat de validation."""

    allowed: bool
    reason: str
    missing_requirements: list[str] | None = None


@dataclass
class MergeRequestValidation:
    """Validation détaillée d'une merge request."""

    can_merge: bool
    approval_status: dict[str, Any]
    status_checks: dict[str, Any]
    protection_bypassed: bool
    reason: str


class BranchProtectionService:
    """
    Service pour l'enforcement des règles de protection de branches.
    """

    def __init__(self) -> None:
        self.branch_repo = BranchRepo()
        self.protection_repo = BranchProtectionRepo()

    def can_perform_operation(
        self,
        operation: str,
        branch_id: str,
        user_role: str,
        user_permissions: list[str],
        org_id: str,
        repo_id: str,
    ) -> ValidationResult:
        """
        Vérifie si un utilisateur peut effectuer une opération sur une branche.

        Args:
            operation: Type d'opération (merge, push, force_push, delete)
            branch_id: ID de la branche
            user_role: Rôle de l'utilisateur
            user_permissions: Liste des permissions de l'utilisateur
            org_id: ID de l'organisation
            repo_id: ID du repository

        Returns:
            ValidationResult avec allowed et reason
        """
        # Récupérer la branche
        try:
            branch = self.branch_repo.get_by_id(branch_id)
        except ValueError:
            return ValidationResult(False, "Branch not found")

        # Récupérer les règles de protection
        rules = self.protection_repo.get_rules_for_branch(branch_id, org_id, repo_id)

        if branch["branch_type"]:
            type_rules = self.protection_repo.get_rules_by_type(branch["branch_type"], org_id, repo_id)
            rules.extend(type_rules)

        if not rules:
            # Pas de règles = autorisé si permission de base
            return self._check_basic_permission(operation, user_permissions)

        # Utiliser la règle la plus stricte
        active_rules = [r for r in rules if r["is_active"]]
        if not active_rules:
            return self._check_basic_permission(operation, user_permissions)

        # Prioriser les règles spécifiques à la branche
        rule = active_rules[0]

        # Vérifier si l'utilisateur peut bypass
        if self._can_bypass_protection(user_role, rule):
            return ValidationResult(True, "Protection bypassed by role")

        # Valider selon l'opération
        if operation == "push":
            if rule["block_direct_commits"]:
                return ValidationResult(False, "Direct commits are blocked by branch protection rule")
            if rule["allowed_push_roles"]:
                if user_role not in rule["allowed_push_roles"]:
                    return ValidationResult(
                        False, f"Your role ({user_role}) is not allowed to push to this branch"
                    )
            return ValidationResult(True, "Push allowed")

        elif operation == "force_push":
            if not rule["allow_force_pushes"]:
                return ValidationResult(False, "Force pushes are not allowed by branch protection rule")
            return ValidationResult(True, "Force push allowed")

        elif operation == "delete":
            if not rule["allow_deletions"]:
                return ValidationResult(False, "Branch deletion is not allowed by branch protection rule")
            return ValidationResult(True, "Deletion allowed")

        elif operation == "merge":
            if rule["require_pull_request"]:
                return ValidationResult(False, "Merges must go through pull request")
            if rule["allowed_merge_roles"]:
                if user_role not in rule["allowed_merge_roles"]:
                    return ValidationResult(
                        False, f"Your role ({user_role}) is not allowed to merge to this branch"
                    )
            return ValidationResult(True, "Merge allowed")

        return ValidationResult(False, f"Unknown operation: {operation}")

    def validate_merge_request(
        self,
        source_branch_id: str,
        target_branch_id: str,
        current_approvals: list[str],
        current_approvals_by_role: dict[str, int],
        status_checks: dict[str, str],
        user_role: str,
        org_id: str,
        repo_id: str,
    ) -> MergeRequestValidation:
        """
        Valide si une merge request peut être complétée.

        Args:
            source_branch_id: ID de la branche source
            target_branch_id: ID de la branche cible
            current_approvals: Liste des IDs de reviewers ayant approuvé
            current_approvals_by_role: Compteur d'approbations par rôle
            status_checks: Statut des checks (nom -> 'passing'/'failing')
            user_role: Rôle de l'utilisateur tentant le merge
            org_id: ID de l'organisation
            repo_id: ID du repository

        Returns:
            MergeRequestValidation avec détails complets
        """
        # Récupérer la branche target et ses règles
        try:
            target_branch = self.branch_repo.get_by_id(target_branch_id)
        except ValueError:
            return MergeRequestValidation(
                can_merge=False,
                approval_status={},
                status_checks={},
                protection_bypassed=False,
                reason="Target branch not found",
            )

        rules = self.protection_repo.get_rules_for_branch(target_branch_id, org_id, repo_id)
        if target_branch["branch_type"]:
            type_rules = self.protection_repo.get_rules_by_type(target_branch["branch_type"], org_id, repo_id)
            rules.extend(type_rules)

        if not rules:
            # Pas de règles = merge autorisé
            return MergeRequestValidation(
                can_merge=True,
                approval_status={"required": 0, "current": len(current_approvals)},
                status_checks={"required": [], "passing": []},
                protection_bypassed=False,
                reason="No protection rules configured",
            )

        active_rules = [r for r in rules if r["is_active"]]
        if not active_rules:
            return MergeRequestValidation(
                can_merge=True,
                approval_status={"required": 0, "current": len(current_approvals)},
                status_checks={"required": [], "passing": []},
                protection_bypassed=False,
                reason="No active protection rules",
            )

        rule = active_rules[0]

        # Vérifier bypass
        if self._can_bypass_protection(user_role, rule):
            return MergeRequestValidation(
                can_merge=True,
                approval_status={"bypassed": True},
                status_checks={"bypassed": True},
                protection_bypassed=True,
                reason="Protection bypassed by role",
            )

        missing_requirements = []

        # Vérifier les approbations requises
        required_approvals = rule["required_approvals"]
        current_approval_count = len(current_approvals)

        if current_approval_count < required_approvals:
            missing_requirements.append(
                f"Needs {required_approvals - current_approval_count} more approval(s)"
            )

        # Vérifier les rôles de reviewers requis
        if rule["required_reviewer_roles"]:
            for required_role in rule["required_reviewer_roles"]:
                role_count = current_approvals_by_role.get(required_role, 0)
                if role_count == 0:
                    missing_requirements.append(f"Needs approval from {required_role}")

        # Vérifier les status checks
        if rule["require_status_checks"] and rule["required_status_checks"]:
            failing_checks = []
            for check_name in rule["required_status_checks"]:
                check_status = status_checks.get(check_name)
                if check_status != "passing":
                    failing_checks.append(check_name)

            if failing_checks:
                missing_requirements.append(f"Status checks failing: {', '.join(failing_checks)}")

        can_merge = len(missing_requirements) == 0

        return MergeRequestValidation(
            can_merge=can_merge,
            approval_status={
                "required": required_approvals,
                "current": current_approval_count,
                "by_role": current_approvals_by_role,
            },
            status_checks={
                "required": rule["required_status_checks"],
                "current": status_checks,
            },
            protection_bypassed=False,
            reason="All requirements met" if can_merge else f"Requirements not met: {'; '.join(missing_requirements)}",
        )

    def apply_protection_rule(self, rule_id: str, branch_ids: list[str]) -> dict[str, int]:
        """
        Applique une règle de protection à plusieurs branches.

        Args:
            rule_id: ID de la règle de protection
            branch_ids: Liste des IDs de branches

        Returns:
            Statistiques d'application
        """
        protected_count = 0
        failed_count = 0

        for branch_id in branch_ids:
            try:
                # Mettre à jour le flag is_protected
                from app.data.repos.branch_repo import UpdateBranchInput

                self.branch_repo.update(UpdateBranchInput(branch_id=branch_id, is_protected=True))
                protected_count += 1
            except Exception:
                failed_count += 1

        return {"protected": protected_count, "failed": failed_count, "total": len(branch_ids)}

    def _check_basic_permission(self, operation: str, user_permissions: list[str]) -> ValidationResult:
        """Vérifie les permissions de base sans règle de protection."""
        permission_map = {
            "push": "branches.push",
            "force_push": "branches.force_push",
            "delete": "branches.delete",
            "merge": "branches.merge",
        }

        required_permission = permission_map.get(operation)
        if not required_permission:
            return ValidationResult(False, f"Unknown operation: {operation}")

        if required_permission in user_permissions:
            return ValidationResult(True, f"{operation} allowed by permission")

        return ValidationResult(False, f"Missing permission: {required_permission}")

    def _can_bypass_protection(self, user_role: str, rule: dict[str, Any]) -> bool:
        """Vérifie si un rôle peut bypass la protection."""
        bypass_roles = rule.get("bypass_roles", [])
        return user_role in bypass_roles or user_role == "admin"

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.data.repos.branch_policy_repo import BranchPolicyRepo


@dataclass
class ValidationResult:
    """Résultat de validation."""

    valid: bool
    reason: str
    violated_policies: list[str] | None = None


class BranchPolicyValidator:
    """
    Service pour valider les opérations contre les politiques de branches.
    """

    def __init__(self) -> None:
        self.policy_repo = BranchPolicyRepo()

    def validate_branch_name(
        self,
        branch_name: str,
        branch_type: str,
        org_id: str,
        repo_id: str,
    ) -> ValidationResult:
        """
        Valide un nom de branche contre les politiques de nommage.

        Args:
            branch_name: Nom de la branche à valider
            branch_type: Type de branche (feature, hotfix, etc.)
            org_id: ID de l'organisation
            repo_id: ID du repository

        Returns:
            ValidationResult indiquant si le nom est valide
        """
        policies = self.policy_repo.get_naming_policies(org_id, repo_id)

        if not policies:
            # Pas de politiques = nom valide
            return ValidationResult(True, "No naming policies configured")

        violated_messages = []
        violated_policies = []

        for policy in policies:
            if not policy["enforce_naming"]:
                continue

            patterns = policy["branch_naming_patterns"]
            if not patterns:
                continue

            # Vérifier si un pattern existe pour ce type
            if branch_type in patterns:
                pattern = patterns[branch_type]
                if not self._matches_pattern(branch_name, pattern):
                    violated_messages.append(
                        f"Branch name '{branch_name}' does not match pattern '{pattern}' "
                        f"for type '{branch_type}' (policy: {policy['policy_name']})"
                    )
                    violated_policies.append(policy['policy_name'])

        if violated_policies:
            return ValidationResult(
                False,
                f"Branch name violates {len(violated_policies)} naming policy(ies): {', '.join(violated_messages)}",
                violated_policies,
            )

        return ValidationResult(True, "Branch name is valid")

    def validate_workflow(
        self,
        operation: str,
        branch_name: str,
        branch_type: str,
        base_branch: str | None,
        org_id: str,
        repo_id: str,
    ) -> ValidationResult:
        """
        Valide une opération contre les politiques de workflow.

        Args:
            operation: Type d'opération (create, merge, etc.)
            branch_name: Nom de la branche
            branch_type: Type de branche
            base_branch: Branche de base (pour création)
            org_id: ID de l'organisation
            repo_id: ID du repository

        Returns:
            ValidationResult
        """
        policies = self.policy_repo.get_policies_for_repo(org_id, repo_id)
        workflow_policies = [p for p in policies if p["policy_type"] == "workflow"]

        if not workflow_policies:
            return ValidationResult(True, "No workflow policies configured")

        violated_messages = []
        violated_policies = []

        for policy in workflow_policies:
            # Vérifier si une base branch est requise
            if operation == "create" and policy["require_base_branch"]:
                if not base_branch:
                    violated_messages.append(
                        f"Policy '{policy['policy_name']}' requires a base branch to be specified"
                    )
                    violated_policies.append(policy['policy_name'])
                elif policy["allowed_base_branches"]:
                    if base_branch not in policy["allowed_base_branches"]:
                        violated_messages.append(
                            f"Base branch '{base_branch}' is not allowed by policy '{policy['policy_name']}'. "
                            f"Allowed: {', '.join(policy['allowed_base_branches'])}"
                        )
                        violated_policies.append(policy['policy_name'])

        if violated_policies:
            return ValidationResult(
                False,
                f"Workflow violations: {len(violated_policies)} - {', '.join(violated_messages)}",
                violated_policies,
            )

        return ValidationResult(True, "Workflow is valid")

    def validate_merge_method(
        self,
        merge_method: str,
        target_branch_type: str,
        org_id: str,
        repo_id: str,
    ) -> ValidationResult:
        """
        Valide une méthode de merge contre les politiques.

        Args:
            merge_method: Méthode de merge (merge, squash, rebase)
            target_branch_type: Type de branche cible
            org_id: ID de l'organisation
            repo_id: ID du repository

        Returns:
            ValidationResult
        """
        policies = self.policy_repo.get_policies_for_repo(org_id, repo_id)
        merge_policies = [p for p in policies if p["policy_type"] == "merge_strategy"]

        if not merge_policies:
            return ValidationResult(True, "No merge strategy policies configured")

        # Utiliser la politique avec la plus haute priorité
        policy = merge_policies[0]

        allowed_methods = policy["allowed_merge_methods"]
        if merge_method not in allowed_methods:
            return ValidationResult(
                False,
                f"Merge method '{merge_method}' is not allowed. "
                f"Allowed methods: {', '.join(allowed_methods)}",
                [policy['policy_name']],
            )

        return ValidationResult(True, f"Merge method '{merge_method}' is allowed")

    def get_default_merge_method(
        self,
        org_id: str,
        repo_id: str,
        target_branch_type: str | None = None,
    ) -> str:
        """
        Récupère la méthode de merge par défaut selon les politiques.

        Args:
            org_id: ID de l'organisation
            repo_id: ID du repository
            target_branch_type: (optionnel) Type de branche cible

        Returns:
            Méthode de merge par défaut (merge, squash, ou rebase)
        """
        policies = self.policy_repo.get_policies_for_repo(org_id, repo_id)
        merge_policies = [p for p in policies if p["policy_type"] == "merge_strategy"]

        if not merge_policies:
            return "merge"  # Valeur par défaut

        return merge_policies[0].get("default_merge_method", "merge")

    def validate_branch_age(
        self,
        branch_created_at: str,
        branch_type: str,
        org_id: str,
        repo_id: str,
    ) -> ValidationResult:
        """
        Valide l'âge d'une branche contre les politiques.

        Args:
            branch_created_at: Date de création de la branche (ISO format)
            branch_type: Type de branche
            org_id: ID de l'organisation
            repo_id: ID du repository

        Returns:
            ValidationResult
        """
        from datetime import datetime, timezone

        policies = self.policy_repo.get_policies_for_repo(org_id, repo_id)
        workflow_policies = [p for p in policies if p["policy_type"] == "workflow"]

        if not workflow_policies:
            return ValidationResult(True, "No workflow policies configured")

        for policy in workflow_policies:
            max_age = policy.get("max_branch_age_days")
            if not max_age:
                continue

            # Calculer l'âge de la branche
            created = datetime.fromisoformat(branch_created_at.replace("Z", "+00:00"))
            now = datetime.now(timezone.utc)
            age_days = (now - created).days

            if age_days > max_age:
                return ValidationResult(
                    False,
                    f"Branch is {age_days} days old, exceeds maximum of {max_age} days "
                    f"(policy: {policy['policy_name']})",
                    [f"Consider merging or deleting this branch"],
                )

        return ValidationResult(True, "Branch age is within limits")

    def _matches_pattern(self, text: str, pattern: str) -> bool:
        """
        Vérifie si un texte correspond à un pattern regex.

        Args:
            text: Texte à vérifier
            pattern: Pattern regex

        Returns:
            True si le texte correspond au pattern
        """
        try:
            return bool(re.match(pattern, text))
        except re.error:
            # Pattern invalide = considéré comme non-correspondant
            return False

    def get_branch_naming_suggestion(
        self,
        branch_type: str,
        org_id: str,
        repo_id: str,
    ) -> str | None:
        """
        Récupère un exemple de nom de branche valide selon les politiques.

        Args:
            branch_type: Type de branche
            org_id: ID de l'organisation
            repo_id: ID du repository

        Returns:
            Exemple de nom de branche ou None
        """
        policies = self.policy_repo.get_naming_policies(org_id, repo_id)

        if not policies:
            return None

        for policy in policies:
            patterns = policy["branch_naming_patterns"]
            if branch_type in patterns:
                pattern = patterns[branch_type]
                # Retourner le pattern comme suggestion
                return self._generate_example_from_pattern(pattern, branch_type)

        return None

    def _generate_example_from_pattern(self, pattern: str, branch_type: str) -> str:
        """
        Génère un exemple de nom à partir d'un pattern regex.

        Args:
            pattern: Pattern regex
            branch_type: Type de branche

        Returns:
            Exemple de nom
        """
        # Exemples simplifiés basés sur des patterns courants
        examples = {
            "feature": "feature/PROJ-123-add-authentication",
            "hotfix": "hotfix/v1.2.3-fix-memory-leak",
            "release": "release/v1.2.0",
            "bugfix": "bugfix/PROJ-456-fix-login-issue",
        }

        return examples.get(branch_type, f"{branch_type}/example-branch-name")

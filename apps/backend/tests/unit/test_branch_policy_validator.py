"""Tests unitaires pour BranchPolicyValidator."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.services.branch_policy_validator import (
    BranchPolicyValidator,
    ValidationResult,
)


def _make_naming_policy(
    patterns: dict[str, str] | None = None,
    enforce_naming: bool = True,
) -> dict[str, Any]:
    """Crée une politique de nommage de test."""
    return {
        "id": "policy_123",
        "org_id": "org_789",
        "policy_name": "naming-convention",
        "policy_type": "naming",
        "branch_naming_patterns": patterns or {
            "feature": r"^feature/[A-Z]+-[0-9]+-.*$",
            "hotfix": r"^hotfix/v[0-9]+\.[0-9]+\.[0-9]+$",
            "release": r"^release/v[0-9]+\.[0-9]+$",
        },
        "enforce_naming": enforce_naming,
        "is_active": True,
    }


def _make_workflow_policy(
    require_base_branch: bool = True,
    allowed_base_branches: list[str] | None = None,
    auto_delete_on_merge: bool = False,
    max_branch_age_days: int | None = None,
) -> dict[str, Any]:
    """Crée une politique de workflow de test."""
    return {
        "id": "policy_456",
        "org_id": "org_789",
        "policy_name": "workflow-policy",
        "policy_type": "workflow",
        "require_base_branch": require_base_branch,
        "allowed_base_branches": allowed_base_branches or ["main", "develop"],
        "auto_delete_on_merge": auto_delete_on_merge,
        "max_branch_age_days": max_branch_age_days,
        "is_active": True,
    }


def _make_merge_strategy_policy(
    allowed_merge_methods: list[str] | None = None,
    default_merge_method: str = "squash",
) -> dict[str, Any]:
    """Crée une politique de stratégie de merge."""
    return {
        "id": "policy_789",
        "org_id": "org_789",
        "policy_name": "merge-strategy",
        "policy_type": "merge_strategy",
        "allowed_merge_methods": allowed_merge_methods or ["squash", "rebase"],
        "default_merge_method": default_merge_method,
        "is_active": True,
    }


class TestValidationResult:
    """Tests pour ValidationResult dataclass."""

    def test_valid_result(self) -> None:
        """Test d'un résultat valide."""
        result = ValidationResult(valid=True, reason="Branch name is valid")

        assert result.valid is True
        assert result.reason == "Branch name is valid"
        assert result.violated_policies is None

    def test_invalid_result_with_violations(self) -> None:
        """Test d'un résultat invalide avec violations."""
        result = ValidationResult(
            valid=False,
            reason="Branch name does not match pattern",
            violated_policies=["naming-convention"],
        )

        assert result.valid is False
        assert result.violated_policies == ["naming-convention"]


class TestBranchPolicyValidatorNaming:
    """Tests pour la validation des noms de branches."""

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_branch_name_valid_feature(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test qu'un nom de feature valide passe la validation."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_naming_policies.return_value = [_make_naming_policy()]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_branch_name(
            branch_name="feature/JIRA-123-add-login",
            branch_type="feature",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is True

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_branch_name_invalid_feature(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test qu'un nom de feature invalide échoue."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_naming_policies.return_value = [_make_naming_policy()]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_branch_name(
            branch_name="feature/my-feature",  # Manque le préfixe JIRA-xxx
            branch_type="feature",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is False
        assert "naming-convention" in result.violated_policies

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_branch_name_valid_hotfix(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test qu'un nom de hotfix valide passe."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_naming_policies.return_value = [_make_naming_policy()]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_branch_name(
            branch_name="hotfix/v1.2.3",
            branch_type="hotfix",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is True

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_branch_name_no_policy(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test sans politique - validation passe par défaut."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_naming_policies.return_value = []
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_branch_name(
            branch_name="any-branch-name",
            branch_type="custom",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is True

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_branch_name_policy_not_enforced(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test avec politique non enforced - validation passe."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_naming_policies.return_value = [
            _make_naming_policy(enforce_naming=False)
        ]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_branch_name(
            branch_name="invalid-name",
            branch_type="feature",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is True


class TestBranchPolicyValidatorWorkflow:
    """Tests pour la validation des workflows."""

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_workflow_valid_base_branch(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test qu'une branche avec base valide passe."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_policies_for_repo.return_value = [_make_workflow_policy()]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_workflow(
            operation="create",
            branch_name="feature/test",
            branch_type="feature",
            base_branch="develop",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is True

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_workflow_invalid_base_branch(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test qu'une branche avec base invalide échoue."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_policies_for_repo.return_value = [
            _make_workflow_policy(allowed_base_branches=["main", "develop"])
        ]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_workflow(
            operation="create",
            branch_name="feature/test",
            branch_type="feature",
            base_branch="staging",  # Non autorisé
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is False
        assert "workflow-policy" in result.violated_policies

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_workflow_missing_required_base(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test qu'une branche sans base échoue si base requise."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_policies_for_repo.return_value = [
            _make_workflow_policy(require_base_branch=True)
        ]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_workflow(
            operation="create",
            branch_name="feature/test",
            branch_type="feature",
            base_branch=None,  # Pas de branche base
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is False

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_workflow_no_policies(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test sans politique - validation passe."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_policies_for_repo.return_value = []
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_workflow(
            operation="create",
            branch_name="feature/test",
            branch_type="feature",
            base_branch=None,
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is True


class TestBranchPolicyValidatorMerge:
    """Tests pour la validation des méthodes de merge."""

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_merge_method_allowed(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test qu'une méthode de merge autorisée passe."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_policies_for_repo.return_value = [_make_merge_strategy_policy()]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_merge_method(
            merge_method="squash",
            target_branch_type="main",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is True

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_validate_merge_method_not_allowed(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test qu'une méthode de merge non autorisée échoue."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_policies_for_repo.return_value = [
            _make_merge_strategy_policy(allowed_merge_methods=["squash"])
        ]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        result = validator.validate_merge_method(
            merge_method="merge",  # Non autorisé
            target_branch_type="main",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.valid is False

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_get_default_merge_method(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test de récupération de la méthode de merge par défaut."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_policies_for_repo.return_value = [
            _make_merge_strategy_policy(default_merge_method="rebase")
        ]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        default_method = validator.get_default_merge_method(
            org_id="org_789",
            repo_id="repo_456",
        )

        assert default_method == "rebase"

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_get_default_merge_method_no_policy(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test sans politique - retourne 'merge' par défaut."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_policies_for_repo.return_value = []
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()
        default_method = validator.get_default_merge_method(
            org_id="org_789",
            repo_id="repo_456",
        )

        assert default_method == "merge"


class TestBranchPolicyValidatorIntegration:
    """Tests d'intégration pour le validateur de politiques."""

    @patch("app.services.branch_policy_validator.BranchPolicyRepo")
    def test_full_validation_flow(self, mock_policy_repo_cls: MagicMock) -> None:
        """Test du flow complet de validation."""
        mock_policy_repo = MagicMock()
        mock_policy_repo.get_naming_policies.return_value = [_make_naming_policy()]
        mock_policy_repo.get_policies_for_repo.return_value = [
            _make_workflow_policy(),
            _make_merge_strategy_policy(),
        ]
        mock_policy_repo_cls.return_value = mock_policy_repo

        validator = BranchPolicyValidator()

        # 1. Valider le nom
        name_result = validator.validate_branch_name(
            branch_name="feature/JIRA-456-new-feature",
            branch_type="feature",
            org_id="org_789",
            repo_id="repo_456",
        )
        assert name_result.valid is True

        # 2. Valider le workflow
        workflow_result = validator.validate_workflow(
            operation="create",
            branch_name="feature/JIRA-456-new-feature",
            branch_type="feature",
            base_branch="develop",
            org_id="org_789",
            repo_id="repo_456",
        )
        assert workflow_result.valid is True

        # 3. Valider la méthode de merge
        merge_result = validator.validate_merge_method(
            merge_method="squash",
            target_branch_type="develop",
            org_id="org_789",
            repo_id="repo_456",
        )
        assert merge_result.valid is True

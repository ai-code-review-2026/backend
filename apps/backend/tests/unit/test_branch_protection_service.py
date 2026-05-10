"""Tests unitaires pour BranchProtectionService."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.services.branch_protection import (
    BranchProtectionService,
    MergeRequestValidation,
    ValidationResult,
)


def _make_branch_data(
    branch_id: str = "branch_123",
    branch_type: str = "feature",
    is_protected: bool = False,
    org_id: str = "org_789",
    repo_id: str = "repo_456",
) -> dict[str, Any]:
    """Crée des données de branche de test."""
    return {
        "id": branch_id,
        "repo_id": repo_id,
        "org_id": org_id,
        "branch_name": f"{branch_type}/test",
        "branch_type": branch_type,
        "is_protected": is_protected,
        "is_default": branch_type == "main",
        "is_active": True,
    }


def _make_protection_rule(
    required_approvals: int = 1,
    require_review_from_lead: bool = False,
    block_direct_commits: bool = True,
    allow_force_pushes: bool = False,
    allow_deletions: bool = False,
    require_status_checks: bool = False,
    required_status_checks: list[str] | None = None,
    allowed_merge_roles: list[str] | None = None,
    allowed_push_roles: list[str] | None = None,
    bypass_roles: list[str] | None = None,
    is_active: bool = True,
) -> dict[str, Any]:
    """Crée une règle de protection de test."""
    return {
        "id": "rule_123",
        "branch_id": "branch_123",
        "org_id": "org_789",
        "repo_id": "repo_456",
        "required_approvals": required_approvals,
        "require_review_from_lead": require_review_from_lead,
        "block_direct_commits": block_direct_commits,
        "allow_force_pushes": allow_force_pushes,
        "allow_deletions": allow_deletions,
        "require_status_checks": require_status_checks,
        "required_status_checks": required_status_checks or [],
        "required_reviewer_roles": [],
        "allowed_merge_roles": allowed_merge_roles or [],
        "allowed_push_roles": allowed_push_roles or [],
        "bypass_roles": bypass_roles or [],
        "is_active": is_active,
        "enforcement_level": "strict",
    }


class TestValidationResult:
    """Tests pour ValidationResult dataclass."""

    def test_validation_result_allowed(self) -> None:
        """Test d'un résultat de validation autorisé."""
        result = ValidationResult(allowed=True, reason="Operation allowed")

        assert result.allowed is True
        assert result.reason == "Operation allowed"
        assert result.missing_requirements is None

    def test_validation_result_denied(self) -> None:
        """Test d'un résultat de validation refusé."""
        result = ValidationResult(
            allowed=False,
            reason="Missing approvals",
            missing_requirements=["Needs 2 more approvals"],
        )

        assert result.allowed is False
        assert result.missing_requirements == ["Needs 2 more approvals"]


class TestBranchProtectionService:
    """Tests pour BranchProtectionService."""

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_can_perform_operation_push_allowed_without_rules(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que push est autorisé sans règles de protection."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.return_value = _make_branch_data()
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo = MagicMock()
        mock_protection_repo.get_rules_for_branch.return_value = []
        mock_protection_repo.get_rules_by_type.return_value = []
        mock_protection_repo_cls.return_value = mock_protection_repo

        service = BranchProtectionService()
        result = service.can_perform_operation(
            operation="push",
            branch_id="branch_123",
            user_role="developer",
            user_permissions=["branches.push"],
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.allowed is True

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_can_perform_operation_push_blocked_by_protection(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que push est bloqué par règle de protection."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.return_value = _make_branch_data(is_protected=True)
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo = MagicMock()
        mock_protection_repo.get_rules_for_branch.return_value = [
            _make_protection_rule(block_direct_commits=True)
        ]
        mock_protection_repo.get_rules_by_type.return_value = []
        mock_protection_repo_cls.return_value = mock_protection_repo

        service = BranchProtectionService()
        result = service.can_perform_operation(
            operation="push",
            branch_id="branch_123",
            user_role="developer",
            user_permissions=["branches.push"],
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.allowed is False
        assert "blocked" in result.reason.lower()

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_can_perform_operation_force_push_denied(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que force push est refusé par défaut."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.return_value = _make_branch_data()
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo = MagicMock()
        mock_protection_repo.get_rules_for_branch.return_value = [
            _make_protection_rule(allow_force_pushes=False)
        ]
        mock_protection_repo.get_rules_by_type.return_value = []
        mock_protection_repo_cls.return_value = mock_protection_repo

        service = BranchProtectionService()
        result = service.can_perform_operation(
            operation="force_push",
            branch_id="branch_123",
            user_role="developer",
            user_permissions=["branches.force_push"],
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.allowed is False

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_can_perform_operation_delete_denied(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que suppression est refusée par règle de protection."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.return_value = _make_branch_data()
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo = MagicMock()
        mock_protection_repo.get_rules_for_branch.return_value = [
            _make_protection_rule(allow_deletions=False)
        ]
        mock_protection_repo.get_rules_by_type.return_value = []
        mock_protection_repo_cls.return_value = mock_protection_repo

        service = BranchProtectionService()
        result = service.can_perform_operation(
            operation="delete",
            branch_id="branch_123",
            user_role="developer",
            user_permissions=["branches.delete"],
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.allowed is False

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_admin_can_bypass_protection(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que admin peut bypass les protections."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.return_value = _make_branch_data(is_protected=True)
        mock_branch_repo_cls.return_value = mock_branch_repo

        # Note: service uses role == "admin" as automatic bypass
        mock_protection_repo = MagicMock()
        mock_protection_repo.get_rules_for_branch.return_value = [
            _make_protection_rule(block_direct_commits=True, bypass_roles=["admin"])
        ]
        mock_protection_repo.get_rules_by_type.return_value = []
        mock_protection_repo_cls.return_value = mock_protection_repo

        service = BranchProtectionService()
        result = service.can_perform_operation(
            operation="push",
            branch_id="branch_123",
            user_role="admin",
            user_permissions=["branches.push"],
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.allowed is True
        assert "bypass" in result.reason.lower()

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_can_perform_operation_branch_not_found(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test avec branche non trouvée."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.side_effect = ValueError("Branch not found")
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo_cls.return_value = MagicMock()

        service = BranchProtectionService()
        result = service.can_perform_operation(
            operation="push",
            branch_id="nonexistent",
            user_role="developer",
            user_permissions=["branches.push"],
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.allowed is False
        assert "not found" in result.reason.lower()


class TestMergeRequestValidation:
    """Tests pour la validation de merge requests."""

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_validate_merge_request_passes_with_no_rules(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que merge request passe sans règles."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.return_value = _make_branch_data(
            branch_id="target_branch",
            branch_type="develop",
        )
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo = MagicMock()
        mock_protection_repo.get_rules_for_branch.return_value = []
        mock_protection_repo.get_rules_by_type.return_value = []
        mock_protection_repo_cls.return_value = mock_protection_repo

        service = BranchProtectionService()
        result = service.validate_merge_request(
            source_branch_id="source_branch",
            target_branch_id="target_branch",
            current_approvals=["user_1"],
            current_approvals_by_role={"developer": 1},
            status_checks={"ci": "passing"},
            user_role="developer",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.can_merge is True

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_validate_merge_request_fails_with_insufficient_approvals(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que merge request échoue sans assez d'approbations."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.return_value = _make_branch_data(
            branch_id="target_branch",
            branch_type="main",
        )
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo = MagicMock()
        mock_protection_repo.get_rules_for_branch.return_value = [
            _make_protection_rule(required_approvals=2)
        ]
        mock_protection_repo.get_rules_by_type.return_value = []
        mock_protection_repo_cls.return_value = mock_protection_repo

        service = BranchProtectionService()
        result = service.validate_merge_request(
            source_branch_id="source_branch",
            target_branch_id="target_branch",
            current_approvals=["user_1"],  # Seulement 1 approbation
            current_approvals_by_role={"developer": 1},
            status_checks={"ci": "passing"},
            user_role="developer",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.can_merge is False
        assert "approval" in result.reason.lower()

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_validate_merge_request_fails_with_failing_checks(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que merge request échoue avec checks en échec."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.return_value = _make_branch_data(
            branch_id="target_branch",
            branch_type="main",
        )
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo = MagicMock()
        mock_protection_repo.get_rules_for_branch.return_value = [
            _make_protection_rule(
                required_approvals=1,
                require_status_checks=True,
                required_status_checks=["ci-tests", "security-scan"],
            )
        ]
        mock_protection_repo.get_rules_by_type.return_value = []
        mock_protection_repo_cls.return_value = mock_protection_repo

        service = BranchProtectionService()
        result = service.validate_merge_request(
            source_branch_id="source_branch",
            target_branch_id="target_branch",
            current_approvals=["user_1", "user_2"],
            current_approvals_by_role={"developer": 2},
            status_checks={"ci-tests": "passing", "security-scan": "failing"},
            user_role="developer",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.can_merge is False
        assert "security-scan" in result.reason

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_validate_merge_request_passes_all_requirements(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que merge request passe avec toutes les conditions remplies."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.get_by_id.return_value = _make_branch_data(
            branch_id="target_branch",
            branch_type="main",
        )
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo = MagicMock()
        mock_protection_repo.get_rules_for_branch.return_value = [
            _make_protection_rule(
                required_approvals=2,
                require_status_checks=True,
                required_status_checks=["ci-tests"],
            )
        ]
        mock_protection_repo.get_rules_by_type.return_value = []
        mock_protection_repo_cls.return_value = mock_protection_repo

        service = BranchProtectionService()
        result = service.validate_merge_request(
            source_branch_id="source_branch",
            target_branch_id="target_branch",
            current_approvals=["user_1", "user_2"],
            current_approvals_by_role={"reviewer_lead": 2},
            status_checks={"ci-tests": "passing"},
            user_role="reviewer_lead",
            org_id="org_789",
            repo_id="repo_456",
        )

        assert result.can_merge is True
        assert result.approval_status["current"] == 2


class TestApplyProtectionRule:
    """Tests pour apply_protection_rule."""

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_apply_protection_rule_updates_branches(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que apply_protection_rule met à jour les branches."""
        mock_branch_repo = MagicMock()
        mock_branch_repo.update.return_value = None
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo_cls.return_value = MagicMock()

        service = BranchProtectionService()
        result = service.apply_protection_rule(
            rule_id="rule_123",
            branch_ids=["branch_1", "branch_2", "branch_3"],
        )

        assert result["protected"] == 3
        assert result["failed"] == 0
        assert result["total"] == 3
        assert mock_branch_repo.update.call_count == 3

    @patch("app.services.branch_protection.BranchRepo")
    @patch("app.services.branch_protection.BranchProtectionRepo")
    def test_apply_protection_rule_handles_failures(
        self, mock_protection_repo_cls: MagicMock, mock_branch_repo_cls: MagicMock
    ) -> None:
        """Test que apply_protection_rule gère les erreurs."""
        mock_branch_repo = MagicMock()
        # First succeeds, second fails, third succeeds
        mock_branch_repo.update.side_effect = [None, Exception("DB Error"), None]
        mock_branch_repo_cls.return_value = mock_branch_repo

        mock_protection_repo_cls.return_value = MagicMock()

        service = BranchProtectionService()
        result = service.apply_protection_rule(
            rule_id="rule_123",
            branch_ids=["branch_1", "branch_2", "branch_3"],
        )

        assert result["protected"] == 2
        assert result["failed"] == 1
        assert result["total"] == 3

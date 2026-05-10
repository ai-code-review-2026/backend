"""Unit tests for BranchSyncService."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from app.services.branch_sync import BranchSyncResult, BranchSyncService


class TestBranchSyncService:
    """Tests for BranchSyncService."""

    @pytest.fixture
    def service(self) -> BranchSyncService:
        """Create a BranchSyncService instance with mocked repo."""
        with patch("app.services.branch_sync.BranchRepo") as mock_repo_class:
            mock_repo = MagicMock()
            mock_repo_class.return_value = mock_repo
            svc = BranchSyncService()
            svc.branch_repo = mock_repo
            return svc

    # ==========================================================================
    # handle_create_event tests
    # ==========================================================================

    def test_handle_create_event_branch_created(self, service: BranchSyncService) -> None:
        """Test creating a new branch from webhook."""
        service.branch_repo.get_by_repo_and_name.return_value = None
        service.branch_repo.create.return_value = {"id": "branch_123"}

        payload = {
            "ref_type": "branch",
            "ref": "feature/AUTH-123-login",
            "sender": {"login": "developer1"},
        }

        result = service.handle_create_event(payload, "org/repo", "org_1")

        assert result.success is True
        assert result.action == "created"
        assert result.branch_name == "feature/AUTH-123-login"
        assert result.branch_id == "branch_123"
        service.branch_repo.create.assert_called_once()

    def test_handle_create_event_tag_skipped(self, service: BranchSyncService) -> None:
        """Test that tags are skipped."""
        payload = {
            "ref_type": "tag",
            "ref": "v1.0.0",
        }

        result = service.handle_create_event(payload, "org/repo", None)

        assert result.success is True
        assert result.action == "skipped"
        assert "tag" in result.error.lower()
        service.branch_repo.create.assert_not_called()

    def test_handle_create_event_branch_already_exists(self, service: BranchSyncService) -> None:
        """Test when branch already exists and is active."""
        service.branch_repo.get_by_repo_and_name.return_value = {
            "id": "branch_existing",
            "is_active": True,
        }

        payload = {
            "ref_type": "branch",
            "ref": "main",
        }

        result = service.handle_create_event(payload, "org/repo", None)

        assert result.success is True
        assert result.action == "skipped"
        assert result.branch_id == "branch_existing"
        service.branch_repo.create.assert_not_called()

    def test_handle_create_event_branch_reactivated(self, service: BranchSyncService) -> None:
        """Test when inactive branch is reactivated."""
        service.branch_repo.get_by_repo_and_name.return_value = {
            "id": "branch_inactive",
            "is_active": False,
        }

        payload = {
            "ref_type": "branch",
            "ref": "feature/old-branch",
        }

        result = service.handle_create_event(payload, "org/repo", None)

        assert result.success is True
        assert result.action == "reactivated"
        assert result.branch_id == "branch_inactive"
        service.branch_repo.update.assert_called_once()

    def test_handle_create_event_exception(self, service: BranchSyncService) -> None:
        """Test handling exception during create."""
        service.branch_repo.get_by_repo_and_name.side_effect = Exception("DB error")

        payload = {
            "ref_type": "branch",
            "ref": "feature/test",
        }

        result = service.handle_create_event(payload, "org/repo", None)

        assert result.success is False
        assert result.action == "failed"
        assert "DB error" in result.error

    # ==========================================================================
    # handle_delete_event tests
    # ==========================================================================

    def test_handle_delete_event_branch_deleted(self, service: BranchSyncService) -> None:
        """Test marking a branch as deleted."""
        service.branch_repo.get_by_repo_and_name.return_value = {
            "id": "branch_to_delete",
            "is_active": True,
        }

        payload = {
            "ref_type": "branch",
            "ref": "feature/completed",
        }

        result = service.handle_delete_event(payload, "org/repo")

        assert result.success is True
        assert result.action == "deleted"
        assert result.branch_id == "branch_to_delete"
        service.branch_repo.update.assert_called_once()

    def test_handle_delete_event_tag_skipped(self, service: BranchSyncService) -> None:
        """Test that tag deletions are skipped."""
        payload = {
            "ref_type": "tag",
            "ref": "v1.0.0",
        }

        result = service.handle_delete_event(payload, "org/repo")

        assert result.success is True
        assert result.action == "skipped"

    def test_handle_delete_event_branch_not_found(self, service: BranchSyncService) -> None:
        """Test deleting a branch that doesn't exist in DB."""
        service.branch_repo.get_by_repo_and_name.return_value = None

        payload = {
            "ref_type": "branch",
            "ref": "feature/unknown",
        }

        result = service.handle_delete_event(payload, "org/repo")

        assert result.success is True
        assert result.action == "skipped"
        assert "not found" in result.error.lower()

    # ==========================================================================
    # handle_push_event tests
    # ==========================================================================

    def test_handle_push_event_updates_existing_branch(self, service: BranchSyncService) -> None:
        """Test updating branch metadata on push."""
        service.branch_repo.get_by_repo_and_name.return_value = {
            "id": "branch_main",
            "branch_name": "main",
        }

        payload = {
            "ref": "refs/heads/main",
            "head_commit": {
                "id": "abc123def456",
                "message": "Fix bug in login",
                "author": {"email": "dev@example.com"},
                "timestamp": "2026-03-25T10:00:00Z",
            },
        }

        result = service.handle_push_event(payload, "org/repo", None)

        assert result.success is True
        assert result.action == "updated"
        assert result.branch_name == "main"
        service.branch_repo.update.assert_called_once()

    def test_handle_push_event_creates_missing_branch(self, service: BranchSyncService) -> None:
        """Test creating branch on push if it doesn't exist."""
        service.branch_repo.get_by_repo_and_name.return_value = None
        service.branch_repo.create.return_value = {"id": "branch_new"}
        service.branch_repo.get_by_id.return_value = {"id": "branch_new"}

        payload = {
            "ref": "refs/heads/feature/new-feature",
            "head_commit": {
                "id": "abc123",
                "message": "Initial commit",
                "author": {"name": "Developer"},
            },
            "repository": {"default_branch": "main"},
        }

        result = service.handle_push_event(payload, "org/repo", "org_1")

        assert result.success is True
        assert result.action == "created"
        service.branch_repo.create.assert_called_once()

    def test_handle_push_event_non_branch_ref(self, service: BranchSyncService) -> None:
        """Test that non-branch refs (tags) are skipped."""
        payload = {
            "ref": "refs/tags/v1.0.0",
        }

        result = service.handle_push_event(payload, "org/repo", None)

        assert result.success is True
        assert result.action == "skipped"
        assert "Not a branch" in result.error

    # ==========================================================================
    # handle_pull_request_event tests
    # ==========================================================================

    def test_handle_pull_request_event_syncs_both_branches(
        self, service: BranchSyncService
    ) -> None:
        """Test syncing both source and target branches from PR."""
        # Mock for source branch (doesn't exist)
        def get_by_repo_mock(repo, name):
            if name == "feature/pr-branch":
                return None
            return {"id": "branch_main", "branch_name": "main"}

        service.branch_repo.get_by_repo_and_name.side_effect = get_by_repo_mock
        service.branch_repo.create.return_value = {"id": "branch_feature"}
        service.branch_repo.get_by_id.return_value = {"id": "branch_feature"}

        payload = {
            "pull_request": {
                "head": {"ref": "feature/pr-branch", "sha": "abc123"},
                "base": {"ref": "main", "sha": "def456"},
            }
        }

        results = service.handle_pull_request_event(payload, "org/repo", "org_1")

        assert "source" in results
        assert "target" in results
        assert results["source"].success is True
        assert results["target"].success is True

    def test_handle_pull_request_event_invalid_payload(
        self, service: BranchSyncService
    ) -> None:
        """Test handling invalid PR payload."""
        payload = {
            "pull_request": "invalid"
        }

        results = service.handle_pull_request_event(payload, "org/repo", None)

        assert "error" in results
        assert results["error"].success is False

    # ==========================================================================
    # _determine_branch_type tests
    # ==========================================================================

    @pytest.mark.parametrize(
        "branch_name,expected_type",
        [
            ("main", "main"),
            ("master", "main"),
            ("develop", "develop"),
            ("development", "develop"),
            ("dev", "develop"),
            ("feature/AUTH-123", "feature"),
            ("feat/new-login", "feature"),
            ("hotfix/v1.0.1", "hotfix"),
            ("fix/urgent-bug", "hotfix"),
            ("release/v2.0.0", "release"),
            ("rel/1.0", "release"),
            ("custom-branch", "custom"),
            ("my-branch-name", "custom"),
        ],
    )
    def test_determine_branch_type(
        self, service: BranchSyncService, branch_name: str, expected_type: str
    ) -> None:
        """Test branch type determination from name."""
        result = service._determine_branch_type(branch_name)
        assert result == expected_type

    # ==========================================================================
    # _get_branch_pattern tests
    # ==========================================================================

    @pytest.mark.parametrize(
        "branch_type,expected_pattern",
        [
            ("feature", "feature/*"),
            ("hotfix", "hotfix/*"),
            ("release", "release/*"),
            ("main", None),
            ("develop", None),
            ("custom", None),
        ],
    )
    def test_get_branch_pattern(
        self, service: BranchSyncService, branch_type: str, expected_pattern: str | None
    ) -> None:
        """Test getting branch pattern for a type."""
        result = service._get_branch_pattern(branch_type)
        assert result == expected_pattern


class TestBranchSyncResult:
    """Tests for BranchSyncResult dataclass."""

    def test_sync_result_creation(self) -> None:
        """Test creating a sync result."""
        result = BranchSyncResult(
            branch_id="branch_123",
            action="created",
            branch_name="feature/test",
            success=True,
        )

        assert result.branch_id == "branch_123"
        assert result.action == "created"
        assert result.branch_name == "feature/test"
        assert result.success is True
        assert result.error is None

    def test_sync_result_with_error(self) -> None:
        """Test creating a sync result with error."""
        result = BranchSyncResult(
            branch_id=None,
            action="failed",
            branch_name="unknown",
            success=False,
            error="Database connection failed",
        )

        assert result.branch_id is None
        assert result.success is False
        assert result.error == "Database connection failed"

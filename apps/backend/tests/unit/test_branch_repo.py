"""Tests unitaires pour BranchRepo."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from app.data.repos.branch_repo import (
    BranchFilters,
    BranchRepo,
    CreateBranchInput,
    UpdateBranchInput,
)


class MockRow:
    """Mock pour les résultats de requêtes SQL."""

    def __init__(self, data: dict[str, Any]) -> None:
        self._data = data

    def __getitem__(self, key: str) -> Any:
        return self._data[key]

    def keys(self) -> list[str]:
        return list(self._data.keys())


class MockResult:
    """Mock pour les résultats de requêtes SQL."""

    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def mappings(self) -> MockResult:
        return self

    def first(self) -> MockRow | None:
        return MockRow(self._rows[0]) if self._rows else None

    def all(self) -> list[MockRow]:
        return [MockRow(r) for r in self._rows]


def _make_branch_data(
    branch_id: str = "branch_123",
    repo_id: str = "repo_456",
    org_id: str = "org_789",
    branch_name: str = "feature/test-branch",
    branch_type: str = "feature",
) -> dict[str, Any]:
    """Crée des données de branche de test."""
    return {
        "id": branch_id,
        "repo_id": repo_id,
        "org_id": org_id,
        "branch_name": branch_name,
        "branch_type": branch_type,
        "branch_pattern": "feature/*",
        "last_commit_sha": "abc123",
        "last_commit_author": "developer@test.com",
        "last_commit_message": "Test commit",
        "last_commit_at": datetime.now(),
        "created_by": "user_123",
        "created_at": datetime.now(),
        "base_branch": "develop",
        "merged_into": None,
        "merge_status": None,
        "merged_at": None,
        "merged_by": None,
        "is_protected": False,
        "is_default": False,
        "is_active": True,
        "ahead_count": 5,
        "behind_count": 2,
        "last_synced_at": None,
        "description": "Test branch",
        "metadata_json": {},
        "updated_at": datetime.now(),
    }


class TestCreateBranchInput:
    """Tests pour CreateBranchInput dataclass."""

    def test_create_branch_input_defaults(self) -> None:
        """Test des valeurs par défaut de CreateBranchInput."""
        input_data = CreateBranchInput(
            branch_id="branch_123",
            repo_id="repo_456",
            org_id="org_789",
            branch_name="feature/test",
            branch_type="feature",
        )

        assert input_data.branch_id == "branch_123"
        assert input_data.is_protected is False
        assert input_data.is_default is False
        assert input_data.is_active is True
        assert input_data.metadata_json == {}

    def test_create_branch_input_with_all_fields(self) -> None:
        """Test de CreateBranchInput avec tous les champs."""
        input_data = CreateBranchInput(
            branch_id="branch_123",
            repo_id="repo_456",
            org_id="org_789",
            branch_name="main",
            branch_type="main",
            branch_pattern=None,
            created_by="user_123",
            base_branch=None,
            description="Main branch",
            is_protected=True,
            is_default=True,
            is_active=True,
            metadata_json={"key": "value"},
        )

        assert input_data.is_protected is True
        assert input_data.is_default is True
        assert input_data.metadata_json == {"key": "value"}


class TestBranchFilters:
    """Tests pour BranchFilters dataclass."""

    def test_empty_filters(self) -> None:
        """Test des filtres vides."""
        filters = BranchFilters()

        assert filters.repo_id is None
        assert filters.org_id is None
        assert filters.branch_type is None

    def test_filters_with_values(self) -> None:
        """Test des filtres avec valeurs."""
        filters = BranchFilters(
            repo_id="repo_123",
            org_id="org_456",
            branch_type="feature",
            is_protected=True,
            is_active=True,
        )

        assert filters.repo_id == "repo_123"
        assert filters.branch_type == "feature"
        assert filters.is_protected is True


class TestBranchRepo:
    """Tests pour BranchRepo."""

    @patch("app.data.repos.branch_repo.get_engine")
    def test_get_by_id_returns_branch(self, mock_get_engine: MagicMock) -> None:
        """Test que get_by_id retourne une branche."""
        branch_data = _make_branch_data()

        mock_conn = MagicMock()
        mock_conn.execute.return_value = MockResult([branch_data])
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn
        mock_get_engine.return_value = mock_engine

        repo = BranchRepo()
        result = repo.get_by_id("branch_123")

        assert result["id"] == "branch_123"
        assert result["branch_name"] == "feature/test-branch"
        assert result["branch_type"] == "feature"

    @patch("app.data.repos.branch_repo.get_engine")
    def test_get_by_id_raises_error_when_not_found(self, mock_get_engine: MagicMock) -> None:
        """Test que get_by_id lève une erreur si branche non trouvée."""
        mock_conn = MagicMock()
        mock_conn.execute.return_value = MockResult([])
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn
        mock_get_engine.return_value = mock_engine

        repo = BranchRepo()

        with pytest.raises(ValueError, match="Branch not found"):
            repo.get_by_id("nonexistent_branch")

    @patch("app.data.repos.branch_repo.get_engine")
    def test_get_by_repo_and_name_returns_branch(self, mock_get_engine: MagicMock) -> None:
        """Test que get_by_repo_and_name retourne une branche."""
        branch_data = _make_branch_data()

        mock_conn = MagicMock()
        mock_conn.execute.return_value = MockResult([branch_data])
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn
        mock_get_engine.return_value = mock_engine

        repo = BranchRepo()
        result = repo.get_by_repo_and_name("repo_456", "feature/test-branch")

        assert result is not None
        assert result["branch_name"] == "feature/test-branch"

    @patch("app.data.repos.branch_repo.get_engine")
    def test_get_by_repo_and_name_returns_none_when_not_found(self, mock_get_engine: MagicMock) -> None:
        """Test que get_by_repo_and_name retourne None si non trouvée."""
        mock_conn = MagicMock()
        mock_conn.execute.return_value = MockResult([])
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn
        mock_get_engine.return_value = mock_engine

        repo = BranchRepo()
        result = repo.get_by_repo_and_name("repo_456", "nonexistent")

        assert result is None

    @patch("app.data.repos.branch_repo.get_engine")
    def test_list_branches_with_filters(self, mock_get_engine: MagicMock) -> None:
        """Test que list_branches applique les filtres correctement."""
        branches = [
            _make_branch_data(branch_id="branch_1", branch_name="feature/a"),
            _make_branch_data(branch_id="branch_2", branch_name="feature/b"),
        ]

        mock_conn = MagicMock()
        # First call for count, second call for data
        mock_conn.execute.side_effect = [
            MagicMock(first=lambda: (2,)),  # Count result
            MockResult(branches),  # Data result
        ]
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn
        mock_get_engine.return_value = mock_engine

        repo = BranchRepo()
        filters = BranchFilters(repo_id="repo_456", branch_type="feature")
        result, total = repo.list_branches(filters, limit=10, offset=0)

        assert total == 2
        assert len(result) == 2

    @patch("app.data.repos.branch_repo.get_engine")
    def test_get_default_branch_returns_branch(self, mock_get_engine: MagicMock) -> None:
        """Test que get_default_branch retourne la branche par défaut."""
        branch_data = _make_branch_data(
            branch_name="main",
            branch_type="main",
        )
        branch_data["is_default"] = True

        mock_conn = MagicMock()
        mock_conn.execute.return_value = MockResult([branch_data])
        mock_conn.__enter__ = MagicMock(return_value=mock_conn)
        mock_conn.__exit__ = MagicMock(return_value=False)

        mock_engine = MagicMock()
        mock_engine.connect.return_value = mock_conn
        mock_get_engine.return_value = mock_engine

        repo = BranchRepo()
        result = repo.get_default_branch("repo_456")

        assert result is not None
        assert result["is_default"] is True
        assert result["branch_name"] == "main"


class TestUpdateBranchInput:
    """Tests pour UpdateBranchInput dataclass."""

    def test_update_branch_input_partial_update(self) -> None:
        """Test de mise à jour partielle."""
        input_data = UpdateBranchInput(
            branch_id="branch_123",
            description="Updated description",
            is_protected=True,
        )

        assert input_data.branch_id == "branch_123"
        assert input_data.description == "Updated description"
        assert input_data.is_protected is True
        assert input_data.is_active is None  # Non spécifié

    def test_update_branch_input_git_metadata(self) -> None:
        """Test de mise à jour des métadonnées Git."""
        now = datetime.now()
        input_data = UpdateBranchInput(
            branch_id="branch_123",
            last_commit_sha="def456",
            last_commit_author="dev@test.com",
            last_commit_message="New commit",
            last_commit_at=now,
        )

        assert input_data.last_commit_sha == "def456"
        assert input_data.last_commit_at == now

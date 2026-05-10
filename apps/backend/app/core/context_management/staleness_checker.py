"""Staleness Checker for project context.

Determines if context needs to be refreshed based on age and changes.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any

from app.settings import settings

logger = logging.getLogger(__name__)


class StalenessStatus(str, Enum):
    """Status of context staleness."""

    FRESH = "fresh"
    STALE_BY_AGE = "stale_by_age"
    STALE_BY_CHANGES = "stale_by_changes"
    STALE_BY_VERSION = "stale_by_version"
    UNKNOWN = "unknown"


@dataclass
class StalenessResult:
    """Result of staleness check."""

    is_stale: bool
    status: StalenessStatus
    age_hours: float | None = None
    reason: str | None = None
    recommended_action: str = "none"

    def to_dict(self) -> dict[str, Any]:
        return {
            "is_stale": self.is_stale,
            "status": self.status.value,
            "age_hours": self.age_hours,
            "reason": self.reason,
            "recommended_action": self.recommended_action,
        }


class StalenessChecker:
    """Checks if project context is stale.

    Staleness can be determined by:
    1. Age - context older than configured threshold
    2. Changes - significant changes to the repository
    3. Version - newer context version available
    """

    def __init__(self):
        self._max_age_hours = settings.ANTI_HALLUCINATION_MAX_CONTEXT_AGE_HOURS
        self._force_refresh_on_stale = settings.ANTI_HALLUCINATION_REQUIRE_GROUNDING

    def check(
        self,
        last_updated: datetime | None,
        current_version: int | None = None,
        latest_version: int | None = None,
        recent_commits: int = 0,
    ) -> StalenessResult:
        """Check if context is stale.

        Args:
            last_updated: When the context was last updated
            current_version: Current context version in use
            latest_version: Latest available version
            recent_commits: Number of commits since last update

        Returns:
            StalenessResult with details
        """
        # No last_updated - unknown state
        if not last_updated:
            return StalenessResult(
                is_stale=True,
                status=StalenessStatus.UNKNOWN,
                reason="Context has never been updated",
                recommended_action="full_refresh",
            )

        now = datetime.now(timezone.utc)

        # Ensure last_updated is timezone-aware
        if last_updated.tzinfo is None:
            last_updated = last_updated.replace(tzinfo=timezone.utc)

        age = now - last_updated
        age_hours = age.total_seconds() / 3600

        # Check age
        if age_hours > self._max_age_hours:
            return StalenessResult(
                is_stale=True,
                status=StalenessStatus.STALE_BY_AGE,
                age_hours=age_hours,
                reason=f"Context is {age_hours:.1f} hours old (max: {self._max_age_hours})",
                recommended_action="full_refresh" if age_hours > self._max_age_hours * 2 else "incremental_update",
            )

        # Check version mismatch
        if current_version is not None and latest_version is not None:
            if current_version < latest_version:
                return StalenessResult(
                    is_stale=True,
                    status=StalenessStatus.STALE_BY_VERSION,
                    age_hours=age_hours,
                    reason=f"Context version {current_version} is behind latest {latest_version}",
                    recommended_action="incremental_update",
                )

        # Check significant changes
        if recent_commits > 10:
            return StalenessResult(
                is_stale=True,
                status=StalenessStatus.STALE_BY_CHANGES,
                age_hours=age_hours,
                reason=f"{recent_commits} commits since last update",
                recommended_action="incremental_update",
            )

        # Context is fresh
        return StalenessResult(
            is_stale=False,
            status=StalenessStatus.FRESH,
            age_hours=age_hours,
            reason=None,
            recommended_action="none",
        )

    def should_force_refresh(self, result: StalenessResult) -> bool:
        """Determine if a forced refresh is needed."""
        if not self._force_refresh_on_stale:
            return False

        return result.recommended_action == "full_refresh"

    def get_refresh_priority(self, result: StalenessResult) -> int:
        """Get priority for refresh queue (lower = higher priority).

        Returns:
            Priority level 0-100 (0 = immediate, 100 = no rush)
        """
        if result.status == StalenessStatus.UNKNOWN:
            return 0  # Highest priority

        if result.status == StalenessStatus.STALE_BY_AGE:
            # Priority based on how much over the limit
            if result.age_hours and result.age_hours > self._max_age_hours * 3:
                return 10
            elif result.age_hours and result.age_hours > self._max_age_hours * 2:
                return 25
            return 50

        if result.status == StalenessStatus.STALE_BY_VERSION:
            return 30

        if result.status == StalenessStatus.STALE_BY_CHANGES:
            return 40

        return 100  # Fresh - no refresh needed

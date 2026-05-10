"""Data models for project settings and auto-analysis toggle.

This module provides:
- ProjectSettings: Per-project configuration including auto-analysis toggle
- ProjectSettingsAuditEntry: Audit log entries for settings changes
- AutoAnalysisState: Computed state considering temporary disables
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class AutoAnalysisAction(str, Enum):
    """Actions that can be performed on auto-analysis toggle."""
    
    ENABLED = "auto_analysis_enabled"
    DISABLED = "auto_analysis_disabled"
    TEMP_DISABLED = "auto_analysis_temp_disabled"
    TEMP_DISABLED_EXPIRED = "auto_analysis_temp_disabled_expired"
    SETTINGS_UPDATED = "settings_updated"


class AutoAnalysisEffectiveState(str, Enum):
    """The effective state of auto-analysis considering all factors."""
    
    ENABLED = "enabled"
    DISABLED = "disabled"
    TEMPORARILY_DISABLED = "temporarily_disabled"


@dataclass
class ProjectSettings:
    """Per-project settings including auto-analysis configuration."""
    
    id: str
    project_id: str
    organization_id: str | None
    
    # Auto-analysis toggle
    auto_analysis_enabled: bool
    auto_analysis_disabled_until: datetime | None
    auto_analysis_disabled_reason: str | None
    auto_analysis_last_changed_by: str | None
    auto_analysis_last_changed_at: datetime | None
    
    # Additional settings (JSON extensible)
    settings_json: dict[str, Any] = field(default_factory=dict)
    
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @property
    def effective_state(self) -> AutoAnalysisEffectiveState:
        """Calculate the effective state of auto-analysis.
        
        Returns:
            - ENABLED: Toggle is on and no temporary disable is active
            - DISABLED: Toggle is explicitly off
            - TEMPORARILY_DISABLED: Toggle is on but temporary disable is active
        """
        if not self.auto_analysis_enabled:
            return AutoAnalysisEffectiveState.DISABLED
        
        if self.auto_analysis_disabled_until is not None:
            now = datetime.now(timezone.utc)
            # Handle timezone-aware datetimes
            disabled_until = self.auto_analysis_disabled_until
            if disabled_until.tzinfo is not None:
                # already using timezone-aware now
                pass
            
            if disabled_until > now:
                return AutoAnalysisEffectiveState.TEMPORARILY_DISABLED
        
        return AutoAnalysisEffectiveState.ENABLED

    @property
    def is_analysis_allowed(self) -> bool:
        """Check if automatic analysis should be triggered.
        
        This is the primary check used by webhook handlers.
        """
        return self.effective_state == AutoAnalysisEffectiveState.ENABLED

    @property
    def temporary_disable_remaining_seconds(self) -> int | None:
        """Get remaining seconds for temporary disable, or None if not active."""
        if self.auto_analysis_disabled_until is None:
            return None
        
        now = datetime.now(timezone.utc)
        disabled_until = self.auto_analysis_disabled_until
        
        # Handle timezone-aware datetimes (we already use timezone-aware now)
        if disabled_until.tzinfo is not None:
            pass
        
        remaining = (disabled_until - now).total_seconds()
        return max(0, int(remaining)) if remaining > 0 else None


@dataclass
class ProjectSettingsAuditEntry:
    """Audit log entry for project settings changes."""
    
    id: str
    project_id: str
    user_id: str | None
    user_email: str
    user_display_name: str | None
    
    action: AutoAnalysisAction
    previous_state: dict[str, Any]
    new_state: dict[str, Any]
    
    reason: str | None
    ip_address: str | None
    user_agent: str | None
    
    metadata_json: dict[str, Any] = field(default_factory=dict)
    created_at: datetime | None = None


@dataclass
class AutoAnalysisStateResponse:
    """API response model for auto-analysis state."""
    
    project_id: str
    enabled: bool
    effective_state: str
    is_analysis_allowed: bool
    
    # Temporary disable info
    temporarily_disabled_until: datetime | None = None
    temporarily_disabled_reason: str | None = None
    temporary_disable_remaining_seconds: int | None = None
    
    # Last change info
    last_changed_by: str | None = None
    last_changed_at: datetime | None = None
    
    # Permissions (for UI)
    can_modify: bool = False

    @classmethod
    def from_settings(
        cls,
        settings: ProjectSettings,
        can_modify: bool = False,
    ) -> "AutoAnalysisStateResponse":
        """Create response from ProjectSettings instance."""
        return cls(
            project_id=settings.project_id,
            enabled=settings.auto_analysis_enabled,
            effective_state=settings.effective_state.value,
            is_analysis_allowed=settings.is_analysis_allowed,
            temporarily_disabled_until=settings.auto_analysis_disabled_until,
            temporarily_disabled_reason=settings.auto_analysis_disabled_reason,
            temporary_disable_remaining_seconds=settings.temporary_disable_remaining_seconds,
            last_changed_by=settings.auto_analysis_last_changed_by,
            last_changed_at=settings.auto_analysis_last_changed_at,
            can_modify=can_modify,
        )


@dataclass
class UpdateAutoAnalysisRequest:
    """Request model for updating auto-analysis toggle."""
    
    enabled: bool
    reason: str | None = None


@dataclass
class TemporaryDisableRequest:
    """Request model for temporarily disabling auto-analysis."""
    
    duration_minutes: int
    reason: str | None = None
    
    def __post_init__(self) -> None:
        # Validate duration (1 minute to 24 hours)
        if self.duration_minutes < 1:
            raise ValueError("Duration must be at least 1 minute")
        if self.duration_minutes > 1440:  # 24 hours
            raise ValueError("Duration cannot exceed 24 hours (1440 minutes)")


# Common duration presets for temporary disable
TEMPORARY_DISABLE_PRESETS = [
    {"label": "5 minutes", "minutes": 5},
    {"label": "15 minutes", "minutes": 15},
    {"label": "30 minutes", "minutes": 30},
    {"label": "1 hour", "minutes": 60},
    {"label": "2 hours", "minutes": 120},
    {"label": "4 hours", "minutes": 240},
]

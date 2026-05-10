"""Repository for project settings and auto-analysis toggle management.

This module provides thread-safe database operations for:
- Reading and updating project settings
- Managing auto-analysis toggle state
- Recording audit log entries
- Handling temporary disable expiration
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.data.database import get_engine
from app.data.models.project_settings import (
    AutoAnalysisAction,
    ProjectSettings,
    ProjectSettingsAuditEntry,
)


_SETTINGS_LOCK = Lock()


class ProjectSettingsRepo:
    """Repository for project settings operations."""

    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def _generate_id(self, prefix: str = "ps") -> str:
        """Generate a unique ID with prefix."""
        return f"{prefix}_{uuid.uuid4().hex[:16]}"

    def get_settings(self, project_id: str) -> ProjectSettings | None:
        """Get project settings by project ID.
        
        Args:
            project_id: The project/repository identifier (e.g., "owner/repo")
            
        Returns:
            ProjectSettings if found, None otherwise
        """
        normalized_project_id = project_id.strip().lower()
        
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        SELECT 
                            id, project_id, organization_id,
                            auto_analysis_enabled, auto_analysis_disabled_until,
                            auto_analysis_disabled_reason, auto_analysis_last_changed_by,
                            auto_analysis_last_changed_at, settings_json,
                            created_at, updated_at
                        FROM project_settings
                        WHERE project_id = :project_id
                        LIMIT 1
                        """
                    ),
                    {"project_id": normalized_project_id},
                )
                .mappings()
                .first()
            )
            
            if row is None:
                return None
            
            return self._row_to_settings(row)

    def get_or_create_settings(
        self,
        project_id: str,
        organization_id: str | None = None,
    ) -> ProjectSettings:
        """Get existing settings or create default settings for a project.
        
        This is the recommended method for ensuring settings exist before
        checking auto-analysis state.
        
        Args:
            project_id: The project/repository identifier
            organization_id: Optional organization ID for scoping
            
        Returns:
            ProjectSettings (existing or newly created)
        """
        normalized_project_id = project_id.strip().lower()
        
        # Try to get existing settings first
        existing = self.get_settings(normalized_project_id)
        if existing is not None:
            return existing
        
        # Create new settings with defaults
        with _SETTINGS_LOCK:
            with self._engine.begin() as conn:
                settings_id = self._generate_id("ps")
                now = datetime.now(timezone.utc)
                
                conn.execute(
                    text(
                        """
                        INSERT INTO project_settings (
                            id, project_id, organization_id,
                            auto_analysis_enabled, settings_json,
                            created_at, updated_at
                        )
                        VALUES (
                            :id, :project_id, :organization_id,
                            TRUE, :settings_json,
                            :created_at, :updated_at
                        )
                        ON CONFLICT (project_id) DO NOTHING
                        """
                    ),
                    {
                        "id": settings_id,
                        "project_id": normalized_project_id,
                        "organization_id": organization_id,
                        "settings_json": json.dumps({}),
                        "created_at": now,
                        "updated_at": now,
                    },
                )
        
        # Return the settings (either just created or existing due to race)
        return self.get_settings(normalized_project_id) or ProjectSettings(
            id=settings_id,
            project_id=normalized_project_id,
            organization_id=organization_id,
            auto_analysis_enabled=True,
            auto_analysis_disabled_until=None,
            auto_analysis_disabled_reason=None,
            auto_analysis_last_changed_by=None,
            auto_analysis_last_changed_at=None,
            settings_json={},
            created_at=now,
            updated_at=now,
        )

    def is_auto_analysis_enabled(self, project_id: str) -> bool:
        """Quick check if auto-analysis is enabled for a project.
        
        This method handles:
        - Missing settings (returns True - enabled by default)
        - Temporary disable expiration
        
        Args:
            project_id: The project/repository identifier
            
        Returns:
            True if analysis should be triggered, False otherwise
        """
        settings = self.get_settings(project_id)
        
        if settings is None:
            # No settings = default behavior (enabled)
            return True
        
        return settings.is_analysis_allowed

    def update_auto_analysis_enabled(
        self,
        project_id: str,
        enabled: bool,
        user_id: str | None,
        user_email: str,
        user_display_name: str | None = None,
        reason: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> ProjectSettings:
        """Update the auto-analysis toggle for a project.
        
        Args:
            project_id: The project/repository identifier
            enabled: New toggle state
            user_id: ID of user making the change
            user_email: Email of user making the change
            user_display_name: Display name of user
            reason: Optional reason for the change
            ip_address: Optional IP address for audit
            user_agent: Optional user agent for audit
            
        Returns:
            Updated ProjectSettings
        """
        normalized_project_id = project_id.strip().lower()
        
        # Ensure settings exist
        current_settings = self.get_or_create_settings(normalized_project_id)
        
        # Build previous state for audit
        previous_state = {
            "auto_analysis_enabled": current_settings.auto_analysis_enabled,
            "auto_analysis_disabled_until": (
                current_settings.auto_analysis_disabled_until.isoformat()
                if current_settings.auto_analysis_disabled_until
                else None
            ),
            "auto_analysis_disabled_reason": current_settings.auto_analysis_disabled_reason,
        }
        
        now = datetime.now(timezone.utc)
        action = AutoAnalysisAction.ENABLED if enabled else AutoAnalysisAction.DISABLED
        
        with _SETTINGS_LOCK:
            with self._engine.begin() as conn:
                # Update settings
                conn.execute(
                    text(
                        """
                        UPDATE project_settings
                        SET 
                            auto_analysis_enabled = :enabled,
                            auto_analysis_disabled_until = NULL,
                            auto_analysis_disabled_reason = :reason,
                            auto_analysis_last_changed_by = :user_id,
                            auto_analysis_last_changed_at = :changed_at,
                            updated_at = :updated_at
                        WHERE project_id = :project_id
                        """
                    ),
                    {
                        "project_id": normalized_project_id,
                        "enabled": enabled,
                        "reason": reason if not enabled else None,
                        "user_id": user_id,
                        "changed_at": now,
                        "updated_at": now,
                    },
                )
                
                # Build new state for audit
                new_state = {
                    "auto_analysis_enabled": enabled,
                    "auto_analysis_disabled_until": None,
                    "auto_analysis_disabled_reason": reason if not enabled else None,
                }
                
                # Create audit log entry
                self._create_audit_entry(
                    conn=conn,
                    project_id=normalized_project_id,
                    user_id=user_id,
                    user_email=user_email,
                    user_display_name=user_display_name,
                    action=action,
                    previous_state=previous_state,
                    new_state=new_state,
                    reason=reason,
                    ip_address=ip_address,
                    user_agent=user_agent,
                )
        
        return self.get_settings(normalized_project_id)  # type: ignore

    def set_temporary_disable(
        self,
        project_id: str,
        duration_minutes: int,
        user_id: str | None,
        user_email: str,
        user_display_name: str | None = None,
        reason: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> ProjectSettings:
        """Temporarily disable auto-analysis for a project.
        
        The toggle remains enabled, but analysis is paused until the
        expiration time.
        
        Args:
            project_id: The project/repository identifier
            duration_minutes: How long to disable (1-1440 minutes)
            user_id: ID of user making the change
            user_email: Email of user making the change
            user_display_name: Display name of user
            reason: Optional reason for the temporary disable
            ip_address: Optional IP address for audit
            user_agent: Optional user agent for audit
            
        Returns:
            Updated ProjectSettings
            
        Raises:
            ValueError: If duration is out of valid range
        """
        if duration_minutes < 1 or duration_minutes > 1440:
            raise ValueError("Duration must be between 1 and 1440 minutes")
        
        normalized_project_id = project_id.strip().lower()
        
        # Ensure settings exist
        current_settings = self.get_or_create_settings(normalized_project_id)
        
        # Build previous state for audit
        previous_state = {
            "auto_analysis_enabled": current_settings.auto_analysis_enabled,
            "auto_analysis_disabled_until": (
                current_settings.auto_analysis_disabled_until.isoformat()
                if current_settings.auto_analysis_disabled_until
                else None
            ),
            "auto_analysis_disabled_reason": current_settings.auto_analysis_disabled_reason,
        }
        
        now = datetime.now(timezone.utc)
        disabled_until = now + timedelta(minutes=duration_minutes)
        
        with _SETTINGS_LOCK:
            with self._engine.begin() as conn:
                # Update settings with temporary disable
                conn.execute(
                    text(
                        """
                        UPDATE project_settings
                        SET 
                            auto_analysis_disabled_until = :disabled_until,
                            auto_analysis_disabled_reason = :reason,
                            auto_analysis_last_changed_by = :user_id,
                            auto_analysis_last_changed_at = :changed_at,
                            updated_at = :updated_at
                        WHERE project_id = :project_id
                        """
                    ),
                    {
                        "project_id": normalized_project_id,
                        "disabled_until": disabled_until,
                        "reason": reason,
                        "user_id": user_id,
                        "changed_at": now,
                        "updated_at": now,
                    },
                )
                
                # Build new state for audit
                new_state = {
                    "auto_analysis_enabled": current_settings.auto_analysis_enabled,
                    "auto_analysis_disabled_until": disabled_until.isoformat(),
                    "auto_analysis_disabled_reason": reason,
                    "duration_minutes": duration_minutes,
                }
                
                # Create audit log entry
                self._create_audit_entry(
                    conn=conn,
                    project_id=normalized_project_id,
                    user_id=user_id,
                    user_email=user_email,
                    user_display_name=user_display_name,
                    action=AutoAnalysisAction.TEMP_DISABLED,
                    previous_state=previous_state,
                    new_state=new_state,
                    reason=reason,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    metadata={"duration_minutes": duration_minutes},
                )
        
        return self.get_settings(normalized_project_id)  # type: ignore

    def clear_temporary_disable(
        self,
        project_id: str,
        user_id: str | None = None,
        user_email: str = "system",
        reason: str = "Temporary disable expired",
    ) -> ProjectSettings | None:
        """Clear temporary disable for a project.
        
        This is called when temporary disable expires or is manually cleared.
        
        Args:
            project_id: The project/repository identifier
            user_id: ID of user clearing (None for system)
            user_email: Email for audit ("system" for automatic expiration)
            reason: Reason for clearing
            
        Returns:
            Updated ProjectSettings, or None if settings don't exist
        """
        normalized_project_id = project_id.strip().lower()
        
        current_settings = self.get_settings(normalized_project_id)
        if current_settings is None:
            return None
        
        if current_settings.auto_analysis_disabled_until is None:
            return current_settings  # Nothing to clear
        
        previous_state = {
            "auto_analysis_disabled_until": current_settings.auto_analysis_disabled_until.isoformat(),
            "auto_analysis_disabled_reason": current_settings.auto_analysis_disabled_reason,
        }
        
        now = datetime.now(timezone.utc)
        
        with _SETTINGS_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        UPDATE project_settings
                        SET 
                            auto_analysis_disabled_until = NULL,
                            auto_analysis_disabled_reason = NULL,
                            updated_at = :updated_at
                        WHERE project_id = :project_id
                        """
                    ),
                    {
                        "project_id": normalized_project_id,
                        "updated_at": now,
                    },
                )
                
                new_state = {
                    "auto_analysis_disabled_until": None,
                    "auto_analysis_disabled_reason": None,
                }
                
                self._create_audit_entry(
                    conn=conn,
                    project_id=normalized_project_id,
                    user_id=user_id,
                    user_email=user_email,
                    user_display_name=None,
                    action=AutoAnalysisAction.TEMP_DISABLED_EXPIRED,
                    previous_state=previous_state,
                    new_state=new_state,
                    reason=reason,
                )
        
        return self.get_settings(normalized_project_id)

    def get_expired_temporary_disables(self) -> list[str]:
        """Get list of project IDs with expired temporary disables.
        
        This is used by the cleanup task to clear expired temporary disables.
        
        Returns:
            List of project IDs that need their temporary disable cleared
        """
        now = datetime.now(timezone.utc)
        
        with self._engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT project_id
                        FROM project_settings
                        WHERE auto_analysis_disabled_until IS NOT NULL
                          AND auto_analysis_disabled_until <= :now
                        """
                    ),
                    {"now": now},
                )
                .mappings()
                .all()
            )
            
            return [str(row["project_id"]) for row in rows]

    def get_audit_log(
        self,
        project_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[ProjectSettingsAuditEntry]:
        """Get audit log entries for a project.
        
        Args:
            project_id: The project/repository identifier
            limit: Maximum entries to return (default 50, max 100)
            offset: Number of entries to skip
            
        Returns:
            List of audit entries, newest first
        """
        normalized_project_id = project_id.strip().lower()
        limit = min(max(1, limit), 100)
        offset = max(0, offset)
        
        with self._engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT 
                            id, project_id, user_id, user_email, user_display_name,
                            action, previous_state, new_state, reason,
                            ip_address, user_agent, metadata_json, created_at
                        FROM project_settings_audit_log
                        WHERE project_id = :project_id
                        ORDER BY created_at DESC
                        LIMIT :limit OFFSET :offset
                        """
                    ),
                    {
                        "project_id": normalized_project_id,
                        "limit": limit,
                        "offset": offset,
                    },
                )
                .mappings()
                .all()
            )
            
            return [self._row_to_audit_entry(row) for row in rows]

    def _create_audit_entry(
        self,
        conn: Any,
        project_id: str,
        user_id: str | None,
        user_email: str,
        user_display_name: str | None,
        action: AutoAnalysisAction,
        previous_state: dict[str, Any],
        new_state: dict[str, Any],
        reason: str | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Create an audit log entry (internal method)."""
        audit_id = self._generate_id("psa")
        now = datetime.now(timezone.utc)
        
        conn.execute(
            text(
                """
                INSERT INTO project_settings_audit_log (
                    id, project_id, user_id, user_email, user_display_name,
                    action, previous_state, new_state, reason,
                    ip_address, user_agent, metadata_json, created_at
                )
                VALUES (
                    :id, :project_id, :user_id, :user_email, :user_display_name,
                    :action, :previous_state, :new_state, :reason,
                    :ip_address, :user_agent, :metadata_json, :created_at
                )
                """
            ),
            {
                "id": audit_id,
                "project_id": project_id,
                "user_id": user_id,
                "user_email": user_email,
                "user_display_name": user_display_name,
                "action": action.value,
                "previous_state": json.dumps(previous_state),
                "new_state": json.dumps(new_state),
                "reason": reason,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "metadata_json": json.dumps(metadata or {}),
                "created_at": now,
            },
        )

    def _row_to_settings(self, row: Any) -> ProjectSettings:
        """Convert a database row to ProjectSettings."""
        settings_json = row.get("settings_json")
        if isinstance(settings_json, str):
            settings_json = json.loads(settings_json)
        elif settings_json is None:
            settings_json = {}
        
        return ProjectSettings(
            id=str(row["id"]),
            project_id=str(row["project_id"]),
            organization_id=str(row["organization_id"]) if row.get("organization_id") else None,
            auto_analysis_enabled=bool(row.get("auto_analysis_enabled", True)),
            auto_analysis_disabled_until=row.get("auto_analysis_disabled_until"),
            auto_analysis_disabled_reason=row.get("auto_analysis_disabled_reason"),
            auto_analysis_last_changed_by=row.get("auto_analysis_last_changed_by"),
            auto_analysis_last_changed_at=row.get("auto_analysis_last_changed_at"),
            settings_json=settings_json,
            created_at=row.get("created_at"),
            updated_at=row.get("updated_at"),
        )

    def _row_to_audit_entry(self, row: Any) -> ProjectSettingsAuditEntry:
        """Convert a database row to ProjectSettingsAuditEntry."""
        previous_state = row.get("previous_state")
        if isinstance(previous_state, str):
            previous_state = json.loads(previous_state)
        elif previous_state is None:
            previous_state = {}
        
        new_state = row.get("new_state")
        if isinstance(new_state, str):
            new_state = json.loads(new_state)
        elif new_state is None:
            new_state = {}
        
        metadata_json = row.get("metadata_json")
        if isinstance(metadata_json, str):
            metadata_json = json.loads(metadata_json)
        elif metadata_json is None:
            metadata_json = {}
        
        return ProjectSettingsAuditEntry(
            id=str(row["id"]),
            project_id=str(row["project_id"]),
            user_id=str(row["user_id"]) if row.get("user_id") else None,
            user_email=str(row["user_email"]),
            user_display_name=row.get("user_display_name"),
            action=AutoAnalysisAction(row["action"]),
            previous_state=previous_state,
            new_state=new_state,
            reason=row.get("reason"),
            ip_address=row.get("ip_address"),
            user_agent=row.get("user_agent"),
            metadata_json=metadata_json,
            created_at=row.get("created_at"),
        )

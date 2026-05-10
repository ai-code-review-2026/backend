"""
Team and TeamMember models for the Teams Hierarchy feature.

Hierarchy: Organization → Project → Team → Repo → Branch → Commit

Role resolution order:
1. team_members.role (highest priority)
2. org_members.role (mid priority)  
3. users.role (lowest priority)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional


class TeamRole(str, Enum):
    """Team member roles - scoped to a project via team membership."""
    ADMIN = "admin"
    REVIEWER = "reviewer"
    DEVELOPER = "developer"


# Standard permissions that can be granted via permissions JSONB
class TeamPermission(str, Enum):
    """Granular permissions that can override role-based access."""
    CAN_MERGE = "can_merge"
    CAN_DEPLOY = "can_deploy"
    CAN_APPROVE = "can_approve"
    CAN_REJECT = "can_reject"
    CAN_ASSIGN_REVIEWERS = "can_assign_reviewers"
    CAN_MANAGE_TEAM = "can_manage_team"
    CAN_MANAGE_REPOS = "can_manage_repos"
    CAN_VIEW_ANALYTICS = "can_view_analytics"
    CAN_EXPORT_REPORTS = "can_export_reports"
    CAN_CONFIGURE_RULES = "can_configure_rules"


@dataclass
class TeamMember:
    """A user's membership in a team with role and custom permissions."""
    id: str
    team_id: str
    user_id: str
    role: TeamRole
    permissions: List[str] = field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Joined fields (optional, populated from queries)
    user_email: Optional[str] = None
    user_display_name: Optional[str] = None
    user_avatar_url: Optional[str] = None
    
    def has_permission(self, permission: TeamPermission | str) -> bool:
        """Check if member has a specific permission (via role or explicit grant)."""
        perm_value = permission.value if isinstance(permission, TeamPermission) else permission
        
        # Explicit permissions always take precedence
        if perm_value in self.permissions:
            return True
        
        # Role-based implicit permissions
        if self.role == TeamRole.ADMIN:
            return True  # Admins have all permissions
        
        if self.role == TeamRole.REVIEWER:
            reviewer_perms = [
                TeamPermission.CAN_APPROVE.value,
                TeamPermission.CAN_REJECT.value,
                TeamPermission.CAN_VIEW_ANALYTICS.value,
            ]
            return perm_value in reviewer_perms
        
        # Developers have minimal permissions by default
        return False


@dataclass
class Team:
    """A team within a project. Teams own repos and have members with roles."""
    id: str
    name: str
    project_id: str
    description: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Joined fields (optional, populated from queries)
    project_name: Optional[str] = None
    member_count: int = 0
    repo_count: int = 0
    members: List[TeamMember] = field(default_factory=list)


@dataclass
class TeamWithStats:
    """Team with additional statistics for dashboard display."""
    team: Team
    total_members: int = 0
    admin_count: int = 0
    reviewer_count: int = 0
    developer_count: int = 0
    active_reviews: int = 0
    total_reviews: int = 0
    avg_review_time_hours: float = 0.0


@dataclass
class UserTeamAccess:
    """Resolved access for a user in a specific project context."""
    user_id: str
    project_id: str
    team_id: Optional[str] = None
    team_name: Optional[str] = None
    role: TeamRole = TeamRole.DEVELOPER
    permissions: List[str] = field(default_factory=list)
    source: str = "team"  # "team", "org", "platform"
    
    def has_permission(self, permission: TeamPermission | str) -> bool:
        """Check if user has a specific permission in this project context."""
        perm_value = permission.value if isinstance(permission, TeamPermission) else permission
        
        if perm_value in self.permissions:
            return True
        
        if self.role == TeamRole.ADMIN:
            return True
        
        if self.role == TeamRole.REVIEWER:
            reviewer_perms = [
                TeamPermission.CAN_APPROVE.value,
                TeamPermission.CAN_REJECT.value,
                TeamPermission.CAN_VIEW_ANALYTICS.value,
            ]
            return perm_value in reviewer_perms
        
        return False

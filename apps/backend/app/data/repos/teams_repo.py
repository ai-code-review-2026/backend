"""
Repository for Teams hierarchy operations.

Hierarchy: Organization → Project → Team → Repo → Branch → Commit
Role resolution: team_members.role > org_members.role > users.role
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.data.models.team import (
    Team,
    TeamMember,
    TeamRole,
    TeamWithStats,
    UserTeamAccess,
)

logger = logging.getLogger(__name__)


class TeamsRepo:
    """Repository for team CRUD operations."""
    
    def __init__(self, engine: Engine):
        self.engine = engine
    
    # ─────────────────────────────────────────────────────────────────────
    # TEAM CRUD
    # ─────────────────────────────────────────────────────────────────────
    
    def create_team(
        self,
        name: str,
        project_id: str,
        description: Optional[str] = None,
    ) -> Team:
        """Create a new team under a project."""
        team_id = str(uuid4())
        now = datetime.now(timezone.utc)
        
        with self.engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO teams (id, name, project_id, description, is_active, created_at, updated_at)
                    VALUES (:id, :name, :project_id, :description, TRUE, :created_at, :updated_at)
                """),
                {
                    "id": team_id,
                    "name": name,
                    "project_id": project_id,
                    "description": description,
                    "created_at": now,
                    "updated_at": now,
                }
            )
        
        return Team(
            id=team_id,
            name=name,
            project_id=project_id,
            description=description,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
    
    def get_team(self, team_id: str) -> Optional[Team]:
        """Get a team by ID with member and repo counts."""
        with self.engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT 
                        t.id, t.name, t.project_id, t.description, t.is_active,
                        t.created_at, t.updated_at,
                        pp.name as project_name,
                        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count,
                        (SELECT COUNT(*) FROM repo_profiles rp WHERE rp.team_id = t.id) as repo_count
                    FROM teams t
                    JOIN project_profiles pp ON pp.id = t.project_id
                    WHERE t.id = :team_id
                """),
                {"team_id": team_id}
            ).mappings().first()
            
            if not row:
                return None
            
            return Team(
                id=row["id"],
                name=row["name"],
                project_id=row["project_id"],
                description=row["description"],
                is_active=row["is_active"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                project_name=row["project_name"],
                member_count=row["member_count"],
                repo_count=row["repo_count"],
            )
    
    def get_teams_by_project(self, project_id: str) -> List[Team]:
        """Get all teams for a project."""
        with self.engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT 
                        t.id, t.name, t.project_id, t.description, t.is_active,
                        t.created_at, t.updated_at,
                        pp.name as project_name,
                        (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count,
                        (SELECT COUNT(*) FROM repo_profiles rp WHERE rp.team_id = t.id) as repo_count
                    FROM teams t
                    JOIN project_profiles pp ON pp.id = t.project_id
                    WHERE t.project_id = :project_id AND t.is_active = TRUE
                    ORDER BY t.created_at ASC
                """),
                {"project_id": project_id}
            ).mappings().all()
            
            return [
                Team(
                    id=row["id"],
                    name=row["name"],
                    project_id=row["project_id"],
                    description=row["description"],
                    is_active=row["is_active"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    project_name=row["project_name"],
                    member_count=row["member_count"],
                    repo_count=row["repo_count"],
                )
                for row in rows
            ]
    
    def update_team(
        self,
        team_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[Team]:
        """Update a team's details."""
        updates = []
        params = {"team_id": team_id, "updated_at": datetime.now(timezone.utc)}
        
        if name is not None:
            updates.append("name = :name")
            params["name"] = name
        if description is not None:
            updates.append("description = :description")
            params["description"] = description
        if is_active is not None:
            updates.append("is_active = :is_active")
            params["is_active"] = is_active
        
        if not updates:
            return self.get_team(team_id)
        
        updates.append("updated_at = :updated_at")
        
        with self.engine.begin() as conn:
            conn.execute(
                text(f"UPDATE teams SET {', '.join(updates)} WHERE id = :team_id"),
                params
            )
        
        return self.get_team(team_id)
    
    def delete_team(self, team_id: str) -> bool:
        """Delete a team (cascades to team_members)."""
        with self.engine.begin() as conn:
            result = conn.execute(
                text("DELETE FROM teams WHERE id = :team_id"),
                {"team_id": team_id}
            )
            return result.rowcount > 0
    
    # ─────────────────────────────────────────────────────────────────────
    # TEAM MEMBERS CRUD
    # ─────────────────────────────────────────────────────────────────────
    
    def add_member(
        self,
        team_id: str,
        user_id: str,
        role: TeamRole = TeamRole.DEVELOPER,
        permissions: Optional[List[str]] = None,
    ) -> TeamMember:
        """Add a member to a team."""
        member_id = str(uuid4())
        now = datetime.now(timezone.utc)
        perms = permissions or []
        
        with self.engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO team_members (id, team_id, user_id, role, permissions, created_at, updated_at)
                    VALUES (:id, :team_id, :user_id, :role, :permissions::jsonb, :created_at, :updated_at)
                    ON CONFLICT (team_id, user_id) DO UPDATE SET
                        role = EXCLUDED.role,
                        permissions = EXCLUDED.permissions,
                        updated_at = EXCLUDED.updated_at
                """),
                {
                    "id": member_id,
                    "team_id": team_id,
                    "user_id": user_id,
                    "role": role.value,
                    "permissions": str(perms).replace("'", '"'),
                    "created_at": now,
                    "updated_at": now,
                }
            )
        
        return TeamMember(
            id=member_id,
            team_id=team_id,
            user_id=user_id,
            role=role,
            permissions=perms,
            created_at=now,
            updated_at=now,
        )
    
    def get_member(self, team_id: str, user_id: str) -> Optional[TeamMember]:
        """Get a specific team member."""
        with self.engine.connect() as conn:
            row = conn.execute(
                text("""
                    SELECT 
                        tm.id, tm.team_id, tm.user_id, tm.role, tm.permissions,
                        tm.created_at, tm.updated_at,
                        u.email as user_email,
                        COALESCE(u.display_name, u.email) as user_display_name
                    FROM team_members tm
                    JOIN users u ON u.id = tm.user_id
                    WHERE tm.team_id = :team_id AND tm.user_id = :user_id
                """),
                {"team_id": team_id, "user_id": user_id}
            ).mappings().first()
            
            if not row:
                return None
            
            return TeamMember(
                id=row["id"],
                team_id=row["team_id"],
                user_id=row["user_id"],
                role=TeamRole(row["role"]),
                permissions=row["permissions"] or [],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
                user_email=row["user_email"],
                user_display_name=row["user_display_name"],
            )
    
    def get_team_members(self, team_id: str) -> List[TeamMember]:
        """Get all members of a team."""
        with self.engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT 
                        tm.id, tm.team_id, tm.user_id, tm.role, tm.permissions,
                        tm.created_at, tm.updated_at,
                        u.email as user_email,
                        COALESCE(u.display_name, u.email) as user_display_name
                    FROM team_members tm
                    JOIN users u ON u.id = tm.user_id
                    WHERE tm.team_id = :team_id
                    ORDER BY 
                        CASE tm.role 
                            WHEN 'admin' THEN 1 
                            WHEN 'reviewer' THEN 2 
                            ELSE 3 
                        END,
                        tm.created_at ASC
                """),
                {"team_id": team_id}
            ).mappings().all()
            
            return [
                TeamMember(
                    id=row["id"],
                    team_id=row["team_id"],
                    user_id=row["user_id"],
                    role=TeamRole(row["role"]),
                    permissions=row["permissions"] or [],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    user_email=row["user_email"],
                    user_display_name=row["user_display_name"],
                )
                for row in rows
            ]
    
    def update_member(
        self,
        team_id: str,
        user_id: str,
        role: Optional[TeamRole] = None,
        permissions: Optional[List[str]] = None,
    ) -> Optional[TeamMember]:
        """Update a team member's role or permissions."""
        updates = []
        params = {
            "team_id": team_id,
            "user_id": user_id,
            "updated_at": datetime.now(timezone.utc),
        }
        
        if role is not None:
            updates.append("role = :role")
            params["role"] = role.value
        if permissions is not None:
            updates.append("permissions = :permissions::jsonb")
            params["permissions"] = str(permissions).replace("'", '"')
        
        if not updates:
            return self.get_member(team_id, user_id)
        
        updates.append("updated_at = :updated_at")
        
        with self.engine.begin() as conn:
            result = conn.execute(
                text(f"""
                    UPDATE team_members 
                    SET {', '.join(updates)} 
                    WHERE team_id = :team_id AND user_id = :user_id
                """),
                params
            )
            
            if result.rowcount == 0:
                return None
        
        return self.get_member(team_id, user_id)
    
    def remove_member(self, team_id: str, user_id: str) -> bool:
        """Remove a member from a team."""
        with self.engine.begin() as conn:
            result = conn.execute(
                text("DELETE FROM team_members WHERE team_id = :team_id AND user_id = :user_id"),
                {"team_id": team_id, "user_id": user_id}
            )
            return result.rowcount > 0
    
    # ─────────────────────────────────────────────────────────────────────
    # ROLE RESOLUTION
    # ─────────────────────────────────────────────────────────────────────
    
    def get_user_project_access(
        self,
        user_id: str,
        project_id: str,
    ) -> UserTeamAccess:
        """
        Get a user's resolved access for a project.
        Resolution order: team_members.role > org_members.role > users.role
        """
        with self.engine.connect() as conn:
            # 1. Check team membership first (highest priority)
            team_row = conn.execute(
                text("""
                    SELECT 
                        tm.role, tm.permissions, t.id as team_id, t.name as team_name
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    WHERE t.project_id = :project_id
                    AND tm.user_id = :user_id
                    AND t.is_active = TRUE
                    LIMIT 1
                """),
                {"project_id": project_id, "user_id": user_id}
            ).mappings().first()
            
            if team_row:
                return UserTeamAccess(
                    user_id=user_id,
                    project_id=project_id,
                    team_id=team_row["team_id"],
                    team_name=team_row["team_name"],
                    role=TeamRole(team_row["role"]),
                    permissions=team_row["permissions"] or [],
                    source="team",
                )
            
            # 2. Check organization membership (mid priority)
            # Get the org that owns this project
            org_row = conn.execute(
                text("""
                    SELECT 
                        om.role
                    FROM organization_memberships om
                    JOIN project_profiles pp ON pp.organization_id = om.organization_id
                    WHERE pp.id = :project_id
                    AND om.user_id = :user_id
                    AND om.status = 'active'
                    LIMIT 1
                """),
                {"project_id": project_id, "user_id": user_id}
            ).mappings().first()
            
            if org_row:
                # Map org roles to team roles
                org_role = org_row["role"]
                if org_role in ("owner", "admin"):
                    team_role = TeamRole.ADMIN
                elif org_role == "reviewer":
                    team_role = TeamRole.REVIEWER
                else:
                    team_role = TeamRole.DEVELOPER
                
                return UserTeamAccess(
                    user_id=user_id,
                    project_id=project_id,
                    role=team_role,
                    permissions=[],
                    source="org",
                )
            
            # 3. Check platform-level role (lowest priority)
            user_row = conn.execute(
                text("SELECT role FROM users WHERE id = :user_id"),
                {"user_id": user_id}
            ).mappings().first()
            
            if user_row:
                platform_role = user_row["role"]
                if platform_role == "admin":
                    return UserTeamAccess(
                        user_id=user_id,
                        project_id=project_id,
                        role=TeamRole.ADMIN,
                        permissions=[],
                        source="platform",
                    )
            
            # No access found - return developer with no permissions
            return UserTeamAccess(
                user_id=user_id,
                project_id=project_id,
                role=TeamRole.DEVELOPER,
                permissions=[],
                source="none",
            )
    
    def get_user_teams(self, user_id: str) -> List[Tuple[Team, TeamMember]]:
        """Get all teams a user is a member of."""
        with self.engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT 
                        t.id, t.name, t.project_id, t.description, t.is_active,
                        t.created_at, t.updated_at,
                        pp.name as project_name,
                        tm.id as member_id, tm.role, tm.permissions,
                        tm.created_at as member_created_at
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    JOIN project_profiles pp ON pp.id = t.project_id
                    WHERE tm.user_id = :user_id AND t.is_active = TRUE
                    ORDER BY t.name ASC
                """),
                {"user_id": user_id}
            ).mappings().all()
            
            results = []
            for row in rows:
                team = Team(
                    id=row["id"],
                    name=row["name"],
                    project_id=row["project_id"],
                    description=row["description"],
                    is_active=row["is_active"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                    project_name=row["project_name"],
                )
                member = TeamMember(
                    id=row["member_id"],
                    team_id=row["id"],
                    user_id=user_id,
                    role=TeamRole(row["role"]),
                    permissions=row["permissions"] or [],
                    created_at=row["member_created_at"],
                )
                results.append((team, member))
            
            return results
    
    # ─────────────────────────────────────────────────────────────────────
    # TEAM STATS
    # ─────────────────────────────────────────────────────────────────────
    
    def get_team_with_stats(self, team_id: str) -> Optional[TeamWithStats]:
        """Get a team with detailed statistics."""
        team = self.get_team(team_id)
        if not team:
            return None
        
        with self.engine.connect() as conn:
            # Get role counts
            role_counts = conn.execute(
                text("""
                    SELECT 
                        role,
                        COUNT(*) as count
                    FROM team_members
                    WHERE team_id = :team_id
                    GROUP BY role
                """),
                {"team_id": team_id}
            ).mappings().all()
            
            admin_count = 0
            reviewer_count = 0
            developer_count = 0
            
            for row in role_counts:
                if row["role"] == "admin":
                    admin_count = row["count"]
                elif row["role"] == "reviewer":
                    reviewer_count = row["count"]
                else:
                    developer_count = row["count"]
            
            # Get review stats from repo_profiles linked to this team
            review_stats = conn.execute(
                text("""
                    SELECT 
                        COUNT(*) FILTER (WHERE a.status IN ('RUNNING', 'QUEUED', 'RECEIVED')) as active_reviews,
                        COUNT(*) as total_reviews,
                        AVG(EXTRACT(EPOCH FROM (a.updated_at - a.created_at)) / 3600) as avg_time_hours
                    FROM analyses a
                    JOIN repo_profiles rp ON rp.repo_id = a.repo_id
                    WHERE rp.team_id = :team_id
                """),
                {"team_id": team_id}
            ).mappings().first()
            
            return TeamWithStats(
                team=team,
                total_members=admin_count + reviewer_count + developer_count,
                admin_count=admin_count,
                reviewer_count=reviewer_count,
                developer_count=developer_count,
                active_reviews=review_stats["active_reviews"] or 0 if review_stats else 0,
                total_reviews=review_stats["total_reviews"] or 0 if review_stats else 0,
                avg_review_time_hours=review_stats["avg_time_hours"] or 0.0 if review_stats else 0.0,
            )

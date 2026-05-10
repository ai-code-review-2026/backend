from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Optional, List
from sqlalchemy import text
from app.data.database import get_engine

@dataclass
class CreateTeamInput:
    name: str
    organization_id: str
    description: Optional[str] = None
    project_id: Optional[str] = None
    team_lead_id: Optional[str] = None
    settings: dict = None

@dataclass  
class UpdateTeamInput:
    name: Optional[str] = None
    description: Optional[str] = None
    team_lead_id: Optional[str] = None
    settings: Optional[dict] = None

@dataclass
class CreateTeamMemberInput:
    team_id: str
    user_id: str  
    role: str = "developer"
    permissions: List[str] = None
    created_by: Optional[str] = None

@dataclass
class CreateRepositoryInput:
    name: str
    full_name: str
    organization_id: Optional[str] = None
    project_id: Optional[str] = None
    team_id: Optional[str] = None
    description: Optional[str] = None
    github_repo_id: Optional[int] = None
    github_url: Optional[str] = None
    default_branch: str = "main"
    is_private: bool = True
    language: Optional[str] = None
    settings: dict = None

@dataclass
class CreateBranchInput:
    name: str
    repository_id: str
    commit_sha: Optional[str] = None
    is_default: bool = False
    is_protected: bool = False
    protection_rules: dict = None

@dataclass 
class CreateCommitInput:
    sha: str
    branch_id: str
    repository_id: str
    author_name: Optional[str] = None
    author_email: Optional[str] = None
    author_id: Optional[str] = None
    message: Optional[str] = None
    additions: int = 0
    deletions: int = 0
    changed_files: int = 0
    committed_at: Optional[datetime] = None


class OrganizationStructureRepo:
    """Repository pour gérer la structure Org→Project→Team→Repo→Branch→Commit"""
    
    def __init__(self):
        self.engine = get_engine()

    # ===== TEAMS =====
    def create_team(self, input_data: CreateTeamInput) -> dict[str, Any]:
        """Créer une nouvelle équipe"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO teams (name, description, project_id)
                    VALUES (:name, :description, :project_id)
                    RETURNING id, name, description, project_id, created_at, updated_at
                """),
                {
                    "name": input_data.name,
                    "description": input_data.description,
                    "project_id": input_data.project_id
                }
            )
            conn.commit()
            return dict(result.mappings().one())

    def get_teams_by_organization(self, organization_id: str) -> List[dict[str, Any]]:
        """Récupérer toutes les équipes d'une organisation (via les projets)"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT t.*, p.repo_id as project_name,
                           (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
                    FROM teams t
                    JOIN project_profiles p ON t.project_id = p.id
                    WHERE p.id = :organization_id
                    ORDER BY t.created_at DESC
                """),
                {"organization_id": organization_id}
            )
            return [dict(row) for row in result.mappings().all()]

    def get_teams_by_project(self, project_id: str) -> List[dict[str, Any]]:
        """Récupérer toutes les équipes d'un projet"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT t.*,
                           (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) as member_count
                    FROM teams t
                    WHERE t.project_id = :project_id
                    ORDER BY t.created_at DESC
                """),
                {"project_id": project_id}
            )
            return [dict(row) for row in result.mappings().all()]

    def get_team_by_id(self, team_id: str) -> Optional[dict[str, Any]]:
        """Récupérer une équipe par ID"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT t.*, p.repo_id as project_name
                    FROM teams t
                    LEFT JOIN project_profiles p ON t.project_id = p.id
                    WHERE t.id = :team_id
                """),
                {"team_id": team_id}
            )
            row = result.mappings().first()
            return dict(row) if row else None

    def update_team(self, team_id: str, input_data: UpdateTeamInput) -> Optional[dict[str, Any]]:
        """Mettre à jour une équipe"""
        update_fields = []
        params = {"team_id": team_id}
        
        if input_data.name is not None:
            update_fields.append("name = :name")
            params["name"] = input_data.name
        if input_data.description is not None:
            update_fields.append("description = :description")
            params["description"] = input_data.description
        if input_data.team_lead_id is not None:
            update_fields.append("team_lead_id = :team_lead_id")
            params["team_lead_id"] = input_data.team_lead_id
        if input_data.settings is not None:
            update_fields.append("settings = :settings")
            params["settings"] = input_data.settings
            
        if not update_fields:
            return self.get_team_by_id(team_id)
            
        update_fields.append("updated_at = NOW()")
        
        with self.engine.connect() as conn:
            result = conn.execute(
                text(f"""
                    UPDATE teams 
                    SET {', '.join(update_fields)}
                    WHERE id = :team_id
                    RETURNING id, name, description, organization_id, project_id, team_lead_id, 
                             settings, created_at, updated_at
                """),
                params
            )
            conn.commit()
            row = result.mappings().first()
            return dict(row) if row else None

    def delete_team(self, team_id: str) -> bool:
        """Supprimer une équipe"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("DELETE FROM teams WHERE id = :team_id"),
                {"team_id": team_id}
            )
            conn.commit()
            return result.rowcount > 0

    # ===== TEAM MEMBERS =====
    def add_team_member(self, input_data: CreateTeamMemberInput) -> dict[str, Any]:
        """Ajouter un membre à une équipe"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO team_members (team_id, user_id, role, permissions, created_by)
                    VALUES (:team_id, :user_id, :role, :permissions, :created_by)
                    ON CONFLICT (team_id, user_id) DO UPDATE SET
                        role = EXCLUDED.role,
                        permissions = EXCLUDED.permissions
                    RETURNING id, team_id, user_id, role, permissions, joined_at, created_by
                """),
                {
                    "team_id": input_data.team_id,
                    "user_id": input_data.user_id,
                    "role": input_data.role,
                    "permissions": input_data.permissions or [],
                    "created_by": input_data.created_by
                }
            )
            conn.commit()
            return dict(result.mappings().one())

    def get_team_members(self, team_id: str) -> List[dict[str, Any]]:
        """Récupérer tous les membres d'une équipe"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT tm.*, u.email, u.display_name
                    FROM team_members tm
                    LEFT JOIN users u ON tm.user_id = u.id  
                    WHERE tm.team_id = :team_id
                    ORDER BY tm.created_at ASC
                """),
                {"team_id": team_id}
            )
            return [dict(row) for row in result.mappings().all()]

    def remove_team_member(self, team_id: str, user_id: str) -> bool:
        """Retirer un membre d'une équipe"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("DELETE FROM team_members WHERE team_id = :team_id AND user_id = :user_id"),
                {"team_id": team_id, "user_id": user_id}
            )
            conn.commit()
            return result.rowcount > 0

    def get_user_teams(self, user_id: str) -> List[dict[str, Any]]:
        """Récupérer toutes les équipes d'un utilisateur"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT t.*, tm.role, tm.permissions, tm.created_at as joined_at,
                           p.repo_id as project_name
                    FROM team_members tm
                    JOIN teams t ON tm.team_id = t.id
                    LEFT JOIN project_profiles p ON t.project_id = p.id
                    WHERE tm.user_id = :user_id
                    ORDER BY tm.created_at DESC
                """),
                {"user_id": user_id}
            )
            return [dict(row) for row in result.mappings().all()]

    # ===== REPOSITORIES =====
    def create_repository(self, input_data: CreateRepositoryInput) -> dict[str, Any]:
        """Créer un nouveau repository"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO repositories (name, full_name, description, organization_id, 
                                            project_id, team_id, github_repo_id, github_url,
                                            default_branch, is_private, language, settings)
                    VALUES (:name, :full_name, :description, :organization_id, :project_id, 
                           :team_id, :github_repo_id, :github_url, :default_branch, 
                           :is_private, :language, :settings)
                    RETURNING id, name, full_name, description, organization_id, project_id, 
                             team_id, github_repo_id, github_url, default_branch, is_private, 
                             language, settings, created_at, updated_at
                """),
                {
                    "name": input_data.name,
                    "full_name": input_data.full_name,
                    "description": input_data.description,
                    "organization_id": input_data.organization_id,
                    "project_id": input_data.project_id,
                    "team_id": input_data.team_id,
                    "github_repo_id": input_data.github_repo_id,
                    "github_url": input_data.github_url,
                    "default_branch": input_data.default_branch,
                    "is_private": input_data.is_private,
                    "language": input_data.language,
                    "settings": input_data.settings or {}
                }
            )
            conn.commit()
            return dict(result.mappings().one())

    def get_repositories_by_organization(self, organization_id: str) -> List[dict[str, Any]]:
        """Récupérer tous les repos d'une organisation"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT r.*, p.repo_id as project_name, t.name as team_name,
                           (SELECT COUNT(*) FROM branches b WHERE b.repository_id = r.id) as branch_count
                    FROM repositories r
                    LEFT JOIN project_profiles p ON r.project_id = p.id
                    LEFT JOIN teams t ON r.team_id = t.id
                    WHERE r.organization_id = :organization_id
                    ORDER BY r.created_at DESC
                """),
                {"organization_id": organization_id}
            )
            return [dict(row) for row in result.mappings().all()]

    def get_repositories_by_project(self, project_id: str) -> List[dict[str, Any]]:
        """Récupérer tous les repos d'un projet"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT r.*, t.name as team_name,
                           (SELECT COUNT(*) FROM branches b WHERE b.repository_id = r.id) as branch_count
                    FROM repositories r
                    LEFT JOIN teams t ON r.team_id = t.id
                    WHERE r.project_id = :project_id
                    ORDER BY r.created_at DESC
                """),
                {"project_id": project_id}
            )
            return [dict(row) for row in result.mappings().all()]

    def get_repositories_by_team(self, team_id: str) -> List[dict[str, Any]]:
        """Récupérer tous les repos d'une équipe"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT r.*,
                           (SELECT COUNT(*) FROM branches b WHERE b.repository_id = r.id) as branch_count
                    FROM repositories r
                    WHERE r.team_id = :team_id
                    ORDER BY r.created_at DESC
                """),
                {"team_id": team_id}
            )
            return [dict(row) for row in result.mappings().all()]

    # ===== BRANCHES =====
    def create_branch(self, input_data: CreateBranchInput) -> dict[str, Any]:
        """Créer une nouvelle branche"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO branches (name, repository_id, commit_sha, is_default, is_protected, protection_rules)
                    VALUES (:name, :repository_id, :commit_sha, :is_default, :is_protected, :protection_rules)
                    RETURNING id, name, repository_id, commit_sha, is_default, is_protected, 
                             protection_rules, created_at, updated_at
                """),
                {
                    "name": input_data.name,
                    "repository_id": input_data.repository_id,
                    "commit_sha": input_data.commit_sha,
                    "is_default": input_data.is_default,
                    "is_protected": input_data.is_protected,
                    "protection_rules": input_data.protection_rules or {}
                }
            )
            conn.commit()
            return dict(result.mappings().one())

    def get_branches_by_repository(self, repository_id: str) -> List[dict[str, Any]]:
        """Récupérer toutes les branches d'un repo"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT b.*,
                           (SELECT COUNT(*) FROM commits c WHERE c.branch_id = b.id) as commit_count
                    FROM branches b
                    WHERE b.repository_id = :repository_id
                    ORDER BY b.is_default DESC, b.created_at DESC
                """),
                {"repository_id": repository_id}
            )
            return [dict(row) for row in result.mappings().all()]

    # ===== COMMITS =====
    def create_commit(self, input_data: CreateCommitInput) -> dict[str, Any]:
        """Créer un nouveau commit"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    INSERT INTO commits (sha, branch_id, repository_id, author_name, author_email, 
                                       author_id, message, additions, deletions, changed_files, committed_at)
                    VALUES (:sha, :branch_id, :repository_id, :author_name, :author_email, 
                           :author_id, :message, :additions, :deletions, :changed_files, :committed_at)
                    ON CONFLICT (repository_id, sha) DO UPDATE SET
                        message = EXCLUDED.message,
                        additions = EXCLUDED.additions,
                        deletions = EXCLUDED.deletions,
                        changed_files = EXCLUDED.changed_files
                    RETURNING id, sha, branch_id, repository_id, author_name, author_email, 
                             author_id, message, additions, deletions, changed_files, 
                             committed_at, created_at
                """),
                {
                    "sha": input_data.sha,
                    "branch_id": input_data.branch_id,
                    "repository_id": input_data.repository_id,
                    "author_name": input_data.author_name,
                    "author_email": input_data.author_email,
                    "author_id": input_data.author_id,
                    "message": input_data.message,
                    "additions": input_data.additions,
                    "deletions": input_data.deletions,
                    "changed_files": input_data.changed_files,
                    "committed_at": input_data.committed_at
                }
            )
            conn.commit()
            return dict(result.mappings().one())

    def get_commits_by_repository(self, repository_id: str, limit: int = 100) -> List[dict[str, Any]]:
        """Récupérer les commits récents d'un repo"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT c.*, b.name as branch_name
                    FROM commits c
                    LEFT JOIN branches b ON c.branch_id = b.id
                    WHERE c.repository_id = :repository_id
                    ORDER BY c.committed_at DESC, c.created_at DESC
                    LIMIT :limit
                """),
                {"repository_id": repository_id, "limit": limit}
            )
            return [dict(row) for row in result.mappings().all()]

    def get_commits_by_branch(self, branch_id: str, limit: int = 100) -> List[dict[str, Any]]:
        """Récupérer les commits d'une branche"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT c.*, b.name as branch_name
                    FROM commits c
                    LEFT JOIN branches b ON c.branch_id = b.id
                    WHERE c.branch_id = :branch_id
                    ORDER BY c.committed_at DESC, c.created_at DESC
                    LIMIT :limit
                """),
                {"branch_id": branch_id, "limit": limit}
            )
            return [dict(row) for row in result.mappings().all()]

    def get_branches_by_project(self, project_id: str) -> List[dict[str, Any]]:
        """Récupérer toutes les branches d'un projet"""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT b.*, p.repo_id as project_name
                    FROM branches b
                    JOIN project_profiles p ON p.org_id = b.org_id
                    WHERE p.id = :project_id
                    ORDER BY b.created_at DESC
                """),
                {"project_id": project_id}
            )
            return [dict(row) for row in result.mappings().all()]

    # ===== NAVIGATION HIERARCHY =====
    def get_organization_hierarchy(self, organization_id: str) -> dict[str, Any]:
        """Récupérer la hiérarchie complète d'une organisation (en utilisant project_id directement)"""
        with self.engine.connect() as conn:
            # Utiliser le project_id directement comme organization pour les tests
            project_result = conn.execute(
                text("SELECT * FROM project_profiles WHERE id = :org_id"),
                {"org_id": organization_id}
            )
            project = dict(project_result.mappings().one())
            
            # Teams pour ce projet
            teams = self.get_teams_by_project(organization_id)
            
            # Branches pour ce projet
            branches = self.get_branches_by_project(organization_id)
            
            return {
                "organization": {"name": project["repo_id"], "id": project["id"]},
                "projects": [project],
                "teams": teams,
                "branches": branches
            }
            
            return {
                "organization": org,
                "projects": projects
            }

    def get_project_details(self, project_id: str) -> dict[str, Any]:
        """Récupérer les détails complets d'un projet"""
        with self.engine.connect() as conn:
            # Project info
            project_result = conn.execute(
                text("""
                    SELECT p.*, o.name as organization_name, o.slug as organization_slug
                    FROM project_profiles p
                    LEFT JOIN organizations o ON p.org_id = o.id
                    WHERE p.id = :project_id
                """),
                {"project_id": project_id}
            )
            project = dict(project_result.mappings().one())
            
            # Teams avec membres
            teams = self.get_teams_by_project(project_id)
            for team in teams:
                team["members"] = self.get_team_members(team["id"])
            
            # Branches pour ce projet
            branches = self.get_branches_by_project(project_id)
            
            return {
                "project": project,
                "teams": teams,
                "branches": branches,
                "summary": {
                    "team_count": len(teams),
                    "branch_count": len(branches),
                    "member_count": sum(len(team.get("members", [])) for team in teams)
                }
            }
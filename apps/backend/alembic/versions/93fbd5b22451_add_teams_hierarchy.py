"""add_teams_hierarchy

Revision ID: 93fbd5b22451
Revises: 062dd1fedb1d
Create Date: 2026-04-16 04:21:49.096959

This migration implements the Teams hierarchy:
Organization → Project → Team → Repo → Branch → Commit

Tables added:
- teams: Teams within a project
- team_members: User membership with role and permissions per team

Changes:
- Add team_id FK to repo_profiles (nullable during migration)
- Create default teams for existing projects
- Role resolution order: team_members.role > org_members.role > users.role
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '93fbd5b22451'
down_revision: Union[str, None] = '062dd1fedb1d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create teams table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            name TEXT NOT NULL,
            project_id TEXT NOT NULL REFERENCES project_profiles(id) ON DELETE CASCADE,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(project_id, name)
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_teams_project_id ON teams(project_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_teams_is_active ON teams(is_active)")
    
    # Create team_members table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS team_members (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL DEFAULT 'developer',
            permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(team_id, user_id)
        )
        """
    )
    
    # Add role constraint
    op.execute("ALTER TABLE team_members DROP CONSTRAINT IF EXISTS ck_team_members_role")
    op.execute(
        """
        ALTER TABLE team_members
        ADD CONSTRAINT ck_team_members_role
        CHECK (role IN ('admin', 'reviewer', 'developer'))
        """
    )
    
    # Add indexes
    op.execute("CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(role)")
    
    # Add team_id to repo_profiles (nullable for migration)
    op.execute(
        """
        ALTER TABLE repo_profiles
        ADD COLUMN IF NOT EXISTS team_id TEXT REFERENCES teams(id) ON DELETE SET NULL
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_repo_profiles_team_id ON repo_profiles(team_id)")
    
    # Create default teams for existing projects
    # Each project gets one "Default Team" with all current project members
    op.execute(
        """
        INSERT INTO teams (id, name, project_id, description, created_at, updated_at)
        SELECT 
            gen_random_uuid()::text,
            'Default Team',
            pp.id,
            'Auto-generated default team for existing project',
            NOW(),
            NOW()
        FROM project_profiles pp
        WHERE NOT EXISTS (
            SELECT 1 FROM teams t WHERE t.project_id = pp.id
        )
        """
    )
    
    # Migrate existing user_project_roles to team_members
    # This preserves per-project role assignments
    op.execute(
        """
        INSERT INTO team_members (id, team_id, user_id, role, permissions, created_at, updated_at)
        SELECT 
            gen_random_uuid()::text,
            t.id,
            upr.user_id,
            CASE 
                WHEN r.code IN ('tech_lead', 'reviewer_lead', 'admin') THEN 'admin'
                WHEN r.code LIKE 'reviewer%' OR r.code = 'reviewer' THEN 'reviewer'
                ELSE 'developer'
            END,
            '[]'::jsonb,
            NOW(),
            NOW()
        FROM user_project_roles upr
        JOIN roles r ON r.id = upr.role_id
        JOIN project_profiles pp ON upr.project_id = pp.id
        JOIN teams t ON t.project_id = pp.id AND t.name = 'Default Team'
        WHERE upr.is_active = TRUE
        AND NOT EXISTS (
            SELECT 1 FROM team_members tm 
            WHERE tm.team_id = t.id AND tm.user_id = upr.user_id
        )
        """
    )
    
    # Link existing repos to their project's default team
    op.execute(
        """
        UPDATE repo_profiles rp
        SET team_id = t.id
        FROM project_profiles pp, teams t
        WHERE rp.repo_id LIKE pp.repo_id || '%'
        AND t.project_id = pp.id
        AND t.name = 'Default Team'
        AND rp.team_id IS NULL
        """
    )


def downgrade() -> None:
    # Remove team_id from repo_profiles
    op.execute("ALTER TABLE repo_profiles DROP COLUMN IF EXISTS team_id")
    
    # Drop tables in reverse order
    op.execute("DROP TABLE IF EXISTS team_members")
    op.execute("DROP TABLE IF EXISTS teams")

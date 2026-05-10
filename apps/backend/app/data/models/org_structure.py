from __future__ import annotations

from datetime import datetime
from typing import Optional, List
from sqlalchemy import Column, String, Text, Boolean, Integer, TIMESTAMP, ForeignKey, ARRAY, Index, BigInteger
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.data.database import Base

class Organization(Base):
    """
    Table organisations - structure principale
    """
    __tablename__ = "organizations"

    id = Column(String(255), primary_key=True)
    name = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False)
    description = Column(Text)
    github_org_id = Column(String(255))
    github_installation_id = Column(BigInteger)
    settings = Column(JSONB, default={})
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relations
    projects = relationship("Project", back_populates="organization", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="organization", cascade="all, delete-orphan") 
    repositories = relationship("Repository", back_populates="organization", cascade="all, delete-orphan")


class Project(Base):
    """
    Table projects (extension de project_profiles existante)
    """
    __tablename__ = "project_profiles"

    id = Column(String(255), primary_key=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    organization_id = Column(String(255), ForeignKey("organizations.id", ondelete="CASCADE"))
    project_type = Column(String(50), default="code")
    settings = Column(JSONB, default={})
    created_by = Column(String(255))
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relations
    organization = relationship("Organization", back_populates="projects")
    teams = relationship("Team", back_populates="project", cascade="all, delete-orphan")
    repositories = relationship("Repository", back_populates="project", cascade="all, delete-orphan")


class Team(Base):
    """
    Table teams - équipes par projet/org
    """
    __tablename__ = "teams"

    id = Column(String(255), primary_key=True, default=lambda: str(func.gen_random_uuid()))
    name = Column(String(255), nullable=False)
    description = Column(Text)
    organization_id = Column(String(255), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(String(255), ForeignKey("project_profiles.id", ondelete="CASCADE"))
    team_lead_id = Column(String(255))
    settings = Column(JSONB, default={})
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relations
    organization = relationship("Organization", back_populates="teams")
    project = relationship("Project", back_populates="teams")
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    repositories = relationship("Repository", back_populates="team")

    # Indexes
    __table_args__ = (
        Index('idx_teams_organization_id', 'organization_id'),
        Index('idx_teams_project_id', 'project_id'),
    )


class TeamMember(Base):
    """
    Table team_members - membres d'équipe avec rôles
    """
    __tablename__ = "team_members"

    id = Column(String(255), primary_key=True, default=lambda: str(func.gen_random_uuid()))
    team_id = Column(String(255), ForeignKey("teams.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="developer")  # admin, reviewer, developer
    permissions = Column(ARRAY(Text), default=[])
    joined_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    created_by = Column(String(255))

    # Relations
    team = relationship("Team", back_populates="members")

    # Constraints
    __table_args__ = (
        Index('idx_team_members_team_id', 'team_id'),
        Index('idx_team_members_user_id', 'user_id'),
        {"extend_existing": True},
    )


class Repository(Base):
    """
    Table repositories - repos par org/projet/team
    """
    __tablename__ = "repositories"

    id = Column(String(255), primary_key=True, default=lambda: str(func.gen_random_uuid()))
    name = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)  # owner/repo
    description = Column(Text)
    organization_id = Column(String(255), ForeignKey("organizations.id", ondelete="CASCADE"))
    project_id = Column(String(255), ForeignKey("project_profiles.id", ondelete="CASCADE"))
    team_id = Column(String(255), ForeignKey("teams.id", ondelete="SET NULL"))
    github_repo_id = Column(BigInteger)
    github_url = Column(String(500))
    default_branch = Column(String(255), default="main")
    is_private = Column(Boolean, default=True)
    language = Column(String(100))
    settings = Column(JSONB, default={})
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relations
    organization = relationship("Organization", back_populates="repositories")
    project = relationship("Project", back_populates="repositories")
    team = relationship("Team", back_populates="repositories")
    branches = relationship("Branch", back_populates="repository", cascade="all, delete-orphan")
    commits = relationship("Commit", back_populates="repository", cascade="all, delete-orphan")

    # Indexes
    __table_args__ = (
        Index('idx_repositories_organization_id', 'organization_id'),
        Index('idx_repositories_project_id', 'project_id'),
        Index('idx_repositories_team_id', 'team_id'),
    )


class Branch(Base):
    """
    Table branches - branches par repo
    """
    __tablename__ = "branches"

    id = Column(String(255), primary_key=True, default=lambda: str(func.gen_random_uuid()))
    name = Column(String(255), nullable=False)
    repository_id = Column(String(255), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    commit_sha = Column(String(255))
    is_default = Column(Boolean, default=False)
    is_protected = Column(Boolean, default=False)
    protection_rules = Column(JSONB, default={})
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relations
    repository = relationship("Repository", back_populates="branches")
    commits = relationship("Commit", back_populates="branch", cascade="all, delete-orphan")

    # Indexes et contraintes
    __table_args__ = (
        Index('idx_branches_repository_id', 'repository_id'),
        {"extend_existing": True},
    )


class Commit(Base):
    """
    Table commits - commits par branch/repo
    """
    __tablename__ = "commits"

    id = Column(String(255), primary_key=True, default=lambda: str(func.gen_random_uuid()))
    sha = Column(String(255), nullable=False)
    branch_id = Column(String(255), ForeignKey("branches.id", ondelete="CASCADE"), nullable=False)
    repository_id = Column(String(255), ForeignKey("repositories.id", ondelete="CASCADE"), nullable=False)
    author_name = Column(String(255))
    author_email = Column(String(255))
    author_id = Column(String(255))  # user_id si connu
    message = Column(Text)
    additions = Column(Integer, default=0)
    deletions = Column(Integer, default=0)
    changed_files = Column(Integer, default=0)
    committed_at = Column(TIMESTAMP(timezone=True))
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now())

    # Relations
    branch = relationship("Branch", back_populates="commits")
    repository = relationship("Repository", back_populates="commits")

    # Indexes
    __table_args__ = (
        Index('idx_commits_repository_id', 'repository_id'),
        Index('idx_commits_branch_id', 'branch_id'),
        Index('idx_commits_author_id', 'author_id'),
        {"extend_existing": True},
    )
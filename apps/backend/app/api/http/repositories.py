"""
Repository management API endpoints.

Provides CRUD operations for repositories and their metadata.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.middleware.auth import AuthenticatedPrincipal, get_current_principal, enforce_permission
from app.data.database import get_engine
from app.data.repos.branch_repo import BranchRepo, CreateBranchInput, UpdateBranchInput
from app.data.repos.project_settings_repo import ProjectSettingsRepo
from app.data.repos.rbac_repo import RBACRepo
from app.data.repos.repo_profiles_repo import RepoProfilesRepo

router = APIRouter(prefix="/api/v1/repositories", tags=["repositories"])


class RepositoryResponse(BaseModel):
    """Response model for a repository."""
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    full_name: str
    description: str | None = None
    language: str | None = None
    visibility: Literal["public", "private", "internal"] = "private"
    default_branch: str | None = "main"
    indexed_commit: str | None = None
    
    # CI/CD status
    ci_status: Literal["passing", "failing", "unknown"] = "unknown"
    last_analysis_at: str | None = None
    analysis_count: int = 0
    
    # Quality metrics
    quality_score: float | None = None
    security_score: float | None = None
    total_findings: int = 0
    open_issues: int = 0
    
    # Timestamps
    created_at: str
    updated_at: str


class RepositoryListResponse(BaseModel):
    """Response model for repository list."""
    items: list[RepositoryResponse]
    total: int
    page: int
    limit: int
    pages: int


class CreateRepositoryRequest(BaseModel):
    """Request model for creating a repository."""
    model_config = ConfigDict(extra="ignore")

    name: str | None = Field(None, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    language: str | None = None
    visibility: Literal["public", "private", "internal"] = "private"
    default_branch: str = "main"
    github_id: str | None = None
    source: str | None = None


class UpdateRepositoryRequest(BaseModel):
    """Request model for updating a repository."""
    model_config = ConfigDict(extra="forbid")

    description: str | None = None
    visibility: Literal["public", "private", "internal"] | None = None
    default_branch: str | None = None


def _get_repository_stats(engine, repo_id: str) -> dict[str, Any]:
    """Get analysis statistics for a repository."""
    from sqlalchemy import text
    
    query = text("""
        SELECT
            COUNT(*) as analysis_count,
            MAX(a.created_at) as last_analysis_at,
            COALESCE(SUM(fc.cnt), 0) as total_findings,
            SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
            SUM(CASE WHEN a.status = 'FAILED' THEN 1 ELSE 0 END) as failed_count
        FROM analyses a
        LEFT JOIN (SELECT analysis_id, COUNT(*) as cnt FROM findings GROUP BY analysis_id) fc
            ON fc.analysis_id = a.id
        WHERE a.repo = :repo_id
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query, {"repo_id": repo_id})
        row = result.mappings().first()
        
        if row:
            analysis_count = row.get("analysis_count") or 0
            completed = row.get("completed_count") or 0
            failed = row.get("failed_count") or 0
            
            # Determine CI status based on recent analyses
            if analysis_count == 0:
                ci_status = "unknown"
            elif failed > completed:
                ci_status = "failing"
            else:
                ci_status = "passing"
            
            return {
                "analysis_count": analysis_count,
                "last_analysis_at": row.get("last_analysis_at").isoformat() if row.get("last_analysis_at") else None,
                "total_findings": row.get("total_findings") or 0,
                "ci_status": ci_status,
            }
    
    return {
        "analysis_count": 0,
        "last_analysis_at": None,
        "total_findings": 0,
        "ci_status": "unknown",
    }


def _get_security_findings_count(engine, repo_id: str) -> int:
    """Get count of security findings for a repository."""
    from sqlalchemy import text
    
    query = text("""
        SELECT COUNT(*) as count
        FROM findings f
        JOIN analyses a ON f.analysis_id = a.id
        WHERE a.repo = :repo_id AND f.category = 'security'
    """)
    
    with engine.connect() as conn:
        result = conn.execute(query, {"repo_id": repo_id})
        row = result.mappings().first()
        return row.get("count") or 0 if row else 0


@router.get("", response_model=RepositoryListResponse)
async def list_repositories(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    language: str | None = Query(None),
    visibility: str | None = Query(None),
    search: str | None = Query(None),
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> RepositoryListResponse:
    """
    List repositories accessible to the current user.
    
    Supports filtering by language, visibility, and search term.
    Returns paginated results with analysis statistics.
    """
    enforce_permission(principal, "analyses.read")

    engine = get_engine()
    repo_profiles = RepoProfilesRepo()

    # Get distinct repositories from analyses
    from sqlalchemy import text
    
    conditions = []
    params: dict[str, Any] = {"limit": limit, "offset": (page - 1) * limit}
    
    if search:
        conditions.append("a.repo ILIKE :search")
        params["search"] = f"%{search}%"

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    
    # Get repositories from analyses table
    query = text(f"""
        WITH repo_stats AS (
            SELECT
                a.repo,
                COUNT(*) as analysis_count,
                MAX(a.created_at) as last_analysis_at,
                COALESCE(SUM(fc.cnt), 0) as total_findings,
                SUM(CASE WHEN a.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed_count,
                SUM(CASE WHEN a.status = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
                MIN(a.created_at) as first_seen
            FROM analyses a
            LEFT JOIN (SELECT analysis_id, COUNT(*) as cnt FROM findings GROUP BY analysis_id) fc
                ON fc.analysis_id = a.id
            {where_clause}
            GROUP BY a.repo
        )
        SELECT * FROM repo_stats
        ORDER BY last_analysis_at DESC NULLS LAST
        LIMIT :limit OFFSET :offset
    """)
    
    count_query = text(f"""
        SELECT COUNT(DISTINCT a.repo) as total
        FROM analyses a
        {where_clause}
    """)
    
    items = []
    total = 0
    
    with engine.connect() as conn:
        # Get total count
        count_result = conn.execute(count_query, params)
        count_row = count_result.mappings().first()
        total = count_row.get("total") or 0 if count_row else 0
        
        # Get repositories
        result = conn.execute(query, params)
        rows = result.mappings().all()
        
        for row in rows:
            repo_name = row["repo"]
            
            # Try to get profile for additional info
            profile = repo_profiles.get_profile(repo_name)
            
            # Parse repo name
            parts = repo_name.split("/")
            name = parts[-1] if parts else repo_name
            
            # Determine CI status
            analysis_count = row.get("analysis_count") or 0
            completed = row.get("completed_count") or 0
            failed = row.get("failed_count") or 0
            
            if analysis_count == 0:
                ci_status = "unknown"
            elif failed > completed:
                ci_status = "failing"
            else:
                ci_status = "passing"
            
            # Get security findings count
            security_count = _get_security_findings_count(engine, repo_name)
            
            items.append(RepositoryResponse(
                id=repo_name,
                name=name,
                full_name=repo_name,
                description=profile.profile.get("description") if profile else None,
                language=profile.profile.get("primary_language") if profile else None,
                visibility="private",  # Default, could be enhanced with GitHub API
                default_branch=profile.default_branch if profile else "main",
                indexed_commit=profile.indexed_commit if profile else None,
                ci_status=ci_status,
                last_analysis_at=row["last_analysis_at"].isoformat() if row.get("last_analysis_at") else None,
                analysis_count=analysis_count,
                quality_score=None,  # Could compute from findings
                security_score=None,  # Could compute from security findings
                total_findings=row.get("total_findings") or 0,
                open_issues=security_count,
                created_at=row["first_seen"].isoformat() if row.get("first_seen") else datetime.now(timezone.utc).isoformat(),
                updated_at=row["last_analysis_at"].isoformat() if row.get("last_analysis_at") else datetime.now(timezone.utc).isoformat(),
            ))
    
    pages = (total + limit - 1) // limit if total > 0 else 1
    
    return RepositoryListResponse(
        items=items,
        total=total,
        page=page,
        limit=limit,
        pages=pages,
    )


@router.get("/{repo_id:path}", response_model=RepositoryResponse)
async def get_repository(
    repo_id: str,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> RepositoryResponse:
    """
    Get a specific repository by ID (full name like owner/repo).
    """
    enforce_permission(principal, "analyses.read")

    engine = get_engine()
    repo_profiles = RepoProfilesRepo()

    # Get stats
    stats = _get_repository_stats(engine, repo_id)
    
    if stats["analysis_count"] == 0:
        raise HTTPException(status_code=404, detail="Repository not found")
    
    # Get profile
    profile = repo_profiles.get_profile(repo_id)
    
    # Parse repo name
    parts = repo_id.split("/")
    name = parts[-1] if parts else repo_id
    
    # Get security findings
    security_count = _get_security_findings_count(engine, repo_id)
    
    return RepositoryResponse(
        id=repo_id,
        name=name,
        full_name=repo_id,
        description=profile.profile.get("description") if profile else None,
        language=profile.profile.get("primary_language") if profile else None,
        visibility="private",
        default_branch=profile.default_branch if profile else "main",
        indexed_commit=profile.indexed_commit if profile else None,
        ci_status=stats["ci_status"],
        last_analysis_at=stats["last_analysis_at"],
        analysis_count=stats["analysis_count"],
        quality_score=None,
        security_score=None,
        total_findings=stats["total_findings"],
        open_issues=security_count,
        created_at=datetime.now(timezone.utc).isoformat(),  # Could track first analysis
        updated_at=stats["last_analysis_at"] or datetime.now(timezone.utc).isoformat(),
    )


@router.post("", response_model=RepositoryResponse, status_code=status.HTTP_201_CREATED)
async def create_repository(
    request: CreateRepositoryRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> RepositoryResponse:
    """
    Register a new repository for analysis tracking.
    """
    enforce_permission(principal, "analyses.create")

    repo_profiles = RepoProfilesRepo()

    # Derive name from full_name if not provided
    parts = request.full_name.split("/")
    name = request.name or (parts[-1] if parts else request.full_name)

    # Create repo profile
    profile = repo_profiles.upsert_profile(
        repo_id=request.full_name,
        repo_path=None,
        indexed_commit=None,
        default_branch=request.default_branch,
        profile={
            "description": request.description,
            "primary_language": request.language,
            "github_id": request.github_id,
        },
    )
    
    now = datetime.now(timezone.utc).isoformat()
    
    return RepositoryResponse(
        id=request.full_name,
        name=name,
        full_name=request.full_name,
        description=request.description,
        language=request.language,
        visibility=request.visibility,
        default_branch=request.default_branch,
        indexed_commit=None,
        ci_status="unknown",
        last_analysis_at=None,
        analysis_count=0,
        quality_score=None,
        security_score=None,
        total_findings=0,
        open_issues=0,
        created_at=now,
        updated_at=now,
    )


# ── Full GitHub Import ──────────────────────────────────────────────────────


class GitHubImportMember(BaseModel):
    """A GitHub collaborator/org member to import."""
    model_config = ConfigDict(extra="ignore")
    github_login: str
    email: str | None = None
    display_name: str | None = None
    role: str = "developer"


class GitHubImportBranch(BaseModel):
    """A branch to import from GitHub."""
    model_config = ConfigDict(extra="ignore")
    name: str
    is_default: bool = False
    last_commit_sha: str | None = None
    last_commit_message: str | None = None
    last_commit_author: str | None = None
    last_commit_at: str | None = None


class GitHubImportCommit(BaseModel):
    """A commit to import from GitHub."""
    model_config = ConfigDict(extra="ignore")
    sha: str
    branch_name: str
    message: str | None = None
    author_name: str | None = None
    author_email: str | None = None
    authored_at: str | None = None
    committer_name: str | None = None
    committer_email: str | None = None
    committed_at: str | None = None
    parent_shas: list[str] = []


class GitHubImportRequest(BaseModel):
    """Full import payload sent by the BFF."""
    model_config = ConfigDict(extra="ignore")
    full_name: str
    project_name: str | None = None
    description: str | None = None
    visibility: Literal["public", "private", "internal"] = "private"
    default_branch: str = "main"
    github_id: str | None = None
    language: str | None = None
    org_github_login: str | None = None
    org_name: str | None = None
    branches: list[GitHubImportBranch] = []
    commits: list[GitHubImportCommit] = []
    members: list[GitHubImportMember] = []


class MemberToInvite(BaseModel):
    email: str | None = None
    github_login: str | None = None
    role: str
    project_id: str


class GitHubImportResponse(BaseModel):
    repository: RepositoryResponse
    branches_imported: int
    commits_imported: int
    members_to_invite: list[MemberToInvite]
    project_id: str


@router.post("/import-full", response_model=GitHubImportResponse, status_code=status.HTTP_201_CREATED)
async def import_repository_full(
    request: GitHubImportRequest,
    principal: AuthenticatedPrincipal = Depends(get_current_principal),
) -> GitHubImportResponse:
    """
    Full GitHub repository import in one step.

    Stores branches, commits, creates repo profile and project settings,
    assigns the caller as admin, and records pending invitations for members
    who don't yet have a platform account.
    """
    enforce_permission(principal, "analyses.create")

    engine = get_engine()
    repo_profiles = RepoProfilesRepo()
    branch_repo = BranchRepo()
    settings_repo = ProjectSettingsRepo()
    rbac_repo = RBACRepo()

    repo_id = request.full_name.strip().lower()
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    # Derive display name
    parts = repo_id.split("/")
    repo_name = parts[-1] if parts else repo_id
    project_name = request.project_name or repo_name

    # Resolve a canonical local organization when the repository belongs to a GitHub organization.
    org_id: str | None = None
    if request.org_github_login:
        try:
            from sqlalchemy import text as _text

            with engine.begin() as conn:
                existing_org = conn.execute(
                    _text(
                        """
                        SELECT id, clerk_org_id, github_org_login
                        FROM organizations
                        WHERE github_org_login = :github_login
                           OR slug = :github_login
                           OR id = :github_login
                        ORDER BY CASE WHEN clerk_org_id IS NOT NULL THEN 0 ELSE 1 END, created_at ASC
                        LIMIT 1
                        """
                    ),
                    {"github_login": request.org_github_login},
                ).mappings().first()

                if existing_org:
                    org_id = str(existing_org["id"])
                    conn.execute(
                        _text(
                            """
                            UPDATE organizations
                            SET name = COALESCE(:name, name),
                                slug = COALESCE(slug, :slug),
                                description = COALESCE(:description, description),
                                github_org_login = COALESCE(:github_org_login, github_org_login),
                                sync_status = CASE
                                    WHEN clerk_org_id IS NOT NULL AND COALESCE(:github_org_login, github_org_login) IS NOT NULL THEN 'linked'
                                    WHEN clerk_org_id IS NOT NULL THEN 'clerk_only'
                                    WHEN COALESCE(:github_org_login, github_org_login) IS NOT NULL THEN 'github_only'
                                    ELSE sync_status
                                END,
                                is_active = TRUE,
                                updated_at = :updated_at
                            WHERE id = :id
                            """
                        ),
                        {
                            "id": org_id,
                            "name": request.org_name or request.org_github_login,
                            "slug": request.org_github_login,
                            "description": request.description,
                            "github_org_login": request.org_github_login,
                            "updated_at": now,
                        },
                    )
                else:
                    org_id = request.org_github_login
                    conn.execute(
                        _text(
                            """
                            INSERT INTO organizations (
                                id,
                                slug,
                                name,
                                description,
                                github_org_login,
                                source,
                                sync_status,
                                is_active,
                                created_at,
                                updated_at
                            )
                            VALUES (
                                :id,
                                :slug,
                                :name,
                                :description,
                                :github_org_login,
                                'legacy',
                                'github_only',
                                TRUE,
                                :created_at,
                                :updated_at
                            )
                            ON CONFLICT (id) DO UPDATE SET
                                name = COALESCE(EXCLUDED.name, organizations.name),
                                description = COALESCE(EXCLUDED.description, organizations.description),
                                github_org_login = COALESCE(EXCLUDED.github_org_login, organizations.github_org_login),
                                is_active = TRUE,
                                updated_at = EXCLUDED.updated_at
                            """
                        ),
                        {
                            "id": org_id,
                            "slug": request.org_github_login,
                            "name": request.org_name or request.org_github_login,
                            "description": request.description,
                            "github_org_login": request.org_github_login,
                            "created_at": now,
                            "updated_at": now,
                        },
                    )
        except Exception:
            org_id = request.org_github_login

    # 0. Ensure a canonical project_profiles row (UUID id) exists.
    #    This is the identifier required by AnalyzeRequest.project_id (FK to
    #    project_profiles.id). Without this row, /v1/analyze would 404 later.
    from app.api.http.projects import _ensure_project_profile  # local import avoids cycle
    project_id = _ensure_project_profile(
        engine,
        repo_id=repo_id,
        org_id=org_id,
        display_name=project_name,
        description=request.description,
        primary_language=request.language,
        visibility=request.visibility,
    )

    # 1. Upsert legacy repo profile (display metadata keyed by repo_id)
    repo_profiles.upsert_profile(
        repo_id=repo_id,
        repo_path=None,
        indexed_commit=None,
        default_branch=request.default_branch,
        profile={
            "name": project_name,
            "description": request.description,
            "primary_language": request.language,
            "github_id": request.github_id,
            "visibility": request.visibility,
            "org_github_login": request.org_github_login,
            "org_name": request.org_name,
        },
    )

    # 2. Store branches
    branches_imported = 0
    branch_id_map: dict[str, str] = {}  # branch_name → branch_id
    for b in request.branches:
        bid = f"br_{uuid.uuid4().hex[:16]}"
        branch_type = "main" if b.is_default else "custom"
        try:
            branch_repo.create(CreateBranchInput(
                branch_id=bid,
                repo_id=project_id,
                org_id=org_id,
                branch_name=b.name,
                branch_type=branch_type,
                is_default=b.is_default,
                is_protected=b.is_default,
                is_active=True,
                metadata_json={},
            ))
            # Update last commit info if available
            if b.last_commit_sha:
                branch_repo.update(UpdateBranchInput(
                    branch_id=bid,
                    last_commit_sha=b.last_commit_sha,
                    last_commit_author=b.last_commit_author,
                    last_commit_message=b.last_commit_message,
                    last_commit_at=_parse_dt(b.last_commit_at),
                ))
            branch_id_map[b.name] = bid
            branches_imported += 1
        except Exception:
            pass  # Conflict (already exists) or schema issue

    # 4. Bulk insert commits
    commits_imported = 0
    if request.commits:
        from sqlalchemy import text as _text
        commit_rows = []
        seen_shas: set[str] = set()
        for c in request.commits:
            if c.sha in seen_shas:
                continue
            seen_shas.add(c.sha)
            import json as _json
            commit_rows.append({
                "id": f"cm_{uuid.uuid4().hex[:20]}",
                "repo_id": project_id,
                "branch_id": branch_id_map.get(c.branch_name),
                "branch_name": c.branch_name,
                "sha": c.sha,
                "message": c.message,
                "author_name": c.author_name,
                "author_email": c.author_email,
                "authored_at": _parse_dt(c.authored_at),
                "committer_name": c.committer_name,
                "committer_email": c.committer_email,
                "committed_at": _parse_dt(c.committed_at),
                "parent_shas": _json.dumps(c.parent_shas),
            })
        if commit_rows:
            with engine.begin() as conn:
                conn.execute(
                    _text("""
                        INSERT INTO repo_commits (
                            id, repo_id, branch_id, branch_name, sha, message,
                            author_name, author_email, authored_at,
                            committer_name, committer_email, committed_at, parent_shas
                        ) VALUES (
                            :id, :repo_id, :branch_id, :branch_name, :sha, :message,
                            :author_name, :author_email, :authored_at,
                            :committer_name, :committer_email, :committed_at,
                            CAST(:parent_shas AS jsonb)
                        )
                        ON CONFLICT DO NOTHING
                    """),
                    commit_rows,
                )
                commits_imported = len(commit_rows)

    # 5. Create project settings (keyed by repo_id for backward compat)
    settings_repo.get_or_create_settings(project_id=repo_id, organization_id=org_id)

    # 6. Assign creator as admin (keyed by repo_id for backward compat)
    if principal:
        try:
            rbac_repo.assign_project_role(
                user_id=principal.user_id,
                project_id=project_id,
                role_code="admin",
                assigned_by=principal.user_id,
                notes="Project creator via GitHub import",
            )
        except Exception:
            pass

    # 7. Create pending invitations for members
    members_to_invite: list[MemberToInvite] = []
    if request.members:
        from sqlalchemy import text as _text
        for member in request.members:
            # Allow members without emails - they can be invited later by GitHub login
            if not member.github_login:
                continue
            # Skip creator
            principal_github_login = (getattr(principal, "github_login", None) or "").strip().lower() if principal else ""
            if principal_github_login and member.github_login.lower() == principal_github_login:
                continue
            try:
                with engine.begin() as conn:
                    conn.execute(
                        _text("""
                            INSERT INTO pending_project_invitations
                                (id, project_id, email, github_login, role_code, invited_by, status)
                            VALUES (:id, :project_id, :email, :github_login, :role_code, :invited_by, 'pending')
                            ON CONFLICT DO NOTHING
                        """),
                        {
                            "id": f"inv_{uuid.uuid4().hex[:20]}",
                            "project_id": project_id,
                            "email": member.email.lower().strip() if member.email else None,
                            "github_login": member.github_login,
                            "role_code": member.role,
                            "invited_by": principal.user_id if principal else None,
                        },
                    )
                members_to_invite.append(MemberToInvite(
                    email=member.email.lower().strip() if member.email else None,
                    github_login=member.github_login,
                    role=member.role,
                    project_id=project_id,
                ))
            except Exception:
                pass

    return GitHubImportResponse(
        repository=RepositoryResponse(
            id=project_id,
            name=repo_name,
            full_name=repo_id,
            description=request.description,
            language=request.language,
            visibility=request.visibility,
            default_branch=request.default_branch,
            indexed_commit=None,
            ci_status="unknown",
            last_analysis_at=None,
            analysis_count=0,
            quality_score=None,
            security_score=None,
            total_findings=0,
            open_issues=0,
            created_at=now_iso,
            updated_at=now_iso,
        ),
        project_id=project_id,
        branches_imported=branches_imported,
        commits_imported=commits_imported,
        members_to_invite=members_to_invite,
    )


def _parse_dt(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        return None

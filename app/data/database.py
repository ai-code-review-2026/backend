from __future__ import annotations

from threading import Lock

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

from app.settings import settings


class DatabaseUnavailableError(Exception):
    pass


_ENGINE: Engine | None = None
_SESSION_MAKER: sessionmaker[Session] | None = None
_DB_LOCK = Lock()


def _resolve_database_url(database_url: str | None) -> str:
    if not database_url:
        raise DatabaseUnavailableError("DATABASE_URL is required for PostgreSQL runtime")

    normalized = database_url.strip()
    if normalized.startswith("postgres://"):
        normalized = "postgresql://" + normalized.removeprefix("postgres://")

    if normalized.startswith("postgresql://"):
        normalized = "postgresql+psycopg://" + normalized.removeprefix("postgresql://")

    if not normalized.startswith("postgresql+psycopg://"):
        raise DatabaseUnavailableError(
            "DATABASE_URL must be a PostgreSQL URL (example: postgresql+psycopg://postgres:example@localhost:5432/ai_code_review_platform)"
        )

    return normalized


def get_engine() -> Engine:
    global _ENGINE, _SESSION_MAKER

    with _DB_LOCK:
        if _ENGINE is None:
            database_url = _resolve_database_url(settings.DATABASE_URL)
            _ENGINE = create_engine(
                database_url,
                pool_pre_ping=True,
                pool_size=10,
                max_overflow=20,
                future=True,
            )
            _SESSION_MAKER = sessionmaker(bind=_ENGINE, autoflush=False, autocommit=False, expire_on_commit=False)

        return _ENGINE


def get_session() -> Session:
    global _SESSION_MAKER
    if _SESSION_MAKER is None:
        get_engine()
    assert _SESSION_MAKER is not None
    return _SESSION_MAKER()


def init_db() -> None:
    # Runtime bootstrap: ensure DB is reachable and table exists if migration hasn't run yet.
    # Alembic remains the source of truth for schema evolution.
    engine = get_engine()

    with engine.begin() as conn:
        conn.execute(text("SELECT 1"))
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS analyses (
                    id TEXT PRIMARY KEY,
                    repo TEXT NOT NULL,
                    provider TEXT NOT NULL DEFAULT 'github',
                    pr_number INTEGER NULL CHECK (pr_number IS NULL OR pr_number > 0),
                    commit_sha TEXT NULL,
                    source TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('RECEIVED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
                    stage TEXT NULL,
                    progress INTEGER NULL DEFAULT 0 CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100)),
                    nb_files_changed INTEGER NULL DEFAULT 0 CHECK (nb_files_changed IS NULL OR nb_files_changed >= 0),
                    additions_total INTEGER NULL DEFAULT 0 CHECK (additions_total IS NULL OR additions_total >= 0),
                    deletions_total INTEGER NULL DEFAULT 0 CHECK (deletions_total IS NULL OR deletions_total >= 0),
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    diff_hash TEXT NOT NULL,
                    diff_raw TEXT NOT NULL,
                    summary TEXT NULL,
                    diff_text TEXT NOT NULL,
                    diff_redacted TEXT NULL,
                    has_secrets BOOLEAN NOT NULL DEFAULT FALSE,
                    redaction_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
                    static_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
                    change_type TEXT NULL CHECK (change_type IS NULL OR change_type IN ('bugfix', 'feature', 'refactor')),
                    change_type_confidence DOUBLE PRECISION NULL CHECK (change_type_confidence IS NULL OR (change_type_confidence >= 0 AND change_type_confidence <= 1)),
                    change_type_source TEXT NULL CHECK (change_type_source IS NULL OR change_type_source IN ('heuristic', 'llm')),
                    change_type_signals JSONB NOT NULL DEFAULT '{}'::jsonb,
                    error_code TEXT NULL,
                    error_message TEXT NULL,
                    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    UNIQUE(repo, diff_hash)
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'github'"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS stage TEXT"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS progress INTEGER"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS nb_files_changed INTEGER"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS additions_total INTEGER"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS deletions_total INTEGER"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS diff_raw TEXT"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS summary TEXT"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS diff_text TEXT"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS diff_redacted TEXT"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS has_secrets BOOLEAN NOT NULL DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS redaction_stats JSONB NOT NULL DEFAULT '{}'::jsonb"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS static_stats JSONB NOT NULL DEFAULT '{}'::jsonb"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS change_type TEXT"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS change_type_confidence DOUBLE PRECISION"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS change_type_source TEXT"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS change_type_signals JSONB NOT NULL DEFAULT '{}'::jsonb"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS error_code TEXT"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS error_message TEXT"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS findings_count INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS blocker_count INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS warn_count INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("ALTER TABLE analyses ADD COLUMN IF NOT EXISTS info_count INTEGER NOT NULL DEFAULT 0"))
        conn.execute(text("UPDATE analyses SET diff_raw = COALESCE(diff_raw, diff_text, '') WHERE diff_raw IS NULL"))
        conn.execute(text("UPDATE analyses SET diff_text = COALESCE(diff_text, diff_raw, '') WHERE diff_text IS NULL"))
        conn.execute(text("UPDATE analyses SET updated_at = COALESCE(updated_at, created_at, NOW())"))
        conn.execute(text("UPDATE analyses SET stage = COALESCE(stage, status)"))
        conn.execute(text("UPDATE analyses SET progress = COALESCE(progress, 0)"))
        conn.execute(text("UPDATE analyses SET nb_files_changed = COALESCE(nb_files_changed, 0)"))
        conn.execute(text("UPDATE analyses SET additions_total = COALESCE(additions_total, 0)"))
        conn.execute(text("UPDATE analyses SET deletions_total = COALESCE(deletions_total, 0)"))
        conn.execute(text("UPDATE analyses SET has_secrets = COALESCE(has_secrets, FALSE)"))
        conn.execute(text("UPDATE analyses SET redaction_stats = COALESCE(redaction_stats, '{}'::jsonb)"))
        conn.execute(text("UPDATE analyses SET static_stats = COALESCE(static_stats, '{}'::jsonb)"))
        conn.execute(text("UPDATE analyses SET change_type_signals = COALESCE(change_type_signals, '{}'::jsonb)"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN diff_raw SET NOT NULL"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN diff_text SET NOT NULL"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN progress SET DEFAULT 0"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN nb_files_changed SET DEFAULT 0"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN additions_total SET DEFAULT 0"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN deletions_total SET DEFAULT 0"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN has_secrets SET DEFAULT FALSE"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN redaction_stats SET DEFAULT '{}'::jsonb"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN static_stats SET DEFAULT '{}'::jsonb"))
        conn.execute(text("ALTER TABLE analyses ALTER COLUMN change_type_signals SET DEFAULT '{}'::jsonb"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_status"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_status_check"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_progress_range"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS analyses_progress_check"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_nb_files_changed"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_additions_total"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_deletions_total"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_change_type"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_change_type_confidence"))
        conn.execute(text("ALTER TABLE analyses DROP CONSTRAINT IF EXISTS ck_analyses_change_type_source"))
        conn.execute(
            text(
                """
                ALTER TABLE analyses
                ADD CONSTRAINT ck_analyses_status
                CHECK (status IN ('RECEIVED', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED'))
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE analyses
                ADD CONSTRAINT ck_analyses_progress_range
                CHECK (progress IS NULL OR (progress >= 0 AND progress <= 100))
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE analyses
                ADD CONSTRAINT ck_analyses_nb_files_changed
                CHECK (nb_files_changed IS NULL OR nb_files_changed >= 0)
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE analyses
                ADD CONSTRAINT ck_analyses_additions_total
                CHECK (additions_total IS NULL OR additions_total >= 0)
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE analyses
                ADD CONSTRAINT ck_analyses_deletions_total
                CHECK (deletions_total IS NULL OR deletions_total >= 0)
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE analyses
                ADD CONSTRAINT ck_analyses_change_type
                CHECK (change_type IS NULL OR change_type IN ('bugfix', 'feature', 'refactor'))
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE analyses
                ADD CONSTRAINT ck_analyses_change_type_confidence
                CHECK (change_type_confidence IS NULL OR (change_type_confidence >= 0 AND change_type_confidence <= 1))
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE analyses
                ADD CONSTRAINT ck_analyses_change_type_source
                CHECK (change_type_source IS NULL OR change_type_source IN ('heuristic', 'llm'))
                """
            )
        )

        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analyses_repo_pr ON analyses(repo, pr_number)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analyses_repo_pr_sha ON analyses(repo, pr_number, commit_sha)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analyses_diff_hash ON analyses(diff_hash)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analyses_has_secrets ON analyses(has_secrets)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analyses_change_type ON analyses(change_type)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS encrypted_secrets (
                    id TEXT PRIMARY KEY,
                    namespace TEXT NOT NULL,
                    secret_key TEXT NOT NULL,
                    ciphertext TEXT NOT NULL,
                    meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(namespace, secret_key)
                )
                """
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_encrypted_secrets_namespace ON encrypted_secrets(namespace)")
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_encrypted_secrets_namespace_key ON encrypted_secrets(namespace, secret_key)"
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    display_name TEXT NULL,
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_extension_tokens (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    token_hash TEXT NOT NULL UNIQUE,
                    token_prefix TEXT NOT NULL,
                    label TEXT NULL,
                    created_by TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_used_at TIMESTAMPTZ NULL,
                    expires_at TIMESTAMPTZ NULL,
                    revoked_at TIMESTAMPTZ NULL
                )
                """
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_user_extension_tokens_user_id ON user_extension_tokens(user_id)")
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_user_extension_tokens_user_active ON user_extension_tokens(user_id, revoked_at)"
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS repo_profiles (
                    repo_id TEXT PRIMARY KEY,
                    repo_path TEXT NULL,
                    indexed_commit TEXT NULL,
                    default_branch TEXT NULL,
                    profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    overview_context TEXT NULL,
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_repo_profiles_updated_at ON repo_profiles(updated_at DESC)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS organizations (
                    id TEXT PRIMARY KEY,
                    slug TEXT NULL UNIQUE,
                    name TEXT NOT NULL,
                    description TEXT NULL,
                    clerk_org_id TEXT NULL,
                    github_org_id TEXT NULL,
                    github_org_login TEXT NULL,
                    source TEXT NOT NULL DEFAULT 'platform',
                    sync_status TEXT NOT NULL DEFAULT 'local_only',
                    is_active BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS description TEXT NULL"))
        conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS clerk_org_id TEXT NULL"))
        conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS github_org_id TEXT NULL"))
        conn.execute(text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS github_org_login TEXT NULL"))
        conn.execute(
            text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'platform'")
        )
        conn.execute(
            text("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sync_status TEXT NOT NULL DEFAULT 'local_only'")
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_organizations_is_active ON organizations(is_active)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_organizations_clerk_org_id ON organizations(clerk_org_id)"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_organizations_github_org_login ON organizations(github_org_login)")
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS organization_memberships (
                    id TEXT PRIMARY KEY,
                    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role TEXT NOT NULL DEFAULT 'member',
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(organization_id, user_id)
                )
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE organization_memberships
                DROP CONSTRAINT IF EXISTS ck_organization_memberships_role
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE organization_memberships
                DROP CONSTRAINT IF EXISTS ck_organization_memberships_status
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE organization_memberships
                ADD CONSTRAINT ck_organization_memberships_role
                CHECK (role IN ('owner', 'admin', 'member'))
                """
            )
        )
        conn.execute(
            text(
                """
                ALTER TABLE organization_memberships
                ADD CONSTRAINT ck_organization_memberships_status
                CHECK (status IN ('active', 'invited', 'revoked'))
                """
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_organization_memberships_org_id ON organization_memberships(organization_id)"
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_organization_memberships_user_id ON organization_memberships(user_id)")
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_organization_memberships_role ON organization_memberships(role)")
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS roles (
                    id TEXT PRIMARY KEY,
                    code TEXT NOT NULL UNIQUE,
                    label TEXT NOT NULL,
                    is_system BOOLEAN NOT NULL DEFAULT TRUE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_roles_code ON roles(code)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS permissions (
                    id TEXT PRIMARY KEY,
                    code TEXT NOT NULL UNIQUE,
                    description TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS user_roles (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(user_id, role_id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON user_roles(role_id)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS role_permissions (
                    id TEXT PRIMARY KEY,
                    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
                    permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(role_id, permission_id)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id)"))

        conn.execute(
            text(
                """
                INSERT INTO roles (id, code, label, is_system)
                VALUES
                    ('role_admin', 'admin', 'Administrator', TRUE),
                    ('role_tech_lead', 'tech_lead', 'Tech Lead', TRUE),
                    ('role_reviewer', 'reviewer', 'Reviewer', TRUE),
                    ('role_reviewer_lead', 'reviewer_lead', 'Lead Reviewer', TRUE),
                    ('role_reviewer_senior', 'reviewer_senior', 'Senior Reviewer', TRUE),
                    ('role_reviewer_junior', 'reviewer_junior', 'Junior Reviewer', TRUE),
                    ('role_developer', 'developer', 'Developer', TRUE),
                    ('role_viewer', 'viewer', 'Viewer', TRUE)
                ON CONFLICT (code) DO NOTHING
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO permissions (id, code, description)
                VALUES
                    ('perm_analyses_read', 'analyses.read', 'Read analyses and findings'),
                    ('perm_analyses_create', 'analyses.create', 'Create analyses'),
                    ('perm_analyses_write', 'analyses.write', 'Update analyses and findings'),
                    ('perm_secrets_manage', 'secrets.manage', 'Manage encrypted secret material')
                ON CONFLICT (code) DO NOTHING
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT INTO role_permissions (id, role_id, permission_id)
                VALUES
                    ('rp_admin_read', 'role_admin', 'perm_analyses_read'),
                    ('rp_admin_create', 'role_admin', 'perm_analyses_create'),
                    ('rp_admin_write', 'role_admin', 'perm_analyses_write'),
                    ('rp_admin_secrets', 'role_admin', 'perm_secrets_manage'),
                    ('rp_tech_lead_read', 'role_tech_lead', 'perm_analyses_read'),
                    ('rp_tech_lead_create', 'role_tech_lead', 'perm_analyses_create'),
                    ('rp_tech_lead_write', 'role_tech_lead', 'perm_analyses_write'),
                    ('rp_reviewer_read', 'role_reviewer', 'perm_analyses_read'),
                    ('rp_reviewer_create', 'role_reviewer', 'perm_analyses_create'),
                    ('rp_reviewer_write', 'role_reviewer', 'perm_analyses_write'),
                    ('rp_developer_read', 'role_developer', 'perm_analyses_read'),
                    ('rp_developer_create', 'role_developer', 'perm_analyses_create'),
                    ('rp_viewer_read', 'role_viewer', 'perm_analyses_read')
                ON CONFLICT (role_id, permission_id) DO NOTHING
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS files_changed (
                    id TEXT PRIMARY KEY,
                    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
                    file_path TEXT NOT NULL,
                    change_type TEXT NOT NULL CHECK (change_type IN ('modified', 'added', 'deleted', 'renamed')),
                    old_path TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_files_changed_analysis_id ON files_changed(analysis_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_files_changed_analysis_path ON files_changed(analysis_id, file_path)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS analysis_files (
                    id TEXT PRIMARY KEY,
                    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
                    path_old TEXT NULL,
                    path_new TEXT NOT NULL,
                    change_type TEXT NOT NULL CHECK (change_type IN ('modified', 'added', 'deleted', 'renamed')),
                    is_binary BOOLEAN NOT NULL DEFAULT FALSE,
                    additions_count INTEGER NOT NULL DEFAULT 0,
                    deletions_count INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analysis_files_analysis_id ON analysis_files(analysis_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analysis_files_path_new ON analysis_files(analysis_id, path_new)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS analysis_hunks (
                    id TEXT PRIMARY KEY,
                    analysis_file_id TEXT NOT NULL REFERENCES analysis_files(id) ON DELETE CASCADE,
                    old_start INTEGER NOT NULL,
                    old_lines INTEGER NOT NULL,
                    new_start INTEGER NOT NULL,
                    new_lines INTEGER NOT NULL,
                    header TEXT NULL,
                    raw_text TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analysis_hunks_analysis_file_id ON analysis_hunks(analysis_file_id)"))
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_analysis_hunks_ranges ON analysis_hunks(analysis_file_id, new_start, new_lines)"
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS analysis_hunk_lines (
                    id TEXT PRIMARY KEY,
                    hunk_id TEXT NOT NULL REFERENCES analysis_hunks(id) ON DELETE CASCADE,
                    line_type TEXT NOT NULL CHECK (line_type IN ('context', 'add', 'remove')),
                    content TEXT NOT NULL,
                    old_line_no INTEGER NULL,
                    new_line_no INTEGER NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_analysis_hunk_lines_hunk_id ON analysis_hunk_lines(hunk_id)"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_analysis_hunk_lines_new_line ON analysis_hunk_lines(hunk_id, new_line_no)")
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS findings (
                    id TEXT PRIMARY KEY,
                    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
                    source TEXT NOT NULL,
                    file_path TEXT NULL,
                    line_start INTEGER NULL,
                    line_end INTEGER NULL,
                    severity TEXT NOT NULL CHECK (severity IN ('INFO', 'WARN', 'BLOCKER')),
                    category TEXT NOT NULL CHECK (category IN ('security', 'perf', 'quality', 'style', 'maintainability', 'other')),
                    message TEXT NOT NULL,
                    suggestion TEXT NULL,
                    confidence DOUBLE PRECISION NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
                    issue_type TEXT NULL,
                    rule_id TEXT NULL,
                    evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    fingerprint TEXT NOT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(analysis_id, fingerprint)
                )
                """
            )
        )
        conn.execute(text("ALTER TABLE findings ADD COLUMN IF NOT EXISTS issue_type TEXT"))
        conn.execute(text("ALTER TABLE findings ADD COLUMN IF NOT EXISTS rule_id TEXT"))
        conn.execute(text("ALTER TABLE findings ADD COLUMN IF NOT EXISTS evidence_json JSONB NOT NULL DEFAULT '{}'::jsonb"))
        conn.execute(text("UPDATE findings SET evidence_json = COALESCE(evidence_json, '{}'::jsonb)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_findings_analysis_severity ON findings(analysis_id, severity)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_findings_analysis_category ON findings(analysis_id, category)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_findings_issue_type ON findings(issue_type)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_findings_rule_id ON findings(rule_id)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS tool_runs (
                    id TEXT PRIMARY KEY,
                    analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
                    tool_name TEXT NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED')),
                    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    finished_at TIMESTAMPTZ NULL,
                    duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
                    exit_code INTEGER NULL,
                    findings_count INTEGER NOT NULL DEFAULT 0 CHECK (findings_count >= 0),
                    scanned_files INTEGER NOT NULL DEFAULT 0 CHECK (scanned_files >= 0),
                    version TEXT NULL,
                    warning TEXT NULL,
                    command TEXT NULL,
                    workspace_path TEXT NULL,
                    stdout_snippet TEXT NULL,
                    stderr_snippet TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_tool_runs_analysis_id ON tool_runs(analysis_id)"))
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_tool_runs_analysis_tool ON tool_runs(analysis_id, tool_name)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS analysis_review_outputs (
                    analysis_id TEXT PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE,
                    source TEXT NOT NULL,
                    graph_rag_required BOOLEAN NOT NULL DEFAULT TRUE,
                    payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_analysis_review_outputs_source ON analysis_review_outputs(source)")
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS kb_documents (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    path_or_url TEXT NULL,
                    tags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    doc_version INTEGER NOT NULL DEFAULT 1,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS citations (
                    id TEXT PRIMARY KEY,
                    finding_id TEXT NOT NULL REFERENCES findings(id) ON DELETE CASCADE,
                    doc_id TEXT NULL REFERENCES kb_documents(id) ON DELETE SET NULL,
                    source TEXT NOT NULL,
                    excerpt TEXT NOT NULL,
                    score DOUBLE PRECISION NOT NULL DEFAULT 0,
                    meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_citations_finding_id ON citations(finding_id)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS policies (
                    id TEXT PRIMARY KEY,
                    repo TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    blocking_enabled BOOLEAN NOT NULL DEFAULT FALSE,
                    rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(repo, version)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_policies_repo_version ON policies(repo, version DESC)"))

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS kb_chunks (
                    id TEXT PRIMARY KEY,
                    doc_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
                    chunk_index INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    embedding_id TEXT NULL,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(doc_id, chunk_index)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_kb_chunks_doc_id ON kb_chunks(doc_id)"))
        conn.execute(text("ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS content TEXT"))
        conn.execute(text("ALTER TABLE kb_chunks ADD COLUMN IF NOT EXISTS token_count INTEGER"))
        conn.execute(text("UPDATE kb_chunks SET content = COALESCE(content, text) WHERE content IS NULL"))
        conn.execute(
            text(
                """
                UPDATE kb_chunks
                SET token_count = GREATEST(1, LENGTH(COALESCE(content, text, '')) / 4)
                WHERE token_count IS NULL
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_kb_chunks_content_fts
                ON kb_chunks
                USING GIN (to_tsvector('simple', COALESCE(content, text)))
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS repo_context_chunks (
                    id TEXT PRIMARY KEY,
                    repo_id TEXT NOT NULL,
                    path TEXT NOT NULL,
                    chunk_index INTEGER NOT NULL,
                    content TEXT NOT NULL,
                    language TEXT NOT NULL,
                    file_type TEXT NOT NULL,
                    chunk_type TEXT NOT NULL,
                    symbol_name TEXT NULL,
                    start_line INTEGER NULL,
                    end_line INTEGER NULL,
                    indexed_commit TEXT NULL,
                    metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    UNIQUE(repo_id, path, chunk_index, chunk_type, start_line, end_line)
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_repo_context_chunks_repo_id ON repo_context_chunks(repo_id)"))
        conn.execute(
            text("CREATE INDEX IF NOT EXISTS idx_repo_context_chunks_repo_path ON repo_context_chunks(repo_id, path)")
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_repo_context_chunks_repo_symbol ON repo_context_chunks(repo_id, symbol_name)"
            )
        )
        conn.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS idx_repo_context_chunks_content_fts
                ON repo_context_chunks
                USING GIN (to_tsvector('simple', content))
                """
            )
        )

        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    actor TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target_type TEXT NOT NULL,
                    target_id TEXT NOT NULL,
                    meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        conn.execute(text("CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)"))


def close_db() -> None:
    global _ENGINE, _SESSION_MAKER

    with _DB_LOCK:
        if _ENGINE is not None:
            try:
                _ENGINE.dispose()
            except SQLAlchemyError:
                pass
            _ENGINE = None
            _SESSION_MAKER = None

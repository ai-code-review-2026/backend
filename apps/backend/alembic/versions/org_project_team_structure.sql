-- Structure complète Organisation → Projet → Team → Repo → Branch → Commit

-- Table organisations (étendre la table existante)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS github_org_id VARCHAR(255);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS github_installation_id BIGINT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

-- Table projects (étendre project_profiles)
ALTER TABLE project_profiles ADD COLUMN IF NOT EXISTS organization_id VARCHAR(255);
ALTER TABLE project_profiles ADD COLUMN IF NOT EXISTS project_type VARCHAR(50) DEFAULT 'code';
ALTER TABLE project_profiles ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';
ALTER TABLE project_profiles ADD COLUMN IF NOT EXISTS created_by VARCHAR(255);

-- Table teams
CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    organization_id VARCHAR(255) NOT NULL,
    project_id VARCHAR(255),
    team_lead_id VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES project_profiles(id) ON DELETE CASCADE
);

-- Table team_members 
CREATE TABLE IF NOT EXISTS team_members (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    team_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'developer', -- admin, reviewer, developer
    permissions TEXT[] DEFAULT '{}',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    created_by VARCHAR(255),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    UNIQUE(team_id, user_id)
);

-- Table repositories (étendre si elle existe ou créer)
CREATE TABLE IF NOT EXISTS repositories (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL, -- owner/repo
    description TEXT,
    organization_id VARCHAR(255),
    project_id VARCHAR(255),
    team_id VARCHAR(255),
    github_repo_id BIGINT,
    github_url VARCHAR(500),
    default_branch VARCHAR(255) DEFAULT 'main',
    is_private BOOLEAN DEFAULT TRUE,
    language VARCHAR(100),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES project_profiles(id) ON DELETE CASCADE,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
);

-- Table branches
CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name VARCHAR(255) NOT NULL,
    repository_id VARCHAR(255) NOT NULL,
    commit_sha VARCHAR(255),
    is_default BOOLEAN DEFAULT FALSE,
    is_protected BOOLEAN DEFAULT FALSE,
    protection_rules JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    UNIQUE(repository_id, name)
);

-- Table commits
CREATE TABLE IF NOT EXISTS commits (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    sha VARCHAR(255) NOT NULL,
    branch_id VARCHAR(255) NOT NULL,
    repository_id VARCHAR(255) NOT NULL,
    author_name VARCHAR(255),
    author_email VARCHAR(255),
    author_id VARCHAR(255), -- user_id si connu
    message TEXT,
    additions INT DEFAULT 0,
    deletions INT DEFAULT 0,
    changed_files INT DEFAULT 0,
    committed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
    FOREIGN KEY (repository_id) REFERENCES repositories(id) ON DELETE CASCADE,
    UNIQUE(repository_id, sha)
);

-- Indexes pour performance
CREATE INDEX IF NOT EXISTS idx_teams_organization_id ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_teams_project_id ON teams(project_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_repositories_organization_id ON repositories(organization_id);
CREATE INDEX IF NOT EXISTS idx_repositories_project_id ON repositories(project_id);
CREATE INDEX IF NOT EXISTS idx_repositories_team_id ON repositories(team_id);
CREATE INDEX IF NOT EXISTS idx_branches_repository_id ON branches(repository_id);
CREATE INDEX IF NOT EXISTS idx_commits_repository_id ON commits(repository_id);
CREATE INDEX IF NOT EXISTS idx_commits_branch_id ON commits(branch_id);
CREATE INDEX IF NOT EXISTS idx_commits_author_id ON commits(author_id);

-- Foreign keys pour project_profiles vers organizations
ALTER TABLE project_profiles 
ADD CONSTRAINT fk_project_organization 
FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Triggers pour updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_teams_updated_at') THEN
        CREATE TRIGGER update_teams_updated_at 
        BEFORE UPDATE ON teams 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_repositories_updated_at') THEN
        CREATE TRIGGER update_repositories_updated_at 
        BEFORE UPDATE ON repositories 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_branches_updated_at') THEN
        CREATE TRIGGER update_branches_updated_at 
        BEFORE UPDATE ON branches 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END$$;
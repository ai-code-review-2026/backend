"""branch management system with protection, policies, and audit

Revision ID: 20260325_0016
Revises: b8c2f1e34597
Create Date: 2026-03-25 10:00:00
"""

from __future__ import annotations

from alembic import op

# revision identifiers, used by Alembic.
revision = "20260325_0016"
down_revision = "b8c2f1e34597"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ====================
    # Table: branches
    # ====================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS branches (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            repo_id TEXT NOT NULL,
            org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,

            -- Identification de la branche
            branch_name TEXT NOT NULL,
            branch_type TEXT NOT NULL,
            branch_pattern TEXT,

            -- Métadonnées Git
            last_commit_sha TEXT,
            last_commit_author TEXT,
            last_commit_message TEXT,
            last_commit_at TIMESTAMPTZ,

            -- Lifecycle de la branche
            created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            base_branch TEXT,
            merged_into TEXT,
            merge_status TEXT,
            merged_at TIMESTAMPTZ,
            merged_by TEXT REFERENCES users(id) ON DELETE SET NULL,

            -- Protection et statut
            is_protected BOOLEAN NOT NULL DEFAULT FALSE,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            -- Tracking
            ahead_count INTEGER DEFAULT 0,
            behind_count INTEGER DEFAULT 0,
            last_synced_at TIMESTAMPTZ,

            -- Métadonnées
            description TEXT,
            metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT uq_branches_repo_name UNIQUE (repo_id, branch_name)
        )
        """
    )

    # Contraintes pour branches
    op.execute("ALTER TABLE branches DROP CONSTRAINT IF EXISTS ck_branches_type")
    op.execute(
        """
        ALTER TABLE branches
        ADD CONSTRAINT ck_branches_type
        CHECK (branch_type IN ('main', 'develop', 'feature', 'hotfix', 'release', 'custom'))
        """
    )

    op.execute("ALTER TABLE branches DROP CONSTRAINT IF EXISTS ck_branches_merge_status")
    op.execute(
        """
        ALTER TABLE branches
        ADD CONSTRAINT ck_branches_merge_status
        CHECK (merge_status IS NULL OR merge_status IN ('open', 'merged', 'closed', 'deleted'))
        """
    )

    # Index pour branches
    op.execute("CREATE INDEX IF NOT EXISTS idx_branches_repo_id ON branches(repo_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branches_org_id ON branches(org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branches_type ON branches(branch_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branches_active ON branches(is_active)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branches_protected ON branches(is_protected)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branches_merge_status ON branches(merge_status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branches_created_by ON branches(created_by)")

    # ====================
    # Table: branch_protection_rules
    # ====================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS branch_protection_rules (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            repo_id TEXT NOT NULL,

            -- Ciblage de la règle
            branch_pattern TEXT,
            applies_to_type TEXT,

            -- Restrictions de merge
            require_pull_request BOOLEAN NOT NULL DEFAULT TRUE,
            required_approvals INTEGER NOT NULL DEFAULT 1,
            require_code_owner_review BOOLEAN NOT NULL DEFAULT FALSE,
            dismiss_stale_reviews BOOLEAN NOT NULL DEFAULT FALSE,
            require_review_from_lead BOOLEAN NOT NULL DEFAULT FALSE,

            -- Restrictions de commit
            block_direct_commits BOOLEAN NOT NULL DEFAULT TRUE,
            allow_force_pushes BOOLEAN NOT NULL DEFAULT FALSE,
            allow_deletions BOOLEAN NOT NULL DEFAULT FALSE,

            -- Status checks
            require_status_checks BOOLEAN NOT NULL DEFAULT FALSE,
            required_status_checks JSONB NOT NULL DEFAULT '[]'::jsonb,
            require_branches_up_to_date BOOLEAN NOT NULL DEFAULT FALSE,

            -- Auto-assignation de reviewers
            auto_assign_reviewers BOOLEAN NOT NULL DEFAULT FALSE,
            required_reviewer_roles JSONB NOT NULL DEFAULT '[]'::jsonb,

            -- Restrictions par rôle
            allowed_merge_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
            allowed_push_roles JSONB NOT NULL DEFAULT '[]'::jsonb,
            bypass_roles JSONB NOT NULL DEFAULT '[]'::jsonb,

            -- Enforcement
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            enforcement_level TEXT NOT NULL DEFAULT 'strict',

            created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # Contraintes pour branch_protection_rules
    op.execute("ALTER TABLE branch_protection_rules DROP CONSTRAINT IF EXISTS ck_branch_protection_enforcement")
    op.execute(
        """
        ALTER TABLE branch_protection_rules
        ADD CONSTRAINT ck_branch_protection_enforcement
        CHECK (enforcement_level IN ('strict', 'moderate', 'advisory'))
        """
    )

    op.execute("ALTER TABLE branch_protection_rules DROP CONSTRAINT IF EXISTS ck_branch_protection_applies_to")
    op.execute(
        """
        ALTER TABLE branch_protection_rules
        ADD CONSTRAINT ck_branch_protection_applies_to
        CHECK (applies_to_type IS NULL OR applies_to_type IN ('main', 'develop', 'feature', 'hotfix', 'release', 'all'))
        """
    )

    # Index pour branch_protection_rules
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_protection_branch ON branch_protection_rules(branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_protection_org ON branch_protection_rules(org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_protection_repo ON branch_protection_rules(repo_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_protection_pattern ON branch_protection_rules(branch_pattern)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_protection_type ON branch_protection_rules(applies_to_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_protection_active ON branch_protection_rules(is_active)")

    # ====================
    # Table: branch_permissions
    # ====================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS branch_permissions (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,

            -- Ciblage par type de branche
            branch_type TEXT,
            repo_id TEXT,

            -- Permissions d'opérations sur les branches
            can_create_branch BOOLEAN NOT NULL DEFAULT FALSE,
            can_delete_branch BOOLEAN NOT NULL DEFAULT FALSE,
            can_rename_branch BOOLEAN NOT NULL DEFAULT FALSE,
            can_merge_to_branch BOOLEAN NOT NULL DEFAULT FALSE,
            can_force_push BOOLEAN NOT NULL DEFAULT FALSE,
            can_push BOOLEAN NOT NULL DEFAULT FALSE,

            -- Opérations de protection
            can_configure_protection BOOLEAN NOT NULL DEFAULT FALSE,
            can_bypass_protection BOOLEAN NOT NULL DEFAULT FALSE,
            can_approve_merges BOOLEAN NOT NULL DEFAULT FALSE,
            can_block_merges BOOLEAN NOT NULL DEFAULT FALSE,

            -- Opérations de politique
            can_set_default_branch BOOLEAN NOT NULL DEFAULT FALSE,
            can_archive_branch BOOLEAN NOT NULL DEFAULT FALSE,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT uq_branch_permissions_org_role_type UNIQUE (org_id, role_id, branch_type, repo_id)
        )
        """
    )

    # Contraintes pour branch_permissions
    op.execute("ALTER TABLE branch_permissions DROP CONSTRAINT IF EXISTS ck_branch_permissions_type")
    op.execute(
        """
        ALTER TABLE branch_permissions
        ADD CONSTRAINT ck_branch_permissions_type
        CHECK (branch_type IS NULL OR branch_type IN ('main', 'develop', 'feature', 'hotfix', 'release', 'custom'))
        """
    )

    # Index pour branch_permissions
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_permissions_org ON branch_permissions(org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_permissions_role ON branch_permissions(role_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_permissions_type ON branch_permissions(branch_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_permissions_repo ON branch_permissions(repo_id)")

    # ====================
    # Table: branch_reviewer_assignments
    # ====================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS branch_reviewer_assignments (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            repo_id TEXT NOT NULL,

            -- Ciblage de branche
            branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
            branch_pattern TEXT,
            branch_type TEXT,

            -- Assignation de reviewer
            reviewer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            assignment_type TEXT NOT NULL DEFAULT 'manual',

            -- Règles d'auto-assignation
            auto_assign_on_pr BOOLEAN NOT NULL DEFAULT FALSE,
            priority INTEGER NOT NULL DEFAULT 0,
            conditions JSONB NOT NULL DEFAULT '{}'::jsonb,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,

            created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # Contraintes pour branch_reviewer_assignments
    op.execute("ALTER TABLE branch_reviewer_assignments DROP CONSTRAINT IF EXISTS ck_branch_reviewer_assignment_type")
    op.execute(
        """
        ALTER TABLE branch_reviewer_assignments
        ADD CONSTRAINT ck_branch_reviewer_assignment_type
        CHECK (assignment_type IN ('manual', 'auto', 'codeowner'))
        """
    )

    op.execute("ALTER TABLE branch_reviewer_assignments DROP CONSTRAINT IF EXISTS ck_branch_reviewer_branch_type")
    op.execute(
        """
        ALTER TABLE branch_reviewer_assignments
        ADD CONSTRAINT ck_branch_reviewer_branch_type
        CHECK (branch_type IS NULL OR branch_type IN ('main', 'develop', 'feature', 'hotfix', 'release', 'custom'))
        """
    )

    # Index pour branch_reviewer_assignments
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_reviewer_org ON branch_reviewer_assignments(org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_reviewer_repo ON branch_reviewer_assignments(repo_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_reviewer_branch ON branch_reviewer_assignments(branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_reviewer_pattern ON branch_reviewer_assignments(branch_pattern)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_reviewer_type ON branch_reviewer_assignments(branch_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_reviewer_user ON branch_reviewer_assignments(reviewer_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_reviewer_auto ON branch_reviewer_assignments(auto_assign_on_pr)")

    # ====================
    # Table: branch_policies
    # ====================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS branch_policies (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

            -- Identification de la politique
            policy_name TEXT NOT NULL,
            policy_type TEXT NOT NULL,

            -- Conventions de nommage
            branch_naming_patterns JSONB NOT NULL DEFAULT '{}'::jsonb,
            enforce_naming BOOLEAN NOT NULL DEFAULT FALSE,

            -- Politiques de workflow
            require_base_branch BOOLEAN NOT NULL DEFAULT FALSE,
            allowed_base_branches JSONB NOT NULL DEFAULT '[]'::jsonb,
            auto_delete_on_merge BOOLEAN NOT NULL DEFAULT FALSE,
            max_branch_age_days INTEGER,

            -- Stratégies de merge
            allowed_merge_methods JSONB NOT NULL DEFAULT '["merge", "squash", "rebase"]'::jsonb,
            default_merge_method TEXT NOT NULL DEFAULT 'merge',

            -- Portée
            applies_to_repos JSONB NOT NULL DEFAULT '[]'::jsonb,

            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            priority INTEGER NOT NULL DEFAULT 0,

            description TEXT,
            created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT uq_branch_policies_org_name UNIQUE (org_id, policy_name)
        )
        """
    )

    # Contraintes pour branch_policies
    op.execute("ALTER TABLE branch_policies DROP CONSTRAINT IF EXISTS ck_branch_policies_type")
    op.execute(
        """
        ALTER TABLE branch_policies
        ADD CONSTRAINT ck_branch_policies_type
        CHECK (policy_type IN ('naming', 'workflow', 'protection', 'merge_strategy'))
        """
    )

    op.execute("ALTER TABLE branch_policies DROP CONSTRAINT IF EXISTS ck_branch_policies_merge_method")
    op.execute(
        """
        ALTER TABLE branch_policies
        ADD CONSTRAINT ck_branch_policies_merge_method
        CHECK (default_merge_method IN ('merge', 'squash', 'rebase'))
        """
    )

    # Index pour branch_policies
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_policies_org ON branch_policies(org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_policies_type ON branch_policies(policy_type)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_policies_active ON branch_policies(is_active)")

    # ====================
    # Table: branch_merge_requests
    # ====================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS branch_merge_requests (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            analysis_id TEXT REFERENCES analyses(id) ON DELETE CASCADE,
            org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
            repo_id TEXT NOT NULL,

            -- Information de branche
            source_branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
            target_branch_id TEXT NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
            source_branch_name TEXT NOT NULL,
            target_branch_name TEXT NOT NULL,

            -- Métadonnées PR
            pr_number INTEGER,
            pr_title TEXT,
            pr_author TEXT REFERENCES users(id) ON DELETE SET NULL,

            -- Statut
            status TEXT NOT NULL DEFAULT 'open',
            merge_method TEXT,

            -- Approbations
            required_approvals INTEGER NOT NULL DEFAULT 1,
            approvals_count INTEGER NOT NULL DEFAULT 0,
            approvers JSONB NOT NULL DEFAULT '[]'::jsonb,
            blockers JSONB NOT NULL DEFAULT '[]'::jsonb,

            -- Checks
            checks_status TEXT,
            checks_details JSONB NOT NULL DEFAULT '{}'::jsonb,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            merged_at TIMESTAMPTZ,
            closed_at TIMESTAMPTZ
        )
        """
    )

    # Contraintes pour branch_merge_requests
    op.execute("ALTER TABLE branch_merge_requests DROP CONSTRAINT IF EXISTS ck_branch_merge_status")
    op.execute(
        """
        ALTER TABLE branch_merge_requests
        ADD CONSTRAINT ck_branch_merge_status
        CHECK (status IN ('open', 'approved', 'changes_requested', 'merged', 'closed'))
        """
    )

    op.execute("ALTER TABLE branch_merge_requests DROP CONSTRAINT IF EXISTS ck_branch_merge_method")
    op.execute(
        """
        ALTER TABLE branch_merge_requests
        ADD CONSTRAINT ck_branch_merge_method
        CHECK (merge_method IS NULL OR merge_method IN ('merge', 'squash', 'rebase'))
        """
    )

    op.execute("ALTER TABLE branch_merge_requests DROP CONSTRAINT IF EXISTS ck_branch_merge_checks")
    op.execute(
        """
        ALTER TABLE branch_merge_requests
        ADD CONSTRAINT ck_branch_merge_checks
        CHECK (checks_status IS NULL OR checks_status IN ('pending', 'passing', 'failing'))
        """
    )

    # Index pour branch_merge_requests
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_merge_analysis ON branch_merge_requests(analysis_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_merge_org ON branch_merge_requests(org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_merge_repo ON branch_merge_requests(repo_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_merge_source ON branch_merge_requests(source_branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_merge_target ON branch_merge_requests(target_branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_merge_status ON branch_merge_requests(status)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_merge_pr ON branch_merge_requests(repo_id, pr_number)")

    # ====================
    # Table: branch_audit_logs
    # ====================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS branch_audit_logs (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            branch_id TEXT REFERENCES branches(id) ON DELETE SET NULL,
            org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
            repo_id TEXT NOT NULL,

            -- Détails de l'action
            action TEXT NOT NULL,
            actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
            actor_role TEXT,

            -- Contexte
            branch_name TEXT NOT NULL,
            target_branch_name TEXT,

            -- Détails
            action_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Résultat
            success BOOLEAN NOT NULL DEFAULT TRUE,
            error_message TEXT,

            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """
    )

    # Contraintes pour branch_audit_logs
    op.execute("ALTER TABLE branch_audit_logs DROP CONSTRAINT IF EXISTS ck_branch_audit_action")
    op.execute(
        """
        ALTER TABLE branch_audit_logs
        ADD CONSTRAINT ck_branch_audit_action
        CHECK (action IN ('create', 'delete', 'rename', 'merge', 'protect', 'unprotect',
                          'push', 'force_push', 'set_default', 'archive', 'restore'))
        """
    )

    # Index pour branch_audit_logs
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_audit_branch ON branch_audit_logs(branch_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_audit_org ON branch_audit_logs(org_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_audit_repo ON branch_audit_logs(repo_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_audit_actor ON branch_audit_logs(actor_id)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_audit_action ON branch_audit_logs(action)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_branch_audit_created ON branch_audit_logs(created_at DESC)")


def downgrade() -> None:
    # Suppression dans l'ordre inverse pour respecter les dépendances
    op.execute("DROP TABLE IF EXISTS branch_audit_logs")
    op.execute("DROP TABLE IF EXISTS branch_merge_requests")
    op.execute("DROP TABLE IF EXISTS branch_policies")
    op.execute("DROP TABLE IF EXISTS branch_reviewer_assignments")
    op.execute("DROP TABLE IF EXISTS branch_permissions")
    op.execute("DROP TABLE IF EXISTS branch_protection_rules")
    op.execute("DROP TABLE IF EXISTS branches")

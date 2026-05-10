"""add_project_comprehension_tables

Revision ID: b8c2f1e34597
Revises: adfb337c22e0
Create Date: 2026-03-24 18:00:00

This migration adds tables for the enhanced RAG-based code review system:
- project_profiles: Comprehensive project understanding profiles
- context_snapshots: Context version tracking for rollback
- kb_documents_registry: Knowledge base documents registry
- org_rules: Organization-level rules and policies
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8c2f1e34597'
down_revision: Union[str, None] = 'adfb337c22e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create project_profiles table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS project_profiles (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            repo_id TEXT NOT NULL UNIQUE,
            org_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
            context_version INTEGER NOT NULL DEFAULT 1,

            -- Structure information
            root_directories JSONB NOT NULL DEFAULT '[]'::jsonb,
            main_languages JSONB NOT NULL DEFAULT '[]'::jsonb,
            secondary_languages JSONB NOT NULL DEFAULT '[]'::jsonb,
            frameworks_detected JSONB NOT NULL DEFAULT '[]'::jsonb,
            package_managers JSONB NOT NULL DEFAULT '[]'::jsonb,
            total_files INTEGER DEFAULT 0,
            total_directories INTEGER DEFAULT 0,
            code_files_count INTEGER DEFAULT 0,
            config_files_count INTEGER DEFAULT 0,
            doc_files_count INTEGER DEFAULT 0,
            test_files_count INTEGER DEFAULT 0,

            -- Architecture information
            architecture_pattern TEXT,
            architecture_confidence FLOAT,
            entry_points JSONB NOT NULL DEFAULT '[]'::jsonb,
            core_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
            api_endpoints_count INTEGER DEFAULT 0,
            has_api_layer BOOLEAN DEFAULT false,
            has_data_layer BOOLEAN DEFAULT false,
            has_service_layer BOOLEAN DEFAULT false,
            has_presentation_layer BOOLEAN DEFAULT false,
            layer_separation_score FLOAT DEFAULT 0,

            -- Quality indicators
            has_tests BOOLEAN DEFAULT false,
            test_framework TEXT,
            test_coverage_estimated FLOAT,
            has_ci_cd BOOLEAN DEFAULT false,
            ci_cd_platform TEXT,
            has_documentation BOOLEAN DEFAULT false,
            documentation_quality_score FLOAT DEFAULT 0,
            has_readme BOOLEAN DEFAULT false,
            has_contributing BOOLEAN DEFAULT false,
            has_license BOOLEAN DEFAULT false,
            has_changelog BOOLEAN DEFAULT false,
            has_linting BOOLEAN DEFAULT false,
            linting_tools JSONB NOT NULL DEFAULT '[]'::jsonb,
            has_type_hints BOOLEAN DEFAULT false,
            type_coverage_estimated FLOAT,

            -- Dependencies
            external_dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
            external_dependencies_count INTEGER DEFAULT 0,
            dev_dependencies_count INTEGER DEFAULT 0,
            internal_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
            internal_dependencies_graph JSONB NOT NULL DEFAULT '{}'::jsonb,
            has_lockfile BOOLEAN DEFAULT false,

            -- Descriptions (for frontend display)
            business_description TEXT,
            technical_summary TEXT,

            -- Raw metadata for advanced queries
            raw_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

            -- Status
            analysis_status TEXT NOT NULL DEFAULT 'pending',
            analysis_error TEXT,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            last_context_update_at TIMESTAMPTZ,

            -- Constraints
            CONSTRAINT ck_project_profiles_status CHECK (
                analysis_status IN ('pending', 'analyzing', 'completed', 'failed')
            ),
            CONSTRAINT ck_project_profiles_arch_pattern CHECK (
                architecture_pattern IS NULL OR architecture_pattern IN (
                    'monolith', 'microservices', 'serverless', 'modular_monolith',
                    'layered', 'hexagonal', 'event_driven', 'unknown'
                )
            )
        )
        """
    )

    # Create indexes for project_profiles
    op.execute("CREATE INDEX idx_project_profiles_repo_id ON project_profiles(repo_id)")
    op.execute("CREATE INDEX idx_project_profiles_org_id ON project_profiles(org_id)")
    op.execute("CREATE INDEX idx_project_profiles_status ON project_profiles(analysis_status)")
    op.execute("CREATE INDEX idx_project_profiles_languages ON project_profiles USING GIN (main_languages)")
    op.execute("CREATE INDEX idx_project_profiles_frameworks ON project_profiles USING GIN (frameworks_detected)")

    # Create context_snapshots table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS context_snapshots (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            repo_id TEXT NOT NULL,
            context_version INTEGER NOT NULL,
            snapshot_type TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            trigger_ref TEXT,
            chunks_count INTEGER NOT NULL DEFAULT 0,
            qdrant_point_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

            -- Constraints
            CONSTRAINT ck_context_snapshots_type CHECK (
                snapshot_type IN ('full', 'incremental')
            ),
            CONSTRAINT ck_context_snapshots_trigger CHECK (
                trigger_type IN ('onboarding', 'commit', 'pr', 'scheduled', 'manual')
            )
        )
        """
    )

    # Create indexes for context_snapshots
    op.execute("CREATE INDEX idx_context_snapshots_repo ON context_snapshots(repo_id)")
    op.execute("CREATE INDEX idx_context_snapshots_version ON context_snapshots(repo_id, context_version)")
    op.execute("CREATE INDEX idx_context_snapshots_created ON context_snapshots(created_at)")

    # Create kb_documents_registry table (enhanced from existing kb_documents)
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS kb_documents_registry (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
            source_type TEXT NOT NULL,
            source_uri TEXT NOT NULL,
            title TEXT NOT NULL,
            category TEXT,
            tags JSONB NOT NULL DEFAULT '[]'::jsonb,
            content_hash TEXT NOT NULL,
            version TEXT,
            chunks_count INTEGER NOT NULL DEFAULT 0,
            qdrant_collection TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            last_synced_at TIMESTAMPTZ,
            sync_error TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

            -- Constraints
            CONSTRAINT uq_kb_docs_registry_org_uri_hash UNIQUE (org_id, source_uri, content_hash),
            CONSTRAINT ck_kb_docs_registry_source_type CHECK (
                source_type IN ('pdf', 'markdown', 'web', 'code_reference', 'sql', 'generic')
            ),
            CONSTRAINT ck_kb_docs_registry_category CHECK (
                category IS NULL OR category IN (
                    'security', 'architecture', 'style', 'domain', 'api', 'testing', 'other'
                )
            ),
            CONSTRAINT ck_kb_docs_registry_status CHECK (
                status IN ('active', 'inactive', 'syncing', 'error')
            )
        )
        """
    )

    # Create indexes for kb_documents_registry
    op.execute("CREATE INDEX idx_kb_docs_registry_org ON kb_documents_registry(org_id)")
    op.execute("CREATE INDEX idx_kb_docs_registry_type ON kb_documents_registry(source_type)")
    op.execute("CREATE INDEX idx_kb_docs_registry_category ON kb_documents_registry(category)")
    op.execute("CREATE INDEX idx_kb_docs_registry_status ON kb_documents_registry(status)")
    op.execute("CREATE INDEX idx_kb_docs_registry_hash ON kb_documents_registry(content_hash)")

    # Create org_rules table
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS org_rules (
            id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            rule_type TEXT NOT NULL,
            rule_name TEXT NOT NULL,
            description TEXT,
            severity TEXT NOT NULL DEFAULT 'WARN',
            scope TEXT NOT NULL DEFAULT 'all',
            rule_content TEXT NOT NULL,
            examples JSONB NOT NULL DEFAULT '[]'::jsonb,
            exceptions JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_active BOOLEAN NOT NULL DEFAULT true,
            priority INTEGER NOT NULL DEFAULT 0,
            qdrant_point_id TEXT,
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            created_by TEXT REFERENCES users(id),

            -- Constraints
            CONSTRAINT uq_org_rules_name UNIQUE (org_id, rule_name),
            CONSTRAINT ck_org_rules_type CHECK (
                rule_type IN ('security', 'quality', 'style', 'architecture', 'naming', 'documentation', 'testing', 'other')
            ),
            CONSTRAINT ck_org_rules_severity CHECK (
                severity IN ('INFO', 'WARN', 'BLOCKER')
            ),
            CONSTRAINT ck_org_rules_scope CHECK (
                scope IN ('all', 'backend', 'frontend', 'api', 'database', 'tests', 'config')
            )
        )
        """
    )

    # Create indexes for org_rules
    op.execute("CREATE INDEX idx_org_rules_org ON org_rules(org_id)")
    op.execute("CREATE INDEX idx_org_rules_type ON org_rules(rule_type)")
    op.execute("CREATE INDEX idx_org_rules_active ON org_rules(org_id, is_active)")
    op.execute("CREATE INDEX idx_org_rules_severity ON org_rules(severity)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS org_rules")
    op.execute("DROP TABLE IF EXISTS kb_documents_registry")
    op.execute("DROP TABLE IF EXISTS context_snapshots")
    op.execute("DROP TABLE IF EXISTS project_profiles")

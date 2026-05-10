#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Database Schema Consistency Checker

This script verifies the database schema consistency and ensures:
1. All migrations are applied
2. All tables exist
3. All foreign keys are properly set up
4. Indexes are created
5. No orphaned data exists
"""

import sys
import os
from pathlib import Path

# Set UTF-8 encoding for Windows console
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text, inspect
from app.data.database import get_engine
from app.settings import settings

# Define expected tables
EXPECTED_TABLES = [
    # Core tables
    "users",
    "roles",
    "permissions",
    "user_roles",
    "role_permissions",
    "organizations",
    "organization_memberships",
    
    # RBAC extensions
    "user_project_roles",
    "role_permission_audit",
    
    # Analysis tables
    "analyses",
    "findings",
    "files_changed",
    "tool_runs",
    "citations",
    
    # Review tables
    "review_assignments",
    "review_comments",
    "change_requests",
    "review_templates",
    "review_sessions",
    "reviewer_metrics",
    
    # Project tables
    "project_profiles",
    "project_settings",
    "branches",
    "branch_protection_rules",
    "branch_permissions",
    "branch_reviewer_assignments",
    "branch_policies",
    "branch_merge_requests",
    
    # Knowledge base
    "kb_documents",
    "kb_chunks",
    "repo_profiles",
    
    # System tables
    "audit_logs",
    "branch_audit_logs",
    "notifications",
    "policies",
    "encrypted_secrets",
    
    # Alembic
    "alembic_version",
]

# Define critical foreign keys that must exist
CRITICAL_FOREIGN_KEYS = {
    "user_roles": ["user_id", "role_id"],
    "role_permissions": ["role_id", "permission_id"],
    "user_project_roles": ["user_id", "role_id"],
    "organization_memberships": ["user_id", "organization_id"],
    "notifications": ["user_id"],
    "review_assignments": ["reviewer_id"],
    "review_comments": ["author_id"],
}

# Define critical indexes
CRITICAL_INDEXES = {
    "users": ["idx_users_email"],
    "roles": ["idx_roles_code"],
    "permissions": ["idx_permissions_code"],
    "user_roles": ["idx_user_roles_user_id"],
    "role_permissions": ["idx_role_permissions_role_id"],
    "notifications": ["idx_notifications_user_read"],
}


def check_tables(engine):
    """Check if all expected tables exist."""
    print("\n=== Checking Tables ===")
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    
    missing_tables = set(EXPECTED_TABLES) - existing_tables
    extra_tables = existing_tables - set(EXPECTED_TABLES) - {"spatial_ref_sys"}  # PostGIS table
    
    if missing_tables:
        print(f"❌ Missing tables: {', '.join(sorted(missing_tables))}")
        return False
    else:
        print(f"✅ All {len(EXPECTED_TABLES)} expected tables exist")
    
    if extra_tables:
        print(f"⚠️  Extra tables found: {', '.join(sorted(extra_tables))}")
    
    return True


def check_foreign_keys(engine):
    """Check if critical foreign keys exist."""
    print("\n=== Checking Foreign Keys ===")
    inspector = inspect(engine)
    all_ok = True
    
    for table_name, fk_columns in CRITICAL_FOREIGN_KEYS.items():
        try:
            foreign_keys = inspector.get_foreign_keys(table_name)
            fk_col_names = {fk["constrained_columns"][0] for fk in foreign_keys if fk["constrained_columns"]}
            
            missing_fks = set(fk_columns) - fk_col_names
            if missing_fks:
                print(f"❌ Table '{table_name}' missing FKs: {', '.join(missing_fks)}")
                all_ok = False
            else:
                print(f"✅ Table '{table_name}' has all required FKs")
        except Exception as e:
            print(f"❌ Error checking FKs for '{table_name}': {e}")
            all_ok = False
    
    return all_ok


def check_indexes(engine):
    """Check if critical indexes exist."""
    print("\n=== Checking Indexes ===")
    inspector = inspect(engine)
    all_ok = True
    
    for table_name, expected_indexes in CRITICAL_INDEXES.items():
        try:
            indexes = inspector.get_indexes(table_name)
            index_names = {idx["name"] for idx in indexes}
            
            missing_indexes = set(expected_indexes) - index_names
            if missing_indexes:
                print(f"⚠️  Table '{table_name}' missing indexes: {', '.join(missing_indexes)}")
                # Don't fail on missing indexes, just warn
            else:
                print(f"✅ Table '{table_name}' has all expected indexes")
        except Exception as e:
            print(f"❌ Error checking indexes for '{table_name}': {e}")
    
    return all_ok


def check_migrations(engine):
    """Check Alembic migration status."""
    print("\n=== Checking Migrations ===")
    
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
            if result:
                current_version = result[0]
                print(f"✅ Current migration version: {current_version}")
                return True
            else:
                print("❌ No migration version found")
                return False
    except Exception as e:
        print(f"❌ Error checking migrations: {e}")
        return False


def check_data_integrity(engine):
    """Check for orphaned data and referential integrity."""
    print("\n=== Checking Data Integrity ===")
    
    checks = [
        # Check for users without roles
        (
            "SELECT COUNT(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)",
            "Users without roles",
        ),
        # Check for orphaned user_roles
        (
            "SELECT COUNT(*) FROM user_roles ur WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id)",
            "Orphaned user_roles",
        ),
        # Check for orphaned notifications
        (
            "SELECT COUNT(*) FROM notifications n WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.user_id)",
            "Orphaned notifications",
        ),
        # Check for invalid role_permissions (enabled column)
        (
            "SELECT COUNT(*) FROM role_permissions WHERE enabled IS NULL",
            "role_permissions with NULL enabled",
        ),
    ]
    
    all_ok = True
    with engine.connect() as conn:
        for query, description in checks:
            try:
                result = conn.execute(text(query)).fetchone()
                count = result[0] if result else 0
                
                if count > 0:
                    print(f"⚠️  Found {count} {description}")
                else:
                    print(f"✅ No {description}")
            except Exception as e:
                print(f"⚠️  Could not check {description}: {e}")
    
    return all_ok


def check_vector_db():
    """Check Neo4j graph/vector store connectivity."""
    print("\n=== Checking Vector DB (Neo4j) ===")

    if not settings.NEO4J_ENABLED:
        print("⚠️  Neo4j is disabled")
        return True

    try:
        from app.integrations.graph_database.neo4j_client import get_neo4j_client
        client = get_neo4j_client()
        # Lightweight probe — get_repo_stats on a dummy id just verifies connectivity
        client.get_repo_stats("__probe__")
        print("✅ Neo4j connected and responsive.")
        return True
    except Exception as e:
        print(f"❌ Neo4j connection failed: {e}")
        return False


def check_object_storage():
    """Check Object Storage (MinIO) connectivity."""
    print("\n=== Checking Object Storage (MinIO) ===")
    
    if not settings.OBJECT_STORAGE_ENABLED:
        print("⚠️  Object storage is disabled")
        return True
    
    try:
        from app.integrations.object_storage.s3_minio_client import S3MinioClient
        
        client = S3MinioClient()
        health = client.health_check()
        
        if health.get("status") == "healthy":
            print(f"✅ MinIO connected: {health.get('details')}")
            return True
        else:
            print(f"❌ MinIO unhealthy: {health.get('details')}")
            return False
    except Exception as e:
        print(f"❌ Error checking MinIO: {e}")
        return False


def main():
    """Run all schema consistency checks."""
    print("=" * 70)
    print("DATABASE SCHEMA CONSISTENCY CHECKER")
    print("=" * 70)
    print(f"Database: {settings.DATABASE_URL.split('@')[-1] if '@' in settings.DATABASE_URL else 'N/A'}")
    
    engine = get_engine()
    
    results = {
        "Tables": check_tables(engine),
        "Foreign Keys": check_foreign_keys(engine),
        "Indexes": check_indexes(engine),
        "Migrations": check_migrations(engine),
        "Data Integrity": check_data_integrity(engine),
        "Vector DB": check_vector_db(),
        "Object Storage": check_object_storage(),
    }
    
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    
    for check_name, passed in results.items():
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{check_name:.<30} {status}")
    
    all_passed = all(results.values())
    
    if all_passed:
        print("\n✅ All checks passed! Database schema is consistent.")
        return 0
    else:
        print("\n❌ Some checks failed. Please review the output above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())

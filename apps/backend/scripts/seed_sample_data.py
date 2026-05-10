"""
Sample data seed script for development and testing.

This script creates realistic sample data including:
- Organizations and team members
- Users
- Analyses and findings
- Review assignments

Usage:
    poetry run python scripts/seed_sample_data.py
"""

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import create_engine, text

from app.settings import settings


def get_engine():
    """Get database engine from settings."""
    return create_engine(settings.DATABASE_URL)


def seed_organizations_and_members(engine, count: int = 3):
    """Create sample organizations and team members."""
    print(f"Creating {count} organizations and members...")
    
    org_ids = []
    user_ids = []
    
    with engine.begin() as conn:
        # Create users first
        for i in range(count * 2):
            user_id = str(uuid.uuid4())
            email = f"user{i}@example.com"
            
            insert_user = text("""
                INSERT INTO users (id, email, display_name, is_active, created_at, updated_at)
                VALUES (:id, :email, :name, true, NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
            """)
            
            conn.execute(insert_user, {
                "id": user_id,
                "email": email,
                "name": f"User {i}",
            })
            user_ids.append(user_id)
        
        # Create organizations
        for i in range(count):
            org_id = str(uuid.uuid4())
            org_name = f"Team {chr(65 + i)}"  # Team A, Team B, Team C
            
            insert_org = text("""
                INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at)
                VALUES (:id, :name, :slug, true, NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
            """)
            
            conn.execute(insert_org, {
                "id": org_id,
                "name": org_name,
                "slug": org_name.lower().replace(" ", "-"),
            })
            org_ids.append(org_id)
            
            # Add members to organization
            for j in range(min(2, len(user_ids) - i * 2)):
                user_idx = i * 2 + j
                if user_idx < len(user_ids):
                    membership_id = str(uuid.uuid4())
                    role = "owner" if j == 0 else "member"
                    
                    insert_membership = text("""
                        INSERT INTO organization_memberships 
                        (id, organization_id, user_id, role, status, created_at, updated_at)
                        VALUES (:id, :org_id, :user_id, :role, 'active', NOW(), NOW())
                        ON CONFLICT (organization_id, user_id) DO NOTHING
                    """)
                    
                    conn.execute(insert_membership, {
                        "id": membership_id,
                        "org_id": org_id,
                        "user_id": user_ids[user_idx],
                        "role": role,
                    })
    
    print(f"  ✓ Created {len(org_ids)} organizations")
    print(f"  ✓ Created {len(user_ids)} users")
    return org_ids, user_ids


def seed_analyses_and_findings(engine, count: int = 20):
    """Create sample analyses and findings."""
    print(f"Creating {count} analyses with findings...")
    
    now = datetime.now(timezone.utc)
    analysis_ids = []
    
    with engine.begin() as conn:
        for i in range(count):
            analysis_id = str(uuid.uuid4())
            
            # Create analysis
            created_at = now - timedelta(days=30 - (i % 30))
            insert_analysis = text("""
                INSERT INTO analyses 
                (id, repo, provider, source, status, diff_hash, diff_raw, created_at, updated_at, metadata_json, redaction_stats_json, static_stats_json, change_type_signals_json)
                VALUES (:id, :repo, 'github', 'api', :status, :hash, :diff, :created_at, :updated_at, '{}', '{}', '{}', '{}')
                ON CONFLICT (id) DO NOTHING
            """)
            
            status = ["COMPLETED", "FAILED", "COMPLETED"][i % 3]
            repo = ["owner/repo-1", "owner/repo-2", "org/project"][i % 3]
            
            conn.execute(insert_analysis, {
                "id": analysis_id,
                "repo": repo,
                "status": status,
                "hash": f"hash_{i}",
                "diff": "dummy diff content",
                "created_at": created_at,
                "updated_at": created_at + timedelta(hours=1),
            })
            analysis_ids.append(analysis_id)
            
            # Create findings for this analysis
            findings_count = i % 5 + 1
            for j in range(findings_count):
                finding_id = str(uuid.uuid4())
                categories = ["security", "performance", "maintainability", "reliability", "style"]
                severities = ["BLOCKER", "CRITICAL", "WARN", "INFO"]
                
                insert_finding = text("""
                    INSERT INTO findings 
                    (id, analysis_id, source, category, severity, message, confidence, fingerprint, evidence_json, created_at)
                    VALUES (:id, :analysis_id, 'tool', :category, :severity, :message, 0.95, :fingerprint, '{}', :created_at)
                    ON CONFLICT (id) DO NOTHING
                """)
                
                conn.execute(insert_finding, {
                    "id": finding_id,
                    "analysis_id": analysis_id,
                    "category": categories[j % len(categories)],
                    "severity": severities[j % len(severities)],
                    "message": f"Finding {j} in analysis {i}",
                    "fingerprint": f"fingerprint_{analysis_id}_{j}",
                    "created_at": created_at,
                })
    
    print(f"  ✓ Created {len(analysis_ids)} analyses")
    print(f"  ✓ Created {count * 5} findings")
    return analysis_ids


def seed_review_assignments(engine, user_ids: list[str], count: int = 15):
    """Create sample review assignments."""
    print(f"Creating {count} review assignments...")
    
    now = datetime.now(timezone.utc)
    
    if not user_ids:
        print("  ⚠ No users available for review assignments")
        return
    
    with engine.begin() as conn:
        for i in range(count):
            assignment_id = str(uuid.uuid4())
            
            assigned_at = now - timedelta(days=15 - (i % 15))
            completed_at = assigned_at + timedelta(hours=2 + (i % 10))
            
            status = ["completed", "pending", "in_progress"][i % 3]
            if status == "pending":
                completed_at = None
            
            reviewer_idx = i % len(user_ids)
            
            insert_assignment = text("""
                INSERT INTO review_assignments 
                (id, reviewer_id, analysis_id, status, assigned_at, completed_at, created_at, updated_at)
                VALUES (:id, :reviewer_id, :analysis_id, :status, :assigned_at, :completed_at, :created_at, :updated_at)
                ON CONFLICT (id) DO NOTHING
            """)
            
            conn.execute(insert_assignment, {
                "id": assignment_id,
                "reviewer_id": user_ids[reviewer_idx],
                "analysis_id": str(uuid.uuid4()),  # Reference to analysis
                "status": status,
                "assigned_at": assigned_at,
                "completed_at": completed_at,
                "created_at": assigned_at,
                "updated_at": now,
            })
    
    print(f"  ✓ Created {count} review assignments")


def main():
    """Run all seed operations."""
    print("\n" + "=" * 60)
    print("AI Code Review Platform - Sample Data Seeder")
    print("=" * 60 + "\n")
    
    try:
        engine = get_engine()
        print(f"Connected to database: {settings.DATABASE_URL}\n")
        
        # Seed data
        org_ids, user_ids = seed_organizations_and_members(engine, count=3)
        analysis_ids = seed_analyses_and_findings(engine, count=20)
        seed_review_assignments(engine, user_ids, count=15)
        
        print("\n" + "=" * 60)
        print("✅ Sample data created successfully!")
        print("=" * 60)
        print("\nYou can now:")
        print("1. Start the backend: uvicorn app.main:app --reload")
        print("2. Visit http://localhost:3000/dashboard/statistics")
        print("3. See your data in the dashboard\n")
        
    except Exception as e:
        print(f"\n❌ Error seeding data: {e}")
        import traceback
        traceback.print_exc()
        raise


if __name__ == "__main__":
    main()

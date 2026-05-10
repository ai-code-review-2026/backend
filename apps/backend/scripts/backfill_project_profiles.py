#!/usr/bin/env python3
"""
Backfill script to ensure all analyses have valid project_id references.

This script:
1. Creates project_profiles entries for any repository that has analyses but no project profile
2. Updates analyses to link to their corresponding project profiles
3. Reports on the results

This resolves the "Project not found, Project ID is required" error when viewing analysis diffs.
"""

import asyncio
import sys
from pathlib import Path

# Add the app directory to Python path so we can import our modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.data.database import get_engine
from sqlalchemy import text


def backfill_project_profiles():
    """Run the project profiles backfill process."""
    print("Starting project profiles backfill...")
    
    engine = get_engine()
    
    try:
        with engine.begin() as conn:
            # Get initial statistics
            result = conn.execute(text('SELECT COUNT(*) as count FROM analyses'))
            total_analyses = result.scalar()
            print(f"Total analyses: {total_analyses}")
            
            result = conn.execute(text('SELECT COUNT(*) as count FROM project_profiles'))
            total_profiles = result.scalar()
            print(f"Total project_profiles: {total_profiles}")
            
            result = conn.execute(text('SELECT COUNT(*) as count FROM analyses WHERE project_id IS NULL'))
            null_project_ids = result.scalar()
            print(f"Analyses with NULL project_id: {null_project_ids}")
            
            if null_project_ids == 0:
                print("✅ All analyses already have valid project_id references!")
                return
                
            # Step 1: Create project_profiles for any repo with analyses but no project profile
            print("\n1. Creating missing project_profiles...")
            result = conn.execute(
                text('''
                    INSERT INTO project_profiles (id, repo_id, context_version, analysis_status, created_at, last_analyzed_at)
                    SELECT gen_random_uuid()::text, lower(a.repo), 1, 'pending', now(), now()
                    FROM (SELECT DISTINCT repo FROM analyses WHERE repo IS NOT NULL) a
                    WHERE lower(a.repo) NOT IN (SELECT repo_id FROM project_profiles)
                    ON CONFLICT (repo_id) DO NOTHING
                ''')
            )
            profiles_created = result.rowcount
            print(f"Created {profiles_created} new project_profiles")
            
            # Step 2: Update analyses to link to their project profiles
            print("\n2. Linking analyses to project_profiles...")
            result = conn.execute(
                text('''
                    UPDATE analyses a
                    SET project_id = pp.id
                    FROM project_profiles pp
                    WHERE a.project_id IS NULL
                      AND lower(a.repo) = pp.repo_id
                ''')
            )
            analyses_updated = result.rowcount
            print(f"Updated {analyses_updated} analyses with project_id")
            
            # Step 3: Final verification
            print("\n3. Verification...")
            result = conn.execute(text('SELECT COUNT(*) as count FROM analyses WHERE project_id IS NULL'))
            remaining_null = result.scalar()
            print(f"Remaining analyses with NULL project_id: {remaining_null}")
            
            if remaining_null > 0:
                print("⚠️  Some analyses still have NULL project_id. These may have invalid repo names.")
                # Show which repos have issues
                result = conn.execute(
                    text('''
                        SELECT DISTINCT repo, COUNT(*) as analysis_count 
                        FROM analyses 
                        WHERE project_id IS NULL 
                        GROUP BY repo 
                        ORDER BY analysis_count DESC
                    ''')
                )
                problematic_repos = result.fetchall()
                print("Problematic repositories:")
                for row in problematic_repos:
                    print(f"  - {row.repo}: {row.analysis_count} analyses")
            else:
                print("✅ All analyses now have valid project_id references!")
                
    except Exception as e:
        print(f"❌ Error during backfill: {e}")
        raise


if __name__ == "__main__":
    backfill_project_profiles()
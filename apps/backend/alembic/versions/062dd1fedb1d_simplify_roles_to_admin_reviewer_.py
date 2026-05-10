"""simplify_roles_to_admin_reviewer_developer

Revision ID: 062dd1fedb1d
Revises: 20260411_0024
Create Date: 2026-04-16 03:45:50.823602

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '062dd1fedb1d'
down_revision: Union[str, None] = '20260411_0024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Simplify role system from 6 roles to 3 roles:
    - Keep: admin, developer
    - Merge: tech_lead -> admin
    - Merge: reviewer_lead, reviewer_senior, reviewer_junior -> reviewer
    
    This migration:
    1. Creates new 'reviewer' role if it doesn't exist
    2. Migrates user_roles: tech_lead->admin, reviewer_*->reviewer
    3. Migrates user_project_roles similarly
    4. Migrates organization_memberships role field
    5. Removes obsolete role records (tech_lead, reviewer_lead, reviewer_senior, reviewer_junior)
    """
    
    # Step 1: Create 'reviewer' role if it doesn't exist
    op.execute("""
        INSERT INTO roles (id, code, label, is_system)
        VALUES ('role_reviewer', 'reviewer', 'Reviewer', TRUE)
        ON CONFLICT (code) DO NOTHING
    """)
    
    # Step 2: Copy permissions from reviewer_senior to reviewer (most representative)
    # Use ON CONFLICT on the unique constraint (role_id, permission_id)
    op.execute("""
        INSERT INTO role_permissions (id, role_id, permission_id)
        SELECT 
            'rp_reviewer_' || REPLACE(permission_id, 'perm_', ''),
            'role_reviewer',
            permission_id
        FROM role_permissions
        WHERE role_id = 'role_reviewer_senior'
        ON CONFLICT (role_id, permission_id) DO NOTHING
    """)
    
    # Step 3: Migrate user_roles table
    # Map tech_lead -> admin
    op.execute("""
        UPDATE user_roles
        SET role_id = 'role_admin'
        WHERE role_id = 'role_tech_lead'
    """)
    
    # Map reviewer_lead, reviewer_senior, reviewer_junior -> reviewer
    op.execute("""
        UPDATE user_roles
        SET role_id = 'role_reviewer'
        WHERE role_id IN ('role_reviewer_lead', 'role_reviewer_senior', 'role_reviewer_junior')
    """)
    
    # Step 4: Migrate user_project_roles table
    # Map tech_lead -> admin
    op.execute("""
        UPDATE user_project_roles
        SET role_id = 'role_admin'
        WHERE role_id = 'role_tech_lead'
    """)
    
    # Map reviewer variants -> reviewer
    op.execute("""
        UPDATE user_project_roles
        SET role_id = 'role_reviewer'
        WHERE role_id IN ('role_reviewer_lead', 'role_reviewer_senior', 'role_reviewer_junior')
    """)
    
    # Step 5: Migrate organization_memberships table (if role field exists)
    op.execute("""
        UPDATE organization_memberships
        SET role = 'admin'
        WHERE role = 'tech_lead'
    """)
    
    op.execute("""
        UPDATE organization_memberships
        SET role = 'reviewer'
        WHERE role IN ('reviewer_lead', 'reviewer_senior', 'reviewer_junior')
    """)
    
    # Step 6: Clean up duplicate user_roles (user can't have admin+tech_lead after migration)
    op.execute("""
        DELETE FROM user_roles a
        USING user_roles b
        WHERE a.id > b.id 
        AND a.user_id = b.user_id 
        AND a.role_id = b.role_id
    """)
    
    # Step 7: Remove obsolete role_permissions entries
    op.execute("""
        DELETE FROM role_permissions
        WHERE role_id IN ('role_tech_lead', 'role_reviewer_lead', 'role_reviewer_senior', 'role_reviewer_junior')
    """)
    
    # Step 8: Remove obsolete roles
    op.execute("""
        DELETE FROM roles
        WHERE code IN ('tech_lead', 'reviewer_lead', 'reviewer_senior', 'reviewer_junior')
    """)


def downgrade() -> None:
    """
    Downgrade is intentionally complex and lossy:
    - Re-create the 4 removed roles
    - Map reviewer -> reviewer_senior (default)
    - Map admin -> admin (no change for existing admins)
    - Note: Original granular reviewer level data is lost
    """
    
    # Re-create removed roles
    op.execute("""
        INSERT INTO roles (id, code, label, is_system)
        VALUES 
            ('role_tech_lead', 'tech_lead', 'Tech Lead', TRUE),
            ('role_reviewer_lead', 'reviewer_lead', 'Lead Reviewer', TRUE),
            ('role_reviewer_senior', 'reviewer_senior', 'Senior Reviewer', TRUE),
            ('role_reviewer_junior', 'reviewer_junior', 'Junior Reviewer', TRUE)
        ON CONFLICT (code) DO NOTHING
    """)
    
    # Map reviewer back to reviewer_senior (default)
    op.execute("""
        UPDATE user_roles
        SET role_id = 'role_reviewer_senior'
        WHERE role_id = 'role_reviewer'
    """)
    
    op.execute("""
        UPDATE user_project_roles
        SET role_id = 'role_reviewer_senior'
        WHERE role_id = 'role_reviewer'
    """)
    
    op.execute("""
        UPDATE organization_memberships
        SET role = 'reviewer_senior'
        WHERE role = 'reviewer'
    """)
    
    # Remove the generic 'reviewer' role
    op.execute("""
        DELETE FROM role_permissions
        WHERE role_id = 'role_reviewer'
    """)
    
    op.execute("""
        DELETE FROM roles
        WHERE code = 'reviewer'
    """)

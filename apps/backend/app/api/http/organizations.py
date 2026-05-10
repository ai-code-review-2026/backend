"""
Organizations API endpoints for managing multi-tenant organizations.
"""
from __future__ import annotations

import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Path, Body, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.engine import Connection

from app.api.middleware.auth import (
    AuthenticatedPrincipal,
    get_current_principal,
    principal_has_role,
    require_auth,
    require_role,
)
from app.data.database import get_engine
from app.settings import settings

import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/organizations", tags=["organizations"])


class CreateOrganizationRequest(BaseModel):
    clerk_organization_id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=255)
    github_org_id: int | None = None
    github_org_name: str | None = Field(None, max_length=255)


class UpdateOrganizationRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    slug: str | None = Field(None, max_length=255)
    github_org_id: int | None = None
    github_org_name: str | None = Field(None, max_length=255)


class AddMemberRequest(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=255)
    role: Literal["admin", "tech_lead", "reviewer", "developer"] = Field(default="developer")
    status: Literal["active", "invited", "revoked"] = Field(default="active")


class UpdateMemberRequest(BaseModel):
    role: Literal["admin", "tech_lead", "reviewer", "developer"] | None = None
    status: Literal["active", "invited", "revoked"] | None = None


def _to_iso(dt: Any) -> str | None:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _ensure_org_visibility(conn: Connection, org_id: str, principal: AuthenticatedPrincipal) -> None:
    if principal_has_role(principal, "admin"):
        return

    membership = conn.execute(
        text(
            """
            SELECT role, status
            FROM organization_memberships
            WHERE organization_id = :org_id AND user_id = :user_id
            LIMIT 1
            """
        ),
        {"org_id": org_id, "user_id": principal.user_id},
    ).mappings().first()

    if membership is None or str(membership.get("status") or "").strip().lower() != "active":
        raise HTTPException(status_code=403, detail="Not a member of this organization")


def _ensure_org_admin(principal: AuthenticatedPrincipal) -> None:
    if not principal_has_role(principal, "admin"):
        raise HTTPException(status_code=403, detail="Admin access required")


@router.post("")
async def create_organization(
    request: CreateOrganizationRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_role("admin")),
):
    """Create a new organization in the database."""
    engine = get_engine()
    
    with engine.begin() as conn:
        # Check if organization already exists
        existing = conn.execute(
            text("""
                SELECT id FROM organizations 
                WHERE id = :clerk_id
                LIMIT 1
            """),
            {"clerk_id": request.clerk_organization_id}
        ).first()
        
        if existing:
            logger.info(f"Organization {request.clerk_organization_id} already exists")
            return {"id": request.clerk_organization_id, "exists": True}
        
        # Create organization
        conn.execute(
            text("""
                INSERT INTO organizations (
                    id, name, slug, created_at, updated_at
                )
                VALUES (
                    :id, :name, :slug, NOW(), NOW()
                )
            """),
            {
                "id": request.clerk_organization_id,
                "name": request.name,
                "slug": request.slug or request.name.lower().replace(" ", "-"),
            }
        )
        
        logger.info(f"Organization {request.clerk_organization_id} created successfully")
        
        return {
            "id": request.clerk_organization_id,
            "name": request.name,
            "slug": request.slug,
        }


@router.get("/{org_id}")
async def get_organization(
    org_id: str = Path(..., min_length=1),
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
):
    """Get organization details."""
    engine = get_engine()
    
    with engine.connect() as conn:
        org_row = conn.execute(
            text("""
                SELECT id, name, slug, created_at, updated_at
                FROM organizations
                WHERE id = :org_id
                LIMIT 1
            """),
            {"org_id": org_id}
        ).mappings().first()
        
        if not org_row:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        if principal is None:
            raise HTTPException(status_code=401, detail="Authentication required")
        _ensure_org_visibility(conn, org_id, principal)
        membership = conn.execute(
            text(
                """
                SELECT role, status
                FROM organization_memberships
                WHERE organization_id = :org_id AND user_id = :user_id
                LIMIT 1
                """
            ),
            {"org_id": org_id, "user_id": principal.user_id},
        ).mappings().first()
        
        return {
            "id": str(org_row["id"]),
            "name": str(org_row["name"]),
            "slug": str(org_row.get("slug") or ""),
            "createdAt": _to_iso(org_row.get("created_at")),
            "updatedAt": _to_iso(org_row.get("updated_at")),
            "role": str(membership["role"]) if membership else None,
        }


@router.patch("/{org_id}")
async def update_organization(
    request: UpdateOrganizationRequest,
    org_id: str = Path(..., min_length=1),
    principal: AuthenticatedPrincipal | None = Depends(require_role("admin")),
):
    """Update organization details."""
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    engine = get_engine()
    
    with engine.begin() as conn:
        # Check if exists
        existing = conn.execute(
            text("SELECT id FROM organizations WHERE id = :org_id LIMIT 1"),
            {"org_id": org_id}
        ).first()
        
        if not existing:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Build update query
        updates = []
        params = {"org_id": org_id}
        
        if request.name is not None:
            updates.append("name = :name")
            params["name"] = request.name
        
        if request.slug is not None:
            updates.append("slug = :slug")
            params["slug"] = request.slug
        
        if updates:
            updates.append("updated_at = NOW()")
            conn.execute(
                text(f"UPDATE organizations SET {', '.join(updates)} WHERE id = :org_id"),
                params
            )
        
        logger.info(f"Organization {org_id} updated successfully")
        
        return {"id": org_id, "updated": True}


@router.delete("/{org_id}")
async def delete_organization(
    org_id: str = Path(..., min_length=1),
    principal: AuthenticatedPrincipal | None = Depends(require_role("admin")),
):
    """Delete an organization (soft delete)."""
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    engine = get_engine()
    
    with engine.begin() as conn:
        # Check if exists
        existing = conn.execute(
            text("SELECT id FROM organizations WHERE id = :org_id LIMIT 1"),
            {"org_id": org_id}
        ).first()
        
        if not existing:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Soft delete - just mark as inactive or delete memberships
        # For now, we'll delete memberships (CASCADE will handle related data)
        conn.execute(
            text("DELETE FROM organization_memberships WHERE organization_id = :org_id"),
            {"org_id": org_id}
        )
        
        # Delete organization
        conn.execute(
            text("DELETE FROM organizations WHERE id = :org_id"),
            {"org_id": org_id}
        )
        
        logger.info(f"Organization {org_id} deleted successfully")
        
        return {"id": org_id, "deleted": True}


@router.get("")
async def list_organizations(
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
):
    """List organizations the user is a member of."""
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    engine = get_engine()
    
    with engine.connect() as conn:
        query = """
            SELECT DISTINCT o.id, o.name, o.slug, o.created_at, om.role
            FROM organizations o
            LEFT JOIN organization_memberships om ON om.organization_id = o.id AND om.user_id = :user_id
            WHERE om.user_id = :user_id OR :is_admin = TRUE
            ORDER BY o.name ASC
        """
        
        rows = conn.execute(
            text(query),
            {
                "user_id": principal.user_id,
                "is_admin": principal_has_role(principal, "admin"),
            }
        ).mappings().all()
        
        return {
            "items": [
                {
                    "id": str(row["id"]),
                    "name": str(row["name"]),
                    "slug": str(row.get("slug") or ""),
                    "createdAt": _to_iso(row.get("created_at")),
                    "role": str(row.get("role") or "member"),
                }
                for row in rows
            ]
        }


# ============================================================================
# Organization Members Endpoints
# ============================================================================

@router.get("/{org_id}/members")
async def list_organization_members(
    org_id: str = Path(..., min_length=1),
    principal: AuthenticatedPrincipal | None = Depends(require_auth),
):
    """List all members of an organization."""
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    engine = get_engine()
    
    with engine.connect() as conn:
        # Check org exists
        org = conn.execute(
            text("SELECT id FROM organizations WHERE id = :org_id LIMIT 1"),
            {"org_id": org_id}
        ).first()
        
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        _ensure_org_visibility(conn, org_id, principal)
        
        # Get members with user details
        rows = conn.execute(
            text("""
                SELECT 
                    om.id as membership_id,
                    om.user_id,
                    om.role,
                    om.status,
                    om.created_at,
                    u.email,
                    u.display_name,
                    u.avatar_url
                FROM organization_memberships om
                LEFT JOIN users u ON u.id = om.user_id
                WHERE om.organization_id = :org_id
                ORDER BY om.created_at ASC
            """),
            {"org_id": org_id}
        ).mappings().all()
        
        return {
            "items": [
                {
                    "id": str(row["membership_id"]),
                    "userId": str(row["user_id"]),
                    "role": str(row["role"]),
                    "status": str(row["status"]),
                    "createdAt": _to_iso(row.get("created_at")),
                    "user": {
                        "id": str(row["user_id"]),
                        "email": str(row.get("email") or ""),
                        "displayName": str(row.get("display_name") or ""),
                        "avatarUrl": str(row.get("avatar_url") or ""),
                    } if row.get("email") else None,
                }
                for row in rows
            ],
            "total": len(rows),
        }


@router.post("/{org_id}/members")
async def add_organization_member(
    request: AddMemberRequest,
    org_id: str = Path(..., min_length=1),
    principal: AuthenticatedPrincipal | None = Depends(require_role("admin")),
):
    """Add a member to an organization."""
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    engine = get_engine()
    
    with engine.begin() as conn:
        # Check org exists
        org = conn.execute(
            text("SELECT id FROM organizations WHERE id = :org_id LIMIT 1"),
            {"org_id": org_id}
        ).first()
        
        if not org:
            raise HTTPException(status_code=404, detail="Organization not found")
        
        # Check if user exists
        user = conn.execute(
            text("SELECT id FROM users WHERE id = :user_id LIMIT 1"),
            {"user_id": request.user_id}
        ).first()
        
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Check if membership already exists
        existing = conn.execute(
            text("""
                SELECT id FROM organization_memberships 
                WHERE organization_id = :org_id AND user_id = :user_id
                LIMIT 1
            """),
            {"org_id": org_id, "user_id": request.user_id}
        ).first()
        
        if existing:
            # Update existing membership
            conn.execute(
                text("""
                    UPDATE organization_memberships
                    SET role = :role, status = :status, updated_at = NOW()
                    WHERE organization_id = :org_id AND user_id = :user_id
                """),
                {
                    "org_id": org_id,
                    "user_id": request.user_id,
                    "role": _map_platform_role_to_db_role(request.role),
                    "status": request.status,
                }
            )
            logger.info(f"Updated membership: user={request.user_id} org={org_id}")
            return {"id": str(existing[0]), "updated": True}
        
        # Create new membership
        membership_id = str(uuid.uuid4())
        conn.execute(
            text("""
                INSERT INTO organization_memberships (
                    id, organization_id, user_id, role, status, created_at, updated_at
                )
                VALUES (
                    :id, :org_id, :user_id, :role, :status, NOW(), NOW()
                )
            """),
            {
                "id": membership_id,
                "org_id": org_id,
                "user_id": request.user_id,
                "role": _map_platform_role_to_db_role(request.role),
                "status": request.status,
            }
        )
        
        logger.info(f"Created membership: user={request.user_id} org={org_id} role={request.role}")
        
        return {
            "id": membership_id,
            "userId": request.user_id,
            "organizationId": org_id,
            "role": request.role,
            "status": request.status,
        }


@router.patch("/{org_id}/members/{user_id}")
async def update_organization_member(
    request: UpdateMemberRequest,
    org_id: str = Path(..., min_length=1),
    user_id: str = Path(..., min_length=1),
    principal: AuthenticatedPrincipal | None = Depends(require_role("admin")),
):
    """Update a member's role or status in an organization."""
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    engine = get_engine()
    
    with engine.begin() as conn:
        # Check membership exists
        existing = conn.execute(
            text("""
                SELECT id, role, status FROM organization_memberships 
                WHERE organization_id = :org_id AND user_id = :user_id
                LIMIT 1
            """),
            {"org_id": org_id, "user_id": user_id}
        ).mappings().first()
        
        if not existing:
            raise HTTPException(status_code=404, detail="Membership not found")
        
        # Build update query
        updates = ["updated_at = NOW()"]
        params = {"org_id": org_id, "user_id": user_id}
        
        if request.role is not None:
            updates.append("role = :role")
            params["role"] = _map_platform_role_to_db_role(request.role)
        
        if request.status is not None:
            updates.append("status = :status")
            params["status"] = request.status
        
        conn.execute(
            text(f"""
                UPDATE organization_memberships 
                SET {', '.join(updates)}
                WHERE organization_id = :org_id AND user_id = :user_id
            """),
            params
        )
        
        logger.info(f"Updated membership: user={user_id} org={org_id}")
        
        return {
            "id": str(existing["id"]),
            "userId": user_id,
            "organizationId": org_id,
            "role": request.role or str(existing["role"]),
            "status": request.status or str(existing["status"]),
            "updated": True,
        }


@router.delete("/{org_id}/members/{user_id}")
async def remove_organization_member(
    org_id: str = Path(..., min_length=1),
    user_id: str = Path(..., min_length=1),
    principal: AuthenticatedPrincipal | None = Depends(require_role("admin")),
):
    """Remove a member from an organization."""
    if principal is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    engine = get_engine()
    
    with engine.begin() as conn:
        # Check membership exists
        existing = conn.execute(
            text("""
                SELECT id FROM organization_memberships 
                WHERE organization_id = :org_id AND user_id = :user_id
                LIMIT 1
            """),
            {"org_id": org_id, "user_id": user_id}
        ).first()
        
        if not existing:
            raise HTTPException(status_code=404, detail="Membership not found")
        
        # Delete membership
        conn.execute(
            text("""
                DELETE FROM organization_memberships 
                WHERE organization_id = :org_id AND user_id = :user_id
            """),
            {"org_id": org_id, "user_id": user_id}
        )
        
        logger.info(f"Deleted membership: user={user_id} org={org_id}")
        
        return {"deleted": True, "userId": user_id, "organizationId": org_id}


def _map_platform_role_to_db_role(platform_role: str) -> str:
    """
    Map platform roles (admin, tech_lead, developer) to DB roles (owner, admin, member).
    The DB uses a different role vocabulary for historical reasons.
    """
    mapping = {
        "admin": "admin",
        "tech_lead": "member",
        "reviewer": "member",  # reviewers are members with elevated permissions
        "developer": "member",
    }
    return mapping.get(platform_role, "member")

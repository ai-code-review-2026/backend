from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.data.database import get_engine
from app.data.models.rbac import RBACOrganizationMembership, RBACUser


_CLERK_ROLE_TO_DB_ROLE: dict[str, str] = {
    "admin": "admin",
    "tech_lead": "tech_lead",
    "tech-lead": "tech_lead",
    "techlead": "tech_lead",
    "lead": "tech_lead",
    "team_lead": "tech_lead",
    "team-lead": "tech_lead",
    "reviewer": "tech_lead",
    "reviewer_lead": "tech_lead",
    "reviewer_senior": "tech_lead",
    "reviewer_junior": "tech_lead",
    "developer": "developer",
    "viewer": "developer",
    "member": "developer",
    "user": "developer",
}


class RBACRepo:
    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    @staticmethod
    def _normalize_email(user_id: str, email: str) -> str:
        cleaned = email.strip().lower()
        if "@" in cleaned:
            return cleaned
        return f"{user_id}@clerk.local"

    @staticmethod
    def _role_for_db(clerk_role: str) -> str:
        return _CLERK_ROLE_TO_DB_ROLE.get(clerk_role.strip().lower(), "developer")

    @staticmethod
    def _normalize_org_role(value: str | None) -> str:
        if not value:
            return "member"
        normalized = value.strip().lower()
        if normalized.startswith("org:"):
            normalized = normalized.removeprefix("org:")
        alias_map = {
            "owner": "owner",
            "admin": "admin",
            "member": "member",
            "basic_member": "member",
            "basic-member": "member",
            "contributor": "member",
            "developer": "member",
            "dev": "member",
        }
        return alias_map.get(normalized, "member")

    @staticmethod
    def _parse_permission_codes(raw: object) -> list[str]:
        import json

        if raw is None:
            return []
        if isinstance(raw, str):
            try:
                parsed = json.loads(raw) if raw else []
            except json.JSONDecodeError:
                parsed = []
        elif isinstance(raw, list):
            parsed = raw
        else:
            parsed = []

        normalized: list[str] = []
        for item in parsed:
            if not isinstance(item, str):
                continue
            code = item.strip()
            if code and code not in normalized:
                normalized.append(code)
        return normalized

    @staticmethod
    def _merge_effective_permissions(
        *,
        role_permissions: list[str],
        granted_permissions: list[str],
        revoked_permissions: list[str],
    ) -> list[str]:
        granted = {code.strip() for code in granted_permissions if isinstance(code, str) and code.strip()}
        revoked = {code.strip() for code in revoked_permissions if isinstance(code, str) and code.strip()}
        effective = (set(role_permissions) | granted) - revoked
        return sorted(effective)

    def upsert_clerk_user(self, user_id: str, email: str, display_name: str | None, clerk_role: str) -> None:
        normalized_email = self._normalize_email(user_id=user_id, email=email)
        normalized_role = self._role_for_db(clerk_role)
        with self._engine.begin() as conn:
            # Use a nested transaction (SAVEPOINT) for the optimistic insert.
            # A unique constraint violation on the first INSERT will abort the
            # nested transaction only, allowing the outer transaction to continue
            # and run the fallback INSERT without entering an aborted state.
            try:
                try:
                    with conn.begin_nested():
                        conn.execute(
                            text(
                                """
                                INSERT INTO users (id, email, display_name, is_active)
                                VALUES (:user_id, :email, :display_name, TRUE)
                                ON CONFLICT (id) DO UPDATE
                                SET email = CASE
                                        WHEN EXCLUDED.email LIKE '%@clerk.local'
                                             AND users.email IS NOT NULL
                                             AND users.email NOT LIKE '%@clerk.local'
                                        THEN users.email
                                        ELSE EXCLUDED.email
                                    END,
                                    display_name = COALESCE(EXCLUDED.display_name, users.display_name),
                                    is_active = TRUE
                                """
                            ),
                            {"user_id": user_id, "email": normalized_email, "display_name": display_name},
                        )
                except IntegrityError:
                    # Nested transaction failed (likely email uniqueness). Rollback of the
                    # nested savepoint leaves the outer transaction usable; perform fallback.
                    conn.execute(
                        text(
                            """
                            INSERT INTO users (id, email, display_name, is_active)
                            VALUES (:user_id, :fallback_email, :display_name, TRUE)
                            ON CONFLICT (id) DO UPDATE
                            SET display_name = COALESCE(EXCLUDED.display_name, users.display_name),
                                is_active = TRUE
                            """
                        ),
                        {
                            "user_id": user_id,
                            "fallback_email": f"{user_id}@clerk.local",
                            "display_name": display_name,
                        },
                    )
            except Exception:
                # Let the outer transaction manager propagate unexpected errors.
                raise

            role_row = (
                conn.execute(
                    text(
                        """
                        SELECT id
                        FROM roles
                        WHERE code = :role_code
                        LIMIT 1
                        """
                    ),
                    {"role_code": normalized_role},
                )
                .mappings()
                .first()
            )
            if role_row is None:
                role_row = (
                    conn.execute(
                        text(
                            """
                            SELECT id
                            FROM roles
                            WHERE code IN ('developer', 'tech_lead', 'viewer')
                            ORDER BY CASE
                                WHEN code = 'developer' THEN 0
                                WHEN code = 'tech_lead' THEN 1
                                ELSE 2
                            END
                            LIMIT 1
                            """
                        )
                    )
                    .mappings()
                    .first()
                )

            if role_row is None:
                return

            role_id = str(role_row["id"])
            # Clerk is the source of truth for system roles.
            conn.execute(
                text(
                    """
                    DELETE FROM user_roles
                    WHERE user_id = :user_id
                      AND role_id IN (
                        SELECT id
                        FROM roles
                        WHERE is_system = TRUE
                      )
                    """
                ),
                {"user_id": user_id},
            )
            conn.execute(
                text(
                    """
                    INSERT INTO user_roles (id, user_id, role_id)
                    VALUES (:id, :user_id, :role_id)
                    ON CONFLICT (user_id, role_id) DO NOTHING
                    """
                ),
                {
                    "id": f"ur_{user_id}_{role_id}",
                    "user_id": user_id,
                    "role_id": role_id,
                },
            )

    def upsert_organization_membership(
        self,
        user_id: str,
        organization_id: str,
        organization_name: str,
        organization_slug: str | None,
        organization_role: str | None,
    ) -> None:
        normalized_org_id = organization_id.strip()
        if not normalized_org_id:
            return

        normalized_name = organization_name.strip() if organization_name.strip() else normalized_org_id
        normalized_slug = organization_slug.strip().lower() if isinstance(organization_slug, str) and organization_slug.strip() else None
        normalized_role = self._normalize_org_role(organization_role)
        membership_id = f"orgm_{normalized_org_id}_{user_id}"

        with self._engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO organizations (id, slug, name, is_active)
                    VALUES (:org_id, :slug, :name, TRUE)
                    ON CONFLICT (id) DO UPDATE
                    SET slug = COALESCE(EXCLUDED.slug, organizations.slug),
                        name = COALESCE(EXCLUDED.name, organizations.name),
                        is_active = TRUE,
                        updated_at = NOW()
                    """
                ),
                {"org_id": normalized_org_id, "slug": normalized_slug, "name": normalized_name},
            )

            conn.execute(
                text(
                    """
                    INSERT INTO organization_memberships (
                        id,
                        organization_id,
                        user_id,
                        role,
                        status
                    )
                    VALUES (:id, :organization_id, :user_id, :role, 'active')
                    ON CONFLICT (organization_id, user_id) DO UPDATE
                    SET role = EXCLUDED.role,
                        status = 'active',
                        updated_at = NOW()
                    """
                ),
                {
                    "id": membership_id,
                    "organization_id": normalized_org_id,
                    "user_id": user_id,
                    "role": normalized_role,
                },
            )

    def get_user(self, user_id: str) -> RBACUser | None:
        with self._engine.connect() as conn:
            user_row = (
                conn.execute(
                    text(
                        """
                        SELECT id, email, display_name, is_active, custom_permissions
                        FROM users
                        WHERE id = :user_id
                        LIMIT 1
                        """
                    ),
                    {"user_id": user_id},
                )
                .mappings()
                .first()
            )
            if user_row is None:
                return None

            role_rows = (
                conn.execute(
                    text(
                        """
                        SELECT r.code
                        FROM roles r
                        JOIN user_roles ur ON ur.role_id = r.id
                        WHERE ur.user_id = :user_id
                        ORDER BY r.code ASC
                        """
                    ),
                    {"user_id": user_id},
                )
                .mappings()
                .all()
            )
            permission_rows = (
                conn.execute(
                    text(
                        """
                        SELECT DISTINCT p.code
                        FROM permissions p
                        JOIN role_permissions rp ON rp.permission_id = p.id
                        JOIN user_roles ur ON ur.role_id = rp.role_id
                        WHERE ur.user_id = :user_id
                          AND (rp.enabled IS NULL OR rp.enabled = TRUE)
                        ORDER BY p.code ASC
                        """
                    ),
                    {"user_id": user_id},
                )
                .mappings()
                .all()
            )

            membership_rows = (
                conn.execute(
                    text(
                        """
                        SELECT
                            om.organization_id,
                            om.role,
                            om.status,
                            o.name AS organization_name,
                            o.slug AS organization_slug
                        FROM organization_memberships om
                        JOIN organizations o ON o.id = om.organization_id
                        WHERE om.user_id = :user_id
                        ORDER BY o.created_at ASC
                        """
                    ),
                    {"user_id": user_id},
                )
                .mappings()
                .all()
            )
            try:
                user_permission_rows = (
                    conn.execute(
                        text(
                            """
                            SELECT p.code, up.is_active
                            FROM user_permissions up
                            JOIN permissions p ON p.id = up.permission_id
                            WHERE up.user_id = :user_id
                              AND (up.expires_at IS NULL OR up.expires_at > NOW())
                            ORDER BY p.code ASC
                            """
                        ),
                        {"user_id": user_id},
                    )
                    .mappings()
                    .all()
                )
            except SQLAlchemyError:
                user_permission_rows = []

        legacy_grants = self._parse_permission_codes(user_row.get("custom_permissions"))
        explicit_grants = [
            str(row["code"])
            for row in user_permission_rows
            if bool(row.get("is_active", False))
        ]
        explicit_revokes = [
            str(row["code"])
            for row in user_permission_rows
            if not bool(row.get("is_active", False))
        ]
        role_permissions = [str(row["code"]) for row in permission_rows]
        all_permissions = self._merge_effective_permissions(
            role_permissions=role_permissions,
            granted_permissions=[*legacy_grants, *explicit_grants],
            revoked_permissions=explicit_revokes,
        )

        return RBACUser(
            id=str(user_row["id"]),
            email=str(user_row["email"]),
            display_name=user_row.get("display_name"),
            is_active=bool(user_row.get("is_active", False)),
            roles=[str(row["code"]) for row in role_rows],
            permissions=all_permissions,
            organization_memberships=[
                RBACOrganizationMembership(
                    organization_id=str(row["organization_id"]),
                    organization_name=str(row["organization_name"]),
                    organization_slug=str(row["organization_slug"]) if row.get("organization_slug") else None,
                    role=str(row["role"]),
                    status=str(row["status"]),
                )
                for row in membership_rows
            ],
        )

    # ─── Project-Specific Role Methods ────────────────────────────────────────

    def assign_project_role(
        self,
        user_id: str,
        project_id: str,
        role_code: str,
        assigned_by: str | None = None,
        notes: str | None = None,
        expires_at: str | None = None,
    ) -> dict | None:
        """Assign a role to a user for a specific project.

        Args:
            user_id: The user to assign the role to
            project_id: The project (repo_id or project_profiles.id)
            role_code: The role code (e.g., 'developer', 'reviewer_senior')
            assigned_by: Optional user who made the assignment
            notes: Optional notes about the assignment
            expires_at: Optional expiration timestamp (ISO format)

        Returns:
            The created/updated assignment record, or None on failure
        """
        with self._engine.begin() as conn:
            # Get role ID from code
            role_row = (
                conn.execute(
                    text("SELECT id FROM roles WHERE code = :role_code LIMIT 1"),
                    {"role_code": role_code},
                )
                .mappings()
                .first()
            )
            if role_row is None:
                return None

            role_id = str(role_row["id"])

            # Upsert the assignment
            result = conn.execute(
                text(
                    """
                    INSERT INTO user_project_roles (
                        user_id, project_id, role_id, assigned_by, notes, expires_at, is_active
                    )
                    VALUES (:user_id, :project_id, :role_id, :assigned_by, :notes, :expires_at, TRUE)
                    ON CONFLICT (user_id, project_id) DO UPDATE
                    SET role_id = EXCLUDED.role_id,
                        assigned_by = EXCLUDED.assigned_by,
                        notes = COALESCE(EXCLUDED.notes, user_project_roles.notes),
                        expires_at = EXCLUDED.expires_at,
                        is_active = TRUE,
                        updated_at = NOW()
                    RETURNING id, user_id, project_id, role_id, assigned_by, notes, expires_at, is_active, created_at
                    """
                ),
                {
                    "user_id": user_id,
                    "project_id": project_id,
                    "role_id": role_id,
                    "assigned_by": assigned_by,
                    "notes": notes,
                    "expires_at": expires_at,
                },
            )
            row = result.mappings().first()
            if row:
                return {
                    "id": str(row["id"]),
                    "user_id": str(row["user_id"]),
                    "project_id": str(row["project_id"]),
                    "role_id": str(row["role_id"]),
                    "role_code": role_code,
                    "assigned_by": row["assigned_by"],
                    "notes": row["notes"],
                    "expires_at": str(row["expires_at"]) if row["expires_at"] else None,
                    "is_active": bool(row["is_active"]),
                    "created_at": str(row["created_at"]),
                }
            return None

    def remove_project_role(self, user_id: str, project_id: str) -> bool:
        """Remove a user's role from a project (soft delete by setting is_active=FALSE)."""
        with self._engine.begin() as conn:
            result = conn.execute(
                text(
                    """
                    UPDATE user_project_roles
                    SET is_active = FALSE, updated_at = NOW()
                    WHERE user_id = :user_id AND project_id = :project_id
                    """
                ),
                {"user_id": user_id, "project_id": project_id},
            )
            return result.rowcount > 0

    def get_user_project_role(self, user_id: str, project_id: str) -> dict | None:
        """Get the user's role for a specific project."""
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        SELECT 
                            upr.id,
                            upr.user_id,
                            upr.project_id,
                            upr.role_id,
                            r.code AS role_code,
                            r.label AS role_label,
                            upr.assigned_by,
                            upr.notes,
                            upr.expires_at,
                            upr.is_active,
                            upr.created_at,
                            upr.updated_at
                        FROM user_project_roles upr
                        JOIN roles r ON r.id = upr.role_id
                        WHERE upr.user_id = :user_id 
                          AND upr.project_id = :project_id
                          AND upr.is_active = TRUE
                          AND (upr.expires_at IS NULL OR upr.expires_at > NOW())
                        LIMIT 1
                        """
                    ),
                    {"user_id": user_id, "project_id": project_id},
                )
                .mappings()
                .first()
            )
            if row:
                return dict(row)
            return None

    def get_user_project_roles(self, user_id: str) -> list[dict]:
        """Get all project roles for a user."""
        with self._engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT 
                            upr.id,
                            upr.user_id,
                            upr.project_id,
                            upr.role_id,
                            r.code AS role_code,
                            r.label AS role_label,
                            upr.assigned_by,
                            upr.notes,
                            upr.expires_at,
                            upr.is_active,
                            upr.created_at,
                            upr.updated_at
                        FROM user_project_roles upr
                        JOIN roles r ON r.id = upr.role_id
                        WHERE upr.user_id = :user_id
                          AND upr.is_active = TRUE
                          AND (upr.expires_at IS NULL OR upr.expires_at > NOW())
                        ORDER BY upr.created_at DESC
                        """
                    ),
                    {"user_id": user_id},
                )
                .mappings()
                .all()
            )
            return [dict(row) for row in rows]

    def get_project_members(self, project_id: str) -> list[dict]:
        """Get all users with roles in a specific project."""
        with self._engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT 
                            upr.id,
                            upr.user_id,
                            u.email AS user_email,
                            u.display_name AS user_display_name,
                            upr.project_id,
                            upr.role_id,
                            r.code AS role_code,
                            r.label AS role_label,
                            upr.assigned_by,
                            upr.notes,
                            upr.expires_at,
                            upr.is_active,
                            upr.created_at
                        FROM user_project_roles upr
                        JOIN roles r ON r.id = upr.role_id
                        JOIN users u ON u.id = upr.user_id
                        WHERE upr.project_id = :project_id
                          AND upr.is_active = TRUE
                          AND (upr.expires_at IS NULL OR upr.expires_at > NOW())
                        ORDER BY r.code, u.email
                        """
                    ),
                    {"project_id": project_id},
                )
                .mappings()
                .all()
            )
            return [dict(row) for row in rows]

    def get_user_permissions_for_project(self, user_id: str, project_id: str) -> list[str]:
        """Get all permissions a user has for a specific project.

        This combines:
        1. Global permissions from user_roles
        2. Project-specific permissions from user_project_roles
        """
        with self._engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT DISTINCT p.code
                        FROM permissions p
                        JOIN role_permissions rp ON rp.permission_id = p.id
                        WHERE rp.role_id IN (
                            -- Global roles
                            SELECT ur.role_id FROM user_roles ur WHERE ur.user_id = :user_id
                            UNION
                            -- Project-specific roles
                            SELECT upr.role_id 
                            FROM user_project_roles upr 
                            WHERE upr.user_id = :user_id 
                              AND upr.project_id = :project_id
                              AND upr.is_active = TRUE
                              AND (upr.expires_at IS NULL OR upr.expires_at > NOW())
                        )
                        AND (rp.enabled IS NULL OR rp.enabled = TRUE)
                        ORDER BY p.code
                        """
                    ),
                    {"user_id": user_id, "project_id": project_id},
                )
                .mappings()
                .all()
            )
            base_permissions = [str(row["code"]) for row in rows]

            user_row = (
                conn.execute(
                    text(
                        """
                        SELECT custom_permissions
                        FROM users
                        WHERE id = :user_id
                        LIMIT 1
                        """
                    ),
                    {"user_id": user_id},
                )
                .mappings()
                .first()
            )

            legacy_grants = self._parse_permission_codes((user_row or {}).get("custom_permissions"))
            try:
                override_rows = (
                    conn.execute(
                        text(
                            """
                            SELECT p.code, up.is_active
                            FROM user_permissions up
                            JOIN permissions p ON p.id = up.permission_id
                            WHERE up.user_id = :user_id
                              AND (up.expires_at IS NULL OR up.expires_at > NOW())
                            ORDER BY p.code ASC
                            """
                        ),
                        {"user_id": user_id},
                    )
                    .mappings()
                    .all()
                )
            except SQLAlchemyError:
                override_rows = []

            explicit_grants = [
                str(row["code"])
                for row in override_rows
                if bool(row.get("is_active", False))
            ]
            explicit_revokes = [
                str(row["code"])
                for row in override_rows
                if not bool(row.get("is_active", False))
            ]
            return self._merge_effective_permissions(
                role_permissions=base_permissions,
                granted_permissions=[*legacy_grants, *explicit_grants],
                revoked_permissions=explicit_revokes,
            )

    def check_user_has_permission_for_project(
        self, user_id: str, project_id: str, permission_code: str
    ) -> bool:
        """Check if a user has a specific permission for a project."""
        permissions = self.get_user_permissions_for_project(user_id, project_id)
        return permission_code in permissions

    # ─── Dynamic Role Permissions Methods ─────────────────────────────────────

    def get_role_permissions(self, role_id: str, include_disabled: bool = False) -> list[dict]:
        """Get all permissions for a role with their enabled status.
        
        Args:
            role_id: The role ID
            include_disabled: If True, include disabled permissions
            
        Returns:
            List of permission records with enabled status
        """
        with self._engine.connect() as conn:
            query = text(
                """
                SELECT 
                    rp.id,
                    rp.role_id,
                    rp.permission_id,
                    p.code AS permission_code,
                    p.description AS permission_description,
                    rp.enabled,
                    rp.updated_at,
                    rp.updated_by
                FROM role_permissions rp
                JOIN permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = :role_id
                """ + ("" if include_disabled else " AND rp.enabled = TRUE") + """
                ORDER BY p.code
                """
            )
            rows = conn.execute(query, {"role_id": role_id}).mappings().all()
            return [dict(row) for row in rows]

    def toggle_role_permission(
        self, role_id: str, permission_id: str, enabled: bool, updated_by: str, reason: str | None = None
    ) -> dict | None:
        """Toggle a permission for a role.
        
        Args:
            role_id: The role ID
            permission_id: The permission ID
            enabled: New enabled status
            updated_by: User ID who made the change
            reason: Optional reason for the change
            
        Returns:
            The updated role_permission record, or None on failure
        """
        with self._engine.begin() as conn:
            # Get current state for audit
            current = (
                conn.execute(
                    text(
                        """
                        SELECT id, enabled 
                        FROM role_permissions 
                        WHERE role_id = :role_id AND permission_id = :permission_id
                        LIMIT 1
                        """
                    ),
                    {"role_id": role_id, "permission_id": permission_id},
                )
                .mappings()
                .first()
            )
            
            if current is None:
                return None
            
            previous_enabled = bool(current["enabled"])
            rp_id = str(current["id"])
            
            # Update the permission
            conn.execute(
                text(
                    """
                    UPDATE role_permissions
                    SET enabled = :enabled,
                        updated_by = :updated_by,
                        updated_at = NOW()
                    WHERE id = :id
                    """
                ),
                {"id": rp_id, "enabled": enabled, "updated_by": updated_by},
            )
            
            # Insert audit record if role_permission_audit table exists
            try:
                conn.execute(
                    text(
                        """
                        INSERT INTO role_permission_audit (
                            role_permission_id, role_id, permission_id,
                            previous_enabled, new_enabled, changed_by, reason
                        )
                        VALUES (:rp_id, :role_id, :permission_id, :previous, :new, :changed_by, :reason)
                        """
                    ),
                    {
                        "rp_id": rp_id,
                        "role_id": role_id,
                        "permission_id": permission_id,
                        "previous": previous_enabled,
                        "new": enabled,
                        "changed_by": updated_by,
                        "reason": reason,
                    },
                )
            except Exception:
                # Audit table might not exist yet
                pass
            
            # Return updated record
            updated = (
                conn.execute(
                    text(
                        """
                        SELECT 
                            rp.id,
                            rp.role_id,
                            rp.permission_id,
                            p.code AS permission_code,
                            p.description AS permission_description,
                            rp.enabled,
                            rp.updated_at,
                            rp.updated_by
                        FROM role_permissions rp
                        JOIN permissions p ON p.id = rp.permission_id
                        WHERE rp.id = :id
                        LIMIT 1
                        """
                    ),
                    {"id": rp_id},
                )
                .mappings()
                .first()
            )
            
            return dict(updated) if updated else None

    def get_all_roles_with_permissions(self) -> list[dict]:
        """Get all roles with their permissions (including enabled status).
        
        Returns:
            List of roles with nested permissions
        """
        with self._engine.connect() as conn:
            # Get all roles
            role_rows = (
                conn.execute(
                    text(
                        """
                        SELECT id, code, label, is_system
                        FROM roles
                        ORDER BY code
                        """
                    )
                )
                .mappings()
                .all()
            )
            
            # Get all role_permissions with permission details
            perm_rows = (
                conn.execute(
                    text(
                        """
                        SELECT 
                            rp.id,
                            rp.role_id,
                            rp.permission_id,
                            p.code AS permission_code,
                            p.description AS permission_description,
                            rp.enabled,
                            rp.updated_at,
                            rp.updated_by
                        FROM role_permissions rp
                        JOIN permissions p ON p.id = rp.permission_id
                        ORDER BY p.code
                        """
                    )
                )
                .mappings()
                .all()
            )
            
            # Group permissions by role
            perms_by_role: dict[str, list[dict]] = {}
            for perm in perm_rows:
                role_id = str(perm["role_id"])
                if role_id not in perms_by_role:
                    perms_by_role[role_id] = []
                perms_by_role[role_id].append(dict(perm))
            
            # Build result
            result = []
            for role in role_rows:
                role_id = str(role["id"])
                result.append(
                    {
                        "id": role_id,
                        "code": str(role["code"]),
                        "label": str(role["label"]),
                        "is_system": bool(role["is_system"]),
                        "permissions": perms_by_role.get(role_id, []),
                    }
                )
            
            return result

    # ─── Pending Invitation Resolution ────────────────────────────────────────

    def get_and_accept_pending_invitations(self, email: str, user_id: str) -> list[dict]:
        """Called at auth sync.

        Finds all pending invitations for *email*, assigns the corresponding
        project role to *user_id*, marks the invitation as accepted, and
        returns a list of ``{project_id, role_code}`` dicts for each accepted
        invitation.
        """
        if not email or not user_id:
            return []

        accepted: list[dict] = []

        with self._engine.begin() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT id, project_id, role_code
                        FROM pending_project_invitations
                        WHERE email = :email AND status = 'pending'
                        FOR UPDATE SKIP LOCKED
                        """
                    ),
                    {"email": email.strip().lower()},
                )
                .mappings()
                .all()
            )

            for row in rows:
                inv_id = str(row["id"])
                project_id = str(row["project_id"])
                role_code = str(row["role_code"])

                # Assign project role (upsert — ignore if already assigned)
                try:
                    role_row = (
                        conn.execute(
                            text("SELECT id FROM roles WHERE code = :code LIMIT 1"),
                            {"code": role_code},
                        )
                        .mappings()
                        .first()
                    )
                    if role_row:
                        conn.execute(
                            text(
                                """
                                INSERT INTO user_project_roles
                                    (id, user_id, project_id, role_id, assigned_by, created_at)
                                VALUES (
                                    gen_random_uuid()::text,
                                    :user_id, :project_id, :role_id,
                                    :user_id, NOW()
                                )
                                ON CONFLICT (user_id, project_id) DO UPDATE
                                    SET role_id = EXCLUDED.role_id,
                                        updated_at = NOW()
                                """
                            ),
                            {
                                "user_id": user_id,
                                "project_id": project_id,
                                "role_id": str(role_row["id"]),
                            },
                        )
                except Exception:
                    pass  # Role or table may not exist in all environments

                # Mark invitation as accepted
                conn.execute(
                    text(
                        """
                        UPDATE pending_project_invitations
                        SET status = 'accepted', accepted_at = NOW()
                        WHERE id = :id
                        """
                    ),
                    {"id": inv_id},
                )

                accepted.append({"project_id": project_id, "role_code": role_code})

        return accepted

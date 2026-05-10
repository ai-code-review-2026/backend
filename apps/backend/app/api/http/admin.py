from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Path, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.engine import Connection
from sqlalchemy.exc import SQLAlchemyError

from app.api.errors import ApiError
from app.api.middleware.auth import (
    AuthenticatedPrincipal,
    get_rbac_repo,
    normalize_role_code,
    permissions_for_roles,
    require_permission,
)
from app.data.database import get_engine
from app.data.repos.analyses_repo import AnalysesRepo
from app.core.knowledge_base.document_lifecycle import source_observability_summary
from app.integrations.object_storage.s3_minio_client import S3MinioClient
from app.settings import settings
from app.workers.queue import QueueUnavailableError, enqueue_analysis_job
from app.workers.tasks.ingest_kb import run_repo_onboarding

router = APIRouter(prefix="/v1/admin", tags=["admin"])
logger = logging.getLogger(__name__)

_ADMIN_POLICY_REPO_KEY = "__admin_policy__"
_ADMIN_INTEGRATIONS_REPO_KEY = "__admin_integrations__"
_ADMIN_CI_TOKEN_REPO_KEY = "__admin_ci_token__"
_TOKEN_PREFIX_LEN = 12
_SYSTEM_ROLE_SEEDS: dict[str, tuple[str, str]] = {
    "tech_lead": ("role_tech_lead", "Tech Lead"),
}


class AdminUserUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["admin", "tech_lead", "reviewer_lead", "reviewer_senior", "reviewer_junior", "reviewer", "developer", "viewer"] | None = None
    isActive: bool | None = None
    customPermissions: list[str] | None = None
    revokedPermissions: list[str] | None = None


def _ensure_system_role_seed(conn: Connection, role_code: str) -> None:
    seed = _SYSTEM_ROLE_SEEDS.get(role_code)
    if seed is None:
        return

    role_id, label = seed
    conn.execute(
        text(
            """
            INSERT INTO roles (id, code, label, is_system)
            VALUES (:role_id, :code, :label, TRUE)
            ON CONFLICT (code) DO UPDATE
            SET label = EXCLUDED.label,
                is_system = TRUE
            """
        ),
        {"role_id": role_id, "code": role_code, "label": label},
    )

    for permission_code in permissions_for_roles([role_code]):
        conn.execute(
            text(
                """
                INSERT INTO role_permissions (id, role_id, permission_id)
                SELECT :id, roles.id, permissions.id
                FROM roles
                CROSS JOIN permissions
                WHERE roles.code = :role_code
                  AND permissions.code = :permission_code
                ON CONFLICT (role_id, permission_id) DO NOTHING
                """
            ),
            {
                "id": f"rp_{role_code}_{permission_code.replace('.', '_')}",
                "role_code": role_code,
                "permission_code": permission_code,
            },
        )


class PolicyRepoRule(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repo: str = Field(min_length=1, max_length=255)
    severityProfile: Literal["strict", "moderate", "relaxed"] = "strict"


class AdminPolicyConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    failOnBlocker: bool = True
    maxComments: int = Field(default=50, ge=1, le=500)
    enabledCategories: dict[str, bool] = Field(
        default_factory=lambda: {
            "security": True,
            "performance": True,
            "quality": True,
            "maintainability": True,
        }
    )
    ignoredPaths: list[str] = Field(default_factory=list, max_length=200)
    repoRules: list[PolicyRepoRule] = Field(default_factory=list, max_length=100)


class AdminPoliciesUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    config: AdminPolicyConfig


class AdminPoliciesTestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    target: str | None = Field(default=None, max_length=255)
    config: AdminPolicyConfig | None = None


class AdminIntegrationsUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ciEnabled: bool | None = None
    failOnBlocker: bool | None = None


class KnowledgeBaseReindexRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    repoId: str = Field(min_length=1, max_length=255)
    repoPath: str | None = Field(default=None, max_length=4096)


def _utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _to_iso(value: Any) -> str | None:
    if isinstance(value, datetime):
        candidate = value
        if candidate.tzinfo is None:
            candidate = candidate.replace(tzinfo=timezone.utc)
        return candidate.isoformat().replace("+00:00", "Z")
    if value is None:
        return None
    text_value = str(value).strip()
    return text_value or None


def _as_json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        if isinstance(parsed, dict):
            return parsed
    return {}


def _parse_permission_codes(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        try:
            parsed = json.loads(value) if value else []
        except json.JSONDecodeError:
            parsed = []
    elif isinstance(value, list):
        parsed = value
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


def _ensure_admin_access(
    principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
) -> AuthenticatedPrincipal:
    if principal is None:
        if settings.RBAC_ENFORCEMENT_ENABLED or settings.CLERK_AUTH_ENABLED:
            raise ApiError(
                status_code=401,
                code="UNAUTHORIZED",
                message="Missing authentication credentials",
            )
        return AuthenticatedPrincipal(
            user_id="local-admin",
            email="local-admin@example.local",
            roles=["admin"],
            permissions=["analyses.read", "analyses.create", "analyses.write", "secrets.manage"],
        )

    normalized_roles = {role.strip().lower() for role in principal.roles if isinstance(role, str)}
    normalized_org_role = (principal.org_role or "").strip().lower()
    if normalized_org_role.startswith("org:"):
        normalized_org_role = normalized_org_role.removeprefix("org:")

    normalized_email = (principal.email or "").strip().lower()
    is_admin = (
        "admin" in normalized_roles
        or normalized_org_role in {"admin", "owner"}
        or normalized_email in settings.admin_emails
    )
    if not is_admin:
        repo_user = get_rbac_repo().get_user(principal.user_id)
        if repo_user is not None:
            db_email = str(repo_user.email or "").strip().lower()
            if db_email in settings.admin_emails:
                is_admin = True
            if is_admin:
                return principal
            db_roles = {role.strip().lower() for role in repo_user.roles if isinstance(role, str)}
            if "admin" in db_roles:
                is_admin = True
            else:
                target_org_id = (principal.org_id or "").strip()

                def _membership_is_admin(membership: Any) -> bool:
                    role_value = str(getattr(membership, "role", "") or "").strip().lower()
                    status_value = str(getattr(membership, "status", "active") or "active").strip().lower()
                    if role_value.startswith("org:"):
                        role_value = role_value.removeprefix("org:")
                    if status_value not in {"active"}:
                        return False
                    return role_value in {"admin", "owner"}

                if target_org_id:
                    is_admin = any(
                        str(getattr(membership, "organization_id", "") or "").strip() == target_org_id
                        and _membership_is_admin(membership)
                        for membership in repo_user.organization_memberships
                    )
                else:
                    is_admin = any(_membership_is_admin(membership) for membership in repo_user.organization_memberships)

    if not is_admin:
        raise ApiError(
            status_code=403,
            code="FORBIDDEN",
            message="Admin role required",
            details={
                "roles": sorted(normalized_roles),
                "orgRole": normalized_org_role or None,
            },
        )
    return principal


def _policy_defaults() -> dict[str, Any]:
    return {
        "failOnBlocker": True,
        "maxComments": 50,
        "enabledCategories": {
            "security": True,
            "performance": True,
            "quality": True,
            "maintainability": True,
        },
        "ignoredPaths": ["vendor/**", "node_modules/**", "dist/**", "build/**"],
        "repoRules": [],
    }


def _integration_defaults() -> dict[str, Any]:
    return {
        "ciEnabled": True,
        "failOnBlocker": True,
    }


def _load_versioned_settings(conn: Connection, repo_key: str, defaults: dict[str, Any]) -> tuple[dict[str, Any], int, str | None]:
    try:
        row = (
            conn.execute(
                text(
                    """
                    SELECT version, rules_json, created_at
                    FROM policies
                    WHERE repo = :repo
                    ORDER BY version DESC
                    LIMIT 1
                    """
                ),
                {"repo": repo_key},
            )
            .mappings()
            .first()
        )
    except SQLAlchemyError as exc:
        logger.warning(
            "Admin settings fallback: policies table is unavailable for '%s': %s",
            repo_key,
            exc,
        )
        return dict(defaults), 0, None

    if row is None:
        return dict(defaults), 0, None

    payload = _as_json_object(row.get("rules_json"))
    merged: dict[str, Any] = dict(defaults)
    merged.update(payload)
    version = int(row.get("version") or 0)
    created_at = _to_iso(row.get("created_at"))
    return merged, version, created_at


def _save_versioned_settings(conn: Connection, repo_key: str, payload: dict[str, Any], *, blocking_enabled: bool = False) -> tuple[int, str]:
    created_at = _utc_iso_now()
    try:
        version_row = (
            conn.execute(
                text("SELECT COALESCE(MAX(version), 0) + 1 AS next_version FROM policies WHERE repo = :repo"),
                {"repo": repo_key},
            )
            .mappings()
            .first()
        )
        next_version = int(version_row["next_version"] if version_row is not None else 1)
        conn.execute(
            text(
                """
                INSERT INTO policies (id, repo, version, blocking_enabled, rules_json, created_at)
                VALUES (:id, :repo, :version, :blocking_enabled, CAST(:rules_json AS jsonb), NOW())
                """
            ),
            {
                "id": f"policy_{uuid.uuid4().hex}",
                "repo": repo_key,
                "version": next_version,
                "blocking_enabled": blocking_enabled,
                "rules_json": json.dumps(payload),
            },
        )
        return next_version, created_at
    except SQLAlchemyError as exc:
        logger.warning(
            "Admin settings persistence skipped for '%s' because policies table is unavailable: %s",
            repo_key,
            exc,
        )
        # Keep endpoint successful in partially-migrated environments.
        return 0, created_at


def _insert_audit_log(
    conn: Connection,
    *,
    actor: str,
    action: str,
    target_type: str,
    target_id: str,
    meta: dict[str, Any] | None = None,
) -> None:
    try:
        conn.execute(
            text(
                """
                INSERT INTO audit_logs (id, actor, action, target_type, target_id, meta_json)
                VALUES (:id, :actor, :action, :target_type, :target_id, CAST(:meta_json AS jsonb))
                """
            ),
            {
                "id": f"audit_{uuid.uuid4().hex}",
                "actor": actor,
                "action": action,
                "target_type": target_type,
                "target_id": target_id,
                "meta_json": json.dumps(meta or {}),
            },
        )
    except SQLAlchemyError as exc:
        logger.warning(
            "Skipping audit log insert because audit_logs table is unavailable: %s",
            exc,
        )


def _collect_admin_users(limit: int) -> dict[str, Any]:
    engine = get_engine()
    with engine.connect() as conn:
        def _query_all(
            query: str,
            params: dict[str, Any] | None = None,
            *,
            optional: bool = False,
        ) -> list[dict[str, Any]]:
            try:
                return list(conn.execute(text(query), params or {}).mappings().all())
            except SQLAlchemyError as exc:
                if optional:
                    logger.warning(
                        "Skipping optional admin users query because schema is not ready: %s",
                        exc,
                    )
                    return []
                raise

        users_query = """
            SELECT id, email, display_name, is_active, custom_permissions, created_at
            FROM users
            ORDER BY created_at DESC
            LIMIT :limit
        """
        try:
            users_rows = _query_all(users_query, {"limit": limit})
        except SQLAlchemyError as exc:
            logger.warning(
                "Falling back to minimal users projection in admin endpoint: %s",
                exc,
            )
            users_rows = _query_all(
                """
                SELECT id, email, NULL AS display_name, TRUE AS is_active, NULL AS custom_permissions, created_at
                FROM users
                ORDER BY created_at DESC
                LIMIT :limit
                """,
                {"limit": limit},
            )

        role_rows = _query_all(
            """
            SELECT ur.user_id, r.code
            FROM user_roles ur
            JOIN roles r ON r.id = ur.role_id
            ORDER BY ur.user_id ASC, r.code ASC
            """,
            optional=True,
        )
        permission_rows = _query_all(
            """
            SELECT ur.user_id, p.code
            FROM user_roles ur
            JOIN role_permissions rp ON rp.role_id = ur.role_id
            JOIN permissions p ON p.id = rp.permission_id
            WHERE (rp.enabled IS NULL OR rp.enabled = TRUE)
            ORDER BY ur.user_id ASC, p.code ASC
            """,
            optional=True,
        )
        user_permission_rows = _query_all(
            """
            SELECT up.user_id, p.code, up.is_active
            FROM user_permissions up
            JOIN permissions p ON p.id = up.permission_id
            WHERE up.expires_at IS NULL OR up.expires_at > NOW()
            ORDER BY up.user_id ASC, p.code ASC
            """,
            optional=True,
        )
        membership_rows = _query_all(
            """
            SELECT om.user_id, om.organization_id, om.role, om.status, o.name, o.slug
            FROM organization_memberships om
            JOIN organizations o ON o.id = om.organization_id
            ORDER BY om.user_id ASC, o.name ASC
            """,
            optional=True,
        )
        permissions_catalog_rows = _query_all(
            """
            SELECT
                p.code,
                p.description,
                COUNT(DISTINCT ur.user_id) AS user_count
            FROM permissions p
            LEFT JOIN role_permissions rp
              ON rp.permission_id = p.id
             AND (rp.enabled IS NULL OR rp.enabled = TRUE)
            LEFT JOIN user_roles ur ON ur.role_id = rp.role_id
            GROUP BY p.code, p.description
            ORDER BY p.code ASC
            """,
            optional=True,
        )
        role_stat_rows = _query_all(
            """
            SELECT r.code, COUNT(DISTINCT ur.user_id) AS user_count
            FROM roles r
            LEFT JOIN user_roles ur ON ur.role_id = r.id
            GROUP BY r.code
            ORDER BY r.code ASC
            """,
            optional=True,
        )
        try:
            total_row = (
                conn.execute(
                    text(
                        """
                        SELECT
                            COUNT(*) AS total_users,
                            SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS active_users,
                            SUM(CASE WHEN is_active THEN 0 ELSE 1 END) AS inactive_users
                        FROM users
                        """
                    )
                )
                .mappings()
                .first()
            )
        except SQLAlchemyError as exc:
            logger.warning(
                "Falling back to total-only admin user stats because schema is not ready: %s",
                exc,
            )
            fallback_total_row = (
                conn.execute(text("SELECT COUNT(*) AS total_users FROM users"))
                .mappings()
                .first()
            )
            total_users = int((fallback_total_row or {}).get("total_users") or 0)
            total_row = {
                "total_users": total_users,
                "active_users": total_users,
                "inactive_users": 0,
            }

    roles_by_user: dict[str, list[str]] = {}
    for row in role_rows:
        user_id = str(row["user_id"])
        roles_by_user.setdefault(user_id, []).append(str(row["code"]))

    permissions_by_user: dict[str, list[str]] = {}
    for row in permission_rows:
        user_id = str(row["user_id"])
        permissions_by_user.setdefault(user_id, []).append(str(row["code"]))

    granted_overrides_by_user: dict[str, list[str]] = {}
    revoked_overrides_by_user: dict[str, list[str]] = {}
    for row in user_permission_rows:
        user_id = str(row["user_id"])
        if bool(row.get("is_active", False)):
            granted_overrides_by_user.setdefault(user_id, []).append(str(row["code"]))
        else:
            revoked_overrides_by_user.setdefault(user_id, []).append(str(row["code"]))

    memberships_by_user: dict[str, list[dict[str, Any]]] = {}
    for row in membership_rows:
        user_id = str(row["user_id"])
        memberships_by_user.setdefault(user_id, []).append(
            {
                "organizationId": str(row["organization_id"]),
                "organizationName": str(row["name"]),
                "organizationSlug": str(row["slug"]) if row.get("slug") else None,
                "role": str(row["role"]),
                "status": str(row["status"]),
            }
        )

    users: list[dict[str, Any]] = []
    for row in users_rows:
        user_id = str(row["id"])
        legacy_custom_permissions = _parse_permission_codes(row.get("custom_permissions"))
        granted_permissions = sorted(
            set(legacy_custom_permissions) | set(granted_overrides_by_user.get(user_id, []))
        )
        revoked_permissions = sorted(set(revoked_overrides_by_user.get(user_id, [])))
        effective_permissions = _merge_effective_permissions(
            role_permissions=permissions_by_user.get(user_id, []),
            granted_permissions=granted_permissions,
            revoked_permissions=revoked_permissions,
        )
        users.append(
            {
                "id": user_id,
                "email": str(row["email"]),
                "displayName": row.get("display_name"),
                "isActive": bool(row.get("is_active", False)),
                "createdAt": _to_iso(row.get("created_at")),
                "roles": sorted(set(roles_by_user.get(user_id, []))),
                "permissions": effective_permissions,
                "customPermissions": granted_permissions,
                "revokedPermissions": revoked_permissions,
                "organizationMemberships": memberships_by_user.get(user_id, []),
            }
        )

    role_stats = {str(row["code"]): int(row.get("user_count") or 0) for row in role_stat_rows}

    return {
        "items": users,
        "permissions": [
            {
                "code": str(row["code"]),
                "description": str(row["description"]),
                "userCount": int(row.get("user_count") or 0),
            }
            for row in permissions_catalog_rows
        ],
        "stats": {
            "totalUsers": int((total_row or {}).get("total_users") or 0),
            "activeUsers": int((total_row or {}).get("active_users") or 0),
            "inactiveUsers": int((total_row or {}).get("inactive_users") or 0),
            "admins": role_stats.get("admin", 0),
            "reviewers": role_stats.get("tech_lead", role_stats.get("reviewer", 0)),
            "developers": role_stats.get("developer", 0),
            "viewers": role_stats.get("viewer", 0),
        },
    }


def _fetch_user_by_id(conn: Connection, user_id: str) -> dict[str, Any] | None:
    row = (
        conn.execute(
            text(
                """
                SELECT id, email, display_name, is_active, custom_permissions, created_at
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
    if row is None:
        return None

    role_rows = (
        conn.execute(
            text(
                """
                SELECT r.code
                FROM user_roles ur
                JOIN roles r ON r.id = ur.role_id
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
                FROM user_roles ur
                JOIN role_permissions rp ON rp.role_id = ur.role_id
                JOIN permissions p ON p.id = rp.permission_id
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
                SELECT om.organization_id, om.role, om.status, o.name, o.slug
                FROM organization_memberships om
                JOIN organizations o ON o.id = om.organization_id
                WHERE om.user_id = :user_id
                ORDER BY o.name ASC
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

    legacy_custom_permissions = _parse_permission_codes(row.get("custom_permissions"))
    granted_permissions = sorted(
        set(legacy_custom_permissions)
        | {
            str(item["code"])
            for item in user_permission_rows
            if bool(item.get("is_active", False))
        }
    )
    revoked_permissions = sorted(
        {
            str(item["code"])
            for item in user_permission_rows
            if not bool(item.get("is_active", False))
        }
    )
    effective_permissions = _merge_effective_permissions(
        role_permissions=[str(item["code"]) for item in permission_rows],
        granted_permissions=granted_permissions,
        revoked_permissions=revoked_permissions,
    )

    return {
        "id": str(row["id"]),
        "email": str(row["email"]),
        "displayName": row.get("display_name"),
        "isActive": bool(row.get("is_active", False)),
        "createdAt": _to_iso(row.get("created_at")),
        "roles": [str(item["code"]) for item in role_rows],
        "permissions": effective_permissions,
        "customPermissions": granted_permissions,
        "revokedPermissions": revoked_permissions,
        "organizationMemberships": [
            {
                "organizationId": str(item["organization_id"]),
                "organizationName": str(item["name"]),
                "organizationSlug": str(item["slug"]) if item.get("slug") else None,
                "role": str(item["role"]),
                "status": str(item["status"]),
            }
            for item in membership_rows
        ],
    }


def _cascade_delete_user(user_id: str, actor_id: str) -> dict[str, Any]:
    """
    Completely delete a user and ALL related data from the system.
    
    This performs a hard cascade delete across all tables that reference the user.
    Tables with ON DELETE CASCADE will be handled automatically by PostgreSQL.
    Other tables need explicit deletion.
    
    Order of deletion matters due to FK constraints.
    """
    engine = get_engine()
    with engine.begin() as conn:
        # First verify user exists and capture info for audit
        user_row = (
            conn.execute(
                text("SELECT id, email, display_name FROM users WHERE id = :user_id LIMIT 1"),
                {"user_id": user_id},
            )
            .mappings()
            .first()
        )
        if user_row is None:
            raise ApiError(
                status_code=404,
                code="USER_NOT_FOUND",
                message="User not found",
                details={"user_id": user_id},
            )
        
        user_email = str(user_row["email"])
        user_display_name = user_row.get("display_name")
        
        # Collect statistics about what will be deleted for the response
        deletion_stats: dict[str, int] = {}
        
        # 1. Delete from tables that DON'T have ON DELETE CASCADE
        # (or where we want explicit control/counting)
        
        # review_templates (created_by has no CASCADE)
        result = conn.execute(
            text("DELETE FROM review_templates WHERE created_by = :user_id"),
            {"user_id": user_id},
        )
        deletion_stats["review_templates"] = result.rowcount
        
        # review_sessions (initiator_id has no CASCADE)
        result = conn.execute(
            text("DELETE FROM review_sessions WHERE initiator_id = :user_id"),
            {"user_id": user_id},
        )
        deletion_stats["review_sessions"] = result.rowcount
        
        # Update resolved_by references to NULL before deleting user
        # (review_comments.resolved_by and change_requests.resolved_by don't have CASCADE)
        conn.execute(
            text("UPDATE review_comments SET resolved_by = NULL WHERE resolved_by = :user_id"),
            {"user_id": user_id},
        )
        conn.execute(
            text("UPDATE change_requests SET resolved_by = NULL WHERE resolved_by = :user_id"),
            {"user_id": user_id},
        )
        
        # Update assigner_id in review_assignments (nullable FK without CASCADE)
        conn.execute(
            text("UPDATE review_assignments SET assigner_id = NULL WHERE assigner_id = :user_id"),
            {"user_id": user_id},
        )
        
        # 2. Count records in tables with ON DELETE CASCADE (for stats)
        # These will be auto-deleted when we delete the user
        
        cascade_tables = [
            ("user_roles", "user_id"),
            ("user_project_roles", "user_id"),
            ("organization_memberships", "user_id"),
            ("notifications", "user_id"),
            ("reviewer_metrics", "reviewer_id"),
            ("review_assignments", "reviewer_id"),
            ("review_comments", "author_id"),
            ("change_requests", "reviewer_id"),
        ]
        
        for table_name, column_name in cascade_tables:
            try:
                count_row = (
                    conn.execute(
                        text(f"SELECT COUNT(*) AS cnt FROM {table_name} WHERE {column_name} = :user_id"),
                        {"user_id": user_id},
                    )
                    .mappings()
                    .first()
                )
                deletion_stats[table_name] = int(count_row["cnt"]) if count_row else 0
            except Exception:
                # Table might not exist in some environments
                deletion_stats[table_name] = 0
        
        # 3. Log the deletion BEFORE actually deleting (so we have a record)
        _insert_audit_log(
            conn,
            actor=actor_id,
            action="admin.user.delete",
            target_type="user",
            target_id=user_id,
            meta={
                "email": user_email,
                "displayName": user_display_name,
                "deletionStats": deletion_stats,
                "cascadeDelete": True,
            },
        )
        
        # 4. Delete the user - this will CASCADE to:
        # - user_roles
        # - user_project_roles  
        # - organization_memberships
        # - notifications
        # - reviewer_metrics
        # - review_assignments (reviewer_id)
        # - review_comments (author_id)
        # - change_requests (reviewer_id)
        conn.execute(
            text("DELETE FROM users WHERE id = :user_id"),
            {"user_id": user_id},
        )
        
        return {
            "deleted": True,
            "userId": user_id,
            "email": user_email,
            "displayName": user_display_name,
            "deletedAt": _utc_iso_now(),
            "deletedBy": actor_id,
            "stats": deletion_stats,
        }


def _update_admin_user(user_id: str, payload: AdminUserUpdateRequest, actor_id: str) -> dict[str, Any]:
    from app.api.middleware.auth import invalidate_principal_cache
    
    engine = get_engine()
    with engine.begin() as conn:
        existing = _fetch_user_by_id(conn, user_id)
        if existing is None:
            raise ApiError(
                status_code=404,
                code="USER_NOT_FOUND",
                message="User not found",
                details={"user_id": user_id},
            )

        if payload.isActive is not None:
            conn.execute(
                text("UPDATE users SET is_active = :is_active WHERE id = :user_id"),
                {"is_active": payload.isActive, "user_id": user_id},
            )

        if payload.role is not None:
            normalized_role = normalize_role_code(payload.role)
            _ensure_system_role_seed(conn, normalized_role)
            role_row = (
                conn.execute(
                    text("SELECT id FROM roles WHERE code = :code LIMIT 1"),
                    {"code": normalized_role},
                )
                .mappings()
                .first()
            )
            if role_row is None:
                raise ApiError(
                    status_code=400,
                    code="ROLE_NOT_FOUND",
                    message="Role is not defined",
                    details={"role": normalized_role},
                )
            conn.execute(
                text(
                    """
                    DELETE FROM user_roles
                    WHERE user_id = :user_id
                      AND role_id IN (SELECT id FROM roles WHERE is_system = TRUE)
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
                    "id": f"ur_{uuid.uuid4().hex}",
                    "user_id": user_id,
                    "role_id": str(role_row["id"]),
                },
            )

        merged_custom_permissions = (
            _parse_permission_codes(payload.customPermissions)
            if payload.customPermissions is not None
            else _parse_permission_codes(existing.get("customPermissions"))
        )
        merged_revoked_permissions = (
            _parse_permission_codes(payload.revokedPermissions)
            if payload.revokedPermissions is not None
            else _parse_permission_codes(existing.get("revokedPermissions"))
        )

        if merged_revoked_permissions:
            merged_custom_permissions = [
                code for code in merged_custom_permissions if code not in set(merged_revoked_permissions)
            ]

        if payload.customPermissions is not None or payload.revokedPermissions is not None:
            desired_states: dict[str, bool] = {
                **{code: True for code in merged_custom_permissions},
                **{code: False for code in merged_revoked_permissions},
            }

            try:
                permission_rows = (
                    conn.execute(
                        text(
                            """
                            SELECT id, code
                            FROM permissions
                            """
                        ),
                    )
                    .mappings()
                    .all()
                    if desired_states
                    else []
                )
                permission_map = {str(row["code"]): str(row["id"]) for row in permission_rows}
                unknown_permissions = sorted(set(desired_states) - set(permission_map))
                if unknown_permissions:
                    raise ApiError(
                        status_code=400,
                        code="PERMISSION_NOT_FOUND",
                        message="One or more permissions are not defined",
                        details={"permissions": unknown_permissions},
                    )

                existing_override_rows = (
                    conn.execute(
                        text(
                            """
                            SELECT permission_id
                            FROM user_permissions
                            WHERE user_id = :user_id
                            """
                        ),
                        {"user_id": user_id},
                    )
                    .mappings()
                    .all()
                )

                if desired_states:
                    for code, enabled in desired_states.items():
                        conn.execute(
                            text(
                                """
                                INSERT INTO user_permissions (
                                    id,
                                    user_id,
                                    permission_id,
                                    granted_by,
                                    reason,
                                    is_active
                                )
                                VALUES (
                                    :id,
                                    :user_id,
                                    :permission_id,
                                    :granted_by,
                                    :reason,
                                    :is_active
                                )
                                ON CONFLICT (user_id, permission_id) DO UPDATE
                                SET granted_by = EXCLUDED.granted_by,
                                    reason = EXCLUDED.reason,
                                    is_active = EXCLUDED.is_active,
                                    expires_at = NULL,
                                    updated_at = NOW()
                                """
                            ),
                            {
                                "id": f"up_{uuid.uuid4().hex}",
                                "user_id": user_id,
                                "permission_id": permission_map[code],
                                "granted_by": actor_id,
                                "reason": "admin.user.update",
                                "is_active": enabled,
                            },
                        )
                if desired_states:
                    desired_permission_ids = {permission_map[code] for code in desired_states}
                    for row in existing_override_rows:
                        permission_id = str(row["permission_id"])
                        if permission_id not in desired_permission_ids:
                            conn.execute(
                                text(
                                    """
                                    DELETE FROM user_permissions
                                    WHERE user_id = :user_id
                                      AND permission_id = :permission_id
                                    """
                                ),
                                {"user_id": user_id, "permission_id": permission_id},
                            )
                else:
                    conn.execute(
                        text("DELETE FROM user_permissions WHERE user_id = :user_id"),
                        {"user_id": user_id},
                    )
            except SQLAlchemyError as exc:
                if merged_revoked_permissions:
                    raise ApiError(
                        status_code=500,
                        code="USER_PERMISSION_OVERRIDES_UNAVAILABLE",
                        message="User permission overrides are unavailable until the latest backend migrations are applied",
                        details={"hint": "Run alembic upgrade head", "user_id": user_id},
                    ) from exc

            conn.execute(
                text("UPDATE users SET custom_permissions = :perms WHERE id = :user_id"),
                {"perms": json.dumps(merged_custom_permissions), "user_id": user_id},
            )

        _insert_audit_log(
            conn,
            actor=actor_id,
            action="admin.user.update",
            target_type="user",
            target_id=user_id,
            meta={
                "role": payload.role,
                "isActive": payload.isActive,
                "customPermissions": merged_custom_permissions if (payload.customPermissions is not None or payload.revokedPermissions is not None) else payload.customPermissions,
                "revokedPermissions": merged_revoked_permissions if (payload.customPermissions is not None or payload.revokedPermissions is not None) else payload.revokedPermissions,
            },
        )

        updated = _fetch_user_by_id(conn, user_id)
        if updated is None:
            raise ApiError(
                status_code=404,
                code="USER_NOT_FOUND",
                message="User not found",
                details={"user_id": user_id},
            )
        
        # Invalidate the principal cache for this user after successful update
        invalidate_principal_cache(user_id)
        
        return updated


def _collect_policy_payload() -> dict[str, Any]:
    engine = get_engine()
    with engine.connect() as conn:
        config, version, updated_at = _load_versioned_settings(conn, _ADMIN_POLICY_REPO_KEY, _policy_defaults())
        repo_rows = (
            conn.execute(
                text(
                    """
                    SELECT repo, COUNT(*) AS analysis_count, MAX(created_at) AS last_analysis_at
                    FROM analyses
                    GROUP BY repo
                    ORDER BY last_analysis_at DESC NULLS LAST
                    LIMIT 100
                    """
                )
            )
            .mappings()
            .all()
        )
    return {
        "config": config,
        "version": version,
        "updatedAt": updated_at,
        "repos": [
            {
                "repo": str(row["repo"]),
                "analysisCount": int(row.get("analysis_count") or 0),
                "lastAnalysisAt": _to_iso(row.get("last_analysis_at")),
            }
            for row in repo_rows
        ],
    }


def _save_policy_payload(config: AdminPolicyConfig, actor_id: str) -> dict[str, Any]:
    engine = get_engine()
    payload = json.loads(config.model_dump_json())
    with engine.begin() as conn:
        version, updated_at = _save_versioned_settings(
            conn,
            _ADMIN_POLICY_REPO_KEY,
            payload,
            blocking_enabled=bool(payload.get("failOnBlocker", True)),
        )
        _insert_audit_log(
            conn,
            actor=actor_id,
            action="admin.policy.save",
            target_type="policy",
            target_id=_ADMIN_POLICY_REPO_KEY,
            meta={"version": version},
        )
    return {
        "config": payload,
        "version": version,
        "updatedAt": updated_at,
    }


def _is_category_enabled(category: str, enabled: dict[str, bool]) -> bool:
    normalized = category.strip().lower()
    if normalized == "security":
        return bool(enabled.get("security", True))
    if normalized in {"perf", "performance"}:
        return bool(enabled.get("performance", True))
    if normalized in {"quality", "style", "other"}:
        return bool(enabled.get("quality", True))
    if normalized == "maintainability":
        return bool(enabled.get("maintainability", True))
    return True


def _resolve_analysis_for_policy_test(conn: Connection, target: str | None) -> dict[str, Any] | None:
    if target is None or len(target.strip()) == 0:
        row = (
            conn.execute(
                text(
                    """
                    SELECT id, repo, pr_number, commit_sha, status, created_at
                    FROM analyses
                    ORDER BY created_at DESC
                    LIMIT 1
                    """
                )
            )
            .mappings()
            .first()
        )
        return dict(row) if row is not None else None

    cleaned = target.strip()
    lower = cleaned.lower()
    if lower.startswith("pr"):
        digits = "".join(character for character in cleaned if character.isdigit())
        if digits:
            pr_number = int(digits)
            row = (
                conn.execute(
                    text(
                        """
                        SELECT id, repo, pr_number, commit_sha, status, created_at
                        FROM analyses
                        WHERE pr_number = :pr_number
                        ORDER BY created_at DESC
                        LIMIT 1
                        """
                    ),
                    {"pr_number": pr_number},
                )
                .mappings()
                .first()
            )
            if row is not None:
                return dict(row)

    row = (
        conn.execute(
            text(
                """
                SELECT id, repo, pr_number, commit_sha, status, created_at
                FROM analyses
                WHERE id = :analysis_id
                LIMIT 1
                """
            ),
            {"analysis_id": cleaned},
        )
        .mappings()
        .first()
    )
    if row is not None:
        return dict(row)

    row = (
        conn.execute(
            text(
                """
                SELECT id, repo, pr_number, commit_sha, status, created_at
                FROM analyses
                WHERE commit_sha ILIKE :commit_prefix
                ORDER BY created_at DESC
                LIMIT 1
                """
            ),
            {"commit_prefix": f"{cleaned}%"},
        )
        .mappings()
        .first()
    )
    if row is not None:
        return dict(row)
    return None


def _test_policy(target: str | None, config: AdminPolicyConfig | None) -> dict[str, Any]:
    engine = get_engine()
    with engine.connect() as conn:
        effective_config: dict[str, Any]
        if config is None:
            effective_config, _version, _updated_at = _load_versioned_settings(conn, _ADMIN_POLICY_REPO_KEY, _policy_defaults())
        else:
            effective_config = json.loads(config.model_dump_json())
        analysis = _resolve_analysis_for_policy_test(conn, target)
        if analysis is None:
            raise ApiError(
                status_code=404,
                code="ANALYSIS_NOT_FOUND",
                message="No analysis found for policy test",
                details={"target": target},
            )
        finding_rows = (
            conn.execute(
                text(
                    """
                    SELECT severity, category, COUNT(*) AS count
                    FROM findings
                    WHERE analysis_id = :analysis_id
                    GROUP BY severity, category
                    """
                ),
                {"analysis_id": str(analysis["id"])},
            )
            .mappings()
            .all()
        )

    enabled_categories_raw = _as_json_object(effective_config.get("enabledCategories"))
    enabled_categories: dict[str, bool] = {key: bool(value) for key, value in enabled_categories_raw.items()}
    blocker_count = 0
    warn_count = 0
    info_count = 0
    for row in finding_rows:
        category = str(row.get("category") or "")
        if not _is_category_enabled(category, enabled_categories):
            continue
        severity = str(row.get("severity") or "").upper()
        count = int(row.get("count") or 0)
        if severity == "BLOCKER":
            blocker_count += count
        elif severity == "WARN":
            warn_count += count
        elif severity == "INFO":
            info_count += count

    fail_on_blocker = bool(effective_config.get("failOnBlocker", True))
    max_comments = int(effective_config.get("maxComments") or 50)
    total_comments = blocker_count + warn_count + info_count

    decision: Literal["APPROVE", "WARN", "BLOCK"]
    reasons: list[str] = []
    if fail_on_blocker and blocker_count > 0:
        decision = "BLOCK"
        reasons.append(f"{blocker_count} blocker finding(s)")
    elif warn_count > 0 or total_comments > max_comments:
        decision = "WARN"
        if warn_count > 0:
            reasons.append(f"{warn_count} warning finding(s)")
        if total_comments > max_comments:
            reasons.append(f"comment budget exceeded ({total_comments} > {max_comments})")
    else:
        decision = "APPROVE"
        reasons.append("no blocking condition matched")

    return {
        "analysisId": str(analysis["id"]),
        "repo": str(analysis["repo"]),
        "status": str(analysis.get("status") or ""),
        "createdAt": _to_iso(analysis.get("created_at")),
        "decision": decision,
        "reasons": reasons,
        "counts": {
            "blocker": blocker_count,
            "warn": warn_count,
            "info": info_count,
            "total": total_comments,
            "maxComments": max_comments,
        },
        "config": effective_config,
    }


def _collect_observability_payload() -> dict[str, Any]:
    engine = get_engine()
    with engine.connect() as conn:
        metrics_row = (
            conn.execute(
                text(
                    """
                    SELECT
                        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW())) AS analyses_today,
                        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', NOW()) AND status = 'FAILED') AS failures_today,
                        COUNT(*) FILTER (WHERE status = 'RUNNING') AS running_count,
                        COUNT(*) FILTER (WHERE status IN ('RECEIVED', 'QUEUED')) AS queued_count
                    FROM analyses
                    """
                )
            )
            .mappings()
            .first()
        )
        duration_row = (
            conn.execute(
                text(
                    """
                    SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (updated_at - created_at))), 0) AS avg_duration_sec
                    FROM analyses
                    WHERE status IN ('COMPLETED', 'FAILED')
                      AND created_at >= NOW() - INTERVAL '24 hours'
                    """
                )
            )
            .mappings()
            .first()
        )
        worker_row = (
            conn.execute(
                text(
                    """
                    SELECT
                        COUNT(DISTINCT tool_name) FILTER (
                            WHERE started_at >= NOW() - INTERVAL '15 minutes'
                              AND (finished_at IS NULL OR finished_at >= NOW() - INTERVAL '15 minutes')
                        ) AS active_workers,
                        COUNT(DISTINCT tool_name) AS total_workers
                    FROM tool_runs
                    """
                )
            )
            .mappings()
            .first()
        )
        api_rows = (
            conn.execute(
                text(
                    """
                    SELECT id, created_at, status, repo, pr_number, error_message
                    FROM analyses
                    ORDER BY created_at DESC
                    LIMIT 40
                    """
                )
            )
            .mappings()
            .all()
        )
        worker_rows = (
            conn.execute(
                text(
                    """
                    SELECT id, analysis_id, tool_name, status, created_at, duration_ms, findings_count, warning
                    FROM tool_runs
                    ORDER BY created_at DESC
                    LIMIT 40
                    """
                )
            )
            .mappings()
            .all()
        )
        ingestion_rows = (
            conn.execute(
                text(
                    """
                    SELECT repo_id, updated_at, profile_json
                    FROM repo_profiles
                    ORDER BY updated_at DESC
                    LIMIT 40
                    """
                )
            )
            .mappings()
            .all()
        )
        queue_rows = (
            conn.execute(
                text(
                    """
                    SELECT id, repo, pr_number, status, created_at
                    FROM analyses
                    WHERE status IN ('RECEIVED', 'QUEUED', 'RUNNING')
                    ORDER BY created_at DESC
                    LIMIT 20
                    """
                )
            )
            .mappings()
            .all()
        )

    analyses_today = int((metrics_row or {}).get("analyses_today") or 0)
    failures_today = int((metrics_row or {}).get("failures_today") or 0)
    running_count = int((metrics_row or {}).get("running_count") or 0)
    queued_count = int((metrics_row or {}).get("queued_count") or 0)
    avg_duration_sec = float((duration_row or {}).get("avg_duration_sec") or 0.0)
    active_workers = int((worker_row or {}).get("active_workers") or 0)
    total_workers = int((worker_row or {}).get("total_workers") or 0)
    if total_workers < active_workers:
        total_workers = active_workers

    failure_rate = (failures_today / analyses_today * 100.0) if analyses_today > 0 else 0.0

    issues: list[dict[str, Any]] = []
    if queued_count >= 5:
        issues.append(
            {
                "id": "queue_saturation",
                "title": "Worker queue saturation",
                "detail": f"{queued_count} job(s) are queued or waiting.",
                "severity": "warn",
            }
        )
    if failure_rate >= 20:
        issues.append(
            {
                "id": "high_failure_rate",
                "title": "High failure rate",
                "detail": f"Failure rate is {failure_rate:.1f}% for today.",
                "severity": "error",
            }
        )
    if analyses_today == 0:
        issues.append(
            {
                "id": "no_activity",
                "title": "No analyses today",
                "detail": "No analysis has been created since the start of the day.",
                "severity": "info",
            }
        )

    api_logs = []
    for row in api_rows:
        status = str(row.get("status") or "").upper()
        level = "error" if status == "FAILED" else ("warn" if status in {"RECEIVED", "QUEUED"} else "info")
        message = f"Analysis {row['id']} {status or 'UNKNOWN'}"
        details = f"repo={row['repo']}"
        if row.get("pr_number") is not None:
            details += f" pr=#{row['pr_number']}"
        if row.get("error_message"):
            details += f" error={row['error_message']}"
        api_logs.append(
            {
                "id": str(row["id"]),
                "timestamp": _to_iso(row.get("created_at")),
                "level": level,
                "message": message,
                "details": details,
            }
        )

    worker_logs = []
    for row in worker_rows:
        status = str(row.get("status") or "").upper()
        level = "error" if status == "FAILED" else ("warn" if status == "SKIPPED" else "info")
        worker_logs.append(
            {
                "id": str(row["id"]),
                "timestamp": _to_iso(row.get("created_at")),
                "level": level,
                "message": f"{row['tool_name']} {status or 'UNKNOWN'}",
                "details": (
                    f"analysis={row['analysis_id']} "
                    f"durationMs={int(row.get('duration_ms') or 0)} "
                    f"findings={int(row.get('findings_count') or 0)} "
                    f"warning={row.get('warning') or '-'}"
                ),
            }
        )

    ingestion_logs = []
    for row in ingestion_rows:
        profile = _as_json_object(row.get("profile_json"))
        files_indexed = int(profile.get("files_indexed") or 0)
        indexed_commit = profile.get("indexed_commit")
        ingestion_logs.append(
            {
                "id": f"repo:{row['repo_id']}",
                "timestamp": _to_iso(row.get("updated_at")),
                "level": "info",
                "message": f"KB profile refreshed for {row['repo_id']}",
                "details": f"filesIndexed={files_indexed} indexedCommit={indexed_commit or '-'}",
            }
        )

    return {
        "metrics": {
            "failureRatePct": round(failure_rate, 2),
            "avgLatencySec": round(avg_duration_sec, 2),
            "analysesToday": analyses_today,
            "activeWorkers": active_workers,
            "totalWorkers": total_workers,
            "queuedJobs": queued_count,
            "runningJobs": running_count,
        },
        "issues": issues,
        "logs": {
            "api": api_logs,
            "workers": worker_logs,
            "ingestion": ingestion_logs,
        },
        "queue": [
            {
                "analysisId": str(row["id"]),
                "repo": str(row["repo"]),
                "prNumber": int(row["pr_number"]) if row.get("pr_number") is not None else None,
                "status": str(row["status"]),
                "createdAt": _to_iso(row.get("created_at")),
            }
            for row in queue_rows
        ],
        "knowledgeBase": source_observability_summary(),
        "generatedAt": _utc_iso_now(),
    }


def _requeue_analysis_job(analysis_id: str, actor_id: str) -> dict[str, Any]:
    repo = AnalysesRepo()
    analysis = repo.get_by_id(analysis_id)
    if analysis is None:
        raise ApiError(
            status_code=404,
            code="ANALYSIS_NOT_FOUND",
            message="Analysis not found",
            details={"analysis_id": analysis_id},
        )

    repo.update_status(
        analysis_id=analysis_id,
        status="QUEUED",
        stage="QUEUED",
        progress=10,
        error_code=None,
        error_message=None,
        metadata_updates={
            "pipeline": {
                "requeued": True,
                "requeued_at": _utc_iso_now(),
                "requeued_by": actor_id,
            }
        },
    )
    try:
        enqueue_result = enqueue_analysis_job(analysis_id)
    except QueueUnavailableError as exc:
        raise ApiError(
            status_code=503,
            code="QUEUE_UNAVAILABLE",
            message="Unable to enqueue analysis job",
            details={"analysis_id": analysis_id},
        ) from exc
    return {
        "analysisId": analysis_id,
        "taskId": enqueue_result.task_id,
        "status": "QUEUED",
    }


def _collect_integrations_payload() -> dict[str, Any]:
    engine = get_engine()
    with engine.connect() as conn:
        integration_settings, settings_version, settings_updated_at = _load_versioned_settings(
            conn,
            _ADMIN_INTEGRATIONS_REPO_KEY,
            _integration_defaults(),
        )
        ci_token_settings, _token_version, _token_updated_at = _load_versioned_settings(
            conn,
            _ADMIN_CI_TOKEN_REPO_KEY,
            {"revoked": True},
        )
        try:
            webhook_rows = (
                conn.execute(
                    text(
                        """
                        SELECT repo, source, created_at
                        FROM analyses
                        WHERE source ILIKE 'github%'
                        ORDER BY created_at DESC
                        LIMIT 20
                        """
                    )
                )
                .mappings()
                .all()
            )
        except SQLAlchemyError as exc:
            logger.warning(
                "Admin integrations webhook history unavailable because analyses query failed: %s",
                exc,
            )
            webhook_rows = []

    token_revoked = bool(ci_token_settings.get("revoked", True))
    token_hash = str(ci_token_settings.get("tokenHash") or "")
    token_exists = bool(token_hash) and not token_revoked
    ci_token = {
        "exists": token_exists,
        "prefix": ci_token_settings.get("tokenPrefix"),
        "createdAt": ci_token_settings.get("createdAt"),
        "createdBy": ci_token_settings.get("createdBy"),
        "revoked": token_revoked,
        "revokedAt": ci_token_settings.get("revokedAt"),
    }

    return {
        "config": {
            "ciEnabled": bool(integration_settings.get("ciEnabled", True)),
            "failOnBlocker": bool(integration_settings.get("failOnBlocker", True)),
        },
        "version": settings_version,
        "updatedAt": settings_updated_at,
        "ciToken": ci_token,
        "providers": {
            "githubAppConfigured": bool(
                settings.GITHUB_APP_ID and settings.GITHUB_APP_INSTALLATION_ID and settings.GITHUB_APP_PRIVATE_KEY_PEM
            ),
            "githubWebhookConfigured": bool(settings.GITHUB_WEBHOOK_SECRET),
            "neo4jEnabled": bool(settings.NEO4J_ENABLED),
        },
        "storage": {
            "enabled": bool(settings.OBJECT_STORAGE_ENABLED),
            "provider": "S3 Compatible (MinIO)",
            "endpoint": settings.MINIO_ENDPOINT,
            "bucket": settings.MINIO_BUCKET,
            "secure": bool(settings.MINIO_SECURE),
        },
        "webhooks": [
            {
                "repo": str(row["repo"]),
                "event": str(row["source"]),
                "timestamp": _to_iso(row.get("created_at")),
            }
            for row in webhook_rows
        ],
    }


def _save_integrations_payload(payload: AdminIntegrationsUpdateRequest, actor_id: str) -> dict[str, Any]:
    engine = get_engine()
    with engine.begin() as conn:
        current, _version, _updated_at = _load_versioned_settings(conn, _ADMIN_INTEGRATIONS_REPO_KEY, _integration_defaults())
        if payload.ciEnabled is not None:
            current["ciEnabled"] = bool(payload.ciEnabled)
        if payload.failOnBlocker is not None:
            current["failOnBlocker"] = bool(payload.failOnBlocker)
        version, updated_at = _save_versioned_settings(conn, _ADMIN_INTEGRATIONS_REPO_KEY, current)
        _insert_audit_log(
            conn,
            actor=actor_id,
            action="admin.integrations.save",
            target_type="integration",
            target_id=_ADMIN_INTEGRATIONS_REPO_KEY,
            meta={"version": version},
        )

    return {
        "config": {
            "ciEnabled": bool(current.get("ciEnabled", True)),
            "failOnBlocker": bool(current.get("failOnBlocker", True)),
        },
        "version": version,
        "updatedAt": updated_at,
    }


def _rotate_ci_token(actor_id: str) -> dict[str, Any]:
    token_value = f"air_{secrets.token_urlsafe(36)}"
    token_hash = hashlib.sha256(token_value.encode("utf-8")).hexdigest()
    created_at = _utc_iso_now()
    payload = {
        "tokenHash": token_hash,
        "tokenPrefix": token_value[:_TOKEN_PREFIX_LEN],
        "createdAt": created_at,
        "createdBy": actor_id,
        "revoked": False,
        "revokedAt": None,
    }
    engine = get_engine()
    with engine.begin() as conn:
        version, updated_at = _save_versioned_settings(conn, _ADMIN_CI_TOKEN_REPO_KEY, payload)
        _insert_audit_log(
            conn,
            actor=actor_id,
            action="admin.integrations.ci_token.rotate",
            target_type="integration_token",
            target_id=_ADMIN_CI_TOKEN_REPO_KEY,
            meta={"version": version},
        )
    return {
        "token": token_value,
        "prefix": payload["tokenPrefix"],
        "createdAt": created_at,
        "version": version,
        "updatedAt": updated_at,
    }


def _revoke_ci_token(actor_id: str) -> dict[str, Any]:
    engine = get_engine()
    with engine.begin() as conn:
        current, _version, _updated_at = _load_versioned_settings(conn, _ADMIN_CI_TOKEN_REPO_KEY, {"revoked": True})
        current["revoked"] = True
        current["revokedAt"] = _utc_iso_now()
        version, updated_at = _save_versioned_settings(conn, _ADMIN_CI_TOKEN_REPO_KEY, current)
        _insert_audit_log(
            conn,
            actor=actor_id,
            action="admin.integrations.ci_token.revoke",
            target_type="integration_token",
            target_id=_ADMIN_CI_TOKEN_REPO_KEY,
            meta={"version": version},
        )
    return {
        "revoked": True,
        "version": version,
        "updatedAt": updated_at,
    }


async def _reindex_kb_repo(repo_id: str, repo_path: str | None, actor_id: str) -> dict[str, Any]:
    engine = get_engine()
    with engine.connect() as conn:
        resolved_repo_path = repo_path
        if not resolved_repo_path:
            row = (
                conn.execute(
                    text("SELECT repo_path FROM repo_profiles WHERE repo_id = :repo_id LIMIT 1"),
                    {"repo_id": repo_id},
                )
                .mappings()
                .first()
            )
            resolved_repo_path = str(row["repo_path"]) if row and row.get("repo_path") else None
    if not resolved_repo_path:
        raise ApiError(
            status_code=400,
            code="MISSING_REPO_PATH",
            message="repoPath is required because no existing profile path was found",
            details={"repoId": repo_id},
        )
    try:
        async_result = run_repo_onboarding.apply_async(
            args=[repo_id, resolved_repo_path, "admin_manual"],
            queue=settings.ANALYSIS_QUEUE_NAME,
        )
    except Exception as exc:
        raise ApiError(
            status_code=503,
            code="QUEUE_UNAVAILABLE",
            message="Unable to enqueue KB reindex task",
            details={"repoId": repo_id},
        ) from exc

    engine = get_engine()
    with engine.begin() as conn:
        _insert_audit_log(
            conn,
            actor=actor_id,
            action="admin.kb.reindex",
            target_type="repo_profile",
            target_id=repo_id,
            meta={"repoPath": resolved_repo_path},
        )
    return {
        "repoId": repo_id,
        "repoPath": resolved_repo_path,
        "taskId": str(async_result.id or ""),
        "status": "QUEUED",
    }


async def _delete_kb_repo(repo_id: str, actor_id: str) -> dict[str, Any]:
    engine = get_engine()
    deleted = False
    with engine.begin() as conn:
        existing = (
            conn.execute(
                text("SELECT repo_id FROM repo_profiles WHERE repo_id = :repo_id LIMIT 1"),
                {"repo_id": repo_id},
            )
            .mappings()
            .first()
        )
        if existing is None:
            raise ApiError(
                status_code=404,
                code="REPO_PROFILE_NOT_FOUND",
                message="Repo profile not found",
                details={"repoId": repo_id},
            )
        conn.execute(text("DELETE FROM repo_profiles WHERE repo_id = :repo_id"), {"repo_id": repo_id})
        _insert_audit_log(
            conn,
            actor=actor_id,
            action="admin.kb.delete_profile",
            target_type="repo_profile",
            target_id=repo_id,
            meta={},
        )
        deleted = True

    if settings.NEO4J_ENABLED:
        from app.integrations.graph_database.neo4j_client import get_neo4j_client
        try:
            neo4j_client = get_neo4j_client()
            import asyncio
            await asyncio.to_thread(neo4j_client.delete_repo_chunks, repo_id)
        except Exception:
            # Keep profile deletion successful even when graph-store cleanup fails.
            pass

    return {"repoId": repo_id, "deleted": deleted}


def _test_storage_connection() -> dict[str, Any]:
    client = S3MinioClient()
    if not settings.OBJECT_STORAGE_ENABLED:
        return {
            "ok": False,
            "message": "Object storage is disabled. Set OBJECT_STORAGE_ENABLED=true and configure MinIO before running the storage probe.",
            "checkedAt": _utc_iso_now(),
        }

    probe_key = f"admin-storage-probe/{uuid.uuid4().hex}.txt"
    payload = f"probe:{_utc_iso_now()}".encode("utf-8")
    object_path = client.put_object(probe_key, payload, content_type="text/plain")
    if object_path is None:
        return {
            "ok": False,
            "message": "Unable to upload probe object.",
            "checkedAt": _utc_iso_now(),
        }
    fetched = client.get_object(probe_key)
    deleted = client.delete_object(probe_key)
    ok = fetched == payload and deleted
    return {
        "ok": ok,
        "message": "Storage probe succeeded." if ok else "Storage probe failed.",
        "checkedAt": _utc_iso_now(),
    }


@router.get("/users")
async def get_admin_users(
    limit: int = Query(default=250, ge=1, le=1000),
    _principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    payload = await asyncio.to_thread(_collect_admin_users, limit)
    return payload


@router.patch("/users/{user_id}")
async def patch_admin_user(
    payload: AdminUserUpdateRequest,
    user_id: str = Path(min_length=1, max_length=255),
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    if (
        payload.role is None
        and payload.isActive is None
        and payload.customPermissions is None
        and payload.revokedPermissions is None
    ):
        raise ApiError(
            status_code=400,
            code="EMPTY_UPDATE",
            message="At least one field must be provided",
        )
    if payload.isActive is False and principal.user_id == user_id:
        raise ApiError(
            status_code=400,
            code="SELF_DEACTIVATE_FORBIDDEN",
            message="Cannot deactivate the current admin user",
        )

    updated = await asyncio.to_thread(_update_admin_user, user_id, payload, principal.user_id)
    return {"item": updated}


@router.delete("/users/{user_id}")
async def delete_admin_user(
    user_id: str = Path(min_length=1, max_length=255),
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    """
    Permanently delete a user and ALL their associated data.
    
    This is a destructive operation that cannot be undone.
    It will cascade delete:
    - User roles and permissions
    - Project-specific roles
    - Organization memberships
    - Notifications
    - Review assignments, comments, and change requests
    - Reviewer metrics
    - Review templates and sessions created by user
    
    An audit log entry is created before deletion.
    """
    # Prevent self-deletion
    if principal.user_id == user_id:
        raise ApiError(
            status_code=400,
            code="SELF_DELETE_FORBIDDEN",
            message="Cannot delete your own account",
        )
    
    result = await asyncio.to_thread(_cascade_delete_user, user_id, principal.user_id)
    return result


@router.get("/policies")
async def get_admin_policies(
    _principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    payload = await asyncio.to_thread(_collect_policy_payload)
    return payload


@router.put("/policies")
async def put_admin_policies(
    payload: AdminPoliciesUpdateRequest,
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    saved = await asyncio.to_thread(_save_policy_payload, payload.config, principal.user_id)
    return saved


@router.post("/policies/test")
async def test_admin_policies(
    payload: AdminPoliciesTestRequest,
    _principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    result = await asyncio.to_thread(_test_policy, payload.target, payload.config)
    return result


@router.get("/observability")
async def get_admin_observability(
    _principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    payload = await asyncio.to_thread(_collect_observability_payload)
    return payload


@router.post("/observability/jobs/{analysis_id}/retry")
async def retry_admin_observability_job(
    analysis_id: str = Path(min_length=1, max_length=255),
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    payload = await asyncio.to_thread(_requeue_analysis_job, analysis_id, principal.user_id)
    return payload


@router.get("/integrations")
async def get_admin_integrations(
    _principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    payload = await asyncio.to_thread(_collect_integrations_payload)
    return payload


@router.put("/integrations")
async def put_admin_integrations(
    payload: AdminIntegrationsUpdateRequest,
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    saved = await asyncio.to_thread(_save_integrations_payload, payload, principal.user_id)
    return saved


@router.post("/integrations/ci-token/rotate")
async def rotate_admin_ci_token(
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    payload = await asyncio.to_thread(_rotate_ci_token, principal.user_id)
    return payload


@router.delete("/integrations/ci-token")
async def delete_admin_ci_token(
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    payload = await asyncio.to_thread(_revoke_ci_token, principal.user_id)
    return payload


@router.post("/integrations/storage/test")
async def test_admin_storage(
    _principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    payload = await asyncio.to_thread(_test_storage_connection)
    return payload


@router.post("/knowledge-base/reindex")
async def reindex_admin_knowledge_base(
    payload: KnowledgeBaseReindexRequest,
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    result = await _reindex_kb_repo(payload.repoId, payload.repoPath, principal.user_id)
    return result


@router.delete("/knowledge-base/repos/{repo_id}")
async def delete_admin_knowledge_base_repo(
    repo_id: str = Path(min_length=1, max_length=255),
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    result = await _delete_kb_repo(repo_id, principal.user_id)
    return result


# ============================================================================
# User Permissions CRUD Endpoints
# ============================================================================

class GrantPermissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    permission_code: str = Field(..., min_length=1, max_length=255)
    reason: str | None = None
    expires_at: datetime | None = None


class UpdatePermissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    is_active: bool | None = None
    expires_at: datetime | None = None
    reason: str | None = None


@router.get("/users/{user_id}/permissions")
async def get_user_permissions(
    user_id: str = Path(min_length=1, max_length=255),
    _principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    """Get all permissions for a user, including role-based and direct grants."""
    result = await asyncio.to_thread(_get_user_permissions, user_id)
    return result


@router.post("/users/{user_id}/permissions")
async def grant_user_permission(
    payload: GrantPermissionRequest,
    user_id: str = Path(min_length=1, max_length=255),
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    """Grant a permission directly to a user."""
    result = await asyncio.to_thread(
        _grant_user_permission, 
        user_id, 
        payload.permission_code,
        principal.user_id,
        payload.reason,
        payload.expires_at
    )
    return result


@router.patch("/users/{user_id}/permissions/{permission_code}")
async def update_user_permission(
    payload: UpdatePermissionRequest,
    user_id: str = Path(min_length=1, max_length=255),
    permission_code: str = Path(min_length=1, max_length=255),
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    """Update a user's direct permission grant."""
    result = await asyncio.to_thread(
        _update_user_permission,
        user_id,
        permission_code,
        principal.user_id,
        payload.is_active,
        payload.expires_at,
        payload.reason
    )
    return result


@router.delete("/users/{user_id}/permissions/{permission_code}")
async def revoke_user_permission(
    user_id: str = Path(min_length=1, max_length=255),
    permission_code: str = Path(min_length=1, max_length=255),
    principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    """Revoke a permission from a user."""
    result = await asyncio.to_thread(
        _revoke_user_permission,
        user_id,
        permission_code,
        principal.user_id
    )
    return result


def _get_user_permissions(user_id: str) -> dict[str, Any]:
    """Get all permissions for a user."""
    engine = get_engine()
    with engine.connect() as conn:
        # Check user exists
        user = conn.execute(
            text("SELECT id, email, display_name FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        ).mappings().first()
        
        if not user:
            raise ApiError(status=404, code="USER_NOT_FOUND", message="User not found")
        
        # Get role-based permissions
        role_permissions = conn.execute(
            text("""
                SELECT DISTINCT p.code, p.description, r.code as role_code
                FROM permissions p
                JOIN role_permissions rp ON rp.permission_id = p.id
                JOIN roles r ON r.id = rp.role_id
                JOIN user_roles ur ON ur.role_id = r.id
                WHERE ur.user_id = :user_id
                ORDER BY p.code
            """),
            {"user_id": user_id}
        ).mappings().all()
        
        # Get direct user permissions
        direct_permissions = conn.execute(
            text("""
                SELECT 
                    up.id,
                    p.code,
                    p.description,
                    up.granted_by,
                    up.granted_at,
                    up.expires_at,
                    up.reason,
                    up.is_active,
                    g.display_name as granted_by_name
                FROM user_permissions up
                JOIN permissions p ON p.id = up.permission_id
                LEFT JOIN users g ON g.id = up.granted_by
                WHERE up.user_id = :user_id
                ORDER BY up.granted_at DESC
            """),
            {"user_id": user_id}
        ).mappings().all()
        
        return {
            "user": {
                "id": user["id"],
                "email": user["email"],
                "displayName": user["display_name"],
            },
            "rolePermissions": [
                {
                    "code": p["code"],
                    "description": p["description"],
                    "fromRole": p["role_code"],
                }
                for p in role_permissions
            ],
            "directPermissions": [
                {
                    "id": p["id"],
                    "code": p["code"],
                    "description": p["description"],
                    "grantedBy": p["granted_by"],
                    "grantedByName": p["granted_by_name"],
                    "grantedAt": p["granted_at"].isoformat() if p["granted_at"] else None,
                    "expiresAt": p["expires_at"].isoformat() if p["expires_at"] else None,
                    "reason": p["reason"],
                    "isActive": p["is_active"],
                }
                for p in direct_permissions
            ],
        }


def _grant_user_permission(
    user_id: str,
    permission_code: str,
    granted_by: str,
    reason: str | None,
    expires_at: datetime | None
) -> dict[str, Any]:
    """Grant a permission directly to a user."""
    engine = get_engine()
    with engine.begin() as conn:
        # Check user exists
        user = conn.execute(
            text("SELECT id FROM users WHERE id = :user_id"),
            {"user_id": user_id}
        ).first()
        
        if not user:
            raise ApiError(status=404, code="USER_NOT_FOUND", message="User not found")
        
        # Get permission ID
        permission = conn.execute(
            text("SELECT id FROM permissions WHERE code = :code"),
            {"code": permission_code}
        ).first()
        
        if not permission:
            raise ApiError(status=404, code="PERMISSION_NOT_FOUND", message=f"Permission '{permission_code}' not found")
        
        permission_id = permission[0]
        
        # Check if already granted
        existing = conn.execute(
            text("""
                SELECT id FROM user_permissions 
                WHERE user_id = :user_id AND permission_id = :permission_id
            """),
            {"user_id": user_id, "permission_id": permission_id}
        ).first()
        
        if existing:
            # Update existing grant
            conn.execute(
                text("""
                    UPDATE user_permissions 
                    SET is_active = TRUE, 
                        granted_by = :granted_by,
                        granted_at = NOW(),
                        expires_at = :expires_at,
                        reason = :reason,
                        updated_at = NOW()
                    WHERE user_id = :user_id AND permission_id = :permission_id
                """),
                {
                    "user_id": user_id,
                    "permission_id": permission_id,
                    "granted_by": granted_by,
                    "expires_at": expires_at,
                    "reason": reason,
                }
            )
            grant_id = existing[0]
        else:
            # Create new grant
            grant_id = str(uuid.uuid4())
            conn.execute(
                text("""
                    INSERT INTO user_permissions (
                        id, user_id, permission_id, granted_by, 
                        expires_at, reason, is_active
                    )
                    VALUES (
                        :id, :user_id, :permission_id, :granted_by,
                        :expires_at, :reason, TRUE
                    )
                """),
                {
                    "id": grant_id,
                    "user_id": user_id,
                    "permission_id": permission_id,
                    "granted_by": granted_by,
                    "expires_at": expires_at,
                    "reason": reason,
                }
            )
        
        # Log to audit
        audit_id = str(uuid.uuid4())
        conn.execute(
            text("""
                INSERT INTO user_permissions_audit (
                    id, user_permission_id, user_id, permission_id,
                    action, performed_by, reason, new_values
                )
                VALUES (
                    :id, :user_permission_id, :user_id, :permission_id,
                    'granted', :performed_by, :reason,
                    :new_values::jsonb
                )
            """),
            {
                "id": audit_id,
                "user_permission_id": grant_id,
                "user_id": user_id,
                "permission_id": permission_id,
                "performed_by": granted_by,
                "reason": reason,
                "new_values": json.dumps({
                    "expires_at": expires_at.isoformat() if expires_at else None,
                    "is_active": True,
                }),
            }
        )
        
        return {
            "id": grant_id,
            "permissionCode": permission_code,
            "userId": user_id,
            "granted": True,
        }


def _update_user_permission(
    user_id: str,
    permission_code: str,
    updated_by: str,
    is_active: bool | None,
    expires_at: datetime | None,
    reason: str | None
) -> dict[str, Any]:
    """Update a user's direct permission grant."""
    engine = get_engine()
    with engine.begin() as conn:
        # Get permission ID
        permission = conn.execute(
            text("SELECT id FROM permissions WHERE code = :code"),
            {"code": permission_code}
        ).first()
        
        if not permission:
            raise ApiError(status=404, code="PERMISSION_NOT_FOUND", message=f"Permission '{permission_code}' not found")
        
        permission_id = permission[0]
        
        # Check if grant exists
        existing = conn.execute(
            text("""
                SELECT id, is_active, expires_at, reason 
                FROM user_permissions 
                WHERE user_id = :user_id AND permission_id = :permission_id
            """),
            {"user_id": user_id, "permission_id": permission_id}
        ).mappings().first()
        
        if not existing:
            raise ApiError(status=404, code="GRANT_NOT_FOUND", message="Permission grant not found")
        
        # Build update
        updates = ["updated_at = NOW()"]
        params = {"user_id": user_id, "permission_id": permission_id}
        
        old_values = {
            "is_active": existing["is_active"],
            "expires_at": existing["expires_at"].isoformat() if existing["expires_at"] else None,
            "reason": existing["reason"],
        }
        new_values = {}
        
        if is_active is not None:
            updates.append("is_active = :is_active")
            params["is_active"] = is_active
            new_values["is_active"] = is_active
        
        if expires_at is not None:
            updates.append("expires_at = :expires_at")
            params["expires_at"] = expires_at
            new_values["expires_at"] = expires_at.isoformat()
        
        if reason is not None:
            updates.append("reason = :reason")
            params["reason"] = reason
            new_values["reason"] = reason
        
        conn.execute(
            text(f"""
                UPDATE user_permissions 
                SET {', '.join(updates)}
                WHERE user_id = :user_id AND permission_id = :permission_id
            """),
            params
        )
        
        # Log to audit
        audit_id = str(uuid.uuid4())
        conn.execute(
            text("""
                INSERT INTO user_permissions_audit (
                    id, user_permission_id, user_id, permission_id,
                    action, performed_by, reason, old_values, new_values
                )
                VALUES (
                    :id, :user_permission_id, :user_id, :permission_id,
                    'modified', :performed_by, :reason,
                    :old_values::jsonb, :new_values::jsonb
                )
            """),
            {
                "id": audit_id,
                "user_permission_id": existing["id"],
                "user_id": user_id,
                "permission_id": permission_id,
                "performed_by": updated_by,
                "reason": reason,
                "old_values": json.dumps(old_values),
                "new_values": json.dumps(new_values),
            }
        )
        
        return {
            "id": existing["id"],
            "permissionCode": permission_code,
            "userId": user_id,
            "updated": True,
        }


def _revoke_user_permission(
    user_id: str,
    permission_code: str,
    revoked_by: str
) -> dict[str, Any]:
    """Revoke a permission from a user."""
    engine = get_engine()
    with engine.begin() as conn:
        # Get permission ID
        permission = conn.execute(
            text("SELECT id FROM permissions WHERE code = :code"),
            {"code": permission_code}
        ).first()
        
        if not permission:
            raise ApiError(status=404, code="PERMISSION_NOT_FOUND", message=f"Permission '{permission_code}' not found")
        
        permission_id = permission[0]
        
        # Check if grant exists
        existing = conn.execute(
            text("""
                SELECT id FROM user_permissions 
                WHERE user_id = :user_id AND permission_id = :permission_id
            """),
            {"user_id": user_id, "permission_id": permission_id}
        ).first()
        
        if not existing:
            raise ApiError(status=404, code="GRANT_NOT_FOUND", message="Permission grant not found")
        
        # Delete the grant
        conn.execute(
            text("""
                DELETE FROM user_permissions 
                WHERE user_id = :user_id AND permission_id = :permission_id
            """),
            {"user_id": user_id, "permission_id": permission_id}
        )
        
        # Log to audit
        audit_id = str(uuid.uuid4())
        conn.execute(
            text("""
                INSERT INTO user_permissions_audit (
                    id, user_permission_id, user_id, permission_id,
                    action, performed_by
                )
                VALUES (
                    :id, :user_permission_id, :user_id, :permission_id,
                    'revoked', :performed_by
                )
            """),
            {
                "id": audit_id,
                "user_permission_id": existing[0],
                "user_id": user_id,
                "permission_id": permission_id,
                "performed_by": revoked_by,
            }
        )
        
        return {
            "permissionCode": permission_code,
            "userId": user_id,
            "revoked": True,
        }


@router.get("/permissions/catalog")
async def get_permissions_catalog(
    _principal: AuthenticatedPrincipal = Depends(_ensure_admin_access),
):
    """Get all available permissions."""
    result = await asyncio.to_thread(_get_permissions_catalog)
    return result


def _get_permissions_catalog() -> dict[str, Any]:
    """Get all available permissions."""
    engine = get_engine()
    with engine.connect() as conn:
        permissions = conn.execute(
            text("""
                SELECT id, code, description
                FROM permissions
                ORDER BY code
            """)
        ).mappings().all()
        
        return {
            "items": [
                {
                    "id": p["id"],
                    "code": p["code"],
                    "description": p["description"],
                }
                for p in permissions
            ],
            "total": len(permissions),
        }

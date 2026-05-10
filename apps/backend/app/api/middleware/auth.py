from __future__ import annotations

import asyncio
import threading
import time
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Depends, Header, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient
from pydantic import BaseModel, Field

from app.data.repos.rbac_repo import RBACRepo
from app.settings import settings

import logging
logger = logging.getLogger(__name__)


# TTL cache for authenticated principals to avoid DB calls on every request
# Key: (user_id, org_id), Value: (AuthenticatedPrincipal, timestamp)
_principal_cache: dict[tuple[str, str | None], tuple["AuthenticatedPrincipal", float]] = {}
_PRINCIPAL_CACHE_TTL_SECONDS = 60  # Cache principals for 60 seconds
_cache_lock = threading.Lock()


def _get_cached_principal(user_id: str, org_id: str | None) -> "AuthenticatedPrincipal | None":
    """Get cached principal if still valid."""
    key = (user_id, org_id)
    with _cache_lock:
        if key in _principal_cache:
            principal, cached_at = _principal_cache[key]
            if time.time() - cached_at < _PRINCIPAL_CACHE_TTL_SECONDS:
                return principal
            # Expired, remove from cache
            del _principal_cache[key]
    return None


def _cache_principal(user_id: str, org_id: str | None, principal: "AuthenticatedPrincipal") -> None:
    """Cache principal with current timestamp."""
    key = (user_id, org_id)
    with _cache_lock:
        _principal_cache[key] = (principal, time.time())
        # Simple cache size limit - clear oldest entries if too large
        if len(_principal_cache) > 10000:
            # Remove oldest 20% of entries
            sorted_entries = sorted(_principal_cache.items(), key=lambda x: x[1][1])
            for k, _ in sorted_entries[:2000]:
                del _principal_cache[k]


def invalidate_principal_cache(user_id: str) -> None:
    """Invalidate all cached principals for a given user (across all orgs)."""
    with _cache_lock:
        keys_to_remove = [key for key in _principal_cache if key[0] == user_id]
        for key in keys_to_remove:
            del _principal_cache[key]
    logger.info(f"Invalidated principal cache for user {user_id} ({len(keys_to_remove)} entries)")



class AuthenticatedPrincipal(BaseModel):
    user_id: str
    email: str
    display_name: str | None = None
    github_login: str | None = None
    canonical_role: str = "developer"
    roles: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    org_id: str | None = None
    org_slug: str | None = None
    org_name: str | None = None
    org_role: str | None = None

    @property
    def role(self) -> str:
        if self.canonical_role:
            return self.canonical_role
        if self.roles:
            return self.roles[0]
        return "developer"


_bearer_scheme = HTTPBearer(auto_error=False)

_ROLE_ALIASES: dict[str, str] = {
    "admin": "admin",
    "administrator": "admin",
    "owner": "admin",
    "superadmin": "admin",
    "super-admin": "admin",
    "super_admin": "admin",
    "tech_lead": "tech_lead",
    "tech-lead": "tech_lead",
    "techlead": "tech_lead",
    "lead": "tech_lead",
    "team_lead": "tech_lead",
    "team-lead": "tech_lead",
    "reviewer": "tech_lead",
    "review": "tech_lead",
    "code-reviewer": "tech_lead",
    "code_reviewer": "tech_lead",
    "reviewer_lead": "tech_lead",
    "reviewer-lead": "tech_lead",
    "lead_reviewer": "tech_lead",
    "lead-reviewer": "tech_lead",
    "reviewer_senior": "tech_lead",
    "reviewer-senior": "tech_lead",
    "senior_reviewer": "tech_lead",
    "senior-reviewer": "tech_lead",
    "reviewer_junior": "tech_lead",
    "reviewer-junior": "tech_lead",
    "junior_reviewer": "tech_lead",
    "junior-reviewer": "tech_lead",
    # Developer
    "developer": "developer",
    "dev": "developer",
    "member": "developer",
    "user": "developer",
    "viewer": "developer",
}

_ROLE_PRIORITY: dict[str, int] = {
    "admin": 300,
    "tech_lead": 200,
    "developer": 100,
}

_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "developer": {
        "analyses.create",
        "analyses.read",
        "assignments.view_own",
        "comments.read",
        "metrics.read_self",
        "projects.read",
        "repositories.read",
    },
    "tech_lead": {
        "analyses.create",
        "analyses.read",
        "analyses.write",
        "assignments.create",
        "assignments.modify",
        "assignments.view_all",
        "assignments.view_own",
        "comments.create",
        "comments.edit",
        "comments.read",
        "comments.reply",
        "comments.resolve",
        "metrics.read_self",
        "metrics.read_team",
        "organizations.read",
        "project_roles.read",
        "project_roles.write",
        "project_settings.audit",
        "project_settings.read",
        "project_settings.write",
        "projects.read",
        "projects.update",
        "repositories.create",
        "repositories.read",
        "reviews.approve",
        "reviews.assign",
        "reviews.block",
        "reviews.bulk_action",
        "reviews.claim",
        "reviews.delegate",
        "reviews.request_changes",
        "reviews.warn",
        "teams.create",
        "teams.delete",
        "teams.manage_members",
        "teams.read",
        "teams.update",
        "templates.create",
        "templates.use",
        "threads.create",
        "threads.moderate",
        "threads.participate",
    },
}
_ROLE_PERMISSIONS["admin"] = _ROLE_PERMISSIONS["tech_lead"] | {
    "admin.read",
    "admin.write",
    "integrations.read",
    "integrations.write",
    "observability.read",
    "organizations.write",
    "organizations.delete",
    "policies.read",
    "policies.write",
    "role_permissions.read",
    "role_permissions.write",
    "users.manage",
}


@lru_cache(maxsize=1)
def get_rbac_repo() -> RBACRepo:
    return RBACRepo()


@lru_cache(maxsize=1)
def get_clerk_jwk_client() -> PyJWKClient:
    issuer = (settings.CLERK_ISSUER_URL or "").rstrip("/")
    jwks_url = settings.CLERK_JWKS_URL or (f"{issuer}/.well-known/jwks.json" if issuer else "")
    if not jwks_url:
        raise RuntimeError("CLERK_JWKS_URL or CLERK_ISSUER_URL must be configured when CLERK_AUTH_ENABLED=true")
    return PyJWKClient(jwks_url)


def _is_auth_enforced() -> bool:
    return settings.RBAC_ENFORCEMENT_ENABLED or settings.CLERK_AUTH_ENABLED


def _build_local_dev_principal(user_id: str | None = None) -> AuthenticatedPrincipal:
    normalized_user_id = (user_id or "").strip() or "local-dev-user"
    return AuthenticatedPrincipal(
        user_id=normalized_user_id,
        email=f"{normalized_user_id}@local.dev",
        display_name="Local Dev User",
        canonical_role="admin",
        roles=["admin"],
        permissions=permissions_for_roles(["admin"]),
        org_id=None,
        org_slug=None,
        org_name=None,
        org_role=None,
    )


def _first_non_empty_string(*values: Any) -> str | None:
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def normalize_role_code(value: Any) -> str:
    if not isinstance(value, str):
        return "developer"
    normalized = value.strip().lower()
    if normalized.startswith("org:"):
        normalized = normalized.removeprefix("org:")
    return _ROLE_ALIASES.get(normalized, "developer")


def canonicalize_roles(values: list[str] | tuple[str, ...] | None) -> list[str]:
    normalized_roles: list[str] = []
    for value in values or []:
        normalized = normalize_role_code(value)
        if normalized not in normalized_roles:
            normalized_roles.append(normalized)

    if not normalized_roles:
        normalized_roles.append("developer")

    return sorted(normalized_roles, key=lambda role: _ROLE_PRIORITY.get(role, 0), reverse=True)


def _select_canonical_role(roles: list[str]) -> str:
    return canonicalize_roles(roles)[0]


def _extract_dict(parent: dict[str, Any], *keys: str) -> dict[str, Any]:
    for key in keys:
        candidate = parent.get(key)
        if isinstance(candidate, dict):
            return candidate
    return {}


def _extract_roles(claims: dict[str, Any]) -> list[str]:
    metadata = _extract_dict(claims, "metadata")
    public_metadata = _extract_dict(claims, "public_metadata", "publicMetadata")
    app_metadata = _extract_dict(claims, "app_metadata", "appMetadata")
    unsafe_metadata = _extract_dict(claims, "unsafe_metadata", "unsafeMetadata")

    candidates: list[Any] = [
        claims.get("role"),
        claims.get("org_role"),
        metadata.get("role"),
        public_metadata.get("role"),
        app_metadata.get("role"),
        unsafe_metadata.get("role"),
    ]

    raw_roles = claims.get("roles")
    if isinstance(raw_roles, list):
        candidates.extend(raw_roles)

    roles: list[str] = []
    for candidate in candidates:
        if not isinstance(candidate, str) or not candidate.strip():
            continue
        normalized = normalize_role_code(candidate)
        if normalized not in roles:
            roles.append(normalized)

    return canonicalize_roles(roles or ["developer"])


def _normalize_org_role(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if not normalized:
        return None
    if normalized.startswith("org:"):
        normalized = normalized.removeprefix("org:")
    if normalized in {"owner", "admin", "member"}:
        return normalized
    if normalized in {"basic_member", "basic-member", "contributor", "developer", "dev"}:
        return "member"
    return None


def _extract_org_context_from_claims(claims: dict[str, Any]) -> tuple[str | None, str | None, str | None, str | None]:
    org_block = _extract_dict(claims, "organization", "org", "org_data")
    org_id = _first_non_empty_string(
        claims.get("org_id"),
        claims.get("organization_id"),
        org_block.get("id"),
    )
    org_slug = _first_non_empty_string(
        claims.get("org_slug"),
        claims.get("organization_slug"),
        org_block.get("slug"),
    )
    org_name = _first_non_empty_string(
        claims.get("org_name"),
        claims.get("organization_name"),
        org_block.get("name"),
        org_slug,
        org_id,
    )
    org_role = _normalize_org_role(
        _first_non_empty_string(
            claims.get("org_role"),
            claims.get("organization_role"),
            org_block.get("role"),
        )
    )
    return org_id, org_slug, org_name, org_role


def permissions_for_roles(roles: list[str]) -> list[str]:
    permissions: set[str] = set()
    for role in canonicalize_roles(roles):
        permissions.update(_ROLE_PERMISSIONS.get(role, _ROLE_PERMISSIONS["developer"]))
    return sorted(permissions)


def _apply_admin_email_override(email: str, roles: list[str]) -> list[str]:
    normalized_email = email.strip().lower()
    if not normalized_email or normalized_email not in settings.admin_emails:
        return roles

    elevated_roles = ["admin"]
    for role in roles:
        if role != "admin":
            elevated_roles.append(role)
    return canonicalize_roles(elevated_roles)


def _decode_clerk_jwt(token: str) -> dict[str, Any]:
    signing_key = get_clerk_jwk_client().get_signing_key_from_jwt(token)

    issuer = (settings.CLERK_ISSUER_URL or "").rstrip("/") or None
    audience = settings.CLERK_AUDIENCE.strip() if settings.CLERK_AUDIENCE else None
    options = {"verify_aud": audience is not None}

    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        audience=audience,
        issuer=issuer,
        options=options,
        leeway=settings.CLERK_JWT_LEEWAY_SECONDS,
    )
    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Clerk token payload")
    return payload


def _extract_email_from_claims(claims: dict[str, Any]) -> str:
    direct = _first_non_empty_string(claims.get("email"), claims.get("email_address"))
    if direct:
        return direct

    addresses = claims.get("email_addresses")
    if isinstance(addresses, list):
        for candidate in addresses:
            if isinstance(candidate, dict):
                nested = _first_non_empty_string(candidate.get("email_address"), candidate.get("email"))
                if nested:
                    return nested

    return "unknown@example.local"


def _is_placeholder_email(email: str | None) -> bool:
    if not isinstance(email, str):
        return True
    normalized = email.strip().lower()
    if not normalized:
        return True
    return normalized == "unknown@example.local" or normalized.endswith("@clerk.local")


def _extract_display_name_from_claims(claims: dict[str, Any]) -> str | None:
    return _first_non_empty_string(
        claims.get("name"),
        claims.get("username"),
        " ".join(
            item
            for item in [claims.get("given_name"), claims.get("family_name")]
            if isinstance(item, str) and item.strip()
        ),
    )


def _normalize_github_login(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    return normalized or None


def _extract_github_login_from_claims(claims: dict[str, Any]) -> str | None:
    metadata_blocks: list[dict[str, Any]] = []
    for key in ("public_metadata", "publicMetadata", "unsafe_metadata", "unsafeMetadata", "metadata", "app_metadata", "appMetadata"):
        block = _extract_dict(claims, key)
        if isinstance(block, dict):
            metadata_blocks.append(block)

    candidates: list[Any] = [
        claims.get("username"),
        claims.get("github_login"),
        claims.get("githubUsername"),
        claims.get("preferred_username"),
        claims.get("nickname"),
    ]

    for block in metadata_blocks:
        candidates.extend(
            [
                block.get("github_login"),
                block.get("githubLogin"),
                block.get("github_username"),
                block.get("githubUsername"),
                block.get("username"),
            ]
        )

    external_accounts = claims.get("external_accounts") or claims.get("externalAccounts")
    if isinstance(external_accounts, list):
        for account in external_accounts:
            if not isinstance(account, dict):
                continue
            provider = _first_non_empty_string(
                account.get("provider"),
                account.get("provider_id"),
                account.get("providerId"),
                account.get("strategy"),
            )
            if not provider or "github" not in provider.lower():
                continue
            candidates.extend(
                [
                    account.get("username"),
                    account.get("login"),
                    account.get("preferred_username"),
                ]
            )

    for candidate in candidates:
        normalized = _normalize_github_login(candidate)
        if normalized:
            return normalized
    return None


async def _validate_and_decode_token(token: str) -> dict[str, Any]:
    """Validate and decode Clerk JWT token."""
    try:
        claims = await asyncio.to_thread(_decode_clerk_jwt, token)
    except InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Clerk token") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unable to validate Clerk token") from exc
    return claims


def _extract_user_info(claims: dict[str, Any]) -> tuple[str, str | None, str | None, str | None, str | None]:
    """Extract user and organization info from claims."""
    user_id = _first_non_empty_string(claims.get("sub"), claims.get("user_id"), claims.get("uid"))
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Clerk token missing subject")
    
    org_id, org_slug, org_name, org_role = _extract_org_context_from_claims(claims)
    return user_id, org_id, org_slug, org_name, org_role


def _determine_email(existing_user, claims: dict[str, Any], user_id: str) -> str:
    """Determine the email to use for the user."""
    email_from_claims = _extract_email_from_claims(claims)
    if _is_placeholder_email(email_from_claims):
        if existing_user is not None and not _is_placeholder_email(existing_user.email):
            email = existing_user.email.strip().lower()
        else:
            email = f"{user_id}@clerk.local"
    else:
        email = email_from_claims.strip().lower()
    return email


async def _sync_user_with_db(repo: RBACRepo, user_id: str, email: str, display_name: str | None, roles: list[str], org_id: str | None, org_name: str | None, org_slug: str | None, org_role: str | None) -> None:
    """Sync user and organization data with database."""
    primary_role = roles[0] if roles else "developer"
    await asyncio.to_thread(repo.upsert_clerk_user, user_id, email, display_name, primary_role)
    if org_id:
        await asyncio.to_thread(
            repo.upsert_organization_membership,
            user_id,
            org_id,
            org_name or org_id,
            org_slug,
            org_role,
        )


def _construct_principal_from_db_user(
    user,
    org_id: str | None,
    org_slug: str | None,
    org_name: str | None,
    org_role: str | None,
    fallback_user_id: str,
    fallback_email: str,
    fallback_display_name: str | None,
    fallback_roles: list[str],
    fallback_permissions: list[str],
    fallback_github_login: str | None = None,
) -> AuthenticatedPrincipal:
    """Construct principal from database user."""
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="RBAC user is inactive")

    raw_roles = [str(role) for role in (user.roles or [])]
    resolved_roles = canonicalize_roles(raw_roles or fallback_roles)
    use_role_fallback_permissions = not user.permissions or resolved_roles != raw_roles
    resolved_permissions = sorted(set(user.permissions or []))
    if use_role_fallback_permissions:
        resolved_permissions = sorted(set(resolved_permissions) | set(permissions_for_roles(resolved_roles)))
    elif fallback_permissions:
        resolved_permissions = sorted(set(resolved_permissions) | set(fallback_permissions))

    resolved_org_name = org_name
    if org_id and not resolved_org_name:
        membership = next(
            (item for item in user.organization_memberships if item.organization_id == org_id and item.status == "active"),
            None,
        )
        if membership is not None:
            resolved_org_name = membership.organization_name

    return AuthenticatedPrincipal(
        user_id=user.id,
        email=user.email or fallback_email,
        display_name=user.display_name or fallback_display_name,
        github_login=fallback_github_login,
        canonical_role=_select_canonical_role(resolved_roles),
        roles=resolved_roles,
        permissions=resolved_permissions,
        org_id=org_id,
        org_slug=org_slug,
        org_name=resolved_org_name,
        org_role=org_role,
    )


def _construct_principal_fallback(
    user_id: str,
    email: str,
    display_name: str | None,
    roles: list[str],
    permissions: list[str],
    org_id: str | None,
    org_slug: str | None,
    org_name: str | None,
    org_role: str | None,
    github_login: str | None = None,
) -> AuthenticatedPrincipal:
    """Construct principal when no DB user exists."""
    resolved_roles = canonicalize_roles(roles)
    resolved_permissions = sorted(set(permissions) | set(permissions_for_roles(resolved_roles)))
    return AuthenticatedPrincipal(
        user_id=user_id,
        email=email,
        display_name=display_name,
        github_login=github_login,
        canonical_role=_select_canonical_role(resolved_roles),
        roles=resolved_roles,
        permissions=resolved_permissions,
        org_id=org_id,
        org_slug=org_slug,
        org_name=org_name,
        org_role=org_role,
    )


async def _build_principal_from_clerk_token(token: str, repo: RBACRepo) -> AuthenticatedPrincipal:
    claims = await _validate_and_decode_token(token)
    user_id, org_id, org_slug, org_name, org_role = _extract_user_info(claims)
    github_login = _extract_github_login_from_claims(claims)
    
    # Check cache first to avoid DB calls on every request
    cached_principal = _get_cached_principal(user_id, org_id)
    if cached_principal is not None:
        return cached_principal

    existing_user = await asyncio.to_thread(repo.get_user, user_id)
    email = _determine_email(existing_user, claims, user_id)
    display_name = _extract_display_name_from_claims(claims)
    roles = canonicalize_roles(_extract_roles(claims))
    roles = _apply_admin_email_override(email, roles)

    await _sync_user_with_db(repo, user_id, email, display_name, roles, org_id, org_name, org_slug, org_role)

    user = await asyncio.to_thread(repo.get_user, user_id)
    if user is not None:
        principal = _construct_principal_from_db_user(
            user,
            org_id,
            org_slug,
            org_name,
            org_role,
            user_id,
            email,
            display_name,
            roles,
            [],
            github_login,
        )
        _cache_principal(user_id, org_id, principal)
        return principal

    permissions = permissions_for_roles(roles)
    principal = _construct_principal_fallback(
        user_id,
        email,
        display_name,
        roles,
        permissions,
        org_id,
        org_slug,
        org_name,
        org_role,
        github_login,
    )
    _cache_principal(user_id, org_id, principal)
    return principal


async def get_current_principal(
    authorization: HTTPAuthorizationCredentials | None = Security(_bearer_scheme),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    repo: RBACRepo = Depends(get_rbac_repo),
) -> AuthenticatedPrincipal | None:
    # Prefer bearer token when provided (tests expect bearer-first behavior)
    if authorization is not None:
        if authorization.scheme.lower() != "bearer":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unsupported authorization scheme")
        token = authorization.credentials.strip()
        if not token:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Empty bearer token")
        try:
            return await _build_principal_from_clerk_token(token, repo)
        except Exception as exc:
            # If auth enforcement is disabled, allow fallback to explicit
            # header-based auth only. A bad bearer token must not silently
            # become the local admin principal.
            if not _is_auth_enforced() and x_user_id:
                logger.debug("Bearer token validation failed; falling back to X-User-Id")
            else:
                if isinstance(exc, HTTPException):
                    raise
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unable to validate bearer token") from exc

    if not _is_auth_enforced() and not x_user_id:
        return _build_local_dev_principal()

    if not x_user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication credentials")

    user = await asyncio.to_thread(repo.get_user, x_user_id.strip())
    if user is None:
        # When auth is not enforced, tolerate unknown users (e.g. first request
        # before /auth/sync has been called) instead of blocking the call.
        if not _is_auth_enforced():
            return _build_local_dev_principal(x_user_id)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="RBAC user is missing or inactive")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="RBAC user is inactive")

    raw_roles = [str(role) for role in (user.roles or [])]
    resolved_roles = canonicalize_roles(raw_roles)
    use_role_fallback_permissions = not user.permissions or resolved_roles != raw_roles
    resolved_permissions = sorted(set(user.permissions or []))
    if use_role_fallback_permissions:
        resolved_permissions = sorted(set(resolved_permissions) | set(permissions_for_roles(resolved_roles)))

    return AuthenticatedPrincipal(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        github_login=None,
        canonical_role=_select_canonical_role(resolved_roles),
        roles=resolved_roles,
        permissions=resolved_permissions,
        org_id=None,
        org_slug=None,
        org_name=None,
        org_role=None,
    )


def get_user_team_role(user_id: str, project_id: str, repo: RBACRepo) -> str | None:
    """
    Get user's role from team membership for a specific project.
    
    Role resolution order (highest priority first):
    1. Team member role (project-scoped)
    2. Organization member role  
    3. User platform role
    
    Returns None if user has no access to the project.
    """
    from sqlalchemy import text
    from app.data.database import get_engine
    
    engine = get_engine()
    
    try:
        with engine.connect() as conn:
            # Get user's team role for this project
            result = conn.execute(
                text("""
                    SELECT tm.role, tm.permissions
                    FROM team_members tm
                    JOIN teams t ON t.id = tm.team_id
                    WHERE t.project_id = :project_id
                    AND tm.user_id = :user_id
                    LIMIT 1
                """),
                {"project_id": project_id, "user_id": user_id}
            ).first()
            
            if result:
                logger.debug(f"User {user_id} has team role '{result.role}' for project {project_id}")
                return result.role
            
            # Check if user has org-level access to this project's organization
            org_result = conn.execute(
                text("""
                    SELECT om.role
                    FROM organization_memberships om
                    JOIN project_profiles pp ON pp.org_id = om.organization_id
                    WHERE pp.id = :project_id
                    AND om.user_id = :user_id
                    AND om.status = 'active'
                    LIMIT 1
                """),
                {"project_id": project_id, "user_id": user_id}
            ).first()
            
            if org_result:
                # Map org role to project role
                org_role = org_result.role
                if org_role in ('owner', 'admin'):
                    logger.debug(f"User {user_id} has org role '{org_role}', granting admin access to project {project_id}")
                    return "admin"
                else:
                    logger.debug(f"User {user_id} has org role '{org_role}', granting developer access to project {project_id}")
                    return "developer"
            
            logger.debug(f"User {user_id} has no team or org role for project {project_id}")
            return None
    except Exception as exc:
        logger.warning(f"Failed to get team role for user {user_id} and project {project_id}: {exc}")
        return None


def enrich_principal_with_project_role(
    principal: AuthenticatedPrincipal,
    project_id: str | None,
    repo: RBACRepo
) -> AuthenticatedPrincipal:
    """
    Enrich principal with project-specific role if project_id is provided.
    
    This updates the principal's roles and permissions based on their team membership.
    Platform admin role always overrides project-level roles.
    """
    if not project_id:
        return principal
    
    # Platform admins always keep their admin role
    if "admin" in principal.roles:
        return principal
    
    # Get project-specific role from team membership
    team_role = get_user_team_role(principal.user_id, project_id, repo)
    
    if team_role:
        # Update principal with project-specific role
        normalized_role = normalize_role_code(team_role)
        new_roles = [normalized_role] if normalized_role else principal.roles
        new_permissions = permissions_for_roles(new_roles)
        
        return AuthenticatedPrincipal(
            user_id=principal.user_id,
            email=principal.email,
            display_name=principal.display_name,
            github_login=principal.github_login,
            canonical_role=_select_canonical_role(new_roles),
            roles=new_roles,
            permissions=new_permissions,
            org_id=principal.org_id,
            org_slug=principal.org_slug,
            org_name=principal.org_name,
            org_role=principal.org_role,
        )
    
    # User has no access to this project
    return principal


def require_auth(principal: AuthenticatedPrincipal | None = Depends(get_current_principal)) -> AuthenticatedPrincipal | None:
    """Require authentication — return principal if authenticated, None if auth not enforced."""
    if not _is_auth_enforced():
        return principal

    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return principal


def principal_has_role(principal: AuthenticatedPrincipal | None, *required_roles: str) -> bool:
    if principal is None:
        return False

    normalized_required = {normalize_role_code(role) for role in required_roles}
    if not normalized_required:
        return True

    principal_roles = set(canonicalize_roles(principal.roles))
    principal_roles.add(normalize_role_code(principal.role))
    return bool(principal_roles & normalized_required)


def require_role(*required_roles: str):
    async def dependency(principal: AuthenticatedPrincipal | None = Depends(get_current_principal)) -> AuthenticatedPrincipal | None:
        if not _is_auth_enforced():
            return principal

        if principal is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication credentials")

        if not principal_has_role(principal, *required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required role: {', '.join(canonicalize_roles(list(required_roles)))}",
            )
        return principal

    return dependency


def require_permission(permission_code: str):
    async def dependency(principal: AuthenticatedPrincipal | None = Depends(get_current_principal)) -> AuthenticatedPrincipal | None:
        if not _is_auth_enforced():
            return principal

        if principal is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authentication credentials")

        if settings.CLERK_ORGANIZATIONS_ENFORCED and not principal.org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization context is required for this action",
            )

        if permission_code not in principal.permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permission: {permission_code}",
            )
        return principal

    return dependency


def enforce_permission(principal: AuthenticatedPrincipal | None, permission_code: str) -> None:
    """Inline permission check — use when you already have the principal instance."""
    if not _is_auth_enforced():
        return
    if principal is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    if permission_code not in (principal.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing required permission: {permission_code}",
        )

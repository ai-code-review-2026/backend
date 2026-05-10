from __future__ import annotations

import asyncio

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.api.middleware import auth as auth_middleware
from app.data.models.rbac import RBACUser


def test_extract_roles_defaults_to_developer() -> None:
    assert auth_middleware._extract_roles({}) == ["developer"]


def test_extract_roles_normalizes_aliases() -> None:
    claims = {
        "metadata": {"role": "reviewer"},
        "roles": ["dev", "admin", "org:owner"],
    }

    roles = auth_middleware._extract_roles(claims)
    assert "reviewer" in roles
    assert "developer" in roles
    assert "admin" in roles


def test_permissions_for_roles_union() -> None:
    permissions = auth_middleware._permissions_for_roles(["developer", "reviewer"])
    assert permissions == ["analyses.create", "analyses.read", "analyses.write"]


def test_apply_admin_email_override_promotes_admin(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_middleware.settings, "ADMIN_EMAILS", "bejaouiahmed053@gmail.com")
    roles = auth_middleware._apply_admin_email_override("BejaouIAhmed053@gmail.com", ["developer"])
    assert roles[0] == "admin"
    assert "developer" in roles


def test_extract_org_context_from_claims() -> None:
    claims = {
        "org_id": "org_123",
        "org_slug": "acme",
        "org_name": "Acme Inc",
        "org_role": "org:admin",
    }

    org_id, org_slug, org_name, org_role = auth_middleware._extract_org_context_from_claims(claims)

    assert org_id == "org_123"
    assert org_slug == "acme"
    assert org_name == "Acme Inc"
    assert org_role == "admin"


def test_require_permission_rejects_missing_permission_when_auth_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_middleware.settings, "RBAC_ENFORCEMENT_ENABLED", False)
    monkeypatch.setattr(auth_middleware.settings, "CLERK_AUTH_ENABLED", True)

    principal = auth_middleware.AuthenticatedPrincipal(
        user_id="user_123",
        email="dev@example.com",
        roles=["developer"],
        permissions=["analyses.read"],
    )

    dependency = auth_middleware.require_permission("analyses.write")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(dependency(principal=principal))

    assert exc_info.value.status_code == 403


def test_require_permission_is_noop_when_auth_not_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_middleware.settings, "RBAC_ENFORCEMENT_ENABLED", False)
    monkeypatch.setattr(auth_middleware.settings, "CLERK_AUTH_ENABLED", False)

    dependency = auth_middleware.require_permission("analyses.read")
    result = asyncio.run(dependency(principal=None))
    assert result is None


def test_get_current_principal_uses_bearer_even_if_clerk_flag_is_false(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_middleware.settings, "CLERK_AUTH_ENABLED", False)
    monkeypatch.setattr(auth_middleware.settings, "RBAC_ENFORCEMENT_ENABLED", False)

    expected_principal = auth_middleware.AuthenticatedPrincipal(
        user_id="user_bearer_1",
        email="bearer@example.com",
        display_name="Bearer User",
        roles=["developer"],
        permissions=["analyses.read", "analyses.create"],
    )

    async def _fake_build(token: str, repo: object) -> auth_middleware.AuthenticatedPrincipal:  # noqa: ARG001
        assert token == "token_abc"
        return expected_principal

    monkeypatch.setattr(auth_middleware, "_build_principal_from_clerk_token", _fake_build)

    principal = asyncio.run(
        auth_middleware.get_current_principal(
            authorization=HTTPAuthorizationCredentials(scheme="Bearer", credentials="token_abc"),
            x_user_id=None,
            repo=object(),  # type: ignore[arg-type]
        )
    )

    assert principal == expected_principal


def test_build_principal_from_clerk_token_upserts_local_user(monkeypatch: pytest.MonkeyPatch) -> None:
    claims = {
        "sub": "user_test_123",
        "email": "new.user@example.com",
        "name": "New User",
        "role": "reviewer",
    }

    class _Repo:
        def __init__(self) -> None:
            self.upsert_calls: list[tuple[str, str, str | None, str]] = []

        def upsert_clerk_user(self, user_id: str, email: str, display_name: str | None, clerk_role: str) -> None:
            self.upsert_calls.append((user_id, email, display_name, clerk_role))

        def get_user(self, user_id: str) -> RBACUser | None:
            assert user_id == "user_test_123"
            return RBACUser(
                id=user_id,
                email="new.user@example.com",
                display_name="New User",
                is_active=True,
                roles=["reviewer"],
                permissions=["analyses.read", "analyses.create", "analyses.write"],
            )

    repo = _Repo()

    monkeypatch.setattr(auth_middleware, "_decode_clerk_jwt", lambda token: claims)

    principal = asyncio.run(auth_middleware._build_principal_from_clerk_token("token", repo))  # type: ignore[arg-type]

    assert repo.upsert_calls == [("user_test_123", "new.user@example.com", "New User", "reviewer")]
    assert principal.user_id == "user_test_123"
    assert principal.roles == ["reviewer"]

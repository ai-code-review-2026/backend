from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RBACOrganizationMembership:
    organization_id: str
    organization_name: str
    organization_slug: str | None
    role: str
    status: str


@dataclass(frozen=True)
class RBACUser:
    id: str
    email: str
    display_name: str | None
    is_active: bool
    roles: list[str] = field(default_factory=list)
    permissions: list[str] = field(default_factory=list)
    organization_memberships: list[RBACOrganizationMembership] = field(default_factory=list)

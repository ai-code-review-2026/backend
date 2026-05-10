from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class RepoProfile:
    repo_id: str
    repo_path: str | None
    indexed_commit: str | None
    default_branch: str | None
    profile: dict[str, Any] = field(default_factory=dict)
    overview_context: str | None = None
    updated_at: str | None = None

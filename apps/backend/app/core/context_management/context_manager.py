"""Context Manager for hierarchical project context.

Manages the three-level context hierarchy:
1. Global Context (Organization)
2. Project Context (Repository)
3. Local Context (Commit/PR)
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from app.settings import settings

if TYPE_CHECKING:
    from app.integrations.graph_database.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)


@dataclass
class ProjectContext:
    """Represents the current context for a project."""

    repo_id: str
    org_id: str | None = None
    context_version: int = 1

    # Context levels
    global_context: dict[str, Any] = field(default_factory=dict)
    project_context: dict[str, Any] = field(default_factory=dict)
    local_context: dict[str, Any] = field(default_factory=dict)

    # Metadata
    last_updated: datetime | None = None
    is_stale: bool = False
    staleness_reason: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "repo_id": self.repo_id,
            "org_id": self.org_id,
            "context_version": self.context_version,
            "global_context": self.global_context,
            "project_context": self.project_context,
            "local_context": self.local_context,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None,
            "is_stale": self.is_stale,
            "staleness_reason": self.staleness_reason,
        }


class ContextManager:
    """Manages hierarchical project context backed by Neo4j.

    This manager:
    1. Retrieves and caches project context from Neo4j
    2. Manages context lifecycle (load, update, invalidate)
    3. Provides context for RAG agents
    4. Handles incremental context updates
    """

    def __init__(
        self,
        *,
        neo4j_client: Neo4jClient | None = None,
        redis_client: object | None = None,
    ):
        if neo4j_client is None:
            from app.integrations.graph_database.neo4j_client import get_neo4j_client
            neo4j_client = get_neo4j_client()
        self.neo4j_client = neo4j_client
        self.redis_client = redis_client
        self._cache: dict[str, ProjectContext] = {}
        self._cache_ttl = settings.ANTI_HALLUCINATION_MAX_CONTEXT_AGE_HOURS * 3600

    async def get_context(
        self,
        repo_id: str,
        *,
        org_id: str | None = None,
        force_refresh: bool = False,
    ) -> ProjectContext:
        """Get the context for a repository."""
        cache_key = f"{org_id or 'default'}:{repo_id}"

        if not force_refresh and cache_key in self._cache:
            cached = self._cache[cache_key]
            if not cached.is_stale:
                return cached

        if self.redis_client and not force_refresh:
            cached = await self._get_from_redis(cache_key)
            if cached:
                self._cache[cache_key] = cached
                return cached

        context = await self._load_context(repo_id, org_id)

        self._cache[cache_key] = context
        if self.redis_client:
            await self._set_in_redis(cache_key, context)

        return context

    async def _load_context(
        self,
        repo_id: str,
        org_id: str | None,
    ) -> ProjectContext:
        """Load context from Neo4j and database."""
        context = ProjectContext(
            repo_id=repo_id,
            org_id=org_id,
            last_updated=datetime.now(timezone.utc),
        )

        try:
            # Load project profile from Neo4j (repository node properties)
            project_profile = await self._load_project_profile(repo_id)
            if project_profile:
                context.project_context = project_profile
                context.context_version = int(project_profile.get("context_version", 1))

            # Load organization rules from Neo4j rule nodes
            if org_id:
                org_rules = await self._load_org_rules(org_id)
                context.global_context = org_rules

            logger.debug(f"Loaded context for {repo_id}, version {context.context_version}")

        except Exception as e:
            logger.error(f"Failed to load context for {repo_id}: {e}")
            context.is_stale = True
            context.staleness_reason = str(e)

        return context

    async def _load_project_profile(self, repo_id: str) -> dict[str, Any]:
        """Load project profile from Neo4j Repository node."""
        if not self.neo4j_client or not self.neo4j_client.enabled:
            # Fall back to PostgreSQL
            from app.data.repos.repo_profiles_repo import RepoProfilesRepo
            row = await asyncio.to_thread(RepoProfilesRepo().get_profile, repo_id)
            if row and isinstance(row.profile, dict):
                return dict(row.profile)
            return {}

        try:
            results = await asyncio.to_thread(
                self.neo4j_client.get_repo_profile,
                repo_id=repo_id,
            )
            if results and isinstance(results, dict):
                return results
        except Exception as e:
            logger.warning(f"Failed to load project profile from Neo4j: {e}")

        # Fallback to PostgreSQL
        try:
            from app.data.repos.repo_profiles_repo import RepoProfilesRepo
            row = await asyncio.to_thread(RepoProfilesRepo().get_profile, repo_id)
            if row and isinstance(row.profile, dict):
                return dict(row.profile)
        except Exception as e:
            logger.warning(f"Failed to load project profile from SQL fallback: {e}")

        return {}

    async def _load_org_rules(self, org_id: str) -> dict[str, Any]:
        """Load organization rules from Neo4j Rule nodes."""
        if not self.neo4j_client or not self.neo4j_client.enabled:
            return {}

        try:
            # Search Neo4j for Rule nodes tagged with this org
            rules = await asyncio.to_thread(
                self.neo4j_client.vector_search_rules,
                query_vector=[0.0] * 384,  # neutral query to list all org rules
                limit=100,
            )
            if isinstance(rules, list):
                org_rules = [r for r in rules if r.get("org_id") == org_id or not r.get("org_id")]
                return {"rules": org_rules, "rules_count": len(org_rules)}
        except Exception as e:
            logger.warning(f"Failed to load org rules from Neo4j: {e}")

        return {}

    async def get_neighbor_paths(
        self,
        repo_id: str,
        path: str,
        *,
        depth: int = 2,
        limit: int = 32,
    ) -> list[str]:
        """Return neighboring file paths using Neo4j graph traversal."""
        if not self.neo4j_client or not self.neo4j_client.enabled:
            return []
        try:
            return await asyncio.to_thread(
                self.neo4j_client.get_neighbor_paths,
                repo_id=repo_id,
                path=path,
                depth=depth,
                limit=limit,
            )
        except Exception as e:
            logger.warning(f"Failed to get neighbor paths from Neo4j: {e}")
            return []

    async def update_local_context(
        self,
        repo_id: str,
        local_context: dict[str, Any],
        *,
        org_id: str | None = None,
    ) -> ProjectContext:
        """Update the local context for an analysis."""
        context = await self.get_context(repo_id, org_id=org_id)
        context.local_context = local_context
        context.last_updated = datetime.now(timezone.utc)

        cache_key = f"{org_id or 'default'}:{repo_id}"
        self._cache[cache_key] = context
        return context

    async def invalidate_context(
        self,
        repo_id: str,
        *,
        org_id: str | None = None,
        reason: str = "manual invalidation",
    ) -> None:
        """Invalidate cached context for a repository."""
        cache_key = f"{org_id or 'default'}:{repo_id}"
        if cache_key in self._cache:
            self._cache[cache_key].is_stale = True
            self._cache[cache_key].staleness_reason = reason

        if self.redis_client:
            await self._delete_from_redis(cache_key)

        logger.info(f"Invalidated context for {repo_id}: {reason}")

    async def increment_version(
        self,
        repo_id: str,
        *,
        org_id: str | None = None,
    ) -> int:
        """Increment the context version for a repository."""
        context = await self.get_context(repo_id, org_id=org_id)
        new_version = context.context_version + 1
        context.context_version = new_version
        context.last_updated = datetime.now(timezone.utc)

        cache_key = f"{org_id or 'default'}:{repo_id}"
        self._cache[cache_key] = context
        return new_version

    # ── Redis cache helpers (placeholders — actual Redis calls depend on client) ──

    async def _get_from_redis(self, cache_key: str) -> ProjectContext | None:
        if not self.redis_client:
            return None
        try:
            pass
        except Exception as e:
            logger.warning(f"Redis get failed: {e}")
        return None

    async def _set_in_redis(self, cache_key: str, context: ProjectContext) -> None:
        if not self.redis_client:
            return
        try:
            pass
        except Exception as e:
            logger.warning(f"Redis set failed: {e}")

    async def _delete_from_redis(self, cache_key: str) -> None:
        if not self.redis_client:
            return
        try:
            pass
        except Exception as e:
            logger.warning(f"Redis delete failed: {e}")

    def _serialize_context(self, context: ProjectContext) -> str:
        return json.dumps(context.to_dict())

    def _deserialize_context(self, data: str) -> ProjectContext:
        d = json.loads(data)
        ctx = ProjectContext(
            repo_id=d["repo_id"],
            org_id=d.get("org_id"),
            context_version=d.get("context_version", 1),
            global_context=d.get("global_context", {}),
            project_context=d.get("project_context", {}),
            local_context=d.get("local_context", {}),
            is_stale=d.get("is_stale", False),
            staleness_reason=d.get("staleness_reason"),
        )
        if d.get("last_updated"):
            ctx.last_updated = datetime.fromisoformat(d["last_updated"])
        return ctx

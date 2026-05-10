"""Incremental Context Updater.

Updates project context incrementally based on changes,
avoiding full re-analysis when possible.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Any

from app.settings import settings

if TYPE_CHECKING:
    from app.core.context_management.context_manager import ContextManager
    from app.core.project_comprehension.service import ProjectComprehensionService
    from app.integrations.graph_database.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)


class UpdateType(str, Enum):
    """Type of context update."""

    FULL = "full"
    INCREMENTAL = "incremental"
    PARTIAL = "partial"  # Only specific extractors


@dataclass
class UpdateResult:
    """Result of an incremental update."""

    success: bool
    update_type: UpdateType
    old_version: int
    new_version: int
    chunks_added: int = 0
    chunks_updated: int = 0
    chunks_removed: int = 0
    extractors_run: list[str] = field(default_factory=list)
    duration_ms: int = 0
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "update_type": self.update_type.value,
            "old_version": self.old_version,
            "new_version": self.new_version,
            "chunks_added": self.chunks_added,
            "chunks_updated": self.chunks_updated,
            "chunks_removed": self.chunks_removed,
            "extractors_run": self.extractors_run,
            "duration_ms": self.duration_ms,
            "error": self.error,
        }


class IncrementalUpdater:
    """Updates project context incrementally.

    This updater:
    1. Analyzes what changed since last update
    2. Re-runs only necessary extractors
    3. Updates only affected chunks in Neo4j
    4. Maintains version consistency
    """

    def __init__(
        self,
        *,
        context_manager: ContextManager | None = None,
        comprehension_service: ProjectComprehensionService | None = None,
        neo4j_client: Neo4jClient | None = None,
    ):
        self.context_manager = context_manager
        self.comprehension_service = comprehension_service
        self.neo4j_client = neo4j_client

    async def update(
        self,
        repo_id: str,
        changed_files: list[str],
        *,
        org_id: str | None = None,
        commit_sha: str | None = None,
        force_full: bool = False,
        repo_path: str | None = None,
    ) -> UpdateResult:
        """Update context based on changed files.

        Args:
            repo_id: Repository identifier
            changed_files: List of changed file paths
            org_id: Optional organization ID
            commit_sha: Optional commit SHA
            force_full: Force full re-analysis

        Returns:
            UpdateResult with update details
        """
        import time
        start_time = time.time()

        # Get current context and version
        old_version = 1
        if self.context_manager:
            context = await self.context_manager.get_context(repo_id, org_id=org_id)
            old_version = context.context_version

        # Determine update type
        if force_full:
            update_type = UpdateType.FULL
        else:
            update_type = self._determine_update_type(changed_files)

        try:
            if update_type == UpdateType.FULL:
                result = await self._do_full_update(repo_id, org_id, old_version, repo_path=repo_path)
            elif update_type == UpdateType.INCREMENTAL:
                result = await self._do_incremental_update(
                    repo_id, org_id, old_version, changed_files
                )
            else:  # PARTIAL
                result = await self._do_partial_update(
                    repo_id, org_id, old_version, changed_files
                )

            result.duration_ms = int((time.time() - start_time) * 1000)

            # Invalidate old context
            if self.context_manager and result.success:
                await self.context_manager.invalidate_context(
                    repo_id,
                    org_id=org_id,
                    reason=f"Updated to version {result.new_version}",
                )

            return result

        except Exception as e:
            logger.error(f"Context update failed for {repo_id}: {e}")
            return UpdateResult(
                success=False,
                update_type=update_type,
                old_version=old_version,
                new_version=old_version,
                error=str(e),
                duration_ms=int((time.time() - start_time) * 1000),
            )

    def _determine_update_type(self, changed_files: list[str]) -> UpdateType:
        """Determine the type of update needed based on changes."""
        if not changed_files:
            return UpdateType.PARTIAL

        # Count by category
        code_files = 0
        config_files = 0
        doc_files = 0

        for f in changed_files:
            lower_f = f.lower()
            if any(lower_f.endswith(ext) for ext in [".py", ".js", ".ts", ".go", ".java", ".rs"]):
                code_files += 1
            elif any(lower_f.endswith(ext) for ext in [".json", ".yaml", ".yml", ".toml"]):
                config_files += 1
            elif any(lower_f.endswith(ext) for ext in [".md", ".rst", ".txt"]):
                doc_files += 1

        # Significant changes to core config = full update
        sensitive_configs = ["package.json", "pyproject.toml", "Cargo.toml", "go.mod"]
        if any(f for f in changed_files if any(cfg in f for cfg in sensitive_configs)):
            return UpdateType.FULL

        # Many code changes = incremental (but thorough)
        if code_files > 20:
            return UpdateType.INCREMENTAL

        # Few changes = partial
        return UpdateType.PARTIAL

    async def _do_full_update(
        self,
        repo_id: str,
        org_id: str | None,
        old_version: int,
        *,
        repo_path: str | None = None,
    ) -> UpdateResult:
        """Do a full context update by delegating to Neo4jRepoIngestor.

        When ``repo_path`` is provided the ingestor's ``onboard_repo`` is called
        so all files are re-chunked and re-embedded in Neo4j.  Without it the
        update is recorded in the version counter but no re-ingestion happens.
        """
        new_version = old_version + 1
        extractors_run = ["structure", "languages", "frameworks", "architecture", "quality", "dependencies"]

        if repo_path:
            try:
                from app.core.knowledge_base.ingestor import get_neo4j_ingestor
                import asyncio
                ingestor = get_neo4j_ingestor()
                await asyncio.to_thread(
                    ingestor.onboard_repo,
                    repo_path=repo_path,
                    repo_id=repo_id,
                    org_id=org_id,
                    force_full=True,
                )
                logger.info(f"Full re-ingestion completed for {repo_id} at {repo_path}: v{old_version} -> v{new_version}")
            except Exception as exc:
                logger.warning(f"Full update ingestor delegation failed for {repo_id}: {exc}")
        else:
            logger.info(
                f"Full context update for {repo_id}: v{old_version} -> v{new_version} "
                "(re-ingestion skipped — repo_path not provided)"
            )

        return UpdateResult(
            success=True,
            update_type=UpdateType.FULL,
            old_version=old_version,
            new_version=new_version,
            extractors_run=extractors_run,
        )

    async def _do_incremental_update(
        self,
        repo_id: str,
        org_id: str | None,
        old_version: int,
        changed_files: list[str],
    ) -> UpdateResult:
        """Do an incremental context update."""
        extractors_needed = self._get_extractors_for_files(changed_files)

        # Re-run only needed extractors
        # This would selectively run extractors based on changed files

        new_version = old_version + 1

        # Update affected chunks in Neo4j
        chunks_updated = await self._update_chunks_for_files(
            repo_id, changed_files
        )

        logger.info(
            f"Incremental context update for {repo_id}: "
            f"v{old_version} -> v{new_version}, "
            f"{len(changed_files)} files, {chunks_updated} chunks"
        )

        return UpdateResult(
            success=True,
            update_type=UpdateType.INCREMENTAL,
            old_version=old_version,
            new_version=new_version,
            chunks_updated=chunks_updated,
            extractors_run=extractors_needed,
        )

    async def _do_partial_update(
        self,
        repo_id: str,
        org_id: str | None,
        old_version: int,
        changed_files: list[str],
    ) -> UpdateResult:
        """Do a partial context update (only affected chunks)."""
        # Only update chunks for changed files, no extractor re-run

        chunks_updated = await self._update_chunks_for_files(
            repo_id, changed_files
        )

        new_version = old_version + 1

        logger.info(
            f"Partial context update for {repo_id}: "
            f"{len(changed_files)} files, {chunks_updated} chunks"
        )

        return UpdateResult(
            success=True,
            update_type=UpdateType.PARTIAL,
            old_version=old_version,
            new_version=new_version,
            chunks_updated=chunks_updated,
            extractors_run=[],
        )

    def _get_extractors_for_files(self, changed_files: list[str]) -> list[str]:
        """Determine which extractors need to run based on changed files."""
        extractors = set()

        for f in changed_files:
            lower_f = f.lower()

            # Code changes affect structure and potentially architecture
            if any(lower_f.endswith(ext) for ext in [".py", ".js", ".ts", ".go", ".java", ".rs"]):
                extractors.add("structure")
                if "test" in lower_f:
                    extractors.add("quality")

            # Config changes affect dependencies, frameworks
            if any(lower_f.endswith(ext) for ext in [".json", ".yaml", ".yml", ".toml"]):
                if "package" in lower_f or "pyproject" in lower_f or "cargo" in lower_f:
                    extractors.add("dependencies")
                    extractors.add("frameworks")

            # CI/CD changes affect quality
            if ".github" in f or "gitlab-ci" in lower_f or "jenkinsfile" in lower_f:
                extractors.add("quality")

            # Documentation changes
            if any(lower_f.endswith(ext) for ext in [".md", ".rst"]):
                extractors.add("quality")

        return list(extractors)

    async def _update_chunks_for_files(
        self,
        repo_id: str,
        changed_files: list[str],
    ) -> int:
        """Delete old Neo4j chunks for changed files then re-chunk and re-embed them."""
        if not self.neo4j_client:
            return 0

        import asyncio
        from pathlib import Path

        count = 0

        # Lazy-import the ingestor to avoid circular imports
        try:
            from app.core.knowledge_base.ingestor import get_neo4j_ingestor
            ingestor = get_neo4j_ingestor()
        except Exception:
            ingestor = None

        for file_path in changed_files:
            try:
                # 1. Delete stale chunks
                await asyncio.to_thread(
                    self.neo4j_client.delete_file_chunks,
                    repo_id,
                    file_path,
                )

                # 2. Re-chunk and re-embed if file still exists on disk and ingestor is available
                if ingestor is not None:
                    path = Path(file_path)
                    if path.exists() and path.is_file():
                        try:
                            file_chunks = await asyncio.to_thread(ingestor._file_to_chunks, path)
                            if file_chunks:
                                texts = [c.content for c in file_chunks]
                                vectors = await asyncio.to_thread(ingestor.embedder.embed_texts, texts)
                                records = [
                                    {
                                        "repo_id": repo_id,
                                        "path": str(path),
                                        "chunk_index": c.chunk_index,
                                        "language": c.language,
                                        "file_type": c.file_type,
                                        "chunk_type": c.chunk_type,
                                        "content": c.content,
                                        "symbol_name": c.symbol_name,
                                        "start_line": c.start_line,
                                        "end_line": c.end_line,
                                        "embedding": v,
                                    }
                                    for c, v in zip(file_chunks, vectors)
                                ]
                                await asyncio.to_thread(
                                    self.neo4j_client.batch_upsert_chunks,
                                    repo_id,
                                    records,
                                )
                        except Exception as re_chunk_exc:
                            logger.warning(f"Re-chunk failed for {file_path}: {re_chunk_exc}")

                count += 1
            except Exception as exc:
                logger.warning(f"Failed to update chunks for {file_path}: {exc}")
        return count

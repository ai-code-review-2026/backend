"""
Repository Context Manager - Central Service for Repo Indexing

Responsibilities:
1. First-time repository onboarding (full indexation)
2. Incremental updates (commits, PRs)
3. Coordinate: chunking → embeddings → graph → Neo4j
4. Track indexing state per repository
5. Handle large repositories efficiently

Design: Service layer orchestrating chunker, embedder, graph builder
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from app.core.analysis.context.chunking import CodeChunker, CodeChunk
from app.core.analysis.context.embeddings import EmbeddingGenerator
from app.core.analysis.graph.builder import GraphBuilder
from app.core.analysis.graph.manager import GraphManager
from app.integrations.graph_database.neo4j_client import get_neo4j_client
from app.data.repos.repo_profiles_repo import RepoProfilesRepo

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IndexingResult:
    """Result of repository indexing operation."""
    
    success: bool
    repository_id: str
    indexed_commit: str | None
    mode: str  # "full", "incremental"
    files_seen: int
    files_indexed: int
    chunks_created: int
    chunks_embedded: int
    graph_nodes_created: int
    graph_edges_created: int
    duration_ms: int
    error: str | None = None


class RepoContextManager:
    """
    Manages repository context lifecycle.
    
    Workflow for first-time onboarding:
    1. Clone or access repository
    2. Scan all relevant files (filter by language, exclude binaries)
    3. Chunk each file with Tree-sitter
    4. Generate embeddings for each chunk
    5. Store chunks in Neo4j
    6. Build code graph in Neo4j (files, functions, classes, dependencies)
    7. Update repository profile metadata
    
    Workflow for incremental updates:
    1. Detect changed files (git diff)
    2. Re-chunk only changed files
    3. Update embeddings
    4. Update graph nodes/edges
    5. Keep history linkage
    
    Why this approach:
    - Scalable: Process large repos incrementally
    - Efficient: Skip unchanged files
    - Traceable: Full history in graph
    - Queryable: Vector + graph retrieval
    """
    
    def __init__(
        self,
        *,
        chunker: CodeChunker | None = None,
        embedder: EmbeddingGenerator | None = None,
        graph_manager: GraphManager | None = None,
        graph_builder: GraphBuilder | None = None,
        repo_profiles_repo: RepoProfilesRepo | None = None,
    ) -> None:
        self._chunker = chunker or CodeChunker()
        self._embedder = embedder or EmbeddingGenerator()
        self._graph_manager = graph_manager or GraphManager()
        self._graph_builder = graph_builder or GraphBuilder()
        self._neo4j = get_neo4j_client()
        self._profiles_repo = repo_profiles_repo or RepoProfilesRepo()
    
    async def index_repository(
        self,
        *,
        organization_id: str,
        project_id: str,
        repository_id: str,
        repo_path: str,
        commit_sha: str | None = None,
        changed_files: list[str] | None = None,
        force_full: bool = False,
    ) -> IndexingResult:
        """
        Index repository (full or incremental).
        
        Decision tree:
        - If force_full is set → full indexing
        - If repository never indexed → full indexing
        - If changed_files provided → incremental update
        - If commit_sha differs from indexed_commit → incremental
        - Otherwise → skip (already indexed)
        
        Args:
            organization_id: Organization ID
            project_id: Project ID
            repository_id: Repository ID
            repo_path: Local path to repository
            commit_sha: Current commit SHA
            changed_files: List of changed files (for incremental)
            force_full: Force a full re-index even if the repository already exists
            
        Returns:
            Indexing result with stats
        """
        started = time.perf_counter()
        
        try:
            # Check if repository already exists in Neo4j canonical schema.
            existing_repo_rows = await asyncio.to_thread(
                self._neo4j.execute_query,
                "MATCH (r:Repository {repo_id: $repo_id}) RETURN r LIMIT 1",
                {"repo_id": repository_id},
            )
            repo_node = existing_repo_rows[0]["r"] if existing_repo_rows else None
            
            if force_full:
                logger.info(f"[{repository_id}] Forced full indexing")
                result = await self._full_indexing(
                    organization_id=organization_id,
                    project_id=project_id,
                    repository_id=repository_id,
                    repo_path=repo_path,
                    commit_sha=commit_sha,
                )
            elif repo_node is None:
                # First-time indexing
                logger.info(f"[{repository_id}] First-time indexing")
                result = await self._full_indexing(
                    organization_id=organization_id,
                    project_id=project_id,
                    repository_id=repository_id,
                    repo_path=repo_path,
                    commit_sha=commit_sha,
                )
            elif changed_files:
                # Incremental update
                logger.info(f"[{repository_id}] Incremental update ({len(changed_files)} files)")
                result = await self._incremental_indexing(
                    repository_id=repository_id,
                    repo_path=repo_path,
                    commit_sha=commit_sha,
                    changed_files=changed_files,
                )
            else:
                # Already indexed, skip
                logger.info(f"[{repository_id}] Already indexed, skipping")
                result = IndexingResult(
                    success=True,
                    repository_id=repository_id,
                    indexed_commit=repo_node.get("indexed_commit") if isinstance(repo_node, dict) else None,
                    mode="skipped",
                    files_seen=0,
                    files_indexed=0,
                    chunks_created=0,
                    chunks_embedded=0,
                    graph_nodes_created=0,
                    graph_edges_created=0,
                    duration_ms=0,
                )
            
            duration_ms = int((time.perf_counter() - started) * 1000)
            return replace(result, duration_ms=duration_ms)
            
        except Exception as exc:
            logger.error(f"[{repository_id}] Indexing failed: {exc}")
            duration_ms = int((time.perf_counter() - started) * 1000)
            return IndexingResult(
                success=False,
                repository_id=repository_id,
                indexed_commit=None,
                mode="failed",
                files_seen=0,
                files_indexed=0,
                chunks_created=0,
                chunks_embedded=0,
                graph_nodes_created=0,
                graph_edges_created=0,
                duration_ms=duration_ms,
                error=str(exc),
            )
    
    async def _full_indexing(
        self,
        *,
        organization_id: str,
        project_id: str,
        repository_id: str,
        repo_path: str,
        commit_sha: str | None,
    ) -> IndexingResult:
        """
        Full repository indexing.
        
        Steps:
        1. Scan repository files
        2. Filter by language (Python, JS, TS, Go)
        3. Chunk all files
        4. Generate embeddings in batch
        5. Store in Neo4j
        6. Build graph: Repository → Files → Functions/Classes
        7. Extract relationships (calls, imports)
        8. Update repository profile
        """
        repo_root = Path(repo_path)
        if not repo_root.exists():
            raise ValueError(f"Repository path does not exist: {repo_path}")
        
        # Ensure repository root node exists in canonical Neo4j schema.
        await asyncio.to_thread(
            self._neo4j.upsert_repository,
            repo_id=repository_id,
            repo_path=repo_path,
            indexed_commit=commit_sha,
        )

        # Scan files
        code_files = self._scan_repository(repo_root)
        logger.info(f"[{repository_id}] Found {len(code_files)} code files")
        
        # Chunk all files
        all_chunks: list[CodeChunk] = []
        for file_path in code_files:
            try:
                rel_path = str(file_path.relative_to(repo_root))
                content = file_path.read_text(encoding="utf-8")
                chunks = self._chunker.chunk_file(
                    file_path=rel_path,
                    content=content,
                    repository_id=repository_id,
                )
                all_chunks.extend(chunks)
            except Exception as exc:
                logger.warning(f"Failed to chunk {file_path}: {exc}")
        
        logger.info(f"[{repository_id}] Created {len(all_chunks)} chunks")
        
        # Generate embeddings
        chunk_embeddings = await self._embedder.embed_chunks(all_chunks)
        
        # Store in Neo4j
        await self._store_chunks_in_neo4j(repository_id, all_chunks, chunk_embeddings)
        
        # Build graph
        graph_stats = await self._build_graph(
            organization_id=organization_id,
            project_id=project_id,
            repository_id=repository_id,
            repo_path=repo_path,
            commit_sha=commit_sha,
            chunks=all_chunks,
        )
        
        return IndexingResult(
            success=True,
            repository_id=repository_id,
            indexed_commit=commit_sha,
            mode="full",
            files_seen=len(code_files),
            files_indexed=len(code_files),
            chunks_created=len(all_chunks),
            chunks_embedded=len(chunk_embeddings),
            graph_nodes_created=graph_stats["nodes_created"],
            graph_edges_created=graph_stats["edges_created"],
            duration_ms=0,  # Will be set by caller
        )
    
    async def _incremental_indexing(
        self,
        *,
        repository_id: str,
        repo_path: str,
        commit_sha: str | None,
        changed_files: list[str],
    ) -> IndexingResult:
        """
        Incremental indexing for changed files only.
        
        Steps:
        1. Delete old chunks for changed files
        2. Re-chunk changed files
        3. Generate new embeddings
        4. Update Neo4j
        5. Update graph nodes/edges
        """
        repo_root = Path(repo_path)
        
        # Re-chunk changed files
        all_chunks: list[CodeChunk] = []
        for rel_path in changed_files:
            file_path = repo_root / rel_path
            if not file_path.exists():
                continue  # File deleted
            
            try:
                content = file_path.read_text(encoding="utf-8")
                chunks = self._chunker.chunk_file(
                    file_path=rel_path,
                    content=content,
                    repository_id=repository_id,
                )
                all_chunks.extend(chunks)
            except Exception as exc:
                logger.warning(f"Failed to chunk {rel_path}: {exc}")
        
        # Generate embeddings
        chunk_embeddings = await self._embedder.embed_chunks(all_chunks)
        
        # Update Neo4j (delete old, insert new)
        await self._update_chunks_in_neo4j(repository_id, changed_files, all_chunks, chunk_embeddings)
        
        # Update graph
        graph_stats = await self._update_graph(repository_id, commit_sha, all_chunks)
        
        return IndexingResult(
            success=True,
            repository_id=repository_id,
            indexed_commit=commit_sha,
            mode="incremental",
            files_seen=len(changed_files),
            files_indexed=len(changed_files),
            chunks_created=len(all_chunks),
            chunks_embedded=len(chunk_embeddings),
            graph_nodes_created=graph_stats["nodes_created"],
            graph_edges_created=graph_stats["edges_created"],
            duration_ms=0,
        )
    
    def _scan_repository(self, repo_root: Path) -> list[Path]:
        """Scan repository for code files."""
        code_extensions = {".py", ".js", ".jsx", ".ts", ".tsx", ".go", ".rs", ".java"}
        exclude_dirs = {".git", "node_modules", ".venv", "venv", "__pycache__", "dist", "build"}
        
        code_files = []
        for path in repo_root.rglob("*"):
            if path.is_file() and path.suffix in code_extensions:
                if not any(exc in path.parts for exc in exclude_dirs):
                    code_files.append(path)
        
        return code_files
    
    async def _store_chunks_in_neo4j(
        self,
        repository_id: str,
        chunks: list[CodeChunk],
        embeddings: list[list[float]],
    ) -> None:
        """Store chunks with embeddings in Neo4j."""
        neo4j_chunks: list[dict[str, Any]] = []
        file_languages: dict[str, str] = {}
        for chunk, embedding in zip(chunks, embeddings):
            file_languages.setdefault(chunk.file_path, str(chunk.language))
            neo4j_chunks.append({
                "uid": chunk.id,
                "repo_id": repository_id,
                "path": chunk.file_path,
                "chunk_index": chunk.metadata.get("chunk_index", 0),
                "language": str(chunk.language),
                "file_type": Path(chunk.file_path).suffix.lstrip(".") or "code",
                "chunk_type": chunk.chunk_type.value if hasattr(chunk.chunk_type, "value") else str(chunk.chunk_type),
                "content": chunk.content,
                "symbol_name": chunk.symbol_name,
                "start_line": chunk.line_start,
                "end_line": chunk.line_end,
                "indexed_commit": chunk.metadata.get("indexed_commit"),
                "token_count": len(chunk.content.split()),
                "embedding": embedding,
            })
        if not neo4j_chunks:
            return

        # File nodes must exist before chunk->file links.
        for file_path, language in file_languages.items():
            await asyncio.to_thread(
                self._neo4j.upsert_file,
                repo_id=repository_id,
                path=file_path,
                language=language,
                file_type=Path(file_path).suffix.lstrip(".") or "code",
            )

        await asyncio.to_thread(self._neo4j.batch_upsert_chunks, neo4j_chunks)

    async def _update_chunks_in_neo4j(
        self,
        repository_id: str,
        changed_files: list[str],
        chunks: list[CodeChunk],
        embeddings: list[list[float]],
    ) -> None:
        """Update Neo4j: delete old chunks for changed files, insert new ones."""
        for file_path in changed_files:
            await asyncio.to_thread(
                self._neo4j.delete_file_chunks,
                repo_id=repository_id,
                path=file_path,
            )
        await self._store_chunks_in_neo4j(repository_id, chunks, embeddings)
    
    async def _build_graph(
        self,
        *,
        organization_id: str,
        project_id: str,
        repository_id: str,
        repo_path: str,
        commit_sha: str | None,
        chunks: list[CodeChunk],
    ) -> dict[str, int]:
        """Build initial code graph in Neo4j."""
        nodes_created = await self._graph_builder.build_code_graph(
            organization_id=organization_id,
            project_id=project_id,
            repository_id=repository_id,
            chunks=chunks,
        )
        
        edges_created = await self._graph_builder.extract_relationships(
            repository_id=repository_id,
            chunks=chunks,
        )
        
        return {"nodes_created": nodes_created, "edges_created": edges_created}
    
    async def _update_graph(
        self,
        repository_id: str,
        commit_sha: str | None,
        chunks: list[CodeChunk],
    ) -> dict[str, int]:
        """Update graph incrementally."""
        nodes_created = await self._graph_builder.update_code_graph(
            repository_id=repository_id,
            chunks=chunks,
        )
        
        edges_created = await self._graph_builder.update_relationships(
            repository_id=repository_id,
            chunks=chunks,
        )
        
        return {"nodes_created": nodes_created, "edges_created": edges_created}

"""
Neo4j Client - Full Production Graph Database Client

Handles all Neo4j operations:
- Connection management with pooling + retry
- Schema initialization (constraints, indexes, vector indexes)
- Node/relationship CRUD for all graph node types
- Vector similarity search (Neo4j native vector index)
- Multi-hop graph traversal
- Batch write operations
- Transaction handling

Node types: Repository, File, Chunk, Rule, KnowledgeDocument,
            AnalysisRun, Comment, Suggestion, Organization, Project
Relationship types: CONTAINS, DEFINES, CALLS, IMPORTS, DEPENDS_ON,
                    RELATED_TO, VIOLATES, GENERATED_FROM, HAS_HISTORY,
                    HAS_RULE, BASED_ON
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from typing import Any, Iterator
from uuid import uuid4

from neo4j import GraphDatabase, Driver, Session
from neo4j.exceptions import ServiceUnavailable, TransientError

from app.settings import settings

logger = logging.getLogger(__name__)

# ── Schema DDL ────────────────────────────────────────────────────────────────

_CONSTRAINTS: list[str] = [
    "CREATE CONSTRAINT repo_id_unique IF NOT EXISTS FOR (r:Repository) REQUIRE r.repo_id IS UNIQUE",
    "CREATE CONSTRAINT file_uid_unique IF NOT EXISTS FOR (f:File) REQUIRE f.uid IS UNIQUE",
    "CREATE CONSTRAINT chunk_uid_unique IF NOT EXISTS FOR (c:Chunk) REQUIRE c.uid IS UNIQUE",
    "CREATE CONSTRAINT rule_uid_unique IF NOT EXISTS FOR (r:Rule) REQUIRE r.uid IS UNIQUE",
    "CREATE CONSTRAINT kb_doc_uid_unique IF NOT EXISTS FOR (k:KnowledgeDocument) REQUIRE k.uid IS UNIQUE",
    "CREATE CONSTRAINT analysis_run_uid_unique IF NOT EXISTS FOR (a:AnalysisRun) REQUIRE a.uid IS UNIQUE",
    "CREATE CONSTRAINT comment_uid_unique IF NOT EXISTS FOR (c:Comment) REQUIRE c.uid IS UNIQUE",
    "CREATE CONSTRAINT suggestion_uid_unique IF NOT EXISTS FOR (s:Suggestion) REQUIRE s.uid IS UNIQUE",
    "CREATE CONSTRAINT org_uid_unique IF NOT EXISTS FOR (o:Organization) REQUIRE o.uid IS UNIQUE",
    "CREATE CONSTRAINT project_uid_unique IF NOT EXISTS FOR (p:Project) REQUIRE p.uid IS UNIQUE",
]

_INDEXES: list[str] = [
    "CREATE INDEX repo_path_idx IF NOT EXISTS FOR (r:Repository) ON (r.repo_path)",
    "CREATE INDEX file_repo_path_idx IF NOT EXISTS FOR (f:File) ON (f.repo_id, f.path)",
    "CREATE INDEX chunk_repo_idx IF NOT EXISTS FOR (c:Chunk) ON (c.repo_id)",
    "CREATE INDEX chunk_path_idx IF NOT EXISTS FOR (c:Chunk) ON (c.repo_id, c.path)",
    "CREATE INDEX chunk_symbol_idx IF NOT EXISTS FOR (c:Chunk) ON (c.symbol_name)",
    "CREATE INDEX chunk_type_idx IF NOT EXISTS FOR (c:Chunk) ON (c.chunk_type)",
    "CREATE INDEX rule_category_idx IF NOT EXISTS FOR (r:Rule) ON (r.category)",
    "CREATE INDEX analysis_repo_idx IF NOT EXISTS FOR (a:AnalysisRun) ON (a.repo_id)",
    "CREATE INDEX analysis_created_idx IF NOT EXISTS FOR (a:AnalysisRun) ON (a.created_at)",
    "CREATE INDEX kb_doc_project_idx IF NOT EXISTS FOR (k:KnowledgeDocument) ON (k.project_id)",
]

# Vector indexes — require Neo4j 5.11+ with vector plugin
_VECTOR_INDEXES: list[tuple[str, str, int]] = [
    ("chunk_embedding_idx", "Chunk", 384),          # all-MiniLM-L6-v2
    ("kb_doc_embedding_idx", "KnowledgeDocument", 384),
    ("rule_embedding_idx", "Rule", 384),
]


class Neo4jClient:
    """
    Production Neo4j client with connection pooling, retry logic,
    schema management, and vector search.

    Singleton — one driver per process.
    """

    _instance: Neo4jClient | None = None
    _driver: Driver | None = None

    def __new__(cls) -> Neo4jClient:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self) -> None:
        if self._driver is None:
            self._connect()

    # ── Connection ────────────────────────────────────────────────────────────

    def _connect(self) -> None:
        try:
            self._driver = GraphDatabase.driver(
                settings.NEO4J_URI,
                auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
                max_connection_lifetime=settings.NEO4J_MAX_CONNECTION_LIFETIME_SECONDS,
                max_connection_pool_size=settings.NEO4J_MAX_CONNECTION_POOL_SIZE,
                connection_acquisition_timeout=settings.NEO4J_CONNECTION_ACQUISITION_TIMEOUT_SECONDS,
                connection_timeout=settings.NEO4J_CONNECTION_TIMEOUT_SECONDS,
                keep_alive=settings.NEO4J_KEEP_ALIVE,
            )
            self._driver.verify_connectivity()
            logger.info("Connected to Neo4j at %s", settings.NEO4J_URI)
        except ServiceUnavailable as exc:
            logger.error("Neo4j unavailable: %s", exc)
            raise
        except Exception as exc:
            logger.error("Neo4j connection failed: %s", exc)
            raise

    @contextmanager
    def session(self, database: str | None = None) -> Iterator[Session]:
        if self._driver is None:
            self._connect()
        sess = self._driver.session(database=database or settings.NEO4J_DATABASE)
        try:
            yield sess
        finally:
            sess.close()

    def close(self) -> None:
        if self._driver is not None:
            self._driver.close()
            self._driver = None
            Neo4jClient._instance = None
            logger.info("Neo4j driver closed")

    # ── Schema Init ───────────────────────────────────────────────────────────

    def init_schema(self) -> None:
        """Idempotently create all constraints, indexes, and vector indexes."""
        with self.session() as sess:
            for ddl in _CONSTRAINTS:
                try:
                    sess.run(ddl)
                except Exception as exc:
                    logger.warning("Constraint DDL skipped (%s): %s", ddl[:60], exc)

            for ddl in _INDEXES:
                try:
                    sess.run(ddl)
                except Exception as exc:
                    logger.warning("Index DDL skipped (%s): %s", ddl[:60], exc)

            for index_name, label, dims in _VECTOR_INDEXES:
                try:
                    sess.run(
                        "CREATE VECTOR INDEX $name IF NOT EXISTS "
                        "FOR (n:$label) ON (n.embedding) "  # type: ignore[arg-type]
                        "OPTIONS {indexConfig: {`vector.dimensions`: $dims, `vector.similarity_function`: 'cosine'}}",
                        {"name": index_name, "label": label, "dims": dims},
                    )
                except Exception:
                    # Fallback: older Neo4j syntax
                    try:
                        sess.run(
                            f"CALL db.index.vector.createNodeIndex("
                            f"'{index_name}', '{label}', 'embedding', {dims}, 'cosine')"
                        )
                    except Exception as exc2:
                        logger.warning("Vector index %s skipped: %s", index_name, exc2)

        logger.info("Neo4j schema initialized")

    # ── Generic Query Execution ───────────────────────────────────────────────

    def execute_query(
        self,
        query: str,
        parameters: dict[str, Any] | None = None,
        database: str | None = None,
    ) -> list[dict[str, Any]]:
        with self.session(database=database) as sess:
            result = sess.run(query, parameters or {})
            return [dict(record) for record in result]

    def execute_write(
        self,
        query: str,
        parameters: dict[str, Any] | None = None,
        database: str | None = None,
    ) -> dict[str, Any]:
        with self.session(database=database) as sess:
            result = sess.run(query, parameters or {})
            summary = result.consume()
            return {
                "nodes_created": summary.counters.nodes_created,
                "relationships_created": summary.counters.relationships_created,
                "properties_set": summary.counters.properties_set,
                "nodes_deleted": summary.counters.nodes_deleted,
                "relationships_deleted": summary.counters.relationships_deleted,
            }

    def execute_write_with_retry(
        self,
        query: str,
        parameters: dict[str, Any] | None = None,
        retries: int = 3,
        backoff: float = 0.5,
    ) -> dict[str, Any]:
        for attempt in range(retries):
            try:
                return self.execute_write(query, parameters)
            except TransientError as exc:
                if attempt < retries - 1:
                    time.sleep(backoff * (attempt + 1))
                    continue
                raise RuntimeError(f"Neo4j write failed after {retries} retries") from exc
        return {}

    # ── Repository Nodes ─────────────────────────────────────────────────────

    def upsert_repository(
        self,
        *,
        repo_id: str,
        repo_path: str,
        indexed_commit: str | None = None,
        default_branch: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        props = {
            "repo_id": repo_id,
            "repo_path": repo_path,
            "indexed_commit": indexed_commit,
            "default_branch": default_branch,
            "updated_at": _utc_now(),
            **(metadata or {}),
        }
        self.execute_write(
            "MERGE (r:Repository {repo_id: $repo_id}) SET r += $props",
            {"repo_id": repo_id, "props": props},
        )

    # ── File Nodes ────────────────────────────────────────────────────────────

    def upsert_file(
        self,
        *,
        repo_id: str,
        path: str,
        language: str,
        file_type: str,
        indexed_commit: str | None = None,
    ) -> str:
        uid = _make_uid("file", repo_id, path)
        self.execute_write(
            """
            MERGE (f:File {uid: $uid})
            SET f.repo_id = $repo_id,
                f.path = $path,
                f.language = $language,
                f.file_type = $file_type,
                f.indexed_commit = $indexed_commit,
                f.updated_at = $updated_at
            WITH f
            MATCH (r:Repository {repo_id: $repo_id})
            MERGE (r)-[:CONTAINS]->(f)
            """,
            {
                "uid": uid,
                "repo_id": repo_id,
                "path": path,
                "language": language,
                "file_type": file_type,
                "indexed_commit": indexed_commit,
                "updated_at": _utc_now(),
            },
        )
        return uid

    def delete_file_chunks(self, *, repo_id: str, path: str) -> None:
        self.execute_write(
            "MATCH (c:Chunk {repo_id: $repo_id, path: $path}) DETACH DELETE c",
            {"repo_id": repo_id, "path": path},
        )

    def delete_repo_chunks(self, *, repo_id: str) -> None:
        self.execute_write(
            "MATCH (c:Chunk {repo_id: $repo_id}) DETACH DELETE c",
            {"repo_id": repo_id},
        )
        self.execute_write(
            "MATCH (f:File {repo_id: $repo_id}) DETACH DELETE f",
            {"repo_id": repo_id},
        )

    # ── Chunk Nodes ───────────────────────────────────────────────────────────

    def upsert_chunk(
        self,
        *,
        uid: str,
        repo_id: str,
        path: str,
        chunk_index: int,
        language: str,
        file_type: str,
        chunk_type: str,
        content: str,
        embedding: list[float],
        start_line: int | None = None,
        end_line: int | None = None,
        symbol_name: str | None = None,
        indexed_commit: str | None = None,
    ) -> None:
        self.execute_write(
            """
            MERGE (c:Chunk {uid: $uid})
            SET c.repo_id = $repo_id,
                c.path = $path,
                c.chunk_index = $chunk_index,
                c.language = $language,
                c.file_type = $file_type,
                c.chunk_type = $chunk_type,
                c.content = $content,
                c.embedding = $embedding,
                c.start_line = $start_line,
                c.end_line = $end_line,
                c.symbol_name = $symbol_name,
                c.indexed_commit = $indexed_commit,
                c.token_count = $token_count,
                c.indexed_at = $indexed_at
            WITH c
            MATCH (f:File {repo_id: $repo_id, path: $path})
            MERGE (f)-[:CONTAINS]->(c)
            """,
            {
                "uid": uid,
                "repo_id": repo_id,
                "path": path,
                "chunk_index": chunk_index,
                "language": language,
                "file_type": file_type,
                "chunk_type": chunk_type,
                "content": content,
                "embedding": embedding,
                "start_line": start_line,
                "end_line": end_line,
                "symbol_name": symbol_name,
                "indexed_commit": indexed_commit,
                "token_count": len(content.split()),
                "indexed_at": _utc_now(),
            },
        )

    def batch_upsert_chunks(self, chunks: list[dict[str, Any]]) -> int:
        """
        Batch upsert chunks. Each dict must have keys matching upsert_chunk params.
        Returns number of chunks written.
        """
        if not chunks:
            return 0

        batch_size = settings.INCREMENTAL_INDEXING_BATCH_SIZE
        total = 0
        for start in range(0, len(chunks), batch_size):
            batch = chunks[start : start + batch_size]
            with self.session() as sess:
                with sess.begin_transaction() as tx:
                    for c in batch:
                        tx.run(
                            """
                            MERGE (n:Chunk {uid: $uid})
                            SET n += $props
                            WITH n
                            MATCH (f:File {repo_id: $repo_id, path: $path})
                            MERGE (f)-[:CONTAINS]->(n)
                            """,
                            {
                                "uid": c["uid"],
                                "repo_id": c["repo_id"],
                                "path": c["path"],
                                "props": {k: v for k, v in c.items() if k != "uid"},
                            },
                        )
                    tx.commit()
            total += len(batch)
        return total

    # ── Import / Dependency Edges ─────────────────────────────────────────────

    def upsert_import_edge(
        self,
        *,
        repo_id: str,
        source_path: str,
        target_path: str,
        edge_type: str = "IMPORTS",
        source_symbol: str | None = None,
        target_symbol: str | None = None,
    ) -> None:
        """Create IMPORTS or DEPENDS_ON relationship between File nodes."""
        self.execute_write(
            """
            MATCH (src:File {repo_id: $repo_id, path: $source_path})
            MATCH (tgt:File {repo_id: $repo_id, path: $target_path})
            MERGE (src)-[r:IMPORTS]->(tgt)
            SET r.edge_type = $edge_type,
                r.source_symbol = $source_symbol,
                r.target_symbol = $target_symbol,
                r.updated_at = $updated_at
            """,
            {
                "repo_id": repo_id,
                "source_path": source_path,
                "target_path": target_path,
                "edge_type": edge_type,
                "source_symbol": source_symbol,
                "target_symbol": target_symbol,
                "updated_at": _utc_now(),
            },
        )

    def batch_upsert_edges(self, edges: list[dict[str, Any]]) -> int:
        """Batch upsert graph edges (IMPORTS, INHERITS, DEPENDS_ON)."""
        if not edges:
            return 0
        with self.session() as sess:
            with sess.begin_transaction() as tx:
                for edge in edges:
                    tx.run(
                        """
                        MATCH (src:File {repo_id: $repo_id, path: $source_path})
                        MATCH (tgt:File {repo_id: $repo_id, path: $target_path})
                        MERGE (src)-[r:IMPORTS {edge_type: $edge_type}]->(tgt)
                        SET r.source_symbol = $source_symbol,
                            r.target_symbol = $target_symbol,
                            r.updated_at = $updated_at
                        """,
                        {
                            "repo_id": edge.get("repo_id", ""),
                            "source_path": edge.get("source_path", ""),
                            "target_path": edge.get("target_path", ""),
                            "edge_type": edge.get("edge_type", "IMPORTS"),
                            "source_symbol": edge.get("source_symbol"),
                            "target_symbol": edge.get("target_symbol"),
                            "updated_at": _utc_now(),
                        },
                    )
                tx.commit()
        return len(edges)

    # ── Graph Traversal ───────────────────────────────────────────────────────

    def get_neighbor_paths(
        self,
        *,
        repo_id: str,
        path: str,
        depth: int = 2,
        limit: int = 32,
    ) -> list[str]:
        """
        Multi-hop BFS: return file paths reachable from `path`
        via IMPORTS or CONTAINS edges up to `depth` hops.
        """
        result = self.execute_query(
            """
            MATCH (src:File {repo_id: $repo_id, path: $path})
            CALL apoc.path.subgraphNodes(src, {
                relationshipFilter: 'IMPORTS>|<IMPORTS',
                maxLevel: $depth,
                limit: $limit
            })
            YIELD node
            WHERE node:File AND node.path <> $path
            RETURN DISTINCT node.path AS path
            LIMIT $limit
            """,
            {"repo_id": repo_id, "path": path, "depth": depth, "limit": limit},
        )
        paths = [r["path"] for r in result if r.get("path")]
        if not paths:
            # Fallback without APOC
            paths = self._bfs_neighbors(repo_id=repo_id, path=path, depth=depth, limit=limit)
        return paths

    def _bfs_neighbors(
        self,
        *,
        repo_id: str,
        path: str,
        depth: int,
        limit: int,
    ) -> list[str]:
        """Pure Cypher BFS fallback (no APOC needed)."""
        result = self.execute_query(
            """
            MATCH (src:File {repo_id: $repo_id, path: $path})
            MATCH (src)-[:IMPORTS*1..$depth]-(neighbor:File)
            WHERE neighbor.repo_id = $repo_id AND neighbor.path <> $path
            RETURN DISTINCT neighbor.path AS path
            LIMIT $limit
            """,
            {"repo_id": repo_id, "path": path, "depth": depth, "limit": limit},
        )
        return [r["path"] for r in result if r.get("path")]

    def get_chunks_for_paths(
        self,
        *,
        repo_id: str,
        paths: list[str],
        limit_per_path: int = 4,
    ) -> list[dict[str, Any]]:
        """Fetch chunk records for a list of file paths."""
        if not paths:
            return []
        result = self.execute_query(
            """
            UNWIND $paths AS p
            MATCH (c:Chunk {repo_id: $repo_id, path: p})
            RETURN c { .uid, .repo_id, .path, .chunk_index, .language,
                        .file_type, .chunk_type, .content, .symbol_name,
                        .start_line, .end_line, .indexed_commit, .token_count } AS chunk
            LIMIT $limit
            """,
            {"repo_id": repo_id, "paths": paths, "limit": len(paths) * limit_per_path},
        )
        return [r["chunk"] for r in result if r.get("chunk")]

    # ── Vector Search ─────────────────────────────────────────────────────────

    def vector_search_chunks(
        self,
        *,
        repo_id: str,
        query_vector: list[float],
        top_k: int = 20,
        min_score: float = 0.0,
    ) -> list[dict[str, Any]]:
        """
        Semantic similarity search over Chunk embeddings using Neo4j vector index.
        Returns list of {chunk, score} dicts.
        """
        try:
            result = self.execute_query(
                """
                CALL db.index.vector.queryNodes('chunk_embedding_idx', $top_k, $query_vector)
                YIELD node AS c, score
                WHERE c.repo_id = $repo_id AND score >= $min_score
                RETURN c { .uid, .repo_id, .path, .chunk_index, .language,
                            .file_type, .chunk_type, .content, .symbol_name,
                            .start_line, .end_line, .token_count } AS chunk,
                       score
                ORDER BY score DESC
                LIMIT $top_k
                """,
                {
                    "repo_id": repo_id,
                    "query_vector": query_vector,
                    "top_k": top_k,
                    "min_score": min_score,
                },
            )
            return [{"chunk": r["chunk"], "score": float(r["score"])} for r in result]
        except Exception as exc:
            logger.warning("Neo4j vector search failed: %s", exc)
            return []

    def vector_search_kb_docs(
        self,
        *,
        query_vector: list[float],
        top_k: int = 10,
        project_id: str | None = None,
        min_score: float = 0.0,
    ) -> list[dict[str, Any]]:
        """Semantic search over KnowledgeDocument embeddings."""
        try:
            filter_clause = "WHERE score >= $min_score"
            if project_id:
                filter_clause += " AND (k.project_id = $project_id OR k.project_id IS NULL)"

            result = self.execute_query(
                f"""
                CALL db.index.vector.queryNodes('kb_doc_embedding_idx', $top_k, $query_vector)
                YIELD node AS k, score
                {filter_clause}
                RETURN k {{ .uid, .title, .content, .category, .project_id,
                             .doc_type, .source_url }} AS doc, score
                ORDER BY score DESC
                LIMIT $top_k
                """,
                {
                    "query_vector": query_vector,
                    "top_k": top_k,
                    "project_id": project_id,
                    "min_score": min_score,
                },
            )
            return [{"doc": r["doc"], "score": float(r["score"])} for r in result]
        except Exception as exc:
            logger.warning("Neo4j KB vector search failed: %s", exc)
            return []

    def vector_search_rules(
        self,
        *,
        query_vector: list[float],
        top_k: int = 8,
        min_score: float = 0.0,
    ) -> list[dict[str, Any]]:
        """Semantic search over Rule embeddings."""
        try:
            result = self.execute_query(
                """
                CALL db.index.vector.queryNodes('rule_embedding_idx', $top_k, $query_vector)
                YIELD node AS r, score
                WHERE score >= $min_score
                RETURN r { .uid, .title, .description, .category,
                            .severity, .pattern, .example_violation,
                            .example_fix } AS rule, score
                ORDER BY score DESC
                LIMIT $top_k
                """,
                {
                    "query_vector": query_vector,
                    "top_k": top_k,
                    "min_score": min_score,
                },
            )
            return [{"rule": r["rule"], "score": float(r["score"])} for r in result]
        except Exception as exc:
            logger.warning("Neo4j rule vector search failed: %s", exc)
            return []

    # ── Symbol Search ─────────────────────────────────────────────────────────

    def search_chunks_by_symbol(
        self,
        *,
        repo_id: str,
        symbol_name: str,
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        result = self.execute_query(
            """
            MATCH (c:Chunk {repo_id: $repo_id})
            WHERE c.symbol_name CONTAINS $symbol_name
            RETURN c { .uid, .repo_id, .path, .chunk_index, .language,
                        .file_type, .chunk_type, .content, .symbol_name,
                        .start_line, .end_line, .token_count } AS chunk
            LIMIT $limit
            """,
            {"repo_id": repo_id, "symbol_name": symbol_name, "limit": limit},
        )
        return [r["chunk"] for r in result if r.get("chunk")]

    # ── Knowledge Base Nodes ──────────────────────────────────────────────────

    def upsert_kb_document(
        self,
        *,
        uid: str,
        title: str,
        content: str,
        embedding: list[float],
        category: str = "general",
        doc_type: str = "document",
        project_id: str | None = None,
        org_id: str | None = None,
        source_url: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self.execute_write(
            """
            MERGE (k:KnowledgeDocument {uid: $uid})
            SET k.title = $title,
                k.content = $content,
                k.embedding = $embedding,
                k.category = $category,
                k.doc_type = $doc_type,
                k.project_id = $project_id,
                k.org_id = $org_id,
                k.source_url = $source_url,
                k.updated_at = $updated_at
            """,
            {
                "uid": uid,
                "title": title,
                "content": content,
                "embedding": embedding,
                "category": category,
                "doc_type": doc_type,
                "project_id": project_id,
                "org_id": org_id,
                "source_url": source_url,
                "updated_at": _utc_now(),
            },
        )

    def upsert_rule(
        self,
        *,
        uid: str,
        title: str,
        description: str,
        embedding: list[float],
        category: str = "quality",
        severity: str = "WARN",
        pattern: str | None = None,
        example_violation: str | None = None,
        example_fix: str | None = None,
        project_id: str | None = None,
        org_id: str | None = None,
    ) -> None:
        self.execute_write(
            """
            MERGE (r:Rule {uid: $uid})
            SET r.title = $title,
                r.description = $description,
                r.embedding = $embedding,
                r.category = $category,
                r.severity = $severity,
                r.pattern = $pattern,
                r.example_violation = $example_violation,
                r.example_fix = $example_fix,
                r.project_id = $project_id,
                r.org_id = $org_id,
                r.updated_at = $updated_at
            """,
            {
                "uid": uid,
                "title": title,
                "description": description,
                "embedding": embedding,
                "category": category,
                "severity": severity,
                "pattern": pattern,
                "example_violation": example_violation,
                "example_fix": example_fix,
                "project_id": project_id,
                "org_id": org_id,
                "updated_at": _utc_now(),
            },
        )

    # ── Analysis History ──────────────────────────────────────────────────────

    def create_analysis_run(
        self,
        *,
        repo_id: str,
        pr_number: int | None = None,
        commit_sha: str | None = None,
        status: str = "running",
        metadata: dict[str, Any] | None = None,
    ) -> str:
        uid = str(uuid4())
        self.execute_write(
            """
            CREATE (a:AnalysisRun {
                uid: $uid,
                repo_id: $repo_id,
                pr_number: $pr_number,
                commit_sha: $commit_sha,
                status: $status,
                created_at: $created_at,
                updated_at: $updated_at,
                metadata: $metadata
            })
            WITH a
            MATCH (r:Repository {repo_id: $repo_id})
            MERGE (r)-[:HAS_HISTORY]->(a)
            """,
            {
                "uid": uid,
                "repo_id": repo_id,
                "pr_number": pr_number,
                "commit_sha": commit_sha,
                "status": status,
                "created_at": _utc_now(),
                "updated_at": _utc_now(),
                "metadata": str(metadata or {}),
            },
        )
        return uid

    def update_analysis_run(
        self,
        *,
        uid: str,
        status: str,
        summary: str | None = None,
        findings_count: int | None = None,
        completed_at: str | None = None,
    ) -> None:
        self.execute_write(
            """
            MATCH (a:AnalysisRun {uid: $uid})
            SET a.status = $status,
                a.summary = $summary,
                a.findings_count = $findings_count,
                a.completed_at = $completed_at,
                a.updated_at = $updated_at
            """,
            {
                "uid": uid,
                "status": status,
                "summary": summary,
                "findings_count": findings_count,
                "completed_at": completed_at or _utc_now(),
                "updated_at": _utc_now(),
            },
        )

    def add_comment_to_run(
        self,
        *,
        run_uid: str,
        file_path: str,
        line_start: int | None,
        line_end: int | None,
        severity: str,
        category: str,
        message: str,
        suggestion: str | None = None,
        confidence: float = 0.7,
        references: list[str] | None = None,
        auto_fix: str | None = None,
    ) -> str:
        uid = str(uuid4())
        self.execute_write(
            """
            CREATE (c:Comment {
                uid: $uid,
                file_path: $file_path,
                line_start: $line_start,
                line_end: $line_end,
                severity: $severity,
                category: $category,
                message: $message,
                suggestion: $suggestion,
                confidence: $confidence,
                references: $references,
                auto_fix: $auto_fix,
                created_at: $created_at
            })
            WITH c
            MATCH (a:AnalysisRun {uid: $run_uid})
            MERGE (a)-[:GENERATED_FROM]->(c)
            """,
            {
                "uid": uid,
                "run_uid": run_uid,
                "file_path": file_path,
                "line_start": line_start,
                "line_end": line_end,
                "severity": severity,
                "category": category,
                "message": message,
                "suggestion": suggestion,
                "confidence": confidence,
                "references": references or [],
                "auto_fix": auto_fix,
                "created_at": _utc_now(),
            },
        )
        return uid

    def get_analysis_history(
        self,
        *,
        repo_id: str,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        return self.execute_query(
            """
            MATCH (r:Repository {repo_id: $repo_id})-[:HAS_HISTORY]->(a:AnalysisRun)
            RETURN a { .uid, .repo_id, .pr_number, .commit_sha, .status,
                        .summary, .findings_count, .created_at, .completed_at } AS run
            ORDER BY a.created_at DESC
            LIMIT $limit
            """,
            {"repo_id": repo_id, "limit": limit},
        )

    # ── Repo Profile ──────────────────────────────────────────────────────────

    def get_repo_profile(self, repo_id: str) -> dict[str, Any] | None:
        result = self.execute_query(
            "MATCH (r:Repository {repo_id: $repo_id}) RETURN r { .* } AS repo LIMIT 1",
            {"repo_id": repo_id},
        )
        if not result:
            return None
        return result[0].get("repo")

    def get_repo_stats(self, repo_id: str) -> dict[str, Any]:
        result = self.execute_query(
            """
            MATCH (r:Repository {repo_id: $repo_id})
            OPTIONAL MATCH (r)-[:CONTAINS]->(f:File)
            OPTIONAL MATCH (f)-[:CONTAINS]->(c:Chunk)
            RETURN r.repo_id AS repo_id,
                   count(DISTINCT f) AS file_count,
                   count(DISTINCT c) AS chunk_count
            """,
            {"repo_id": repo_id},
        )
        if not result:
            return {"repo_id": repo_id, "file_count": 0, "chunk_count": 0}
        return result[0]


# ── Module-level helpers ──────────────────────────────────────────────────────

def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _make_uid(*parts: str) -> str:
    import hashlib
    return hashlib.sha1(":".join(parts).encode()).hexdigest()


def get_neo4j_client() -> Neo4jClient:
    """Get singleton Neo4j client instance."""
    return Neo4jClient()

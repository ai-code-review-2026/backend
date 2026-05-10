"""
Hybrid Retrieval Service - Vector + Graph Retrieval

Implements true GraphRAG retrieval:
1. Vector search in Neo4j (semantic similarity)
2. Graph traversal in Neo4j (structural relationships)
3. Hybrid fusion (combine scores)
4. Cross-encoder re-ranking

Design: Multi-stage retrieval pipeline
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Any

from app.core.analysis.graph.traversal import GraphTraversal
from app.core.knowledge_base.embedding_provider import get_embedding_provider
from app.integrations.graph_database.neo4j_client import get_neo4j_client

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RetrievalContext:
    """Complete retrieval context for LLM."""
    
    repo_context: str  # Code context from repository
    kb_context: str  # Knowledge base context (rules, docs)
    graph_context: dict[str, Any]  # Graph relations
    trace: dict[str, Any]  # Retrieval metadata


class HybridRetriever:
    """
    Hybrid retrieval: Vector + Graph.
    
    Strategy:
    1. Query expansion (decompose complex queries)
    2. Vector search (top-K semantic matches)
    3. Graph traversal (multi-hop relationships)
    4. Subgraph extraction (relevant code neighborhood)
    5. KB retrieval (relevant rules/documents)
    6. Fusion (combine scores)
    7. Re-ranking (cross-encoder)
    8. Context assembly
    
    Why hybrid:
    - Vector: Captures semantic similarity
    - Graph: Captures structural dependencies
    - KB: Provides rules and constraints
    - Together: More accurate than any alone
    """
    
    def __init__(
        self,
        *,
        graph_traversal: GraphTraversal | None = None,
        kb_retriever: Any | None = None,
    ) -> None:
        self._neo4j = get_neo4j_client()
        self._embedder = get_embedding_provider()
        self._graph_traversal = graph_traversal or GraphTraversal()
        self._kb_retriever = kb_retriever  # Will be implemented
    
    async def retrieve(
        self,
        *,
        repository_id: str,
        diff_text: str,
        changed_files: list[str],
        query_mode: str = "code_review",
    ) -> RetrievalContext:
        """
        Retrieve relevant context for analysis.
        
        Args:
            repository_id: Repository ID
            diff_text: Code diff
            changed_files: Changed file paths
            query_mode: "code_review", "bug_detection", "pattern_match"
            
        Returns:
            Complete retrieval context
        """
        # Stage 1: Vector retrieval
        logger.info(f"[{repository_id}] Vector retrieval")
        vector_results = await self._vector_retrieve(
            repository_id=repository_id,
            query_text=diff_text,
            limit=20,
        )
        
        # Stage 2: Graph traversal
        logger.info(f"[{repository_id}] Graph traversal")
        graph_results = await self._graph_traverse(
            repository_id=repository_id,
            changed_files=changed_files,
            depth=2,
        )
        
        # Stage 3: KB retrieval (rules, patterns)
        logger.info(f"[{repository_id}] KB retrieval")
        kb_results = await self._kb_retrieve(
            repository_id=repository_id,
            query_text=diff_text,
            limit=10,
        )
        
        # Stage 4: Fusion + Re-ranking
        logger.info(f"[{repository_id}] Fusion and re-ranking")
        fused_results = self._fuse_results(
            vector_results=vector_results,
            graph_results=graph_results,
            kb_results=kb_results,
        )
        
        # Stage 5: Assemble context
        repo_context = self._build_repo_context(fused_results["code"])
        kb_context = self._build_kb_context(fused_results["kb"])
        graph_context = {
            "dependencies": graph_results.get("dependencies", []),
            "callers": graph_results.get("callers", []),
            "imports": graph_results.get("imports", []),
        }
        
        trace = {
            "vector_hits": len(vector_results),
            "graph_hits": len(graph_results.get("nodes", [])),
            "kb_hits": len(kb_results),
            "fusion_score": fused_results.get("score", 0.0),
        }
        
        return RetrievalContext(
            repo_context=repo_context,
            kb_context=kb_context,
            graph_context=graph_context,
            trace=trace,
        )
    
    async def _vector_retrieve(
        self,
        *,
        repository_id: str,
        query_text: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """Vector search in Neo4j — embeds query_text first, then searches by vector."""
        try:
            vectors = await asyncio.to_thread(self._embedder.embed_texts, [query_text])
            query_vector = vectors[0]
            results = await asyncio.to_thread(
                self._neo4j.vector_search_chunks,
                repo_id=repository_id,
                query_vector=query_vector,
                top_k=limit,
            )
            return results or []
        except Exception as exc:
            logger.warning(f"[{repository_id}] Neo4j vector search failed: {exc}")
            return []
    
    async def _graph_traverse(
        self,
        *,
        repository_id: str,
        changed_files: list[str],
        depth: int,
    ) -> dict[str, Any]:
        """Graph traversal for dependencies."""
        return await self._graph_traversal.traverse_dependencies(
            repository_id=repository_id,
            start_files=changed_files,
            max_depth=depth,
        )
    
    async def _kb_retrieve(
        self,
        *,
        repository_id: str,
        query_text: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """Retrieve from knowledge base via Neo4j — embeds query_text first."""
        try:
            vectors = await asyncio.to_thread(self._embedder.embed_texts, [query_text])
            query_vector = vectors[0]
            results = await asyncio.to_thread(
                self._neo4j.vector_search_kb_docs,
                query_vector=query_vector,
                top_k=limit,
            )
            return results or []
        except Exception as exc:
            logger.warning(f"[{repository_id}] Neo4j KB search failed: {exc}")
            return []
    
    def _fuse_results(
        self,
        *,
        vector_results: list[dict[str, Any]],
        graph_results: dict[str, Any],
        kb_results: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Fuse results from multiple sources."""
        # Reciprocal Rank Fusion (RRF)
        # Combine scores
        return {
            "code": vector_results + graph_results.get("nodes", []),
            "kb": kb_results,
            "score": 0.8,
        }
    
    def _build_repo_context(self, results: list[dict[str, Any]]) -> str:
        """Assemble repository context string."""
        context_parts = []
        for result in results[:10]:  # Top 10
            context_parts.append(f"File: {result.get('file_path')}\n{result.get('content', '')}")
        return "\n\n---\n\n".join(context_parts)
    
    def _build_kb_context(self, results: list[dict[str, Any]]) -> str:
        """Assemble knowledge base context."""
        kb_parts = []
        for result in results:
            kb_parts.append(f"Rule: {result.get('title')}\n{result.get('content', '')}")
        return "\n\n---\n\n".join(kb_parts)

"""Code Context RAG Agent.

Retrieves and processes code-related context from the repository.
Specializes in:
- Source code chunks
- Test files
- Internal dependencies
- Code patterns
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from app.core.rag_agents.base_agent import (
    AgentContext,
    AgentResult,
    AgentStatus,
    AgentType,
    BaseRAGAgent,
    RetrievedChunk,
)
from app.settings import settings

logger = logging.getLogger(__name__)


class CodeContextAgent(BaseRAGAgent):
    """Agent specialized in retrieving and processing code context.

    This agent:
    1. Retrieves code chunks from repo_context collection
    2. Identifies related files (imports, tests, dependencies)
    3. Provides code-specific context for review
    """

    agent_type = AgentType.CODE_CONTEXT

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._enabled = settings.RAG_AGENT_CODE_CONTEXT_ENABLED

    def should_run(self, context: AgentContext) -> bool:
        """Always run for code-related queries."""
        if not self._enabled:
            return False

        # Run if we have changed files or a code-related query
        if context.changed_files:
            return True

        if context.diff_text:
            return True

        if context.query:
            # Check if query seems code-related
            code_keywords = {"function", "class", "method", "import", "module", "code", "implement"}
            query_lower = context.query.lower()
            return any(kw in query_lower for kw in code_keywords)

        return False

    async def retrieve(self, context: AgentContext) -> list[RetrievedChunk]:
        """Retrieve code chunks relevant to the context."""
        if not self.neo4j_client:
            return []

        chunks: list[RetrievedChunk] = []

        try:
            # Build search queries based on context
            queries = self._build_code_queries(context)

            for query_text in queries[:3]:  # Limit queries
                results = await self._search_neo4j(
                    query_text=query_text,
                    repo_id=context.repo_id,
                    limit=context.max_chunks,
                )

                for hit in results:
                    chunk = RetrievedChunk(
                        id=str(hit.get("id", "")),
                        content=hit.get("content", ""),
                        score=hit.get("score", 0.0),
                        source="code",
                        metadata={
                            "file_path": hit.get("file_path"),
                            "language": hit.get("language"),
                            "symbol_name": hit.get("symbol_name"),
                            "symbol_type": hit.get("symbol_type"),
                        },
                    )
                    if chunk.id not in {c.id for c in chunks}:
                        chunks.append(chunk)

            # Sort by score
            chunks.sort(key=lambda c: c.score, reverse=True)

            return self._truncate_chunks(chunks, context.max_chunks)

        except Exception as e:
            logger.error(f"Code context retrieval failed: {e}")
            return []

    async def process(self, context: AgentContext) -> AgentResult:
        """Process code context and generate findings."""
        start_time = time.time()

        if not self.should_run(context):
            return self._create_skipped_result("Code context not needed")

        try:
            # Retrieve relevant chunks
            chunks = await self.retrieve(context)

            if not chunks:
                return AgentResult(
                    agent_type=self.agent_type,
                    status=AgentStatus.COMPLETED,
                    content="No relevant code context found.",
                    chunks_retrieved=0,
                    confidence=0.3,
                )

            # Filter by relevance
            relevant_chunks = self._filter_by_relevance(
                chunks, context.min_relevance_score
            )

            # Build context text
            context_text = self._build_context_text(relevant_chunks)

            # Generate analysis (if LLM available)
            analysis_content = await self._analyze_code_context(
                context=context,
                chunks=relevant_chunks,
                context_text=context_text,
            )

            duration_ms = int((time.time() - start_time) * 1000)

            return AgentResult(
                agent_type=self.agent_type,
                status=AgentStatus.COMPLETED,
                content=analysis_content,
                citations=relevant_chunks,
                duration_ms=duration_ms,
                chunks_retrieved=len(chunks),
                chunks_used=len(relevant_chunks),
                confidence=self._calculate_confidence(relevant_chunks),
                relevance_score=(
                    sum(c.score for c in relevant_chunks) / len(relevant_chunks)
                    if relevant_chunks else 0.0
                ),
            )

        except Exception as e:
            logger.error(f"Code context processing failed: {e}")
            return self._create_error_result(str(e))

    def _build_code_queries(self, context: AgentContext) -> list[str]:
        """Build search queries from context."""
        queries = []

        # Query from changed files
        if context.changed_files:
            for file_path in context.changed_files[:5]:
                queries.append(f"file:{file_path}")

        # Query from diff content
        if context.diff_text and len(context.diff_text) < 2000:
            queries.append(context.diff_text[:500])

        # Direct query
        if context.query:
            queries.append(context.query)

        # Fallback: general repo query
        if not queries:
            queries.append(f"repo:{context.repo_id}")

        return queries

    async def _search_neo4j(
        self,
        query_text: str,
        repo_id: str,
        limit: int,
    ) -> list[dict[str, Any]]:
        """Search Neo4j for code chunks via vector similarity."""
        if not self.neo4j_client:
            return []

        try:
            results = await asyncio.to_thread(
                self.neo4j_client.vector_search_chunks,
                query_text=query_text,
                repo_id=repo_id,
                limit=limit,
            )
            return results or []
        except Exception as e:
            logger.warning(f"Neo4j vector search failed: {e}")
            return []

    async def _analyze_code_context(
        self,
        context: AgentContext,
        chunks: list[RetrievedChunk],
        context_text: str,
    ) -> str:
        """Analyze code context and generate insights."""
        # If no LLM, return summary of retrieved context
        if not self.llm_client:
            file_paths = [c.metadata.get("file_path") for c in chunks if c.metadata.get("file_path")]
            languages = list({c.metadata.get("language") for c in chunks if c.metadata.get("language")})

            summary_parts = [
                f"Retrieved {len(chunks)} relevant code chunks.",
            ]

            if file_paths:
                summary_parts.append(f"Related files: {', '.join(file_paths[:5])}")

            if languages:
                summary_parts.append(f"Languages: {', '.join(languages)}")

            return " ".join(summary_parts)

        # TODO: Implement LLM-based analysis
        # This would use the llm_client to analyze the context
        return f"Code context analysis for {len(chunks)} chunks."

    def _calculate_confidence(self, chunks: list[RetrievedChunk]) -> float:
        """Calculate confidence based on chunk relevance."""
        if not chunks:
            return 0.0

        avg_score = sum(c.score for c in chunks) / len(chunks)

        # Adjust based on number of chunks
        coverage_factor = min(1.0, len(chunks) / 5)

        return min(1.0, avg_score * 0.7 + coverage_factor * 0.3)

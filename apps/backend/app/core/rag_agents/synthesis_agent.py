"""Synthesis RAG Agent.

Combines results from all other agents and generates final output.
Specializes in:
- Merging contexts from multiple sources
- Deduplicating findings
- Generating coherent final review
"""

from __future__ import annotations

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


class SynthesisAgent(BaseRAGAgent):
    """Agent that synthesizes results from all other agents.

    This agent:
    1. Combines results from Code, Documentation, and Policy agents
    2. Deduplicates and prioritizes findings
    3. Generates a coherent, grounded review output
    """

    agent_type = AgentType.SYNTHESIS

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._enabled = settings.RAG_AGENT_SYNTHESIS_ENABLED

    def should_run(self, context: AgentContext) -> bool:
        """Always run if enabled (final synthesis step)."""
        return self._enabled

    async def retrieve(self, context: AgentContext) -> list[RetrievedChunk]:
        """Synthesis agent doesn't retrieve directly - uses other agents' results."""
        # This agent uses pre-retrieved chunks passed via context
        all_chunks = []

        # Collect chunks from context (populated by other agents)
        for chunk_dict in context.code_chunks:
            all_chunks.append(self._dict_to_chunk(chunk_dict, "code"))

        for chunk_dict in context.doc_chunks:
            all_chunks.append(self._dict_to_chunk(chunk_dict, "documentation"))

        for chunk_dict in context.rule_chunks:
            all_chunks.append(self._dict_to_chunk(chunk_dict, "policy"))

        return all_chunks

    async def process(self, context: AgentContext) -> AgentResult:
        """Synthesize results from all sources."""
        start_time = time.time()

        if not self.should_run(context):
            return self._create_skipped_result("Synthesis not needed")

        try:
            # Get all chunks
            all_chunks = await self.retrieve(context)

            if not all_chunks:
                return AgentResult(
                    agent_type=self.agent_type,
                    status=AgentStatus.COMPLETED,
                    content="No context available for synthesis.",
                    chunks_retrieved=0,
                    confidence=0.3,
                )

            # Deduplicate and prioritize
            prioritized_chunks = self._prioritize_chunks(all_chunks)

            # Build comprehensive context
            context_text = self._build_synthesis_context(prioritized_chunks)

            # Generate synthesis
            synthesis_content = self._generate_synthesis(
                context=context,
                chunks=prioritized_chunks,
                context_text=context_text,
            )

            # Combine findings
            combined_findings = self._combine_findings(context)

            duration_ms = int((time.time() - start_time) * 1000)

            return AgentResult(
                agent_type=self.agent_type,
                status=AgentStatus.COMPLETED,
                content=synthesis_content,
                findings=combined_findings,
                citations=prioritized_chunks,
                duration_ms=duration_ms,
                chunks_retrieved=len(all_chunks),
                chunks_used=len(prioritized_chunks),
                confidence=self._calculate_overall_confidence(prioritized_chunks),
                relevance_score=(
                    sum(c.score for c in prioritized_chunks) / len(prioritized_chunks)
                    if prioritized_chunks else 0.0
                ),
            )

        except Exception as e:
            logger.error(f"Synthesis processing failed: {e}")
            return self._create_error_result(str(e))

    def _dict_to_chunk(self, chunk_dict: dict[str, Any], source: str) -> RetrievedChunk:
        """Convert dictionary to RetrievedChunk."""
        return RetrievedChunk(
            id=str(chunk_dict.get("id", "")),
            content=chunk_dict.get("content", ""),
            score=chunk_dict.get("score", 0.0),
            source=source,
            metadata=chunk_dict.get("metadata", {}),
        )

    def _prioritize_chunks(self, chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
        """Prioritize chunks for synthesis.

        Priority order:
        1. High-relevance policy chunks (compliance is critical)
        2. High-relevance code chunks (direct context)
        3. Documentation chunks (supporting context)
        """
        # Separate by source
        by_source = {"policy": [], "code": [], "documentation": []}
        for chunk in chunks:
            if chunk.source in by_source:
                by_source[chunk.source].append(chunk)
            else:
                by_source["documentation"].append(chunk)

        # Sort each by score
        for source in by_source:
            by_source[source].sort(key=lambda c: c.score, reverse=True)

        # Interleave: policy first, then code, then docs
        result = []

        # Take top policy chunks
        result.extend(by_source["policy"][:3])

        # Take top code chunks
        result.extend(by_source["code"][:5])

        # Take top doc chunks
        result.extend(by_source["documentation"][:3])

        # Deduplicate by content similarity
        seen_content = set()
        deduplicated = []
        for chunk in result:
            content_key = chunk.content[:100].strip().lower()
            if content_key not in seen_content:
                seen_content.add(content_key)
                deduplicated.append(chunk)

        return deduplicated

    def _build_synthesis_context(self, chunks: list[RetrievedChunk]) -> str:
        """Build context text for synthesis."""
        sections = {"policy": [], "code": [], "documentation": []}

        for chunk in chunks:
            source = chunk.source if chunk.source in sections else "documentation"
            sections[source].append(chunk)

        parts = []

        if sections["policy"]:
            parts.append("## Applicable Rules and Policies")
            for chunk in sections["policy"]:
                rule_name = chunk.metadata.get("rule_name", "Policy")
                parts.append(f"### {rule_name}")
                parts.append(chunk.content[:500])

        if sections["code"]:
            parts.append("\n## Relevant Code Context")
            for chunk in sections["code"]:
                file_path = chunk.metadata.get("file_path", "Unknown file")
                parts.append(f"### {file_path}")
                parts.append(chunk.content[:500])

        if sections["documentation"]:
            parts.append("\n## Supporting Documentation")
            for chunk in sections["documentation"]:
                title = chunk.metadata.get("title", "Document")
                parts.append(f"### {title}")
                parts.append(chunk.content[:500])

        return "\n\n".join(parts)

    def _generate_synthesis(
        self,
        context: AgentContext,
        chunks: list[RetrievedChunk],
        context_text: str,
    ) -> str:
        """Generate synthesis content."""
        if not self.llm_client:
            # Generate basic synthesis without LLM
            return self._generate_basic_synthesis(chunks)

        # TODO: Implement LLM-based synthesis
        return self._generate_basic_synthesis(chunks)

    def _generate_basic_synthesis(self, chunks: list[RetrievedChunk]) -> str:
        """Generate basic synthesis without LLM."""
        parts = ["## Review Context Summary\n"]

        # Count by source
        source_counts = {}
        for chunk in chunks:
            source_counts[chunk.source] = source_counts.get(chunk.source, 0) + 1

        parts.append(f"Analyzed context from {len(chunks)} sources:")
        for source, count in sorted(source_counts.items()):
            parts.append(f"- {source.title()}: {count} relevant chunks")

        # Key references
        if chunks:
            parts.append("\n### Key References:")
            for chunk in chunks[:5]:
                ref_name = (
                    chunk.metadata.get("rule_name")
                    or chunk.metadata.get("file_path")
                    or chunk.metadata.get("title")
                    or chunk.source
                )
                parts.append(f"- [{chunk.source}] {ref_name} (score: {chunk.score:.2f})")

        return "\n".join(parts)

    def _combine_findings(self, context: AgentContext) -> list[dict[str, Any]]:
        """Combine findings from all agents."""
        # This would combine findings from context.metadata
        # which would be populated by previous agent results
        return context.metadata.get("all_findings", [])

    def _calculate_overall_confidence(self, chunks: list[RetrievedChunk]) -> float:
        """Calculate overall synthesis confidence."""
        if not chunks:
            return 0.0

        # Base on chunk coverage and scores
        avg_score = sum(c.score for c in chunks) / len(chunks)

        # Bonus for having multiple source types
        source_types = {c.source for c in chunks}
        diversity_bonus = min(0.2, len(source_types) * 0.07)

        return min(1.0, avg_score * 0.8 + diversity_bonus)

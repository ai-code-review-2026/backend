"""Policy and Rules RAG Agent.

Retrieves and processes organization-level rules and policies.
Specializes in:
- Security policies
- Coding standards
- Style guidelines
- Compliance requirements
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


class PolicyRulesAgent(BaseRAGAgent):
    """Agent specialized in organization rules and policies.

    This agent:
    1. Retrieves rules from org_rules collection
    2. Provides policy-based context for compliance checking
    3. Ensures code review follows organization standards
    """

    agent_type = AgentType.POLICY_RULES

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self._enabled = settings.RAG_AGENT_POLICY_RULES_ENABLED

    def should_run(self, context: AgentContext) -> bool:
        """Run for security and policy-related checks."""
        if not self._enabled:
            return False

        # Always run if org_id is set (organization has rules)
        if context.org_id:
            return True

        if context.query:
            policy_keywords = {
                "security", "policy", "rule", "standard", "guideline",
                "compliance", "convention", "style", "lint", "check",
                "forbidden", "required", "must", "should not"
            }
            query_lower = context.query.lower()
            return any(kw in query_lower for kw in policy_keywords)

        # Run for PR/commit analysis to check compliance
        if context.diff_text or context.changed_files:
            return True

        return False

    async def retrieve(self, context: AgentContext) -> list[RetrievedChunk]:
        """Retrieve relevant rules and policies."""
        if not self.neo4j_client:
            return []

        chunks: list[RetrievedChunk] = []

        try:
            queries = self._build_policy_queries(context)

            for query_text in queries[:3]:
                results = await self._search_neo4j(
                    query_text=query_text,
                    org_id=context.org_id,
                    limit=context.max_chunks,
                )

                for hit in results:
                    chunk = RetrievedChunk(
                        id=str(hit.get("id", "")),
                        content=hit.get("rule_content", hit.get("content", "")),
                        score=hit.get("score", 0.0),
                        source="policy",
                        metadata={
                            "rule_name": hit.get("rule_name"),
                            "rule_type": hit.get("rule_type"),
                            "severity": hit.get("severity"),
                            "scope": hit.get("scope"),
                            "description": hit.get("description"),
                        },
                    )
                    if chunk.id not in {c.id for c in chunks}:
                        chunks.append(chunk)

            chunks.sort(key=lambda c: c.score, reverse=True)
            return self._truncate_chunks(chunks, context.max_chunks)

        except Exception as e:
            logger.error(f"Policy retrieval failed: {e}")
            return []

    async def process(self, context: AgentContext) -> AgentResult:
        """Process policy context and identify violations."""
        start_time = time.time()

        if not self.should_run(context):
            return self._create_skipped_result("Policy check not needed")

        try:
            chunks = await self.retrieve(context)

            if not chunks:
                return AgentResult(
                    agent_type=self.agent_type,
                    status=AgentStatus.COMPLETED,
                    content="No organization rules configured.",
                    chunks_retrieved=0,
                    confidence=0.5,
                )

            relevant_chunks = self._filter_by_relevance(
                chunks, context.min_relevance_score
            )

            # Extract applicable rules
            applicable_rules = self._extract_applicable_rules(
                chunks=relevant_chunks,
                context=context,
            )

            analysis_content = self._summarize_rules(applicable_rules)

            duration_ms = int((time.time() - start_time) * 1000)

            return AgentResult(
                agent_type=self.agent_type,
                status=AgentStatus.COMPLETED,
                content=analysis_content,
                findings=applicable_rules,
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
            logger.error(f"Policy processing failed: {e}")
            return self._create_error_result(str(e))

    def _build_policy_queries(self, context: AgentContext) -> list[str]:
        """Build policy search queries."""
        queries = []

        if context.query:
            queries.append(context.query)

        # Add queries based on changed file types
        if context.changed_files:
            scopes = set()
            for f in context.changed_files:
                if "test" in f.lower():
                    scopes.add("tests")
                elif f.endswith((".py", ".go", ".java", ".rs")):
                    scopes.add("backend")
                elif f.endswith((".ts", ".tsx", ".js", ".jsx", ".vue")):
                    scopes.add("frontend")
                elif f.endswith((".sql",)):
                    scopes.add("database")
                elif f.endswith((".yml", ".yaml", ".json", ".toml")):
                    scopes.add("config")

            for scope in scopes:
                queries.append(f"{scope} rules policies standards")

        # Always include security rules
        queries.append("security rules policies")

        return queries

    async def _search_neo4j(
        self,
        query_text: str,
        org_id: str | None,
        limit: int,
    ) -> list[dict[str, Any]]:
        """Search Neo4j for policy/rule chunks."""
        if not self.neo4j_client:
            return []

        try:
            results = await asyncio.to_thread(
                self.neo4j_client.vector_search_rules,
                query_text=query_text,
                org_id=org_id,
                limit=limit,
            )
            return results or []
        except Exception as e:
            logger.warning(f"Neo4j rules search failed: {e}")
            return []

    def _extract_applicable_rules(
        self,
        chunks: list[RetrievedChunk],
        context: AgentContext,
    ) -> list[dict[str, Any]]:
        """Extract rules that apply to the current context."""
        applicable = []

        for chunk in chunks:
            rule_type = chunk.metadata.get("rule_type", "other")
            severity = chunk.metadata.get("severity", "WARN")
            scope = chunk.metadata.get("scope", "all")

            applicable.append({
                "rule_id": chunk.id,
                "rule_name": chunk.metadata.get("rule_name"),
                "rule_type": rule_type,
                "severity": severity,
                "scope": scope,
                "description": chunk.metadata.get("description"),
                "content": chunk.content[:500],
                "relevance_score": chunk.score,
            })

        # Sort by severity (BLOCKER > WARN > INFO)
        severity_order = {"BLOCKER": 0, "WARN": 1, "INFO": 2}
        applicable.sort(key=lambda r: severity_order.get(r["severity"], 3))

        return applicable

    def _summarize_rules(self, rules: list[dict[str, Any]]) -> str:
        """Summarize applicable rules."""
        if not rules:
            return "No applicable rules found."

        by_severity = {"BLOCKER": [], "WARN": [], "INFO": []}
        for rule in rules:
            severity = rule.get("severity", "WARN")
            if severity in by_severity:
                by_severity[severity].append(rule.get("rule_name", "Unknown"))

        parts = [f"Found {len(rules)} applicable rules:"]

        if by_severity["BLOCKER"]:
            parts.append(f"- BLOCKER: {', '.join(by_severity['BLOCKER'][:3])}")
        if by_severity["WARN"]:
            parts.append(f"- WARNING: {', '.join(by_severity['WARN'][:3])}")
        if by_severity["INFO"]:
            parts.append(f"- INFO: {', '.join(by_severity['INFO'][:3])}")

        return "\n".join(parts)

    def _calculate_confidence(self, chunks: list[RetrievedChunk]) -> float:
        """Calculate confidence in policy coverage."""
        if not chunks:
            return 0.0

        avg_score = sum(c.score for c in chunks) / len(chunks)

        # Higher confidence if we have rules from multiple types
        rule_types = {c.metadata.get("rule_type") for c in chunks}
        type_coverage = min(1.0, len(rule_types) / 4)

        return min(1.0, avg_score * 0.5 + type_coverage * 0.5)

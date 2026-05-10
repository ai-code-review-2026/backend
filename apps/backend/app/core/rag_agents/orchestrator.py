"""RAG Agent Orchestrator.

Coordinates the execution of multiple RAG agents and manages their lifecycle.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from app.core.rag_agents.base_agent import (
    AgentContext,
    AgentResult,
    AgentStatus,
    AgentType,
    BaseRAGAgent,
)
from app.core.rag_agents.code_context_agent import CodeContextAgent
from app.core.rag_agents.documentation_agent import DocumentationAgent
from app.core.rag_agents.policy_rules_agent import PolicyRulesAgent
from app.core.rag_agents.synthesis_agent import SynthesisAgent
from app.settings import settings

if TYPE_CHECKING:
    from app.integrations.graph_database.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)


@dataclass
class OrchestratorResult:
    """Result from the orchestrator's execution."""

    success: bool
    synthesis_result: AgentResult | None = None
    agent_results: dict[AgentType, AgentResult] = field(default_factory=dict)
    total_duration_ms: int = 0
    agents_executed: int = 0
    agents_skipped: int = 0
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "success": self.success,
            "synthesis": self.synthesis_result.to_dict() if self.synthesis_result else None,
            "agents": {
                k.value: v.to_dict() for k, v in self.agent_results.items()
            },
            "total_duration_ms": self.total_duration_ms,
            "agents_executed": self.agents_executed,
            "agents_skipped": self.agents_skipped,
            "error": self.error,
        }


class RAGOrchestrator:
    """Orchestrator for coordinating RAG agents.

    The orchestrator:
    1. Determines which agents should run for a given context
    2. Executes agents in parallel when possible
    3. Passes results to the synthesis agent for final output
    4. Manages timeouts and error handling
    """

    def __init__(
        self,
        *,
        neo4j_client: Neo4jClient | None = None,
        llm_client: object | None = None,
    ):
        self.neo4j_client = neo4j_client
        self.llm_client = llm_client

        # Initialize agents
        self._agents: dict[AgentType, BaseRAGAgent] = {
            AgentType.CODE_CONTEXT: CodeContextAgent(
                neo4j_client=neo4j_client,
                llm_client=llm_client,
            ),
            AgentType.DOCUMENTATION: DocumentationAgent(
                neo4j_client=neo4j_client,
                llm_client=llm_client,
            ),
            AgentType.POLICY_RULES: PolicyRulesAgent(
                neo4j_client=neo4j_client,
                llm_client=llm_client,
            ),
            AgentType.SYNTHESIS: SynthesisAgent(
                neo4j_client=neo4j_client,
                llm_client=llm_client,
            ),
        }

        self._enabled = settings.RAG_AGENTS_ENABLED
        self._parallel = settings.RAG_ORCHESTRATOR_PARALLEL_AGENTS
        self._max_agents = settings.RAG_ORCHESTRATOR_MAX_AGENTS_PER_QUERY
        self._timeout = settings.RAG_ORCHESTRATOR_TIMEOUT_SECONDS

    @property
    def enabled(self) -> bool:
        return self._enabled

    async def execute(self, context: AgentContext) -> OrchestratorResult:
        """Execute the RAG agent pipeline.

        Args:
            context: The context for agent execution

        Returns:
            OrchestratorResult with all agent outputs
        """
        start_time = time.time()

        if not self._enabled:
            return OrchestratorResult(
                success=False,
                error="RAG agents are disabled",
            )

        try:
            # Determine which agents to run
            agents_to_run = self._select_agents(context)

            logger.info(
                f"Orchestrating {len(agents_to_run)} agents for repo {context.repo_id}"
            )

            # Execute retrieval agents (not synthesis)
            retrieval_agents = [
                a for a in agents_to_run if a != AgentType.SYNTHESIS
            ]

            if self._parallel:
                results = await self._execute_parallel(retrieval_agents, context)
            else:
                results = await self._execute_sequential(retrieval_agents, context)

            # Update context with retrieved chunks for synthesis
            enriched_context = self._enrich_context_for_synthesis(context, results)

            # Run synthesis agent
            synthesis_result = None
            if AgentType.SYNTHESIS in agents_to_run:
                synthesis_agent = self._agents[AgentType.SYNTHESIS]
                synthesis_result = await synthesis_agent.process(enriched_context)
                results[AgentType.SYNTHESIS] = synthesis_result

            # Calculate metrics
            total_duration = int((time.time() - start_time) * 1000)
            executed = sum(
                1 for r in results.values()
                if r.status == AgentStatus.COMPLETED
            )
            skipped = sum(
                1 for r in results.values()
                if r.status == AgentStatus.SKIPPED
            )

            return OrchestratorResult(
                success=True,
                synthesis_result=synthesis_result,
                agent_results=results,
                total_duration_ms=total_duration,
                agents_executed=executed,
                agents_skipped=skipped,
            )

        except asyncio.TimeoutError:
            return OrchestratorResult(
                success=False,
                error=f"Orchestration timed out after {self._timeout}s",
            )
        except Exception as e:
            logger.error(f"Orchestration failed: {e}")
            return OrchestratorResult(
                success=False,
                error=str(e),
            )

    def _select_agents(self, context: AgentContext) -> list[AgentType]:
        """Select which agents should run for the given context."""
        selected = []

        # Always consider core agents
        for agent_type, agent in self._agents.items():
            if agent.should_run(context):
                selected.append(agent_type)

        # Ensure synthesis runs last if other agents run
        synthesis_in_list = AgentType.SYNTHESIS in selected
        if synthesis_in_list:
            selected.remove(AgentType.SYNTHESIS)

        # Limit number of agents
        selected = selected[:self._max_agents]

        # Add synthesis back
        if synthesis_in_list and len(selected) > 0:
            selected.append(AgentType.SYNTHESIS)

        return selected

    async def _execute_parallel(
        self,
        agent_types: list[AgentType],
        context: AgentContext,
    ) -> dict[AgentType, AgentResult]:
        """Execute agents in parallel."""
        async def run_agent(agent_type: AgentType) -> tuple[AgentType, AgentResult]:
            agent = self._agents[agent_type]
            try:
                result = await asyncio.wait_for(
                    agent.process(context),
                    timeout=self._timeout,
                )
                return agent_type, result
            except asyncio.TimeoutError:
                return agent_type, AgentResult(
                    agent_type=agent_type,
                    status=AgentStatus.FAILED,
                    error="Agent timed out",
                )
            except Exception as e:
                return agent_type, AgentResult(
                    agent_type=agent_type,
                    status=AgentStatus.FAILED,
                    error=str(e),
                )

        tasks = [run_agent(at) for at in agent_types]
        results = await asyncio.gather(*tasks)

        return dict(results)

    async def _execute_sequential(
        self,
        agent_types: list[AgentType],
        context: AgentContext,
    ) -> dict[AgentType, AgentResult]:
        """Execute agents sequentially."""
        results = {}

        for agent_type in agent_types:
            agent = self._agents[agent_type]
            try:
                result = await asyncio.wait_for(
                    agent.process(context),
                    timeout=self._timeout,
                )
                results[agent_type] = result
            except asyncio.TimeoutError:
                results[agent_type] = AgentResult(
                    agent_type=agent_type,
                    status=AgentStatus.FAILED,
                    error="Agent timed out",
                )
            except Exception as e:
                results[agent_type] = AgentResult(
                    agent_type=agent_type,
                    status=AgentStatus.FAILED,
                    error=str(e),
                )

        return results

    def _enrich_context_for_synthesis(
        self,
        context: AgentContext,
        results: dict[AgentType, AgentResult],
    ) -> AgentContext:
        """Enrich context with results from other agents for synthesis."""
        # Collect chunks from each agent
        code_chunks = []
        doc_chunks = []
        rule_chunks = []
        all_findings = []

        for agent_type, result in results.items():
            if result.status != AgentStatus.COMPLETED:
                continue

            for citation in result.citations:
                chunk_dict = citation.to_dict()

                if agent_type == AgentType.CODE_CONTEXT:
                    code_chunks.append(chunk_dict)
                elif agent_type == AgentType.DOCUMENTATION:
                    doc_chunks.append(chunk_dict)
                elif agent_type == AgentType.POLICY_RULES:
                    rule_chunks.append(chunk_dict)

            all_findings.extend(result.findings)

        # Create enriched context
        return AgentContext(
            repo_id=context.repo_id,
            org_id=context.org_id,
            analysis_id=context.analysis_id,
            commit_sha=context.commit_sha,
            pr_number=context.pr_number,
            query=context.query,
            diff_text=context.diff_text,
            changed_files=context.changed_files,
            code_chunks=code_chunks,
            doc_chunks=doc_chunks,
            rule_chunks=rule_chunks,
            project_profile=context.project_profile,
            max_chunks=context.max_chunks,
            min_relevance_score=context.min_relevance_score,
            include_citations=context.include_citations,
            metadata={
                **context.metadata,
                "all_findings": all_findings,
            },
        )

    async def query(
        self,
        repo_id: str,
        query: str,
        *,
        org_id: str | None = None,
        agents: list[str] | None = None,
    ) -> OrchestratorResult:
        """Execute a query across specified or all agents.

        Args:
            repo_id: Repository identifier
            query: The query to process
            org_id: Optional organization ID
            agents: Optional list of agent types to use

        Returns:
            OrchestratorResult with query results
        """
        context = AgentContext(
            repo_id=repo_id,
            org_id=org_id,
            query=query,
        )

        # Filter agents if specified
        if agents:
            for agent_type in list(self._agents.keys()):
                if agent_type.value not in agents and agent_type != AgentType.SYNTHESIS:
                    self._agents[agent_type]._enabled = False

        try:
            return await self.execute(context)
        finally:
            # Re-enable agents
            for agent in self._agents.values():
                agent._enabled = True

    async def analyze_diff(
        self,
        repo_id: str,
        diff_text: str,
        changed_files: list[str],
        *,
        org_id: str | None = None,
        analysis_id: str | None = None,
        commit_sha: str | None = None,
        pr_number: int | None = None,
    ) -> OrchestratorResult:
        """Analyze a diff with full agent pipeline.

        Args:
            repo_id: Repository identifier
            diff_text: The unified diff text
            changed_files: List of changed file paths
            org_id: Optional organization ID
            analysis_id: Optional analysis ID
            commit_sha: Optional commit SHA
            pr_number: Optional PR number

        Returns:
            OrchestratorResult with analysis results
        """
        context = AgentContext(
            repo_id=repo_id,
            org_id=org_id,
            analysis_id=analysis_id,
            commit_sha=commit_sha,
            pr_number=pr_number,
            diff_text=diff_text,
            changed_files=changed_files,
        )

        return await self.execute(context)

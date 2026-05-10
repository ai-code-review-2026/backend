"""
Agent dispatcher - routes review requests to appropriate specialized agents.

Intelligently determines which agents should analyze the code changes
based on file types, code patterns, and complexity metrics.

Executes agents in parallel for efficiency.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.agents.base_agent import Finding, ReviewContext
from app.agents.security_agent import get_security_agent
from app.agents.performance_agent import get_performance_agent
from app.agents.cleancode_agent import get_cleancode_agent
from app.agents.architecture_agent import get_architecture_agent
from app.agents.devops_agent import get_devops_agent
from app.agents.testing_agent import get_testing_agent

logger = logging.getLogger(__name__)


class AgentDispatcher:
    """
    Intelligent dispatcher for code review agents.
    
    Determines which agents should analyze the code changes
    and executes them in parallel.
    """
    
    def __init__(self):
        # Initialize all agents
        self.security_agent = get_security_agent()
        self.performance_agent = get_performance_agent()
        self.cleancode_agent = get_cleancode_agent()
        self.architecture_agent = get_architecture_agent()
        self.devops_agent = get_devops_agent()
        self.testing_agent = get_testing_agent()
        
        self.all_agents = [
            self.security_agent,
            self.performance_agent,
            self.cleancode_agent,
            self.architecture_agent,
            self.devops_agent,
            self.testing_agent,
        ]
    
    async def dispatch(
        self,
        diff_content: str,
        context: ReviewContext,
    ) -> list[Finding]:
        """
        Dispatch review to appropriate agents.
        
        Strategy:
        1. Analyze diff to determine applicable agents
        2. Execute applicable agents in parallel
        3. Combine findings from all agents
        4. Deduplicate similar findings
        
        Args:
            diff_content: Unified diff content
            context: Review context
        
        Returns:
            Combined list of findings from all agents
        """
        logger.info("Starting multi-agent review dispatch")
        
        # Step 1: Determine which agents should run
        applicable_agents = self._select_agents(diff_content, context)
        
        if not applicable_agents:
            logger.warning("No agents selected for review")
            return []
        
        logger.info(
            f"Selected {len(applicable_agents)} agents: "
            f"{', '.join(agent.agent_id for agent in applicable_agents)}"
        )
        
        # Step 2: Execute agents in parallel
        tasks = [
            agent.analyze(diff_content, context)
            for agent in applicable_agents
        ]
        
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:
            logger.error(f"Agent execution failed: {e}", exc_info=True)
            return []
        
        # Step 3: Combine findings
        all_findings: list[Finding] = []
        
        for agent, result in zip(applicable_agents, results):
            if isinstance(result, Exception):
                logger.error(f"Agent {agent.agent_id} failed: {result}")
                continue
            
            if isinstance(result, list):
                all_findings.extend(result)
                logger.info(f"Agent {agent.agent_id} found {len(result)} issues")
        
        # Step 4: Deduplicate findings
        deduplicated = self._deduplicate_findings(all_findings)
        
        logger.info(
            f"Multi-agent review complete: {len(deduplicated)} findings "
            f"(deduplicated from {len(all_findings)})"
        )
        
        return deduplicated
    
    def _select_agents(
        self,
        diff_content: str,
        context: ReviewContext,
    ) -> list:
        """
        Select which agents should analyze the code changes.
        
        Selection criteria:
        1. File types (e.g., Dockerfile → DevOps agent)
        2. Code patterns (e.g., SQL queries → Security + Performance agents)
        3. Change type (e.g., new tests → Testing agent)
        4. Always run: Security, CleanCode (apply to all changes)
        
        Args:
            diff_content: Unified diff content
            context: Review context
        
        Returns:
            List of agents that should analyze the changes
        """
        selected = []
        
        # Security and CleanCode agents always run
        selected.extend([self.security_agent, self.cleancode_agent])
        
        # Analyze file types and patterns
        changed_files_lower = " ".join(context.changed_files).lower()
        diff_lower = diff_content.lower()
        
        # DevOps agent: Infrastructure files
        devops_patterns = [
            "dockerfile", "docker-compose", ".yml", ".yaml",
            ".github", "ci", "cd", "kubernetes", "k8s",
            "terraform", "helm", "nginx", "prometheus",
        ]
        if any(pattern in changed_files_lower or pattern in diff_lower for pattern in devops_patterns):
            selected.append(self.devops_agent)
        
        # Performance agent: Performance-sensitive code
        performance_patterns = [
            "query", "select", "database", "sql",
            "loop", "for ", "while ",
            "async", "await",
            "cache", "redis",
            "request", "http", "fetch",
        ]
        if any(pattern in diff_lower for pattern in performance_patterns):
            selected.append(self.performance_agent)
        
        # Architecture agent: Structural changes
        architecture_patterns = [
            "import ", "from ",
            "class ", "interface ",
            "service", "repository", "controller",
            "factory", "builder", "singleton",
        ]
        if any(pattern in diff_lower for pattern in architecture_patterns):
            selected.append(self.architecture_agent)
        
        # Testing agent: Test files or new code
        test_patterns = [
            "test_", "_test", ".test.", ".spec.",
            "pytest", "jest", "mocha",
            "assert", "expect",
        ]
        has_test_files = any(pattern in changed_files_lower for pattern in test_patterns)
        has_new_functions = "+def " in diff_content or "+function " in diff_content or "+class " in diff_content
        
        if has_test_files or has_new_functions:
            selected.append(self.testing_agent)
        
        return selected
    
    def _deduplicate_findings(self, findings: list[Finding]) -> list[Finding]:
        """
        Deduplicate similar findings from different agents.
        
        Two findings are considered duplicates if they:
        1. Point to the same file and line
        2. Have similar messages (fuzzy match)
        3. Have the same severity
        
        When duplicates are found:
        - Keep the one from the more specialized agent
        - Merge evidence from both
        
        Args:
            findings: List of findings from all agents
        
        Returns:
            Deduplicated list of findings
        """
        if not findings:
            return []
        
        # Agent priority (more specialized = higher priority)
        agent_priority = {
            "security_agent": 6,
            "performance_agent": 5,
            "testing_agent": 4,
            "architecture_agent": 3,
            "devops_agent": 2,
            "cleancode_agent": 1,
        }
        
        deduplicated: dict[str, Finding] = {}
        
        for finding in findings:
            # Create key for deduplication
            key = f"{finding.file_path}:{finding.line}:{finding.severity}"
            
            if key in deduplicated:
                # Check if messages are similar
                existing = deduplicated[key]
                
                if self._are_messages_similar(existing.message, finding.message):
                    # Keep the one from higher priority agent
                    existing_priority = agent_priority.get(existing.agent_id, 0)
                    new_priority = agent_priority.get(finding.agent_id, 0)
                    
                    if new_priority > existing_priority:
                        # Merge evidence
                        finding.evidence.update(existing.evidence)
                        deduplicated[key] = finding
                    else:
                        # Keep existing, but merge evidence
                        existing.evidence.update(finding.evidence)
                else:
                    # Different messages, keep both with unique keys
                    unique_key = f"{key}:{finding.agent_id}"
                    deduplicated[unique_key] = finding
            else:
                deduplicated[key] = finding
        
        return list(deduplicated.values())
    
    def _are_messages_similar(self, msg1: str, msg2: str, threshold: float = 0.7) -> bool:
        """
        Check if two messages are similar using simple word overlap.
        
        Args:
            msg1: First message
            msg2: Second message
            threshold: Similarity threshold (0.0-1.0)
        
        Returns:
            True if messages are similar
        """
        # Simple word-based similarity
        words1 = set(msg1.lower().split())
        words2 = set(msg2.lower().split())
        
        if not words1 or not words2:
            return False
        
        intersection = words1 & words2
        union = words1 | words2
        
        similarity = len(intersection) / len(union)
        return similarity >= threshold


# Singleton instance
_dispatcher_instance: AgentDispatcher | None = None


def get_dispatcher() -> AgentDispatcher:
    """Get singleton dispatcher instance."""
    global _dispatcher_instance
    if _dispatcher_instance is None:
        _dispatcher_instance = AgentDispatcher()
    return _dispatcher_instance


async def dispatch_review(
    diff_content: str,
    changed_files: list[str],
    project_type: str | None = None,
    repository_path: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> list[Finding]:
    """
    Dispatch code review to specialized agents.
    
    Convenience function for triggering multi-agent review.
    
    Args:
        diff_content: Unified diff content
        changed_files: List of changed file paths
        project_type: Type of project (e.g., python, typescript)
        repository_path: Path to repository
        metadata: Additional metadata
    
    Returns:
        List of findings from all agents
    """
    context = ReviewContext(
        diff_content=diff_content,
        changed_files=changed_files,
        project_type=project_type,
        repository_path=repository_path,
        metadata=metadata or {},
    )
    
    dispatcher = get_dispatcher()
    return await dispatcher.dispatch(diff_content, context)

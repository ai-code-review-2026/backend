"""RAG Agents Module.

This module provides a multi-agent RAG system for intelligent code review.
It includes:
- Base agent class for common functionality
- Specialized agents (Code Context, Documentation, Policy/Rules, Synthesis)
- Orchestrator for coordinating agent execution
"""

from app.core.rag_agents.base_agent import BaseRAGAgent, AgentResult, AgentContext
from app.core.rag_agents.orchestrator import RAGOrchestrator
from app.core.rag_agents.code_context_agent import CodeContextAgent
from app.core.rag_agents.documentation_agent import DocumentationAgent
from app.core.rag_agents.policy_rules_agent import PolicyRulesAgent
from app.core.rag_agents.synthesis_agent import SynthesisAgent

__all__ = [
    "BaseRAGAgent",
    "AgentResult",
    "AgentContext",
    "RAGOrchestrator",
    "CodeContextAgent",
    "DocumentationAgent",
    "PolicyRulesAgent",
    "SynthesisAgent",
]

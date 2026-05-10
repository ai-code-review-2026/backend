"""
Analysis Domain - Core Orchestration

This module coordinates the complete analysis pipeline across microservices:
- Context service (repository indexing)
- Knowledge base service (admin rules & documents)
- Retrieval service (hybrid GraphRAG)
- Generation service (LLM orchestration)
- Static analysis service (existing tools)

Architecture: Microservices-based, event-driven
"""

from app.core.analysis.orchestrator import AnalysisOrchestrator

__all__ = ["AnalysisOrchestrator"]

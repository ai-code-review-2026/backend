"""Base RAG Agent class.

Provides common functionality for all specialized RAG agents.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import TYPE_CHECKING, Any, Sequence

if TYPE_CHECKING:
    from app.integrations.graph_database.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)


class AgentType(str, Enum):
    """Types of RAG agents."""

    CODE_CONTEXT = "code_context"
    DOCUMENTATION = "documentation"
    POLICY_RULES = "policy_rules"
    SYNTHESIS = "synthesis"


class AgentStatus(str, Enum):
    """Status of agent execution."""

    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class AgentContext:
    """Context passed to agents for processing.

    Contains all the information an agent needs to perform its task.
    """

    # Request identification
    repo_id: str
    org_id: str | None = None
    analysis_id: str | None = None
    commit_sha: str | None = None
    pr_number: int | None = None

    # Query/Task information
    query: str | None = None  # For query-based operations
    diff_text: str | None = None  # For diff-based analysis
    changed_files: list[str] = field(default_factory=list)

    # Retrieved context (populated by retrieval)
    code_chunks: list[dict[str, Any]] = field(default_factory=list)
    doc_chunks: list[dict[str, Any]] = field(default_factory=list)
    rule_chunks: list[dict[str, Any]] = field(default_factory=list)

    # Project profile (if available)
    project_profile: dict[str, Any] | None = None

    # Execution parameters
    max_chunks: int = 10
    min_relevance_score: float = 0.5
    include_citations: bool = True

    # Metadata
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class RetrievedChunk:
    """A chunk retrieved from the vector store."""

    id: str
    content: str
    score: float
    source: str  # code, documentation, policy
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "score": self.score,
            "source": self.source,
            "metadata": self.metadata,
        }


@dataclass
class AgentResult:
    """Result from an agent's processing."""

    agent_type: AgentType
    status: AgentStatus
    content: str | None = None
    findings: list[dict[str, Any]] = field(default_factory=list)
    citations: list[RetrievedChunk] = field(default_factory=list)
    error: str | None = None

    # Execution metrics
    duration_ms: int = 0
    chunks_retrieved: int = 0
    chunks_used: int = 0

    # Confidence and relevance
    confidence: float = 0.0
    relevance_score: float = 0.0

    # Metadata
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "agent_type": self.agent_type.value,
            "status": self.status.value,
            "content": self.content,
            "findings": self.findings,
            "citations": [c.to_dict() for c in self.citations],
            "error": self.error,
            "duration_ms": self.duration_ms,
            "chunks_retrieved": self.chunks_retrieved,
            "chunks_used": self.chunks_used,
            "confidence": self.confidence,
            "relevance_score": self.relevance_score,
            "metadata": self.metadata,
        }


class BaseRAGAgent(ABC):
    """Base class for all RAG agents.

    Each agent is responsible for:
    1. Retrieving relevant chunks from its designated collection(s)
    2. Processing the context to generate findings/content
    3. Providing citations for grounded output
    """

    agent_type: AgentType

    def __init__(
        self,
        *,
        neo4j_client: Neo4jClient | None = None,
        llm_client: object | None = None,  # LLM integration
    ):
        self.neo4j_client = neo4j_client
        self.llm_client = llm_client
        self._enabled = True

    @property
    def enabled(self) -> bool:
        return self._enabled

    def disable(self, reason: str) -> None:
        """Disable the agent."""
        logger.warning(f"Disabling {self.agent_type.value} agent: {reason}")
        self._enabled = False

    @abstractmethod
    async def process(self, context: AgentContext) -> AgentResult:
        """Process the context and generate results.

        Args:
            context: The context containing all necessary information

        Returns:
            AgentResult with findings, content, and citations
        """
        pass

    @abstractmethod
    async def retrieve(self, context: AgentContext) -> list[RetrievedChunk]:
        """Retrieve relevant chunks for this agent's domain.

        Args:
            context: The context containing query/diff information

        Returns:
            List of relevant chunks sorted by relevance
        """
        pass

    def should_run(self, context: AgentContext) -> bool:
        """Determine if this agent should run for the given context.

        Override in subclasses for specialized logic.
        """
        return self._enabled

    def _create_error_result(self, error: str) -> AgentResult:
        """Create an error result."""
        return AgentResult(
            agent_type=self.agent_type,
            status=AgentStatus.FAILED,
            error=error,
        )

    def _create_skipped_result(self, reason: str) -> AgentResult:
        """Create a skipped result."""
        return AgentResult(
            agent_type=self.agent_type,
            status=AgentStatus.SKIPPED,
            metadata={"skip_reason": reason},
        )

    def _filter_by_relevance(
        self,
        chunks: list[RetrievedChunk],
        min_score: float,
    ) -> list[RetrievedChunk]:
        """Filter chunks by minimum relevance score."""
        return [c for c in chunks if c.score >= min_score]

    def _truncate_chunks(
        self,
        chunks: list[RetrievedChunk],
        max_chunks: int,
    ) -> list[RetrievedChunk]:
        """Truncate to maximum number of chunks."""
        return chunks[:max_chunks]

    def _build_context_text(self, chunks: list[RetrievedChunk]) -> str:
        """Build a context string from chunks for LLM input."""
        if not chunks:
            return ""

        parts = []
        for i, chunk in enumerate(chunks, 1):
            source_info = f"[Source {i}: {chunk.source}]"
            if chunk.metadata.get("file_path"):
                source_info += f" ({chunk.metadata['file_path']})"
            parts.append(f"{source_info}\n{chunk.content}")

        return "\n\n---\n\n".join(parts)

"""
Knowledge Base Management

Handles ingestion, indexing, and retrieval of admin-uploaded knowledge:
- Best practices documents (markdown, PDF)
- Coding standards and style guides
- Architectural decision records (ADRs)
- Bug patterns and anti-patterns
- Security rules and compliance docs
- Jira tickets and issue history
- External documentation

KB content has PRIORITY over repository context in analysis generation.
"""

from .ingestion import KnowledgeBaseIngestionService, KBDocument, KBDocumentType
from .rules_engine import RulesEngine, Rule, RuleType, RuleSeverity

__all__ = [
    "KnowledgeBaseIngestionService",
    "KBDocument",
    "KBDocumentType",
    "RulesEngine",
    "Rule",
    "RuleType",
    "RuleSeverity",
]

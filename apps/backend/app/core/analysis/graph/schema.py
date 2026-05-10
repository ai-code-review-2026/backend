"""
Neo4j Graph Schema for Code Analysis Platform

Complete schema for:
- Code entities (Repository, File, Module, Class, Function, Chunk)
- Knowledge base entities (Rule, Document, Ticket, DesignPattern)
- Analysis entities (AnalysisRun, Finding, Comment, Suggestion)
- Relationships (code dependencies, KB links, analysis traces)

Design rationale:
- Scalable for large repositories (100K+ files)
- Efficient traversal for multi-hop queries
- Rich metadata for context retrieval
- Temporal tracking for incremental updates
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class NodeType(str, Enum):
    """All node types in the graph."""
    
    # Domain entities
    ORGANIZATION = "Organization"
    PROJECT = "Project"
    REPOSITORY = "Repository"
    
    # Code entities
    FILE = "File"
    MODULE = "Module"
    CLASS = "Class"
    FUNCTION = "Function"
    CHUNK = "Chunk"
    IMPORT = "Import"
    
    # Knowledge base entities
    RULE = "Rule"
    KNOWLEDGE_DOCUMENT = "KnowledgeDocument"
    TICKET = "Ticket"
    DESIGN_PATTERN = "DesignPattern"
    
    # Analysis entities
    ANALYSIS_RUN = "AnalysisRun"
    FINDING = "Finding"
    COMMENT = "Comment"
    SUGGESTION = "Suggestion"


class RelationType(str, Enum):
    """All relationship types in the graph."""
    
    # Domain relationships
    CONTAINS = "CONTAINS"  # Org -> Project, Project -> Repo, Repo -> File
    BELONGS_TO = "BELONGS_TO"  # Reverse of CONTAINS
    
    # Code relationships
    DEFINES = "DEFINES"  # File -> Class, Class -> Function
    CALLS = "CALLS"  # Function -> Function
    IMPORTS = "IMPORTS"  # File -> File, Module -> Module
    DEPENDS_ON = "DEPENDS_ON"  # Any -> Any (transitive)
    INHERITS_FROM = "INHERITS_FROM"  # Class -> Class
    IMPLEMENTS = "IMPLEMENTS"  # Class -> Interface
    OVERRIDES = "OVERRIDES"  # Function -> Function
    
    # Chunking relationships
    CHUNKED_FROM = "CHUNKED_FROM"  # Chunk -> File/Function/Class
    NEXT_CHUNK = "NEXT_CHUNK"  # Chunk -> Chunk (sequential)
    
    # Knowledge base relationships
    RELATED_TO = "RELATED_TO"  # Generic semantic relation
    SUPPORTS = "SUPPORTS"  # KB -> Code (positive)
    VIOLATES = "VIOLATES"  # Code -> Rule (negative)
    DERIVES_FROM = "DERIVES_FROM"  # Pattern -> Pattern
    EXEMPLIFIES = "EXEMPLIFIES"  # Code -> Pattern
    
    # Analysis relationships
    ANALYZED_BY = "ANALYZED_BY"  # Repo -> AnalysisRun
    HAS_FINDING = "HAS_FINDING"  # AnalysisRun -> Finding
    HAS_COMMENT = "HAS_COMMENT"  # Finding -> Comment
    HAS_SUGGESTION = "HAS_SUGGESTION"  # Comment -> Suggestion
    BASED_ON = "BASED_ON"  # Finding -> Rule/Document
    REFERENCES = "REFERENCES"  # Finding -> Code entity
    TRIGGERED_BY = "TRIGGERED_BY"  # AnalysisRun -> Commit/PR
    
    # History relationships
    HAS_HISTORY = "HAS_HISTORY"  # Repo -> AnalysisRun (temporal)
    PREVIOUS_RUN = "PREVIOUS_RUN"  # AnalysisRun -> AnalysisRun
    UPDATED_IN = "UPDATED_IN"  # Code -> AnalysisRun (incremental)


@dataclass(frozen=True)
class NodeSchema:
    """Schema definition for a node type."""
    
    node_type: NodeType
    required_properties: list[str]
    optional_properties: list[str]
    indexes: list[str]  # Properties to index
    unique_constraints: list[str]  # Properties with uniqueness constraint


# Complete schema definition
GRAPH_SCHEMA: dict[NodeType, NodeSchema] = {
    NodeType.ORGANIZATION: NodeSchema(
        node_type=NodeType.ORGANIZATION,
        required_properties=["id", "name"],
        optional_properties=["slug", "description", "created_at"],
        indexes=["id", "slug"],
        unique_constraints=["id"],
    ),
    
    NodeType.PROJECT: NodeSchema(
        node_type=NodeType.PROJECT,
        required_properties=["id", "name", "organization_id"],
        optional_properties=["description", "created_at"],
        indexes=["id", "organization_id"],
        unique_constraints=["id"],
    ),
    
    NodeType.REPOSITORY: NodeSchema(
        node_type=NodeType.REPOSITORY,
        required_properties=["id", "repo_path", "project_id"],
        optional_properties=["default_branch", "indexed_commit", "last_indexed_at"],
        indexes=["id", "repo_path", "project_id"],
        unique_constraints=["id"],
    ),
    
    NodeType.FILE: NodeSchema(
        node_type=NodeType.FILE,
        required_properties=["path", "repository_id", "commit_sha"],
        optional_properties=["language", "size_bytes", "last_modified"],
        indexes=["path", "repository_id", "language"],
        unique_constraints=["path", "repository_id", "commit_sha"],
    ),
    
    NodeType.MODULE: NodeSchema(
        node_type=NodeType.MODULE,
        required_properties=["name", "file_path", "repository_id"],
        optional_properties=["docstring", "line_start", "line_end"],
        indexes=["name", "repository_id"],
        unique_constraints=["name", "file_path", "repository_id"],
    ),
    
    NodeType.CLASS: NodeSchema(
        node_type=NodeType.CLASS,
        required_properties=["name", "file_path", "repository_id"],
        optional_properties=["docstring", "line_start", "line_end", "base_classes"],
        indexes=["name", "repository_id"],
        unique_constraints=["name", "file_path", "repository_id", "line_start"],
    ),
    
    NodeType.FUNCTION: NodeSchema(
        node_type=NodeType.FUNCTION,
        required_properties=["name", "file_path", "repository_id"],
        optional_properties=[
            "signature", "docstring", "line_start", "line_end",
            "parent_class", "is_async", "decorators", "complexity"
        ],
        indexes=["name", "repository_id"],
        unique_constraints=["name", "file_path", "repository_id", "line_start"],
    ),
    
    NodeType.CHUNK: NodeSchema(
        node_type=NodeType.CHUNK,
        required_properties=["id", "repository_id", "chunk_type", "content_hash"],
        optional_properties=[
            "file_path", "symbol_name", "line_start", "line_end",
            "language", "chunk_size", "content_preview", "embedding_id", "indexed_at"
        ],
        indexes=["id", "repository_id", "chunk_type", "content_hash"],
        unique_constraints=["id"],
    ),
    
    NodeType.RULE: NodeSchema(
        node_type=NodeType.RULE,
        required_properties=["id", "title", "project_id"],
        optional_properties=[
            "description", "severity", "category", "rule_text",
            "examples", "created_by", "created_at", "is_active"
        ],
        indexes=["id", "project_id", "category"],
        unique_constraints=["id"],
    ),
    
    NodeType.KNOWLEDGE_DOCUMENT: NodeSchema(
        node_type=NodeType.KNOWLEDGE_DOCUMENT,
        required_properties=["id", "title", "project_id"],
        optional_properties=[
            "content", "doc_type", "source_url", "tags",
            "created_by", "created_at", "embedding_id"
        ],
        indexes=["id", "project_id", "doc_type"],
        unique_constraints=["id"],
    ),
    
    NodeType.TICKET: NodeSchema(
        node_type=NodeType.TICKET,
        required_properties=["id", "key", "project_id"],
        optional_properties=[
            "title", "description", "ticket_type", "status", "priority",
            "created_at", "external_url", "related_code_paths"
        ],
        indexes=["id", "key", "project_id"],
        unique_constraints=["key", "project_id"],
    ),
    
    NodeType.DESIGN_PATTERN: NodeSchema(
        node_type=NodeType.DESIGN_PATTERN,
        required_properties=["id", "name", "project_id"],
        optional_properties=[
            "description", "intent", "applicability", "structure",
            "example_code", "tags", "created_at"
        ],
        indexes=["id", "name", "project_id"],
        unique_constraints=["id"],
    ),
    
    NodeType.ANALYSIS_RUN: NodeSchema(
        node_type=NodeType.ANALYSIS_RUN,
        required_properties=["id", "repository_id", "started_at"],
        optional_properties=[
            "commit_sha", "pr_number", "status", "completed_at",
            "duration_ms", "findings_count", "trigger_type"
        ],
        indexes=["id", "repository_id", "started_at"],
        unique_constraints=["id"],
    ),
    
    NodeType.FINDING: NodeSchema(
        node_type=NodeType.FINDING,
        required_properties=["id", "analysis_run_id", "severity", "category"],
        optional_properties=[
            "file_path", "line_start", "line_end", "message",
            "confidence", "kb_grounded", "graph_context"
        ],
        indexes=["id", "analysis_run_id", "severity"],
        unique_constraints=["id"],
    ),
    
    NodeType.COMMENT: NodeSchema(
        node_type=NodeType.COMMENT,
        required_properties=["id", "finding_id", "message"],
        optional_properties=[
            "explanation", "evidence", "created_at"
        ],
        indexes=["id", "finding_id"],
        unique_constraints=["id"],
    ),
    
    NodeType.SUGGESTION: NodeSchema(
        node_type=NodeType.SUGGESTION,
        required_properties=["id", "comment_id", "suggestion_type"],
        optional_properties=[
            "suggested_code", "confidence", "reasoning", "created_at"
        ],
        indexes=["id", "comment_id"],
        unique_constraints=["id"],
    ),
}


def get_node_schema(node_type: NodeType) -> NodeSchema:
    """Get schema for a node type."""
    return GRAPH_SCHEMA[node_type]


def get_all_node_types() -> list[NodeType]:
    """Get all defined node types."""
    return list(GRAPH_SCHEMA.keys())


def get_all_relationship_types() -> list[RelationType]:
    """Get all defined relationship types."""
    return list(RelationType)

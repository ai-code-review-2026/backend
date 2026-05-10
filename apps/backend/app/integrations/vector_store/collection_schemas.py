"""Qdrant collection schemas for the enhanced RAG system.

This module defines the collection schemas for:
- kb_documents: Knowledge base documents (PDF, Markdown, etc.)
- project_profiles: Comprehensive project profiles
- org_rules: Organization-level rules and policies
- analysis_context: Analysis-specific context for commits/PRs
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class CollectionSchema:
    """Schema definition for a Qdrant collection."""

    name: str
    vector_size: int
    distance: str = "Cosine"
    on_disk: bool = False
    payload_indexes: list[dict[str, str]] = field(default_factory=list)


# Collection Schemas

KB_DOCUMENTS_SCHEMA = CollectionSchema(
    name="kb_documents",
    vector_size=1024,  # mxbai-embed-large
    payload_indexes=[
        {"field_name": "org_id", "field_type": "keyword"},
        {"field_name": "source_type", "field_type": "keyword"},
        {"field_name": "category", "field_type": "keyword"},
        {"field_name": "content_hash", "field_type": "keyword"},
        {"field_name": "tags", "field_type": "keyword"},
    ],
)

PROJECT_PROFILES_SCHEMA = CollectionSchema(
    name="project_profiles",
    vector_size=1024,
    payload_indexes=[
        {"field_name": "repo_id", "field_type": "keyword"},
        {"field_name": "org_id", "field_type": "keyword"},
        {"field_name": "context_version", "field_type": "integer"},
        {"field_name": "main_languages", "field_type": "keyword"},
        {"field_name": "frameworks", "field_type": "keyword"},
        {"field_name": "architecture_pattern", "field_type": "keyword"},
    ],
)

ORG_RULES_SCHEMA = CollectionSchema(
    name="org_rules",
    vector_size=1024,
    payload_indexes=[
        {"field_name": "org_id", "field_type": "keyword"},
        {"field_name": "rule_type", "field_type": "keyword"},
        {"field_name": "severity", "field_type": "keyword"},
        {"field_name": "scope", "field_type": "keyword"},
        {"field_name": "is_active", "field_type": "bool"},
    ],
)

ANALYSIS_CONTEXT_SCHEMA = CollectionSchema(
    name="analysis_context",
    vector_size=1024,
    payload_indexes=[
        {"field_name": "repo_id", "field_type": "keyword"},
        {"field_name": "analysis_id", "field_type": "keyword"},
        {"field_name": "commit_sha", "field_type": "keyword"},
        {"field_name": "pr_number", "field_type": "integer"},
        {"field_name": "context_type", "field_type": "keyword"},
    ],
)


# All schemas for easy iteration
ALL_COLLECTION_SCHEMAS = [
    KB_DOCUMENTS_SCHEMA,
    PROJECT_PROFILES_SCHEMA,
    ORG_RULES_SCHEMA,
    ANALYSIS_CONTEXT_SCHEMA,
]


def get_collection_schema(collection_name: str) -> CollectionSchema | None:
    """Get schema by collection name."""
    for schema in ALL_COLLECTION_SCHEMAS:
        if schema.name == collection_name:
            return schema
    return None


def get_collection_create_body(schema: CollectionSchema) -> dict[str, Any]:
    """Get the body for creating a collection via Qdrant REST API."""
    return {
        "vectors": {
            "size": schema.vector_size,
            "distance": schema.distance,
            "on_disk": schema.on_disk,
        }
    }


def get_payload_index_body(index_def: dict[str, str]) -> dict[str, Any]:
    """Get the body for creating a payload index via Qdrant REST API."""
    field_type = index_def["field_type"]

    # Map to Qdrant types
    type_mapping = {
        "keyword": "keyword",
        "text": "text",
        "integer": "integer",
        "float": "float",
        "bool": "bool",
        "geo": "geo",
        "datetime": "datetime",
    }

    return {
        "field_name": index_def["field_name"],
        "field_schema": type_mapping.get(field_type, "keyword"),
    }

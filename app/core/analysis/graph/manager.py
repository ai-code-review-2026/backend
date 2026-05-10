"""
Graph Manager - High-level Graph Operations

Manages:
- Schema initialization (constraints, indexes)
- Node/relationship creation
- Graph traversal
- Batch operations
- Incremental updates

Design: Service layer over Neo4j client
"""

from __future__ import annotations

import re
import logging
from typing import Any

from app.core.analysis.graph.schema import (
    GRAPH_SCHEMA,
    NodeType,
    RelationType,
    get_node_schema,
)
from app.integrations.graph_database.neo4j_client import get_neo4j_client

logger = logging.getLogger(__name__)


class GraphManager:
    """
    High-level graph operations manager.
    
    Responsibilities:
    - Schema management (constraints, indexes)
    - Node CRUD operations
    - Relationship CRUD operations
    - Batch upserts for performance
    - Graph traversal queries
    - Incremental updates
    
    Design rationale:
    - Abstraction layer over raw Cypher
    - Type-safe operations
    - Batch processing for large updates
    - Optimized for code graph patterns
    """
    
    def __init__(self, neo4j_client: Any | None = None) -> None:
        # Keep compatibility with callers that pass an explicit client.
        self._client = neo4j_client or get_neo4j_client()

    def _sanitize_identifier(self, value: str, *, kind: str) -> str:
        """Allow only alphanumeric + underscore labels/types in dynamic Cypher parts."""
        if not isinstance(value, str) or not re.match(r"^[A-Za-z_][A-Za-z0-9_]*$", value):
            raise ValueError(f"Invalid {kind}: {value!r}")
        return value
    
    def initialize_schema(self) -> None:
        """
        Initialize graph schema: constraints and indexes.
        
        Creates:
        - Unique constraints on node IDs
        - Indexes on frequently queried properties
        - Composite indexes for multi-property lookups
        
        This is idempotent and safe to run multiple times.
        """
        logger.info("Initializing Neo4j schema")
        
        for node_type, schema in GRAPH_SCHEMA.items():
            # Create unique constraints
            for prop in schema.unique_constraints:
                constraint_name = f"{node_type.value.lower()}_{prop}_unique"
                query = f"""
                CREATE CONSTRAINT {constraint_name} IF NOT EXISTS
                FOR (n:{node_type.value})
                REQUIRE n.{prop} IS UNIQUE
                """
                try:
                    self._client.execute_write(query)
                    logger.debug(f"Created constraint: {constraint_name}")
                except Exception as exc:
                    logger.warning(f"Constraint {constraint_name} failed: {exc}")
            
            # Create indexes
            for prop in schema.indexes:
                if prop not in schema.unique_constraints:  # Skip already constrained
                    index_name = f"{node_type.value.lower()}_{prop}_index"
                    query = f"""
                    CREATE INDEX {index_name} IF NOT EXISTS
                    FOR (n:{node_type.value})
                    ON (n.{prop})
                    """
                    try:
                        self._client.execute_write(query)
                        logger.debug(f"Created index: {index_name}")
                    except Exception as exc:
                        logger.warning(f"Index {index_name} failed: {exc}")
        
        logger.info("Neo4j schema initialization complete")
    
    def create_node(
        self,
        node_type: NodeType,
        properties: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Create a node with properties.
        
        Args:
            node_type: Type of node to create
            properties: Node properties (must include required fields)
            
        Returns:
            Created node properties
        """
        schema = get_node_schema(node_type)
        
        # Validate required properties
        missing = set(schema.required_properties) - set(properties.keys())
        if missing:
            raise ValueError(f"Missing required properties for {node_type}: {missing}")
        
        # Build Cypher query
        props_str = ", ".join(f"{k}: ${k}" for k in properties.keys())
        query = f"""
        CREATE (n:{node_type.value} {{{props_str}}})
        RETURN n
        """
        
        result = self._client.execute_query(query, properties)
        if result:
            return dict(result[0]["n"])
        return {}
    
    def upsert_node(
        self,
        node_type: NodeType,
        match_properties: dict[str, Any],
        set_properties: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Create or update a node (MERGE operation).
        
        Args:
            node_type: Type of node
            match_properties: Properties to match on (typically ID)
            set_properties: Properties to set/update
            
        Returns:
            Node properties after upsert
        """
        match_str = ", ".join(f"{k}: ${k}" for k in match_properties.keys())
        set_str = ", ".join(f"n.{k} = ${k}" for k in set_properties.keys())
        
        query = f"""
        MERGE (n:{node_type.value} {{{match_str}}})
        ON CREATE SET {set_str}
        ON MATCH SET {set_str}
        RETURN n
        """
        
        params = {**match_properties, **set_properties}
        result = self._client.execute_query(query, params)
        if result:
            return dict(result[0]["n"])
        return {}
    
    def create_relationship(
        self,
        from_node_type: NodeType,
        from_node_id: str,
        to_node_type: NodeType,
        to_node_id: str,
        relationship_type: RelationType,
        properties: dict[str, Any] | None = None,
    ) -> bool:
        """
        Create a relationship between two nodes.
        
        Args:
            from_node_type: Source node type
            from_node_id: Source node ID
            to_node_type: Target node type
            to_node_id: Target node ID
            relationship_type: Type of relationship
            properties: Optional relationship properties
            
        Returns:
            True if created successfully
        """
        props = properties or {}
        props_str = ", ".join(f"{k}: ${k}" for k in props.keys()) if props else ""
        props_clause = f" {{{props_str}}}" if props_str else ""
        
        query = f"""
        MATCH (a:{from_node_type.value} {{id: $from_id}})
        MATCH (b:{to_node_type.value} {{id: $to_id}})
        MERGE (a)-[r:{relationship_type.value}{props_clause}]->(b)
        RETURN r
        """
        
        params = {"from_id": from_node_id, "to_id": to_node_id, **props}
        result = self._client.execute_query(query, params)
        return len(result) > 0
    
    def batch_upsert_nodes(
        self,
        node_type: NodeType,
        nodes: list[dict[str, Any]],
        match_key: str = "id",
    ) -> int:
        """
        Batch upsert nodes for performance.
        
        Args:
            node_type: Type of nodes
            nodes: List of node property dicts
            match_key: Property to match on (default: id)
            
        Returns:
            Number of nodes upserted
        """
        if not nodes:
            return 0
        
        query = f"""
        UNWIND $nodes AS node
        MERGE (n:{node_type.value} {{{match_key}: node.{match_key}}})
        SET n += node
        RETURN count(n) AS count
        """
        
        result = self._client.execute_query(query, {"nodes": nodes})
        return result[0]["count"] if result else 0
    
    def batch_create_relationships(
        self,
        relationships: list[dict[str, Any]],
    ) -> int:
        """
        Batch create relationships.
        
        Args:
            relationships: List of dicts with:
                - from_type, from_id
                - to_type, to_id
                - rel_type
                - properties (optional)
                
        Returns:
            Number of relationships created
        """
        if not relationships:
            return 0
        
        query = """
        UNWIND $rels AS rel
        MATCH (a {id: rel.from_id})
        MATCH (b {id: rel.to_id})
        CALL apoc.create.relationship(a, rel.rel_type, rel.properties, b)
        YIELD rel AS r
        RETURN count(r) AS count
        """
        
        result = self._client.execute_query(query, {"rels": relationships})
        return result[0]["count"] if result else 0
    
    def find_node(
        self,
        node_type: NodeType,
        properties: dict[str, Any],
    ) -> dict[str, Any] | None:
        """
        Find a single node by properties.
        
        Args:
            node_type: Type of node
            properties: Properties to match
            
        Returns:
            Node properties or None
        """
        where_clause = " AND ".join(f"n.{k} = ${k}" for k in properties.keys())
        query = f"""
        MATCH (n:{node_type.value})
        WHERE {where_clause}
        RETURN n
        LIMIT 1
        """
        
        result = self._client.execute_query(query, properties)
        if result:
            return dict(result[0]["n"])
        return None
    
    def delete_node(
        self,
        node_type: NodeType,
        node_id: str,
        detach: bool = True,
    ) -> bool:
        """
        Delete a node.
        
        Args:
            node_type: Type of node
            node_id: Node ID
            detach: If True, delete relationships too
            
        Returns:
            True if deleted
        """
        detach_clause = "DETACH " if detach else ""
        query = f"""
        MATCH (n:{node_type.value} {{id: $node_id}})
        {detach_clause}DELETE n
        RETURN count(n) AS count
        """
        
        result = self._client.execute_query(query, {"node_id": node_id})
        return result[0]["count"] > 0 if result else False

    async def upsert_node_async(self, label: str, properties: dict[str, Any]) -> dict[str, Any]:
        """Async helper used by history services with dynamic labels."""
        safe_label = self._sanitize_identifier(label, kind="label")
        node_id = properties.get("id")
        if not node_id:
            raise ValueError(f"upsert_node requires an 'id' property for label {safe_label}")

        query = f"""
        MERGE (n:{safe_label} {{id: $id}})
        SET n += $props
        RETURN n
        """
        result = self._client.execute_query(query, {"id": node_id, "props": properties})
        return dict(result[0]["n"]) if result else {}

    async def update_node_async(self, label: str, node_id: str, properties: dict[str, Any]) -> dict[str, Any]:
        safe_label = self._sanitize_identifier(label, kind="label")
        query = f"""
        MATCH (n:{safe_label} {{id: $id}})
        SET n += $props
        RETURN n
        """
        result = self._client.execute_query(query, {"id": node_id, "props": properties})
        return dict(result[0]["n"]) if result else {}

    async def get_node_async(self, label: str, node_id: str) -> dict[str, Any] | None:
        safe_label = self._sanitize_identifier(label, kind="label")
        query = f"""
        MATCH (n:{safe_label} {{id: $id}})
        RETURN n
        LIMIT 1
        """
        result = self._client.execute_query(query, {"id": node_id})
        if not result:
            return None
        return dict(result[0]["n"])

    async def upsert_relationship_async(
        self,
        *,
        from_label: str,
        from_id: str,
        to_label: str,
        to_id: str,
        rel_type: str,
        properties: dict[str, Any] | None = None,
    ) -> bool:
        safe_from_label = self._sanitize_identifier(from_label, kind="label")
        safe_to_label = self._sanitize_identifier(to_label, kind="label")
        safe_rel_type = self._sanitize_identifier(rel_type, kind="relationship type")
        query = f"""
        MATCH (a:{safe_from_label} {{id: $from_id}})
        MATCH (b:{safe_to_label} {{id: $to_id}})
        MERGE (a)-[r:{safe_rel_type}]->(b)
        SET r += $props
        RETURN r
        """
        result = self._client.execute_query(
            query,
            {
                "from_id": from_id,
                "to_id": to_id,
                "props": properties or {},
            },
        )
        return len(result) > 0

    async def query_async(self, cypher: str, parameters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return self._client.execute_query(cypher, parameters or {})

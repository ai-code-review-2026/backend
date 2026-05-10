"""
Graph Visualization API Endpoints

Provides REST API for 3D graph visualization of the knowledge base.
Returns nodes and edges for real-time visualization.
"""

from __future__ import annotations

import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.api.middleware.auth import AuthenticatedPrincipal, require_auth
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/graph", tags=["graph-visualization"])


# ─────────────────────────────────────────────────────────────────────────────
# Request/Response Models
# ─────────────────────────────────────────────────────────────────────────────

class GraphNode(BaseModel):
    """A node in the graph."""
    id: str
    label: str
    type: str  # Repository, File, Chunk, Rule, KnowledgeDocument, etc.
    properties: dict[str, Any] = Field(default_factory=dict)
    size: float = 1.0  # For 3D visualization size
    color: str = "#3b82f6"  # Default blue color


class GraphEdge(BaseModel):
    """An edge in the graph."""
    id: str
    source: str  # node id
    target: str  # node id
    type: str  # CONTAINS, IMPORTS, INHERITS, etc.
    properties: dict[str, Any] = Field(default_factory=dict)
    weight: float = 1.0  # For edge thickness


class GraphDataResponse(BaseModel):
    """Response containing graph data for visualization."""
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    stats: dict[str, Any]


class GraphStatsResponse(BaseModel):
    """Response with graph statistics."""
    total_nodes: int
    total_edges: int
    node_types: dict[str, int]
    edge_types: dict[str, int]


# ─────────────────────────────────────────────────────────────────────────────
# Color mapping for different node types
# ─────────────────────────────────────────────────────────────────────────────

NODE_TYPE_COLORS = {
    "Repository": "#8b5cf6",     # Purple
    "File": "#3b82f6",            # Blue
    "Chunk": "#06b6d4",           # Cyan
    "Rule": "#f59e0b",            # Amber
    "KnowledgeDocument": "#10b981", # Green
    "AnalysisRun": "#ef4444",     # Red
    "Comment": "#ec4899",         # Pink
    "Organization": "#6366f1",    # Indigo
    "Project": "#14b8a6",         # Teal
}

NODE_TYPE_SIZES = {
    "Repository": 3.0,
    "File": 2.0,
    "Chunk": 1.0,
    "Rule": 2.5,
    "KnowledgeDocument": 2.5,
    "AnalysisRun": 1.5,
    "Comment": 1.0,
    "Organization": 4.0,
    "Project": 3.5,
}


# ─────────────────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────────────────

def _get_node_label(node_data: dict[str, Any], node_type: str) -> str:
    """Extract a human-readable label from node data."""
    if node_type == "Repository":
        return node_data.get("repo_path", "Repository")
    elif node_type == "File":
        path = node_data.get("path", "")
        return path.split("/")[-1] if "/" in path else path
    elif node_type == "Chunk":
        return node_data.get("symbol_name") or f"Chunk {node_data.get('chunk_index', '')}"
    elif node_type == "Rule":
        return node_data.get("title", "Rule")
    elif node_type == "KnowledgeDocument":
        return node_data.get("title", "Document")
    elif node_type == "AnalysisRun":
        return f"Analysis {node_data.get('pr_number', '')}"
    elif node_type == "Comment":
        return f"Comment L{node_data.get('line_start', '')}"
    elif node_type == "Organization":
        return node_data.get("name", "Organization")
    elif node_type == "Project":
        return node_data.get("name", "Project")
    else:
        return node_type


def _serialize_node_properties(props: dict[str, Any]) -> dict[str, Any]:
    """Serialize node properties for JSON response."""
    serialized = {}
    for key, value in props.items():
        if key in ("uid", "repo_id", "path", "title", "symbol_name", "category", 
                   "chunk_type", "language", "file_type", "severity", "status"):
            serialized[key] = value
        elif key == "embedding":
            # Don't send full embeddings to frontend (too large)
            serialized["has_embedding"] = bool(value)
        elif isinstance(value, (str, int, float, bool, type(None))):
            serialized[key] = value
    return serialized


# ─────────────────────────────────────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/stats", response_model=GraphStatsResponse)
async def get_graph_stats(
    principal: AuthenticatedPrincipal = Depends(require_auth),
    neo4j: Neo4jClient = Depends(get_neo4j_client),
) -> GraphStatsResponse:
    """
    Get statistics about the knowledge graph.
    
    Returns:
        Graph statistics including node/edge counts by type
    """
    try:
        # Count nodes by type
        node_stats_query = """
        MATCH (n)
        RETURN labels(n)[0] as node_type, count(n) as count
        """
        node_results = neo4j.execute_read(node_stats_query)
        node_types = {
            record["node_type"]: record["count"] 
            for record in node_results
        }
        
        # Count edges by type
        edge_stats_query = """
        MATCH ()-[r]->()
        RETURN type(r) as edge_type, count(r) as count
        """
        edge_results = neo4j.execute_read(edge_stats_query)
        edge_types = {
            record["edge_type"]: record["count"]
            for record in edge_results
        }
        
        total_nodes = sum(node_types.values())
        total_edges = sum(edge_types.values())
        
        return GraphStatsResponse(
            total_nodes=total_nodes,
            total_edges=total_edges,
            node_types=node_types,
            edge_types=edge_types,
        )
        
    except Exception as exc:
        logger.error("Failed to get graph stats: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to retrieve graph statistics")


@router.get("/data", response_model=GraphDataResponse)
async def get_graph_data(
    principal: AuthenticatedPrincipal = Depends(require_auth),
    neo4j: Neo4jClient = Depends(get_neo4j_client),
    limit: int = Query(default=500, ge=1, le=5000, description="Maximum nodes to return"),
    node_types: Optional[str] = Query(default=None, description="Comma-separated node types to include"),
    repo_id: Optional[str] = Query(default=None, description="Filter by repository ID"),
    depth: int = Query(default=2, ge=1, le=5, description="Graph traversal depth"),
) -> GraphDataResponse:
    """
    Get graph data for 3D visualization.
    
    Args:
        limit: Maximum number of nodes to return
        node_types: Filter by node types (e.g., "Repository,File,Chunk")
        repo_id: Filter by specific repository
        depth: How many hops from root nodes to traverse
        
    Returns:
        Nodes and edges for graph visualization
    """
    try:
        # Build node filter
        node_type_filter = ""
        if node_types:
            types_list = [f"'{t.strip()}'" for t in node_types.split(",")]
            node_type_filter = f"WHERE labels(n)[0] IN [{','.join(types_list)}]"
        
        repo_filter = ""
        if repo_id:
            repo_filter = f"{'AND' if node_type_filter else 'WHERE'} (n.repo_id = '{repo_id}' OR n:Repository {{repo_id: '{repo_id}'}})"
        
        # Query nodes
        nodes_query = f"""
        MATCH (n)
        {node_type_filter}
        {repo_filter}
        RETURN n, labels(n)[0] as node_type
        LIMIT {limit}
        """
        
        node_results = neo4j.execute_read(nodes_query)
        
        # Build node map
        nodes_map = {}
        nodes = []
        
        for record in node_results:
            node_data = dict(record["n"])
            node_type = record["node_type"]
            node_id = node_data.get("uid") or node_data.get("repo_id") or str(node_data.get("id", ""))
            
            if not node_id:
                continue
            
            nodes_map[node_id] = True
            
            graph_node = GraphNode(
                id=node_id,
                label=_get_node_label(node_data, node_type),
                type=node_type,
                properties=_serialize_node_properties(node_data),
                size=NODE_TYPE_SIZES.get(node_type, 1.0),
                color=NODE_TYPE_COLORS.get(node_type, "#3b82f6"),
            )
            nodes.append(graph_node)
        
        # Query edges between these nodes
        node_ids = list(nodes_map.keys())
        edges = []
        
        if node_ids:
            edges_query = """
            MATCH (a)-[r]->(b)
            WHERE a.uid IN $node_ids OR a.repo_id IN $node_ids
              AND (b.uid IN $node_ids OR b.repo_id IN $node_ids)
            RETURN 
                COALESCE(a.uid, a.repo_id) as source_id,
                COALESCE(b.uid, b.repo_id) as target_id,
                type(r) as edge_type,
                properties(r) as edge_props
            LIMIT 10000
            """
            
            edge_results = neo4j.execute_read(edges_query, {"node_ids": node_ids})
            
            for idx, record in enumerate(edge_results):
                source_id = record["source_id"]
                target_id = record["target_id"]
                edge_type = record["edge_type"]
                edge_props = record["edge_props"] or {}
                
                if source_id and target_id:
                    graph_edge = GraphEdge(
                        id=f"{source_id}_{target_id}_{idx}",
                        source=source_id,
                        target=target_id,
                        type=edge_type,
                        properties=_serialize_node_properties(edge_props),
                        weight=1.0,
                    )
                    edges.append(graph_edge)
        
        # Calculate stats
        node_type_counts = {}
        for node in nodes:
            node_type_counts[node.type] = node_type_counts.get(node.type, 0) + 1
        
        edge_type_counts = {}
        for edge in edges:
            edge_type_counts[edge.type] = edge_type_counts.get(edge.type, 0) + 1
        
        stats = {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "node_types": node_type_counts,
            "edge_types": edge_type_counts,
        }
        
        return GraphDataResponse(
            nodes=nodes,
            edges=edges,
            stats=stats,
        )
        
    except Exception as exc:
        logger.error("Failed to get graph data: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve graph data: {str(exc)}")


@router.get("/repository/{repo_id}", response_model=GraphDataResponse)
async def get_repository_graph(
    repo_id: str,
    principal: AuthenticatedPrincipal = Depends(require_auth),
    neo4j: Neo4jClient = Depends(get_neo4j_client),
    include_chunks: bool = Query(default=False, description="Include code chunks in the graph"),
    limit: int = Query(default=1000, ge=1, le=5000),
) -> GraphDataResponse:
    """
    Get graph data for a specific repository.
    
    Args:
        repo_id: Repository ID
        include_chunks: Whether to include Chunk nodes (can be very large)
        limit: Maximum nodes to return
        
    Returns:
        Nodes and edges for the repository
    """
    try:
        # Start with repository node
        nodes = []
        edges = []
        nodes_map = {}
        
        # Get repository node
        repo_query = """
        MATCH (r:Repository {repo_id: $repo_id})
        RETURN r
        """
        repo_results = neo4j.execute_read(repo_query, {"repo_id": repo_id})
        
        if not repo_results:
            raise HTTPException(status_code=404, detail="Repository not found")
        
        repo_data = dict(repo_results[0]["r"])
        repo_node = GraphNode(
            id=repo_id,
            label=_get_node_label(repo_data, "Repository"),
            type="Repository",
            properties=_serialize_node_properties(repo_data),
            size=NODE_TYPE_SIZES["Repository"],
            color=NODE_TYPE_COLORS["Repository"],
        )
        nodes.append(repo_node)
        nodes_map[repo_id] = True
        
        # Get files
        files_query = f"""
        MATCH (r:Repository {{repo_id: $repo_id}})-[:CONTAINS]->(f:File)
        RETURN f
        LIMIT {limit}
        """
        file_results = neo4j.execute_read(files_query, {"repo_id": repo_id})
        
        for record in file_results:
            file_data = dict(record["f"])
            file_id = file_data.get("uid")
            
            if file_id and file_id not in nodes_map:
                file_node = GraphNode(
                    id=file_id,
                    label=_get_node_label(file_data, "File"),
                    type="File",
                    properties=_serialize_node_properties(file_data),
                    size=NODE_TYPE_SIZES["File"],
                    color=NODE_TYPE_COLORS["File"],
                )
                nodes.append(file_node)
                nodes_map[file_id] = True
                
                # Add CONTAINS edge
                edges.append(GraphEdge(
                    id=f"{repo_id}_contains_{file_id}",
                    source=repo_id,
                    target=file_id,
                    type="CONTAINS",
                    weight=1.0,
                ))
        
        # Get file relationships (IMPORTS)
        imports_query = """
        MATCH (f1:File {repo_id: $repo_id})-[r:IMPORTS]->(f2:File)
        RETURN f1.uid as source_id, f2.uid as target_id, properties(r) as props
        LIMIT 5000
        """
        import_results = neo4j.execute_read(imports_query, {"repo_id": repo_id})
        
        for idx, record in enumerate(import_results):
            source_id = record["source_id"]
            target_id = record["target_id"]
            props = record["props"] or {}
            
            if source_id and target_id and source_id in nodes_map:
                # Add target file if not already added
                if target_id not in nodes_map and len(nodes) < limit:
                    # Fetch target file data
                    target_query = "MATCH (f:File {uid: $uid}) RETURN f"
                    target_results = neo4j.execute_read(target_query, {"uid": target_id})
                    if target_results:
                        target_data = dict(target_results[0]["f"])
                        target_node = GraphNode(
                            id=target_id,
                            label=_get_node_label(target_data, "File"),
                            type="File",
                            properties=_serialize_node_properties(target_data),
                            size=NODE_TYPE_SIZES["File"],
                            color=NODE_TYPE_COLORS["File"],
                        )
                        nodes.append(target_node)
                        nodes_map[target_id] = True
                
                if target_id in nodes_map:
                    edge_type = props.get("edge_type", "IMPORTS")
                    edges.append(GraphEdge(
                        id=f"{source_id}_imports_{target_id}_{idx}",
                        source=source_id,
                        target=target_id,
                        type=edge_type.upper(),
                        properties=_serialize_node_properties(props),
                        weight=1.5,
                    ))
        
        # Optionally include chunks
        if include_chunks and len(nodes) < limit:
            remaining = limit - len(nodes)
            chunks_query = f"""
            MATCH (f:File {{repo_id: $repo_id}})-[:CONTAINS]->(c:Chunk)
            WHERE f.uid IN $file_ids
            RETURN c, f.uid as file_id
            LIMIT {remaining}
            """
            file_ids = [n.id for n in nodes if n.type == "File"]
            
            if file_ids:
                chunk_results = neo4j.execute_read(chunks_query, {
                    "repo_id": repo_id,
                    "file_ids": file_ids,
                })
                
                for record in chunk_results:
                    chunk_data = dict(record["c"])
                    chunk_id = chunk_data.get("uid")
                    file_id = record["file_id"]
                    
                    if chunk_id and chunk_id not in nodes_map:
                        chunk_node = GraphNode(
                            id=chunk_id,
                            label=_get_node_label(chunk_data, "Chunk"),
                            type="Chunk",
                            properties=_serialize_node_properties(chunk_data),
                            size=NODE_TYPE_SIZES["Chunk"],
                            color=NODE_TYPE_COLORS["Chunk"],
                        )
                        nodes.append(chunk_node)
                        nodes_map[chunk_id] = True
                        
                        # Add CONTAINS edge
                        edges.append(GraphEdge(
                            id=f"{file_id}_contains_{chunk_id}",
                            source=file_id,
                            target=chunk_id,
                            type="CONTAINS",
                            weight=0.5,
                        ))
        
        # Calculate stats
        node_type_counts = {}
        for node in nodes:
            node_type_counts[node.type] = node_type_counts.get(node.type, 0) + 1
        
        edge_type_counts = {}
        for edge in edges:
            edge_type_counts[edge.type] = edge_type_counts.get(edge.type, 0) + 1
        
        stats = {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "node_types": node_type_counts,
            "edge_types": edge_type_counts,
            "repository_id": repo_id,
        }
        
        return GraphDataResponse(
            nodes=nodes,
            edges=edges,
            stats=stats,
        )
        
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Failed to get repository graph: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve repository graph: {str(exc)}")

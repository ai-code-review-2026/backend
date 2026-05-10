"""
GraphRAG System API Endpoints

Provides REST API for:
- Knowledge Base management (upload, index, delete docs)
- Repository indexing (full, incremental)
- Analysis history (trends, comparisons)
- Rules management
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from app.api.middleware.auth import AuthenticatedPrincipal, require_auth
from app.core.analysis.context.embeddings import EmbeddingGenerator, EmbeddingProvider
from app.core.analysis.context.repo_context_manager import RepoContextManager
from app.core.analysis.graph.manager import GraphManager
from app.core.analysis.history import AnalysisHistoryService, TrendData
from app.core.analysis.repository_resolution import resolve_repository_scope
from app.core.analysis.knowledge_base import (
    KnowledgeBaseIngestionService,
    KBDocumentType,
    RulesEngine,
)
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client as _get_neo4j_singleton
from app.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/graphrag", tags=["graphrag"])


# ─────────────────────────────────────────────────────────────────────────────
# Request/Response Models
# ─────────────────────────────────────────────────────────────────────────────

class UploadKBDocumentRequest(BaseModel):
    """Request for uploading a knowledge base document."""
    document_type: KBDocumentType
    project_id: Optional[UUID] = None
    tags: list[str] = Field(default_factory=list)


class UploadKBDocumentResponse(BaseModel):
    """Response after uploading a KB document."""
    document_id: UUID
    title: str
    chunks_count: int
    status: str = "success"


class IndexRepositoryRequest(BaseModel):
    """Request for indexing a repository."""
    repository_id: UUID
    full_reindex: bool = False


class IndexRepositoryResponse(BaseModel):
    """Response after indexing a repository."""
    repository_id: UUID
    chunks_indexed: int
    status: str


class GetTrendsRequest(BaseModel):
    """Request for getting analysis trends."""
    repository_id: UUID
    days: int = 30


class GetTrendsResponse(BaseModel):
    """Response with trend data."""
    repository_id: UUID
    trend_data: dict[str, Any]


class ExtractRulesRequest(BaseModel):
    """Request for extracting rules from a KB document."""
    document_id: UUID


class ExtractRulesResponse(BaseModel):
    """Response after extracting rules."""
    document_id: UUID
    rules_extracted: int
    rules: list[dict[str, Any]]


# ─────────────────────────────────────────────────────────────────────────────
# Dependency Injection
# ─────────────────────────────────────────────────────────────────────────────

async def get_neo4j_client() -> Neo4jClient:
    """Get Neo4j client singleton."""
    return _get_neo4j_singleton()


async def get_graph_manager(
    neo4j_client: Neo4jClient = Depends(get_neo4j_client),
) -> GraphManager:
    """Get GraphManager instance."""
    return GraphManager(neo4j_client)


async def get_embedding_generator() -> EmbeddingGenerator:
    """Get EmbeddingGenerator instance."""
    provider = EmbeddingProvider(settings.EMBEDDING_PROVIDER)
    return EmbeddingGenerator(
        provider=provider,
        model_name=settings.EMBEDDING_MODEL,
        batch_size=settings.EMBEDDING_BATCH_SIZE,
        use_cache=settings.EMBEDDING_CACHE_ENABLED,
        openai_api_key=settings.OPENAI_API_KEY if provider == EmbeddingProvider.OPENAI else None,
    )


async def get_kb_ingestion_service(
    graph_manager: GraphManager = Depends(get_graph_manager),
    embeddings: EmbeddingGenerator = Depends(get_embedding_generator),
) -> KnowledgeBaseIngestionService:
    """Get KnowledgeBaseIngestionService instance."""
    return KnowledgeBaseIngestionService(
        graph_manager=graph_manager,
        embedding_generator=embeddings,
    )


async def get_rules_engine(
    graph_manager: GraphManager = Depends(get_graph_manager),
) -> RulesEngine:
    """Get RulesEngine instance."""
    return RulesEngine(graph_manager)


async def get_history_service(
    graph_manager: GraphManager = Depends(get_graph_manager),
) -> AnalysisHistoryService:
    """Get AnalysisHistoryService instance."""
    return AnalysisHistoryService(graph_manager)


async def get_repo_context_manager(
    graph_manager: GraphManager = Depends(get_graph_manager),
    embeddings: EmbeddingGenerator = Depends(get_embedding_generator),
) -> RepoContextManager:
    """Get RepoContextManager instance."""
    return RepoContextManager(
        graph_manager=graph_manager,
        embedding_generator=embeddings,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Knowledge Base Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/kb/upload", response_model=UploadKBDocumentResponse)
async def upload_kb_document(
    file: UploadFile = File(...),
    document_type: str = Form(...),
    project_id: Optional[str] = Form(None),
    tags: Optional[str] = Form(None),
    principal: AuthenticatedPrincipal = Depends(require_auth),
    kb_service: KnowledgeBaseIngestionService = Depends(get_kb_ingestion_service),
) -> UploadKBDocumentResponse:
    """
    Upload a knowledge base document.
    
    Supported formats: .md, .txt, .pdf, .json, .yaml
    """
    if not settings.NEO4J_ENABLED:
        raise HTTPException(status_code=503, detail="Neo4j is not enabled")
    
    logger.info(f"Uploading KB document: {file.filename}")
    
    # Save file temporarily
    import tempfile
    from pathlib import Path
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        # Parse tags
        tag_list = []
        if tags:
            tag_list = [t.strip() for t in tags.split(",") if t.strip()]
        
        # Parse project_id
        proj_id = UUID(project_id) if project_id else None
        
        # Ingest document
        doc_id = await kb_service.ingest_document(
            file_path=tmp_path,
            organization_id=UUID(principal.organization_id),
            document_type=KBDocumentType(document_type),
            project_id=proj_id,
            tags=tag_list,
        )
        
        # Get document info
        doc_data = await kb_service.graph_manager.get_node("KBDocument", str(doc_id))
        
        return UploadKBDocumentResponse(
            document_id=doc_id,
            title=doc_data.get("title", file.filename),
            chunks_count=0,  # TODO: Count chunks
            status="success",
        )
    
    except Exception as e:
        logger.error(f"Failed to upload KB document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        # Clean up temp file
        import os
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


@router.delete("/kb/{document_id}")
async def delete_kb_document(
    document_id: UUID,
    principal: AuthenticatedPrincipal = Depends(require_auth),
    kb_service: KnowledgeBaseIngestionService = Depends(get_kb_ingestion_service),
) -> dict[str, str]:
    """Delete a knowledge base document."""
    if not settings.NEO4J_ENABLED:
        raise HTTPException(status_code=503, detail="Neo4j is not enabled")
    
    logger.info(f"Deleting KB document: {document_id}")
    
    try:
        await kb_service.delete_document(document_id)
        return {"status": "success", "message": f"Document {document_id} deleted"}
    
    except Exception as e:
        logger.error(f"Failed to delete KB document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Rules Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/rules/extract", response_model=ExtractRulesResponse)
async def extract_rules_from_document(
    request: ExtractRulesRequest,
    principal: AuthenticatedPrincipal = Depends(require_auth),
    rules_engine: RulesEngine = Depends(get_rules_engine),
) -> ExtractRulesResponse:
    """Extract rules from a knowledge base document."""
    if not settings.NEO4J_ENABLED:
        raise HTTPException(status_code=503, detail="Neo4j is not enabled")
    
    logger.info(f"Extracting rules from document: {request.document_id}")
    
    try:
        rules = await rules_engine.extract_rules_from_document(
            document_id=request.document_id,
            organization_id=UUID(principal.organization_id),
        )
        
        return ExtractRulesResponse(
            document_id=request.document_id,
            rules_extracted=len(rules),
            rules=[
                {
                    "id": str(rule.id),
                    "name": rule.name,
                    "description": rule.description,
                    "severity": rule.severity,
                    "rule_type": rule.rule_type,
                }
                for rule in rules
            ],
        )
    
    except Exception as e:
        logger.error(f"Failed to extract rules: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Repository Indexing Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/repositories/index", response_model=IndexRepositoryResponse)
async def index_repository(
    request: IndexRepositoryRequest,
    principal: AuthenticatedPrincipal = Depends(require_auth),
    repo_context_manager: RepoContextManager = Depends(get_repo_context_manager),
) -> IndexRepositoryResponse:
    """
    Index a repository (full or incremental).
    
    This creates a code graph and generates embeddings for all files.
    """
    if not settings.NEO4J_ENABLED:
        raise HTTPException(status_code=503, detail="Neo4j is not enabled")
    
    logger.info(f"Indexing repository: {request.repository_id}, full={request.full_reindex}")
    
    try:
        resolved_scope = await asyncio.to_thread(
            resolve_repository_scope,
            str(request.repository_id),
        )
        if resolved_scope is None:
            raise HTTPException(status_code=404, detail="Project repository was not found")

        organization_id = resolved_scope.organization_id or principal.organization_id
        if not organization_id:
            raise HTTPException(
                status_code=409,
                detail="Project organization could not be resolved for repository indexing",
            )
        if not resolved_scope.repo_path:
            raise HTTPException(
                status_code=404,
                detail="Repository path could not be resolved for indexing",
            )

        result = await repo_context_manager.index_repository(
            organization_id=organization_id,
            project_id=resolved_scope.project_id,
            repository_id=resolved_scope.repository_id,
            repo_path=resolved_scope.repo_path,
            force_full=request.full_reindex,
        )
        
        return IndexRepositoryResponse(
            repository_id=request.repository_id,
            chunks_indexed=result.chunks_created,
            status="success" if result.success else "failed",
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to index repository: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Analysis History Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/history/trends", response_model=GetTrendsResponse)
async def get_analysis_trends(
    request: GetTrendsRequest,
    principal: AuthenticatedPrincipal = Depends(require_auth),
    history_service: AnalysisHistoryService = Depends(get_history_service),
) -> GetTrendsResponse:
    """
    Get analysis trends for a repository over time.
    
    Returns time series data of findings, quality scores, etc.
    """
    if not settings.NEO4J_ENABLED:
        raise HTTPException(status_code=503, detail="Neo4j is not enabled")
    
    logger.info(f"Getting trends for repository: {request.repository_id}, days={request.days}")
    
    try:
        trends = await history_service.get_trends(
            repository_id=request.repository_id,
            days=request.days,
        )
        
        return GetTrendsResponse(
            repository_id=request.repository_id,
            trend_data={
                "dates": [d.isoformat() for d in trends.dates],
                "total_findings": trends.total_findings,
                "critical_findings": trends.critical_findings,
                "high_findings": trends.high_findings,
                "medium_findings": trends.medium_findings,
                "low_findings": trends.low_findings,
                "quality_scores": trends.quality_scores,
            },
        )
    
    except Exception as e:
        logger.error(f"Failed to get trends: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/runs/{run_id}")
async def get_analysis_run(
    run_id: UUID,
    principal: AuthenticatedPrincipal = Depends(require_auth),
    history_service: AnalysisHistoryService = Depends(get_history_service),
) -> dict[str, Any]:
    """Get details of a specific analysis run."""
    if not settings.NEO4J_ENABLED:
        raise HTTPException(status_code=503, detail="Neo4j is not enabled")
    
    logger.info(f"Getting analysis run: {run_id}")
    
    try:
        run = await history_service.get_run_by_id(run_id)
        
        if not run:
            raise HTTPException(status_code=404, detail="Analysis run not found")
        
        return {
            "id": str(run.id),
            "repository_id": str(run.repository_id),
            "project_id": str(run.project_id),
            "status": run.status,
            "started_at": run.started_at.isoformat(),
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "metrics": {
                "total_findings": run.metrics.total_findings,
                "critical_findings": run.metrics.critical_findings,
                "high_findings": run.metrics.high_findings,
                "medium_findings": run.metrics.medium_findings,
                "low_findings": run.metrics.low_findings,
                "new_findings": run.metrics.new_findings,
                "fixed_findings": run.metrics.fixed_findings,
                "persistent_findings": run.metrics.persistent_findings,
            },
            "git": {
                "commit_sha": run.git_commit_sha,
                "branch": run.git_branch,
                "author": run.git_author,
            },
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get analysis run: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Graph Visualization Endpoints
# ─────────────────────────────────────────────────────────────────────────────

class GraphVisualizationRequest(BaseModel):
    """Request for graph visualization data."""
    node_type: Optional[str] = None
    rel_type: Optional[str] = None
    search: Optional[str] = None
    file_path: Optional[str] = None
    limit: int = 100


class GraphVisualizationResponse(BaseModel):
    """Response with graph data for visualization."""
    nodes: list[dict[str, Any]]
    relationships: list[dict[str, Any]]


@router.get("/graph", response_model=GraphVisualizationResponse)
async def get_graph_visualization(
    node_type: Optional[str] = None,
    rel_type: Optional[str] = None,
    search: Optional[str] = None,
    file_path: Optional[str] = None,
    limit: int = 100,
    principal: AuthenticatedPrincipal = Depends(require_auth),
    graph_manager: GraphManager = Depends(get_graph_manager),
) -> GraphVisualizationResponse:
    """
    Get graph data for visualization.
    
    Fetches nodes and relationships from Neo4j with optional filters.
    Supports filtering by node type, relationship type, search query, and file path.
    """
    if not settings.NEO4J_ENABLED:
        raise HTTPException(status_code=503, detail="Neo4j is not enabled")
    
    logger.info(f"Getting graph visualization: node_type={node_type}, search={search}")
    
    try:
        # Build Cypher query
        where_clauses = []
        params = {
            "org_id": principal.organization_id,
            "limit": min(limit, 500),  # Cap at 500 nodes
        }
        
        # Node type filter
        node_label = "n"
        if node_type and node_type != "all":
            if node_type == "chunk":
                node_label = "n:Chunk"
            elif node_type == "rule":
                node_label = "n:Rule"
            elif node_type == "pattern":
                node_label = "n:Pattern"
            elif node_type == "kb_document":
                node_label = "n:KBDocument"
        
        # Organization filter
        where_clauses.append("n.organization_id = $org_id")
        
        # Search filter
        if search:
            where_clauses.append("(n.content CONTAINS $search OR n.name CONTAINS $search OR n.title CONTAINS $search)")
            params["search"] = search
        
        # File path filter
        if file_path:
            where_clauses.append("n.file_path CONTAINS $file_path")
            params["file_path"] = file_path
        
        where_clause = " AND ".join(where_clauses) if where_clauses else "1=1"
        
        # Fetch nodes
        node_query = f"""
        MATCH ({node_label})
        WHERE {where_clause}
        RETURN
            id(n) as id,
            labels(n)[0] as type,
            CASE
                WHEN n:Chunk THEN coalesce(n.content, '')
                WHEN n:Rule THEN coalesce(n.name, '')
                WHEN n:Pattern THEN coalesce(n.pattern_type, '')
                WHEN n:KBDocument THEN coalesce(n.title, '')
                ELSE coalesce(n.name, n.title, '')
            END as label,
            properties(n) as properties
        LIMIT $limit
        """
        
        nodes_result = await asyncio.to_thread(
            graph_manager.neo4j_client.execute_query,
            node_query,
            params,
        )
        
        nodes = []
        node_ids = []
        for record in nodes_result:
            node_id = str(record["id"])
            node_ids.append(node_id)
            nodes.append({
                "id": node_id,
                "label": record["label"][:100] if record["label"] else "Unnamed",
                "type": record["type"].lower(),
                "properties": record["properties"],
            })
        
        # Fetch relationships between selected nodes
        relationships = []
        if node_ids:
            rel_type_filter = ""
            if rel_type and rel_type != "all":
                rel_type_filter = f"[:{rel_type.upper()}]"
            
            rel_query = f"""
            MATCH (n)-[r{rel_type_filter}]->(m)
            WHERE id(n) IN $node_ids AND id(m) IN $node_ids
            RETURN
                id(r) as id,
                id(n) as source,
                id(m) as target,
                type(r) as type,
                properties(r) as properties
            """
            
            rel_params = {"node_ids": [int(nid) for nid in node_ids]}
            
            rels_result = await asyncio.to_thread(
                graph_manager.neo4j_client.execute_query,
                rel_query,
                rel_params,
            )
            
            for record in rels_result:
                relationships.append({
                    "id": str(record["id"]),
                    "source": str(record["source"]),
                    "target": str(record["target"]),
                    "type": record["type"],
                    "properties": record["properties"],
                })
        
        return GraphVisualizationResponse(
            nodes=nodes,
            relationships=relationships,
        )
    
    except Exception as e:
        logger.error(f"Failed to get graph visualization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

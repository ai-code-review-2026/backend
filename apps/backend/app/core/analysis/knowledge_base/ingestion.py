"""
Knowledge Base Ingestion Service

Handles ingestion of admin-uploaded knowledge base documents into the graph.

Supported formats:
- Markdown (.md) - documentation, ADRs, guides
- Plain text (.txt) - rules, patterns
- PDF (.pdf) - external docs
- JSON (.json) - structured data, Jira exports
- YAML (.yaml, .yml) - config, rules definitions

Process:
1. Parse document (extract text, metadata, structure)
2. Chunk document (semantic chunking for docs, not code)
3. Extract entities (rules, patterns, best practices)
4. Generate embeddings
5. Store in Neo4j graph (nodes + vector embeddings)
6. Link to organization/project context

Graph structure:
- (Organization)-[:HAS_KB]->(KBDocument)-[:CONTAINS]->(KBChunk)
- (KBDocument)-[:DEFINES]->(Rule)
- (KBDocument)-[:DESCRIBES]->(Pattern)
- (Rule)-[:APPLIES_TO]->(Language|Framework|FileType)
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from uuid import UUID, uuid4

import yaml
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class KBDocumentType(str, Enum):
    """Types of knowledge base documents."""
    BEST_PRACTICE = "best_practice"
    CODING_STANDARD = "coding_standard"
    ARCHITECTURE = "architecture"
    SECURITY_RULE = "security_rule"
    BUG_PATTERN = "bug_pattern"
    STYLE_GUIDE = "style_guide"
    API_DOC = "api_doc"
    ADR = "adr"  # Architecture Decision Record
    TICKET = "ticket"  # Jira/GitHub issue
    GENERAL = "general"


class KBDocument(BaseModel):
    """Knowledge base document model."""
    id: UUID = Field(default_factory=uuid4)
    organization_id: UUID
    project_id: Optional[UUID] = None  # None = org-wide
    title: str
    content: str
    document_type: KBDocumentType
    source_path: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    tags: list[str] = Field(default_factory=list)
    language: Optional[str] = None  # Programming language if applicable
    framework: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class KBChunk(BaseModel):
    """Chunk of a knowledge base document."""
    id: UUID = Field(default_factory=uuid4)
    document_id: UUID
    content: str
    chunk_index: int
    heading: Optional[str] = None
    section_path: list[str] = Field(default_factory=list)  # e.g., ["Security", "Authentication"]
    metadata: dict[str, Any] = Field(default_factory=dict)


class MarkdownParser:
    """Parse markdown documents and extract structure."""
    
    def parse(self, content: str) -> dict[str, Any]:
        """
        Parse markdown and return structured data.
        
        Returns:
            {
                "title": str,
                "sections": [{"heading": str, "level": int, "content": str}],
                "links": [{"text": str, "url": str}],
                "code_blocks": [{"language": str, "code": str}],
            }
        """
        lines = content.split("\n")
        sections = []
        current_section = None
        title = None
        links = []
        code_blocks = []
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            # Extract title (first h1)
            if title is None and line.startswith("# "):
                title = line[2:].strip()
                i += 1
                continue
            
            # Extract headings and sections
            heading_match = re.match(r"^(#{1,6})\s+(.+)$", line)
            if heading_match:
                # Save previous section
                if current_section:
                    sections.append(current_section)
                
                level = len(heading_match.group(1))
                heading = heading_match.group(2).strip()
                current_section = {
                    "heading": heading,
                    "level": level,
                    "content": "",
                }
                i += 1
                continue
            
            # Extract links
            link_matches = re.findall(r"\[([^\]]+)\]\(([^)]+)\)", line)
            for text, url in link_matches:
                links.append({"text": text, "url": url})
            
            # Extract code blocks
            if line.strip().startswith("```"):
                lang = line.strip()[3:].strip()
                code_lines = []
                i += 1
                while i < len(lines) and not lines[i].strip().startswith("```"):
                    code_lines.append(lines[i])
                    i += 1
                code_blocks.append({
                    "language": lang or "unknown",
                    "code": "\n".join(code_lines),
                })
                i += 1
                continue
            
            # Add to current section
            if current_section:
                current_section["content"] += line + "\n"
            
            i += 1
        
        # Save last section
        if current_section:
            sections.append(current_section)
        
        return {
            "title": title or "Untitled",
            "sections": sections,
            "links": links,
            "code_blocks": code_blocks,
        }
    
    def chunk_by_sections(
        self,
        parsed: dict[str, Any],
        max_chunk_size: int = 1000,
    ) -> list[dict[str, Any]]:
        """
        Chunk markdown by sections with size limits.
        
        Returns list of chunks with metadata.
        """
        chunks = []
        
        for section in parsed["sections"]:
            content = section["content"].strip()
            heading = section["heading"]
            level = section["level"]
            
            # If section is small enough, keep it as one chunk
            if len(content) <= max_chunk_size:
                chunks.append({
                    "content": f"## {heading}\n\n{content}",
                    "heading": heading,
                    "level": level,
                })
            else:
                # Split large sections by paragraphs
                paragraphs = content.split("\n\n")
                current_chunk = f"## {heading}\n\n"
                
                for para in paragraphs:
                    if len(current_chunk) + len(para) > max_chunk_size:
                        if current_chunk.strip():
                            chunks.append({
                                "content": current_chunk.strip(),
                                "heading": heading,
                                "level": level,
                            })
                        current_chunk = f"## {heading}\n\n{para}\n\n"
                    else:
                        current_chunk += para + "\n\n"
                
                if current_chunk.strip():
                    chunks.append({
                        "content": current_chunk.strip(),
                        "heading": heading,
                        "level": level,
                    })
        
        return chunks


class KnowledgeBaseIngestionService:
    """
    Service for ingesting knowledge base documents.
    
    Features:
    - Multi-format parsing (markdown, PDF, JSON, YAML)
    - Semantic chunking for docs (not AST-based like code)
    - Entity extraction (rules, patterns, best practices)
    - Graph storage with rich relationships
    - Vector storage for retrieval
    - Duplicate detection
    
    Usage:
        service = KnowledgeBaseIngestionService(graph_manager, neo4j_client, embeddings)
        doc_id = await service.ingest_document(
            file_path="/path/to/doc.md",
            organization_id=org_id,
            document_type=KBDocumentType.BEST_PRACTICE,
        )
    """
    
    def __init__(
        self,
        graph_manager: Any,  # GraphManager from app/core/analysis/graph/manager.py
        neo4j_client: Any,  # Neo4jClient from app/integrations/graph_database/
        embedding_generator: Any,  # EmbeddingGenerator
    ):
        self.graph_manager = graph_manager
        self.neo4j_client = neo4j_client
        self.embeddings = embedding_generator
        self.markdown_parser = MarkdownParser()
    
    async def ingest_document(
        self,
        file_path: str,
        organization_id: UUID,
        document_type: KBDocumentType,
        project_id: Optional[UUID] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> UUID:
        """
        Ingest a knowledge base document.
        
        Args:
            file_path: Path to the document file
            organization_id: Organization UUID
            document_type: Type of document
            project_id: Optional project UUID (None = org-wide)
            tags: Optional tags for categorization
            metadata: Additional metadata
            
        Returns:
            Document UUID
        """
        logger.info(f"Ingesting KB document: {file_path}")
        
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"Document not found: {file_path}")
        
        # Parse document based on extension
        content = path.read_text(encoding="utf-8")
        parsed_data = await self._parse_document(content, path.suffix)
        
        # Create document record
        doc = KBDocument(
            organization_id=organization_id,
            project_id=project_id,
            title=parsed_data.get("title", path.stem),
            content=content,
            document_type=document_type,
            source_path=str(path),
            metadata=metadata or {},
            tags=tags or [],
        )
        
        # Chunk document
        chunks = await self._chunk_document(doc, parsed_data)
        logger.info(f"Created {len(chunks)} chunks for document {doc.title}")
        
        # Generate embeddings
        embeddings = await self.embeddings.embed_texts(
            [chunk.content for chunk in chunks]
        )
        
        # Store in graph
        await self._store_in_graph(doc, chunks)
        
        # Store in vector DB
        await self._store_in_vector_db(doc, chunks, embeddings)
        
        logger.info(f"Successfully ingested document: {doc.id}")
        return doc.id
    
    async def _parse_document(
        self,
        content: str,
        extension: str,
    ) -> dict[str, Any]:
        """Parse document based on file extension."""
        if extension in [".md", ".markdown"]:
            return self.markdown_parser.parse(content)
        
        elif extension in [".yaml", ".yml"]:
            try:
                data = yaml.safe_load(content)
                return {
                    "title": data.get("title", "Untitled"),
                    "sections": [{"heading": "Content", "level": 1, "content": content}],
                    "structured_data": data,
                }
            except Exception as e:
                logger.error(f"YAML parse error: {e}")
                return {"title": "Untitled", "sections": [], "structured_data": {}}
        
        elif extension == ".json":
            import json
            try:
                data = json.loads(content)
                return {
                    "title": data.get("title", "Untitled"),
                    "sections": [{"heading": "Content", "level": 1, "content": content}],
                    "structured_data": data,
                }
            except Exception as e:
                logger.error(f"JSON parse error: {e}")
                return {"title": "Untitled", "sections": [], "structured_data": {}}
        
        elif extension == ".txt":
            # Simple text file - split by double newlines
            sections = []
            for i, para in enumerate(content.split("\n\n")):
                if para.strip():
                    sections.append({
                        "heading": f"Section {i+1}",
                        "level": 1,
                        "content": para,
                    })
            return {"title": "Document", "sections": sections}
        
        elif extension == ".pdf":
            # PDF parsing - requires external library
            # For now, treat as plain text
            logger.warning("PDF parsing not fully implemented, treating as plain text")
            return {
                "title": "PDF Document",
                "sections": [{"heading": "Content", "level": 1, "content": content}],
            }
        
        else:
            # Unknown format - treat as plain text
            return {
                "title": "Document",
                "sections": [{"heading": "Content", "level": 1, "content": content}],
            }
    
    async def _chunk_document(
        self,
        doc: KBDocument,
        parsed_data: dict[str, Any],
    ) -> list[KBChunk]:
        """
        Chunk document semantically.
        
        For markdown: chunk by sections
        For plain text: chunk by paragraphs with overlap
        For structured data: chunk by logical units
        """
        chunks: list[KBChunk] = []
        
        if "sections" in parsed_data:
            # Markdown-style chunking
            chunk_dicts = self.markdown_parser.chunk_by_sections(parsed_data)
            
            for idx, chunk_dict in enumerate(chunk_dicts):
                chunks.append(KBChunk(
                    document_id=doc.id,
                    content=chunk_dict["content"],
                    chunk_index=idx,
                    heading=chunk_dict.get("heading"),
                    metadata={
                        "level": chunk_dict.get("level", 1),
                    },
                ))
        
        else:
            # Fallback: simple paragraph-based chunking
            paragraphs = doc.content.split("\n\n")
            max_chunk_size = 1000
            current_chunk = ""
            chunk_index = 0
            
            for para in paragraphs:
                if len(current_chunk) + len(para) > max_chunk_size:
                    if current_chunk.strip():
                        chunks.append(KBChunk(
                            document_id=doc.id,
                            content=current_chunk.strip(),
                            chunk_index=chunk_index,
                        ))
                        chunk_index += 1
                    current_chunk = para + "\n\n"
                else:
                    current_chunk += para + "\n\n"
            
            if current_chunk.strip():
                chunks.append(KBChunk(
                    document_id=doc.id,
                    content=current_chunk.strip(),
                    chunk_index=chunk_index,
                ))
        
        return chunks
    
    async def _store_in_graph(
        self,
        doc: KBDocument,
        chunks: list[KBChunk],
    ) -> None:
        """Store document and chunks in Neo4j graph."""
        # Create document node
        doc_node = {
            "id": str(doc.id),
            "organization_id": str(doc.organization_id),
            "project_id": str(doc.project_id) if doc.project_id else None,
            "title": doc.title,
            "document_type": doc.document_type,
            "source_path": doc.source_path,
            "tags": doc.tags,
            "language": doc.language,
            "framework": doc.framework,
            "created_at": doc.created_at.isoformat(),
            "updated_at": doc.updated_at.isoformat(),
            **doc.metadata,
        }
        
        await self.graph_manager.upsert_node("KBDocument", doc_node)
        
        # Link to organization
        await self.graph_manager.upsert_relationship(
            from_label="Organization",
            from_id=str(doc.organization_id),
            to_label="KBDocument",
            to_id=str(doc.id),
            rel_type="HAS_KB",
            properties={"created_at": datetime.now(timezone.utc).isoformat()},
        )
        
        # Link to project if applicable
        if doc.project_id:
            await self.graph_manager.upsert_relationship(
                from_label="Project",
                from_id=str(doc.project_id),
                to_label="KBDocument",
                to_id=str(doc.id),
                rel_type="HAS_KB",
                properties={"created_at": datetime.now(timezone.utc).isoformat()},
            )
        
        # Create chunk nodes
        for chunk in chunks:
            chunk_node = {
                "id": str(chunk.id),
                "document_id": str(chunk.document_id),
                "content": chunk.content,
                "chunk_index": chunk.chunk_index,
                "heading": chunk.heading,
                "section_path": chunk.section_path,
                **chunk.metadata,
            }
            
            await self.graph_manager.upsert_node("KBChunk", chunk_node)
            
            # Link chunk to document
            await self.graph_manager.upsert_relationship(
                from_label="KBDocument",
                from_id=str(doc.id),
                to_label="KBChunk",
                to_id=str(chunk.id),
                rel_type="CONTAINS",
                properties={"chunk_index": chunk.chunk_index},
            )
        
        logger.info(f"Stored document {doc.id} with {len(chunks)} chunks in graph")
    
    async def _store_in_vector_db(
        self,
        doc: KBDocument,
        chunks: list[KBChunk],
        embeddings: list[list[float]],
    ) -> None:
        """Store chunks and embeddings in Neo4j."""
        for chunk, embedding in zip(chunks, embeddings):
            kb_doc_data = {
                "chunk_id": str(chunk.id),
                "document_id": str(doc.id),
                "organization_id": str(doc.organization_id),
                "project_id": str(doc.project_id) if doc.project_id else None,
                "content": chunk.content,
                "document_type": doc.document_type,
                "tags": doc.tags,
                "heading": chunk.heading,
                "chunk_index": chunk.chunk_index,
                "embedding": embedding,
            }
            await asyncio.to_thread(self.neo4j_client.upsert_kb_document, kb_doc_data)
        logger.info(f"Stored {len(chunks)} KB chunks in Neo4j for document {doc.id}")
    
    async def delete_document(self, document_id: UUID) -> None:
        """Delete a knowledge base document and all its chunks."""
        logger.info(f"Deleting KB document: {document_id}")
        
        # Delete from graph (cascades to chunks via relationships)
        await self.graph_manager.delete_node("KBDocument", str(document_id))
        # Neo4j is the single store — no secondary vector DB cleanup needed.
        
        logger.info(f"Deleted document {document_id}")
    
    async def update_document(
        self,
        document_id: UUID,
        file_path: Optional[str] = None,
        tags: Optional[list[str]] = None,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """Update an existing knowledge base document."""
        logger.info(f"Updating KB document: {document_id}")
        
        # If file_path provided, re-ingest
        if file_path:
            # Delete old version
            await self.delete_document(document_id)
            
            # Re-ingest (need to get original params from DB)
            # TODO: Implement full update logic
            raise NotImplementedError("Document re-ingestion not yet implemented")
        
        # Otherwise, just update metadata
        update_props = {
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
        if tags is not None:
            update_props["tags"] = tags
        
        if metadata is not None:
            update_props.update(metadata)
        
        await self.graph_manager.update_node(
            "KBDocument",
            str(document_id),
            update_props,
        )
        
        logger.info(f"Updated document {document_id}")

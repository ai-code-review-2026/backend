"""
Graph Builder - Constructs code graph in Neo4j

Builds:
- Repository hierarchy (Org → Project → Repo → Files)
- Code entities (Functions, Classes, Modules)
- Relationships (CALLS, IMPORTS, DEPENDS_ON)
- Extracts from chunks + AST analysis
"""

from __future__ import annotations

import logging
import posixpath
import re
from pathlib import PurePosixPath
from typing import Any

from app.core.analysis.graph.manager import GraphManager
from app.core.analysis.graph.schema import NodeType, RelationType

logger = logging.getLogger(__name__)


class GraphBuilder:
    """Build code graphs from chunks."""
    
    def __init__(self) -> None:
        self._graph = GraphManager()
        self._python_keywords = {
            "if", "for", "while", "return", "print", "len", "range", "with",
            "await", "yield", "and", "or", "not", "in", "is", "try", "except",
            "class", "def", "from", "import", "raise", "assert", "lambda",
        }
    
    async def build_code_graph(
        self,
        *,
        organization_id: str,
        project_id: str,
        repository_id: str,
        chunks: list[Any],
    ) -> int:
        """Build initial code graph."""
        # Create nodes for each chunk (Function, Class)
        nodes_created = 0
        for chunk in chunks:
            chunk_type = chunk.chunk_type.value if hasattr(chunk.chunk_type, "value") else str(chunk.chunk_type)
            if chunk_type in {"function", "class"}:
                self._graph.upsert_node(
                    NodeType.FUNCTION if chunk_type == "function" else NodeType.CLASS,
                    {"id": chunk.id},
                    {
                        "name": chunk.symbol_name,
                        "file_path": chunk.file_path,
                        "repository_id": repository_id,
                        "line_start": chunk.line_start,
                        "line_end": chunk.line_end,
                    },
                )
                nodes_created += 1
        
        return nodes_created
    
    async def extract_relationships(
        self,
        *,
        repository_id: str,
        chunks: list[Any],
    ) -> int:
        """Extract code relationships (CALLS, IMPORTS, DEPENDS_ON)."""
        call_edges = self._extract_call_edges(chunks)
        import_edges = self._extract_import_edges(repository_id=repository_id, chunks=chunks)

        created = 0
        for from_id, to_id in call_edges:
            if self._graph.create_relationship(
                NodeType.FUNCTION,
                from_id,
                NodeType.FUNCTION,
                to_id,
                RelationType.CALLS,
            ):
                created += 1

        if import_edges:
            created += self._graph._client.batch_upsert_edges(import_edges)  # noqa: SLF001
        return created
    
    async def update_code_graph(self, repository_id: str, chunks: list[Any]) -> int:
        """Update graph incrementally by upserting changed symbol nodes."""
        nodes_created = 0
        for chunk in chunks:
            chunk_type = chunk.chunk_type.value if hasattr(chunk.chunk_type, "value") else str(chunk.chunk_type)
            if chunk_type not in {"function", "class"}:
                continue
            self._graph.upsert_node(
                NodeType.FUNCTION if chunk_type == "function" else NodeType.CLASS,
                {"id": chunk.id},
                {
                    "name": chunk.symbol_name,
                    "file_path": chunk.file_path,
                    "repository_id": repository_id,
                    "line_start": chunk.line_start,
                    "line_end": chunk.line_end,
                },
            )
            nodes_created += 1
        return nodes_created
    
    async def update_relationships(self, repository_id: str, chunks: list[Any]) -> int:
        """Update relationships incrementally using the same extraction logic."""
        return await self.extract_relationships(repository_id=repository_id, chunks=chunks)

    def _extract_call_edges(self, chunks: list[Any]) -> set[tuple[str, str]]:
        function_nodes: dict[str, str] = {}
        for chunk in chunks:
            chunk_type = chunk.chunk_type.value if hasattr(chunk.chunk_type, "value") else str(chunk.chunk_type)
            if chunk_type == "function" and chunk.symbol_name:
                function_nodes[chunk.symbol_name] = chunk.id

        edges: set[tuple[str, str]] = set()
        call_pattern = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*\(")
        for chunk in chunks:
            chunk_type = chunk.chunk_type.value if hasattr(chunk.chunk_type, "value") else str(chunk.chunk_type)
            if chunk_type != "function":
                continue
            caller_id = chunk.id
            for callee_name in call_pattern.findall(chunk.content or ""):
                if callee_name in self._python_keywords:
                    continue
                callee_id = function_nodes.get(callee_name)
                if not callee_id or callee_id == caller_id:
                    continue
                edges.add((caller_id, callee_id))
        return edges

    def _extract_import_edges(self, *, repository_id: str, chunks: list[Any]) -> list[dict[str, Any]]:
        known_paths = {str(chunk.file_path) for chunk in chunks if getattr(chunk, "file_path", None)}
        edges: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()

        for chunk in chunks:
            source_path = str(getattr(chunk, "file_path", "") or "")
            if not source_path:
                continue

            for target_path in self._resolve_import_targets(source_path, chunk.content or "", known_paths):
                key = (source_path, target_path)
                if key in seen or source_path == target_path:
                    continue
                seen.add(key)
                edges.append(
                    {
                        "repo_id": repository_id,
                        "source_path": source_path,
                        "target_path": target_path,
                        "edge_type": "IMPORTS",
                    }
                )
                edges.append(
                    {
                        "repo_id": repository_id,
                        "source_path": source_path,
                        "target_path": target_path,
                        "edge_type": "DEPENDS_ON",
                    }
                )
        return edges

    def _resolve_import_targets(
        self,
        source_path: str,
        content: str,
        known_paths: set[str],
    ) -> set[str]:
        targets: set[str] = set()
        source_parent = str(PurePosixPath(source_path).parent)

        for line in content.splitlines():
            stripped = line.strip()
            if not stripped:
                continue

            py_from = re.match(r"^from\s+([A-Za-z0-9_\.]+)\s+import\s+", stripped)
            py_import = re.match(r"^import\s+([A-Za-z0-9_\.]+)", stripped)
            ts_import = re.search(r"(?:from|import)\s+[\"']([^\"']+)[\"']", stripped)

            module_path = None
            if ts_import:
                module_path = ts_import.group(1)
            elif py_from:
                module_path = py_from.group(1)
            elif py_import:
                module_path = py_import.group(1).split(",")[0].strip()

            if not module_path:
                continue

            for candidate in self._expand_module_candidates(source_parent, module_path):
                if candidate in known_paths:
                    targets.add(candidate)
        return targets

    def _expand_module_candidates(self, source_parent: str, module_path: str) -> list[str]:
        if module_path.startswith("."):
            base = str(PurePosixPath(source_parent, module_path)).replace("\\", "/")
        elif module_path.startswith("/"):
            base = module_path.lstrip("/")
        else:
            base = module_path.replace(".", "/")

        candidates = [
            base,
            f"{base}.py",
            f"{base}.ts",
            f"{base}.tsx",
            f"{base}.js",
            f"{base}.jsx",
            f"{base}/__init__.py",
            f"{base}/index.ts",
            f"{base}/index.js",
        ]

        normalized: list[str] = []
        for item in candidates:
            path = item.replace("\\", "/")
            while "//" in path:
                path = path.replace("//", "/")
            if path.startswith("./"):
                path = path[2:]
            path = posixpath.normpath(path)
            normalized.append(path)
        return normalized

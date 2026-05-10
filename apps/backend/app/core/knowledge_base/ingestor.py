"""
Neo4j Repository Ingestor

Replaces the Qdrant-backed RepoContextIngestor with a Neo4j-native implementation.

Key changes vs old ingestor:
- Writes File + Chunk nodes to Neo4j (no Qdrant)
- Uses real sentence-transformers embeddings (not hash)
- Writes IMPORTS / INHERITS edges to Neo4j (not PostgreSQL code_entity_edges)
- Keeps PostgreSQL RepoContextChunksRepo as a fast lookup fallback
- Full incremental mode: only re-chunks changed files
- All chunking logic preserved (Python AST, generic symbols, docs, config, SQL, etc.)
"""

from __future__ import annotations

import ast
import hashlib
import json
import re
import subprocess
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterable

from app.core.knowledge_base.embedding_provider import embed_texts
from app.core.knowledge_base.guardrails import (
    iter_repo_files,
    normalize_repo_id,
    resolve_repo_path,
    should_index_path,
    to_posix_relative,
    validate_allowed_roots,
)
from app.data.repos.repo_context_chunks_repo import RepoContextChunkWrite, RepoContextChunksRepo
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client
from app.settings import settings

logger = __import__("logging").getLogger(__name__)

# ── Language / file-type maps (unchanged) ────────────────────────────────────

_LANGUAGE_BY_SUFFIX: dict[str, str] = {
    ".py": "python", ".pyi": "python",
    ".js": "javascript", ".jsx": "javascript",
    ".ts": "typescript", ".tsx": "typescript",
    ".vue": "vue", ".svelte": "svelte",
    ".go": "go", ".java": "java", ".kt": "kotlin",
    ".scala": "scala", ".rs": "rust", ".rb": "ruby",
    ".php": "php", ".c": "c", ".h": "c",
    ".cpp": "cpp", ".hpp": "cpp", ".cs": "csharp",
    ".swift": "swift", ".m": "objective-c",
    ".mm": "objective-cpp", ".dart": "dart",
    ".md": "markdown", ".mdx": "markdown",
    ".rst": "rst", ".txt": "text", ".sql": "sql",
    ".yaml": "yaml", ".yml": "yaml", ".json": "json",
    ".toml": "toml", ".ini": "ini", ".cfg": "config",
    ".conf": "config", ".env.example": "dotenv",
    ".tf": "terraform", ".hcl": "hcl",
    ".sh": "bash", ".ps1": "powershell", ".bat": "batch",
    ".xml": "xml", ".feature": "gherkin",
    ".diff": "diff", ".patch": "diff",
}

_DOC_SUFFIXES = {".md", ".mdx", ".rst", ".txt"}
_CONFIG_SUFFIXES = {".yaml", ".yml", ".json", ".toml", ".ini", ".cfg", ".conf", ".env.example", ".xml"}
_SCRIPT_SUFFIXES = {".sh", ".ps1", ".bat"}
_SQL_SUFFIXES = {".sql"}
_DIFF_SUFFIXES = {".diff", ".patch"}
_INFRA_SUFFIXES = {".tf", ".hcl"}
_CODE_SUFFIXES = {
    ".py", ".pyi", ".js", ".jsx", ".ts", ".tsx", ".go", ".java", ".kt",
    ".scala", ".rs", ".rb", ".php", ".c", ".h", ".cpp", ".hpp", ".cs",
    ".swift", ".m", ".mm", ".dart", ".vue", ".svelte",
}

_DEPENDENCY_FILENAMES = {
    "package.json", "pnpm-lock.yaml", "package-lock.json", "yarn.lock",
    "requirements.txt", "requirements-dev.txt", "poetry.lock", "pyproject.toml",
    "go.mod", "go.sum", "cargo.toml", "cargo.lock", "pom.xml",
    "build.gradle", "build.gradle.kts", "composer.json", "composer.lock",
    "gemfile", "gemfile.lock",
}
_CI_FILENAMES = {
    ".gitlab-ci.yml", "azure-pipelines.yml", "azure-pipelines.yaml",
    "buildkite.yml", "buildkite.yaml", "circle.yml", "drone.yml", "drone.yaml",
}
_CI_PATH_HINTS = (".github/workflows/", ".circleci/", ".gitlab/")
_MIGRATION_PATH_HINTS = ("migrations/", "alembic/versions/", "db/migrate/")
_TEST_PATH_HINTS = ("tests/", "test/", "__tests__/", "spec/")
_ADR_PATH_HINTS = ("docs/adr/", "adr/")

_GENERIC_SYMBOL_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"^\s*(?:export\s+)?class\s+([A-Za-z_]\w*)"), "class"),
    (re.compile(r"^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)"), "function"),
    (re.compile(r"^\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\("), "function"),
    (re.compile(r"^\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)\s*\("), "function"),
    (
        re.compile(
            r"^\s*(?:public|private|protected|internal|static|final|virtual|override|\s)+\s*"
            r"[A-Za-z_<>\[\], ?]+\s+([A-Za-z_]\w*)\s*\([^;]*\)\s*\{?"
        ),
        "function",
    ),
)

_PY_IMPORT_RE = re.compile(r"^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", re.MULTILINE)
_PY_CLASS_BASES_RE = re.compile(r"^\s*class\s+(\w+)\s*\(([^)]+)\)", re.MULTILINE)
_JS_IMPORT_RE = re.compile(
    r"""(?:import\s+.*?from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))""",
    re.MULTILINE,
)


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class RepoIndexResult:
    repo_id: str
    repo_path: str
    mode: str
    indexed_commit: str | None
    default_branch: str | None
    files_seen: int
    files_indexed: int
    chunks_upserted: int
    chunks_deleted: int
    changed_files: list[str]
    started_at: str
    completed_at: str


@dataclass(frozen=True)
class ChunkRecord:
    content: str
    chunk_type: str
    start_line: int
    end_line: int
    symbol_name: str | None = None


@dataclass(frozen=True)
class ChunkingResult:
    file_type: str
    chunks: list[ChunkRecord]


@dataclass(frozen=True)
class _LineSplitChunk:
    content: str
    start_line: int
    end_line: int


# ── Main Ingestor ─────────────────────────────────────────────────────────────

class Neo4jRepoIngestor:
    """
    Repository ingestor that writes to Neo4j + PostgreSQL fallback.

    Flow:
      iter files → chunk → embed (sentence-transformers) →
      upsert File + Chunk nodes to Neo4j →
      upsert edge relationships (IMPORTS, INHERITS) to Neo4j →
      upsert chunk rows to PostgreSQL (fast lookup fallback)
    """

    def __init__(self, neo4j_client: Neo4jClient | None = None) -> None:
        self._neo4j = neo4j_client or get_neo4j_client()
        self._sql_repo = RepoContextChunksRepo()
        self._chunk_size = settings.CHUNKING_MAX_CHUNK_SIZE
        self._chunk_overlap = settings.CHUNKING_OVERLAP_SIZE
        self._batch_size = settings.INCREMENTAL_INDEXING_BATCH_SIZE

    async def onboard_repo(
        self,
        *,
        repo_id: str,
        repo_path: str,
        source: str = "manual",
        force_full: bool = False,
    ) -> RepoIndexResult:
        _ = source, force_full
        repo_key = normalize_repo_id(repo_id)
        root = resolve_repo_path(repo_path)
        validate_allowed_roots(root)
        started_at = _utc_now()

        indexed_commit = _safe_git_head(root)
        default_branch = _safe_git_branch(root)

        # Wipe existing Neo4j nodes for this repo
        self._neo4j.delete_repo_chunks(repo_id=repo_key)
        self._sql_repo.delete_repo(repo_key)

        # Upsert Repository node
        self._neo4j.upsert_repository(
            repo_id=repo_key,
            repo_path=str(root),
            indexed_commit=indexed_commit,
            default_branch=default_branch,
        )

        files = iter_repo_files(root)
        chunk_batch: list[dict[str, Any]] = []
        sql_rows: list[RepoContextChunkWrite] = []
        edge_batch: list[dict[str, Any]] = []
        files_indexed = 0

        for file_path in files:
            relative_path = to_posix_relative(root, file_path)
            chunking = self._file_to_chunks(file_path)
            if not chunking.chunks:
                continue

            language = _guess_language(relative_path)

            # Upsert File node
            self._neo4j.upsert_file(
                repo_id=repo_key,
                path=relative_path,
                language=language,
                file_type=chunking.file_type,
                indexed_commit=indexed_commit,
            )

            # Embed all chunks for this file in one batch
            texts = [
                _build_embed_input(relative_path, language, chunking.file_type, c)
                for c in chunking.chunks
            ]
            embeddings = embed_texts(texts)

            for chunk_index, (chunk, embedding) in enumerate(zip(chunking.chunks, embeddings)):
                uid = _chunk_uid(repo_key, relative_path, chunk_index, chunk.chunk_type, chunk.symbol_name)
                chunk_batch.append({
                    "uid": uid,
                    "repo_id": repo_key,
                    "path": relative_path,
                    "chunk_index": chunk_index,
                    "language": language,
                    "file_type": chunking.file_type,
                    "chunk_type": chunk.chunk_type,
                    "content": chunk.content,
                    "embedding": embedding,
                    "start_line": chunk.start_line,
                    "end_line": chunk.end_line,
                    "symbol_name": chunk.symbol_name,
                    "indexed_commit": indexed_commit,
                    "token_count": len(chunk.content.split()),
                    "indexed_at": _utc_now(),
                })
                sql_rows.append(_build_sql_row(uid, repo_key, relative_path, chunk_index, language, chunking.file_type, chunk, indexed_commit))

                if len(chunk_batch) >= self._batch_size:
                    self._neo4j.batch_upsert_chunks(chunk_batch)
                    chunk_batch = []

            # Extract edges
            if language == "python" and chunking.file_type == "code":
                edge_batch.extend(_extract_python_edges(file_path, relative_path, repo_key, indexed_commit))
            elif language in {"javascript", "typescript"} and chunking.file_type == "code":
                edge_batch.extend(_extract_js_ts_edges(file_path, relative_path, repo_key, indexed_commit))

            files_indexed += 1

        # Flush remaining chunks
        if chunk_batch:
            self._neo4j.batch_upsert_chunks(chunk_batch)
        self._sql_repo.upsert_chunks(sql_rows)

        # Persist edges to Neo4j
        if edge_batch:
            self._neo4j.batch_upsert_edges(edge_batch)

        completed_at = _utc_now()
        return RepoIndexResult(
            repo_id=repo_key,
            repo_path=str(root),
            mode="full",
            indexed_commit=indexed_commit,
            default_branch=default_branch,
            files_seen=len(files),
            files_indexed=files_indexed,
            chunks_upserted=len(sql_rows),
            chunks_deleted=0,
            changed_files=[],
            started_at=started_at,
            completed_at=completed_at,
        )

    async def update_repo_incremental(
        self,
        *,
        repo_id: str,
        repo_path: str,
        base_ref: str | None = None,
        head_ref: str = "HEAD",
        source: str = "manual",
    ) -> RepoIndexResult:
        _ = source
        repo_key = normalize_repo_id(repo_id)
        root = resolve_repo_path(repo_path)
        validate_allowed_roots(root)
        started_at = _utc_now()

        profile = self._neo4j.get_repo_profile(repo_key)
        inferred_base = base_ref or _as_str(profile.get("indexed_commit") if profile else None)

        if inferred_base is None:
            return await self.onboard_repo(repo_id=repo_key, repo_path=str(root), source=source, force_full=True)

        changed_files = _git_changed_files(root, base_ref=inferred_base, head_ref=head_ref)
        indexed_commit = _safe_git_head(root)
        default_branch = _safe_git_branch(root)

        if not changed_files:
            return RepoIndexResult(
                repo_id=repo_key, repo_path=str(root), mode="incremental",
                indexed_commit=indexed_commit, default_branch=default_branch,
                files_seen=0, files_indexed=0, chunks_upserted=0, chunks_deleted=0,
                changed_files=[], started_at=started_at, completed_at=_utc_now(),
            )

        chunk_batch: list[dict[str, Any]] = []
        sql_rows: list[RepoContextChunkWrite] = []
        edge_batch: list[dict[str, Any]] = []
        files_indexed = 0
        chunks_deleted = 0

        self._sql_repo.delete_repo_paths(repo_key, changed_files)

        for relative_path in changed_files:
            self._neo4j.delete_file_chunks(repo_id=repo_key, path=relative_path)
            chunks_deleted += 1

            abs_path = root / Path(relative_path)
            if not abs_path.exists() or not abs_path.is_file():
                continue
            if not should_index_path(abs_path):
                continue
            if abs_path.stat().st_size > settings.REPO_CONTEXT_MAX_FILE_BYTES:
                continue

            chunking = self._file_to_chunks(abs_path)
            if not chunking.chunks:
                continue

            language = _guess_language(relative_path)
            self._neo4j.upsert_file(
                repo_id=repo_key, path=relative_path,
                language=language, file_type=chunking.file_type,
                indexed_commit=indexed_commit,
            )

            texts = [_build_embed_input(relative_path, language, chunking.file_type, c) for c in chunking.chunks]
            embeddings = embed_texts(texts)

            for chunk_index, (chunk, embedding) in enumerate(zip(chunking.chunks, embeddings)):
                uid = _chunk_uid(repo_key, relative_path, chunk_index, chunk.chunk_type, chunk.symbol_name)
                chunk_batch.append({
                    "uid": uid, "repo_id": repo_key, "path": relative_path,
                    "chunk_index": chunk_index, "language": language,
                    "file_type": chunking.file_type, "chunk_type": chunk.chunk_type,
                    "content": chunk.content, "embedding": embedding,
                    "start_line": chunk.start_line, "end_line": chunk.end_line,
                    "symbol_name": chunk.symbol_name, "indexed_commit": indexed_commit,
                    "token_count": len(chunk.content.split()), "indexed_at": _utc_now(),
                })
                sql_rows.append(_build_sql_row(uid, repo_key, relative_path, chunk_index, language, chunking.file_type, chunk, indexed_commit))

                if len(chunk_batch) >= self._batch_size:
                    self._neo4j.batch_upsert_chunks(chunk_batch)
                    chunk_batch = []

            if language == "python" and chunking.file_type == "code":
                edge_batch.extend(_extract_python_edges(abs_path, relative_path, repo_key, indexed_commit))
            elif language in {"javascript", "typescript"} and chunking.file_type == "code":
                edge_batch.extend(_extract_js_ts_edges(abs_path, relative_path, repo_key, indexed_commit))

            files_indexed += 1

        if chunk_batch:
            self._neo4j.batch_upsert_chunks(chunk_batch)
        self._sql_repo.upsert_chunks(sql_rows)
        if edge_batch:
            self._neo4j.batch_upsert_edges(edge_batch)

        # Update repo node
        self._neo4j.upsert_repository(
            repo_id=repo_key, repo_path=str(root),
            indexed_commit=indexed_commit, default_branch=default_branch,
        )

        return RepoIndexResult(
            repo_id=repo_key, repo_path=str(root), mode="incremental",
            indexed_commit=indexed_commit, default_branch=default_branch,
            files_seen=len(changed_files), files_indexed=files_indexed,
            chunks_upserted=len(sql_rows), chunks_deleted=chunks_deleted,
            changed_files=changed_files, started_at=started_at, completed_at=_utc_now(),
        )

    async def get_repo_profile(self, repo_id: str) -> dict[str, Any] | None:
        return self._neo4j.get_repo_profile(normalize_repo_id(repo_id))

    # ── Chunking (all logic preserved from old ingestor) ─────────────────────

    def _file_to_chunks(self, file_path: Path) -> ChunkingResult:
        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            return ChunkingResult(file_type="text", chunks=[])
        if not text.strip():
            return ChunkingResult(file_type="text", chunks=[])

        file_type = _classify_file_type(file_path)
        if file_type == "code":
            chunks = self._chunk_code(file_path=file_path, text=text)
        elif file_type == "test":
            chunks = self._chunk_tests(file_path=file_path, text=text)
        elif file_type in {"docs", "adr"}:
            chunks = self._chunk_docs(text=text, chunk_type="adr_paragraph" if file_type == "adr" else "paragraph")
        elif file_type in {"config", "infra", "ci"}:
            chunks = self._chunk_config(file_path=file_path, text=text, file_type=file_type)
        elif file_type == "migration":
            chunks = self._chunk_migration(file_path=file_path, text=text)
        elif file_type == "dependency":
            chunks = self._chunk_dependency(file_path=file_path, text=text)
        elif file_type == "diff":
            chunks = self._chunk_diff(text=text)
        elif file_type == "script":
            chunks = self._chunk_script(text=text)
        else:
            chunks = self._chunk_fixed(text=text, chunk_type="text_chunk", start_line=1)

        normalized: list[ChunkRecord] = []
        for chunk in chunks:
            content = chunk.content.strip()
            if not content:
                continue
            normalized.extend(self._fit_chunk_size(chunk))

        if settings.PARENT_DOCUMENT_ENABLED and len(normalized) > 1:
            parent_max_chars = settings.PARENT_DOCUMENT_MAX_TOKENS * 4
            parent_content = text[:parent_max_chars].strip()
            if parent_content:
                total_lines = text.count("\n") + 1
                normalized.append(ChunkRecord(
                    content=parent_content, chunk_type="parent_document",
                    start_line=1, end_line=total_lines,
                ))

        return ChunkingResult(file_type=file_type, chunks=normalized)

    def _fit_chunk_size(self, chunk: ChunkRecord) -> list[ChunkRecord]:
        if len(chunk.content) <= self._chunk_size:
            return [chunk]
        sub: list[ChunkRecord] = []
        for item in _split_text_with_line_ranges(chunk.content, chunk_size=self._chunk_size, overlap=self._chunk_overlap, base_start_line=chunk.start_line):
            sub.append(ChunkRecord(content=item.content, chunk_type=chunk.chunk_type, start_line=item.start_line, end_line=item.end_line, symbol_name=chunk.symbol_name))
        return sub

    def _chunk_code(self, *, file_path: Path, text: str) -> list[ChunkRecord]:
        language = _guess_language(file_path.as_posix())
        if language == "python":
            py = self._chunk_python(text=text)
            if py:
                return py
        generic = self._chunk_generic_symbols(text=text)
        if generic:
            return generic
        return self._chunk_fixed(text=text, chunk_type="code_block", start_line=1)

    def _chunk_tests(self, *, file_path: Path, text: str) -> list[ChunkRecord]:
        chunks = self._chunk_code(file_path=file_path, text=text)
        out: list[ChunkRecord] = []
        for item in chunks:
            symbol = (item.symbol_name or "").lower()
            is_test = symbol.startswith("test") or "spec" in symbol or "test(" in item.content
            out.append(ChunkRecord(content=item.content, chunk_type="test_case" if is_test else "test_block", start_line=item.start_line, end_line=item.end_line, symbol_name=item.symbol_name))
        return out

    def _chunk_docs(self, *, text: str, chunk_type: str) -> list[ChunkRecord]:
        lines = text.replace("\r\n", "\n").split("\n")
        chunks: list[ChunkRecord] = []
        current_section = "Document"
        paragraph_lines: list[str] = []
        paragraph_start = 1

        def flush(end_line: int) -> None:
            nonlocal paragraph_lines
            if not paragraph_lines:
                return
            body = "\n".join(paragraph_lines).strip()
            if not body:
                paragraph_lines = []
                return
            content = f"{current_section}\n{body}" if current_section else body
            chunks.append(ChunkRecord(content=content, chunk_type=chunk_type, start_line=paragraph_start, end_line=max(end_line, paragraph_start), symbol_name=current_section if current_section != "Document" else None))
            paragraph_lines = []

        for line_no, line in enumerate(lines, start=1):
            stripped = line.strip()
            if stripped.startswith("#"):
                flush(line_no - 1)
                current_section = stripped
                paragraph_start = line_no + 1
                continue
            if not stripped:
                flush(line_no - 1)
                paragraph_start = line_no + 1
                continue
            if not paragraph_lines:
                paragraph_start = line_no
            paragraph_lines.append(line)
        flush(len(lines))
        return chunks or self._chunk_fixed(text=text, chunk_type=chunk_type, start_line=1)

    def _chunk_config(self, *, file_path: Path, text: str, file_type: str) -> list[ChunkRecord]:
        suffix = _extract_suffix(file_path)
        chunk_type = "infra_block" if file_type == "infra" else ("ci_block" if file_type == "ci" else "config_section")
        if suffix == ".json":
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                lines = text.replace("\r\n", "\n").split("\n")
                chunks = []
                for key, value in parsed.items():
                    content = json.dumps({key: value}, ensure_ascii=False, indent=2)
                    sl = _find_line_for_token(lines, f'"{key}"')
                    chunks.append(ChunkRecord(content=content, chunk_type=chunk_type, start_line=sl, end_line=sl + max(content.count("\n"), 0), symbol_name=str(key)))
                if chunks:
                    return chunks
        lines = text.replace("\r\n", "\n").split("\n")
        headers: list[tuple[int, str]] = []
        for line_no, line in enumerate(lines, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            if suffix in {".toml", ".ini", ".cfg", ".conf"} and stripped.startswith("[") and stripped.endswith("]"):
                headers.append((line_no, stripped))
                continue
            if re.match(r"^[A-Za-z0-9_.-]+\s*:\s*", line):
                headers.append((line_no, stripped.split(":", maxsplit=1)[0].strip()))
        if headers:
            return _chunk_by_headers(lines=lines, headers=headers, chunk_type=chunk_type)
        return self._chunk_fixed(text=text, chunk_type=chunk_type, start_line=1)

    def _chunk_migration(self, *, file_path: Path, text: str) -> list[ChunkRecord]:
        if _extract_suffix(file_path) in _SQL_SUFFIXES:
            return self._chunk_sql_statements(text=text)
        return self._chunk_code(file_path=file_path, text=text)

    def _chunk_dependency(self, *, file_path: Path, text: str) -> list[ChunkRecord]:
        name = file_path.name.lower()
        if name == "package.json":
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, dict):
                chunks = []
                for section in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
                    values = parsed.get(section)
                    if isinstance(values, dict) and values:
                        content = json.dumps({section: values}, ensure_ascii=False, indent=2)
                        chunks.append(ChunkRecord(content=content, chunk_type="dependency_group", start_line=1, end_line=1 + max(content.count("\n"), 0), symbol_name=section))
                if chunks:
                    return chunks
        return self._chunk_fixed(text=text, chunk_type="dependency_block", start_line=1)

    def _chunk_diff(self, *, text: str) -> list[ChunkRecord]:
        lines = text.replace("\r\n", "\n").split("\n")
        headers: list[tuple[int, str]] = [(line_no, line.strip()) for line_no, line in enumerate(lines, 1) if line.startswith("@@")]
        if headers:
            return _chunk_by_headers(lines=lines, headers=headers, chunk_type="diff_hunk")
        return self._chunk_fixed(text=text, chunk_type="diff_block", start_line=1)

    def _chunk_script(self, *, text: str) -> list[ChunkRecord]:
        lines = text.replace("\r\n", "\n").split("\n")
        headers: list[tuple[int, str]] = []
        for line_no, line in enumerate(lines, 1):
            bash_m = re.match(r"^\s*(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(\)\s*\{", line)
            ps_m = re.match(r"^\s*function\s+([A-Za-z_][A-Za-z0-9_-]*)", line, flags=re.IGNORECASE)
            if bash_m:
                headers.append((line_no, bash_m.group(1)))
            elif ps_m:
                headers.append((line_no, ps_m.group(1)))
        if headers:
            return _chunk_by_headers(lines=lines, headers=headers, chunk_type="script_function")
        return self._chunk_fixed(text=text, chunk_type="script_block", start_line=1)

    def _chunk_python(self, *, text: str) -> list[ChunkRecord]:
        try:
            tree = ast.parse(text)
        except SyntaxError:
            return []
        lines = text.replace("\r\n", "\n").split("\n")
        nodes = sorted(
            [n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))],
            key=lambda n: int(getattr(n, "lineno", 1)),
        )
        if not nodes:
            return []
        chunks: list[ChunkRecord] = []
        first_line = int(getattr(nodes[0], "lineno", 1))
        if first_line > 1:
            preamble = "\n".join(lines[:first_line - 1]).strip()
            if preamble:
                chunks.append(ChunkRecord(content=preamble, chunk_type="module_preamble", start_line=1, end_line=first_line - 1))
        for node in nodes:
            sl = int(getattr(node, "lineno", 1))
            el = int(getattr(node, "end_lineno", sl))
            snippet = "\n".join(lines[sl - 1:el]).strip()
            if snippet:
                chunks.append(ChunkRecord(content=snippet, chunk_type="class" if isinstance(node, ast.ClassDef) else "function", start_line=sl, end_line=el, symbol_name=getattr(node, "name", None)))
        last_line = int(getattr(nodes[-1], "end_lineno", len(lines)))
        if last_line < len(lines):
            tail = "\n".join(lines[last_line:]).strip()
            if tail:
                chunks.append(ChunkRecord(content=tail, chunk_type="module_tail", start_line=last_line + 1, end_line=len(lines)))
        return chunks

    def _chunk_generic_symbols(self, *, text: str) -> list[ChunkRecord]:
        lines = text.replace("\r\n", "\n").split("\n")
        headers: list[tuple[int, str, str]] = []
        for line_no, line in enumerate(lines, 1):
            for pattern, kind in _GENERIC_SYMBOL_PATTERNS:
                m = pattern.match(line)
                if m:
                    headers.append((line_no, m.group(1), kind))
                    break
        if not headers:
            return []
        chunks: list[ChunkRecord] = []
        first_line = headers[0][0]
        if first_line > 1:
            preamble = "\n".join(lines[:first_line - 1]).strip()
            if preamble:
                chunks.append(ChunkRecord(content=preamble, chunk_type="module_preamble", start_line=1, end_line=first_line - 1))
        for i, (start, symbol_name, kind) in enumerate(headers):
            next_start = headers[i + 1][0] if i + 1 < len(headers) else len(lines) + 1
            end = max(start, next_start - 1)
            snippet = "\n".join(lines[start - 1:end]).strip()
            if snippet:
                chunks.append(ChunkRecord(content=snippet, chunk_type=kind, start_line=start, end_line=end, symbol_name=symbol_name))
        return chunks

    def _chunk_sql_statements(self, *, text: str) -> list[ChunkRecord]:
        lines = text.replace("\r\n", "\n").split("\n")
        chunks: list[ChunkRecord] = []
        buffer: list[str] = []
        start_line = 1
        for line_no, line in enumerate(lines, 1):
            if not buffer and line.strip():
                start_line = line_no
            buffer.append(line)
            if ";" not in line:
                continue
            content = "\n".join(buffer).strip()
            if content:
                chunks.append(ChunkRecord(content=content, chunk_type="sql_statement", start_line=start_line, end_line=line_no))
            buffer = []
        if buffer:
            content = "\n".join(buffer).strip()
            if content:
                chunks.append(ChunkRecord(content=content, chunk_type="sql_block", start_line=start_line, end_line=len(lines)))
        return chunks

    def _chunk_fixed(self, *, text: str, chunk_type: str, start_line: int) -> list[ChunkRecord]:
        return [
            ChunkRecord(content=item.content, chunk_type=chunk_type, start_line=item.start_line, end_line=item.end_line)
            for item in _split_text_with_line_ranges(text, chunk_size=self._chunk_size, overlap=self._chunk_overlap, base_start_line=start_line)
        ]


# ── Backward-compat alias (old code uses RepoContextIngestor) ────────────────

class RepoContextIngestor(Neo4jRepoIngestor):
    """
    Drop-in alias for legacy callers.
    Accepts (but ignores) a vector_store kwarg for backward compatibility.
    """

    def __init__(self, vector_store: Any = None) -> None:  # noqa: ARG002
        super().__init__()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _chunk_uid(repo_id: str, path: str, chunk_index: int, chunk_type: str, symbol_name: str | None) -> str:
    key = f"{repo_id}:{path}:{chunk_index}:{chunk_type}:{symbol_name or ''}"
    return hashlib.sha1(key.encode()).hexdigest()


def _build_embed_input(relative_path: str, language: str, file_type: str, chunk: ChunkRecord) -> str:
    return f"path:{relative_path}\nfile_type:{file_type}\nlanguage:{language}\nsymbol:{chunk.symbol_name or ''}\n{chunk.content}"


def _build_sql_row(
    uid: str, repo_id: str, path: str, chunk_index: int,
    language: str, file_type: str, chunk: ChunkRecord,
    indexed_commit: str | None,
) -> RepoContextChunkWrite:
    return RepoContextChunkWrite(
        id=uid,
        repo_id=repo_id,
        path=path,
        chunk_index=chunk_index,
        content=chunk.content,
        language=language,
        file_type=file_type,
        chunk_type=chunk.chunk_type,
        symbol_name=chunk.symbol_name,
        start_line=chunk.start_line,
        end_line=chunk.end_line,
        indexed_commit=indexed_commit,
        metadata={"indexed_at": _utc_now(), "token_count": len(chunk.content.split())},
    )


def _extract_suffix(file_path: Path) -> str:
    name = file_path.name.lower()
    if name.endswith(".env.example"):
        return ".env.example"
    return file_path.suffix.lower()


def _guess_language(relative_path: str) -> str:
    return _LANGUAGE_BY_SUFFIX.get(_extract_suffix(Path(relative_path)), "text")


def _classify_file_type(file_path: Path) -> str:
    posix_path = file_path.as_posix().lower()
    name = file_path.name.lower()
    suffix = _extract_suffix(file_path)
    if name in _DEPENDENCY_FILENAMES:
        return "dependency"
    if suffix in _DIFF_SUFFIXES:
        return "diff"
    if any(h in posix_path for h in _CI_PATH_HINTS) or name in _CI_FILENAMES:
        return "ci"
    if any(h in posix_path for h in _MIGRATION_PATH_HINTS):
        return "migration"
    if suffix in _SQL_SUFFIXES and "migration" in posix_path:
        return "migration"
    if any(h in posix_path for h in _ADR_PATH_HINTS):
        return "adr"
    if any(h in posix_path for h in _TEST_PATH_HINTS) or re.search(r"(?:^|[._-])(test|spec)(?:[._-]|$)", name):
        if suffix in _CODE_SUFFIXES:
            return "test"
    if suffix in _INFRA_SUFFIXES or any(t in posix_path for t in ("/terraform/", "/helm/", "/k8s/", "/kubernetes/")):
        return "infra"
    if suffix in _SCRIPT_SUFFIXES:
        return "script"
    if suffix in _DOC_SUFFIXES:
        return "docs"
    if suffix in _CONFIG_SUFFIXES:
        return "config"
    if suffix in _CODE_SUFFIXES:
        return "code"
    if suffix in _SQL_SUFFIXES:
        return "migration"
    return "text"


def _safe_git_head(root: Path) -> str | None:
    return _safe_git_output(root, ["rev-parse", "HEAD"])


def _safe_git_branch(root: Path) -> str | None:
    return _safe_git_output(root, ["rev-parse", "--abbrev-ref", "HEAD"])


def _safe_git_output(root: Path, args: list[str]) -> str | None:
    result = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return None
    return result.stdout.strip() or None


def _git_changed_files(root: Path, *, base_ref: str, head_ref: str) -> list[str]:
    result = subprocess.run(
        ["git", "-C", str(root), "diff", "--name-only", "--diff-filter=ACMRD", base_ref, head_ref],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        raise ValueError(f"git diff failed: {result.stderr.strip() or result.stdout.strip()}")
    return sorted({line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()})


def _as_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    return value.strip() or None


def _language_stats(paths: list[Path]) -> dict[str, int]:
    stats: dict[str, int] = {}
    for path in paths:
        lang = _guess_language(path.as_posix())
        stats[lang] = stats.get(lang, 0) + 1
    return dict(sorted(stats.items(), key=lambda x: x[1], reverse=True))


def _split_text_with_line_ranges(text: str, *, chunk_size: int, overlap: int, base_start_line: int) -> list[_LineSplitChunk]:
    normalized = text.replace("\r\n", "\n")
    if chunk_size <= 0:
        lc = max(normalized.count("\n"), 0)
        return [_LineSplitChunk(content=normalized, start_line=base_start_line, end_line=base_start_line + lc)]
    if overlap < 0:
        overlap = 0
    lines = normalized.split("\n")
    if not lines:
        return []
    chunks: list[_LineSplitChunk] = []
    start_idx = 0
    total = len(lines)
    while start_idx < total:
        end_idx = start_idx
        current_len = 0
        while end_idx < total:
            next_len = len(lines[end_idx]) + 1
            if end_idx > start_idx and current_len + next_len > chunk_size:
                break
            current_len += next_len
            end_idx += 1
            if current_len >= chunk_size:
                break
        content = "\n".join(lines[start_idx:end_idx]).strip()
        if content:
            chunks.append(_LineSplitChunk(content=content, start_line=base_start_line + start_idx, end_line=base_start_line + max(start_idx, end_idx - 1)))
        if end_idx >= total:
            break
        if overlap == 0:
            start_idx = end_idx
            continue
        overlap_chars = 0
        overlap_start = end_idx
        while overlap_start > start_idx and overlap_chars < overlap:
            overlap_start -= 1
            overlap_chars += len(lines[overlap_start]) + 1
        start_idx = overlap_start if overlap_start < end_idx else end_idx
    return chunks


def _chunk_by_headers(lines: list[str], headers: list[tuple[int, str]], chunk_type: str) -> list[ChunkRecord]:
    chunks: list[ChunkRecord] = []
    first = headers[0][0]
    if first > 1:
        preface = "\n".join(lines[:first - 1]).strip()
        if preface:
            chunks.append(ChunkRecord(content=preface, chunk_type=f"{chunk_type}_preamble", start_line=1, end_line=first - 1))
    for i, (sl, label) in enumerate(headers):
        ns = headers[i + 1][0] if i + 1 < len(headers) else len(lines) + 1
        el = max(sl, ns - 1)
        content = "\n".join(lines[sl - 1:el]).strip()
        if content:
            chunks.append(ChunkRecord(content=content, chunk_type=chunk_type, start_line=sl, end_line=el, symbol_name=label))
    return chunks


def _find_line_for_token(lines: Iterable[str], token: str) -> int:
    for i, line in enumerate(lines, 1):
        if token in line:
            return i
    return 1


def _extract_python_edges(file_path: Path, relative_path: str, repo_id: str, indexed_commit: str | None) -> list[dict[str, Any]]:
    try:
        text = file_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []
    edges: list[dict[str, Any]] = []
    for m in _PY_IMPORT_RE.finditer(text):
        module = m.group(1) or m.group(2) or ""
        if module:
            edges.append({"repo_id": repo_id, "source_path": relative_path, "source_symbol": None, "target_path": module.replace(".", "/") + ".py", "target_symbol": None, "edge_type": "imports", "indexed_commit": indexed_commit})
    for m in _PY_CLASS_BASES_RE.finditer(text):
        class_name = m.group(1)
        for base in m.group(2).split(","):
            base_name = base.strip().split(".")[-1].strip()
            if base_name and base_name not in {"object", "ABC", "Protocol", "BaseModel"}:
                edges.append({"repo_id": repo_id, "source_path": relative_path, "source_symbol": class_name, "target_path": "", "target_symbol": base_name, "edge_type": "inherits", "indexed_commit": indexed_commit})
    return edges


def _extract_js_ts_edges(file_path: Path, relative_path: str, repo_id: str, indexed_commit: str | None) -> list[dict[str, Any]]:
    try:
        text = file_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return []
    edges: list[dict[str, Any]] = []
    for m in _JS_IMPORT_RE.finditer(text):
        module = m.group(1) or m.group(2) or ""
        if module and module.startswith("."):
            edges.append({"repo_id": repo_id, "source_path": relative_path, "source_symbol": None, "target_path": module, "target_symbol": None, "edge_type": "imports", "indexed_commit": indexed_commit})
    return edges

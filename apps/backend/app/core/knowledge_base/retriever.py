from __future__ import annotations

import asyncio
import re
from dataclasses import replace
from typing import Any

from app.core.knowledge_base.context_packer import ContextPacker
from app.core.knowledge_base.exact_retriever import ExactRetriever
from app.core.knowledge_base.ingestor import RepoContextIngestor
from app.core.knowledge_base.lexical_retriever import LexicalRetriever
from app.core.knowledge_base.query_router import QueryRouter
from app.core.knowledge_base.re_ranker import ReRanker
from app.core.knowledge_base.retrieval_models import QueryRoute, RetrievedContextChunk
from app.core.knowledge_base.semantic_retriever import SemanticRetriever
from app.core.review_engine.diff_engine import DiffParseError, parse_unified_diff
from app.data.repos.repo_profiles_repo import RepoProfilesRepo
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client
from app.settings import settings


class RepoContextRetriever:
    def __init__(
        self,
        neo4j_client: Neo4jClient | None = None,
        *,
        # legacy: silently ignore old vector_store kwarg
        vector_store: object | None = None,  # noqa: ARG002
    ) -> None:
        self._neo4j = neo4j_client or get_neo4j_client()
        self._ingestor = RepoContextIngestor(neo4j_client=self._neo4j)
        self._exact = ExactRetriever()
        self._lexical = LexicalRetriever()
        self._semantic = SemanticRetriever(neo4j_client=self._neo4j)
        self._router = QueryRouter()
        self._reranker = ReRanker()
        self._packer = ContextPacker(
            max_chars=settings.KB_CONTEXT_MAX_CHARS,
            max_chunks=settings.KB_CONTEXT_MAX_CHUNKS,
        )

    async def get_repo_profile(self, repo_id: str) -> dict[str, Any] | None:
        if self._neo4j.enabled:
            try:
                profile = await self._ingestor.get_repo_profile(repo_id)
                if profile:
                    return profile
            except Exception:
                pass

        sql_profile = await asyncio.to_thread(RepoProfilesRepo().get_profile, repo_id)
        if sql_profile and isinstance(sql_profile.profile, dict):
            return dict(sql_profile.profile)
        return None

    async def retrieve_for_repo_bootstrap(
        self,
        *,
        repo_id: str,
        limit: int = 16,
    ) -> tuple[list[RetrievedContextChunk], dict[str, Any] | None]:
        seed_queries = [
            "repository architecture overview entry points main modules",
            "authentication authorization security middleware",
            "configuration environment variables deployment",
            "database models repositories migrations",
            "ci pipeline workflows quality checks",
        ]

        candidates = []
        for query in seed_queries:
            candidates.extend(
                await self._semantic.retrieve_repo_bootstrap(
                    repo_id=repo_id,
                    query_text=query,
                    limit=max(limit, settings.KB_SEMANTIC_TOP_K),
                )
            )

        ranked = self._reranker.rank(
            query=" ".join(seed_queries),
            candidates=candidates,
            route=QueryRoute.GENERIC_HYBRID_QUERY,
            limit=max(limit * 4, settings.KB_RERANK_TOP_K * 2),
        )
        packed = self._packer.pack(candidates=ranked, route=QueryRoute.GENERIC_HYBRID_QUERY, limit=limit)
        profile = await self.get_repo_profile(repo_id)
        return packed, profile

    async def retrieve_for_query(
        self,
        *,
        repo_id: str,
        query: str,
        changed_files: list[str] | None = None,
        limit: int = 8,
        route_hint: str = "auto",
    ) -> tuple[list[RetrievedContextChunk], dict[str, Any] | None]:
        route = self._router.route_query(query=query, route_hint=route_hint)
        document_source_type = _document_source_type_for_route(route)
        changed_files_set = set(changed_files or [])
        candidates = []
        global_document_limit = max(3, settings.KB_LEXICAL_TOP_K // 2)

        if route in {QueryRoute.REPO_QUERY, QueryRoute.CODE_QUERY, QueryRoute.GENERIC_HYBRID_QUERY, QueryRoute.MULTI_SOURCE_QUERY}:
            candidates.extend(
                self._exact.retrieve_query_hints(
                    repo_id=repo_id,
                    query=query,
                    limit=settings.KB_EXACT_TOP_K,
                )
            )
            candidates.extend(
                self._lexical.retrieve_code(
                    repo_id=repo_id,
                    query=query,
                    limit=settings.KB_LEXICAL_TOP_K,
                    changed_files=changed_files_set or None,
                )
            )
            candidates.extend(
                await self._semantic.retrieve_code(
                    repo_id=repo_id,
                    query_text=query,
                    limit=settings.KB_SEMANTIC_TOP_K,
                    changed_files=changed_files_set or None,
                )
            )
            candidates.extend(
                self._lexical.retrieve_global_documents(
                    query=query,
                    limit=global_document_limit,
                )
            )
            candidates.extend(
                await self._semantic.retrieve_global_documents(
                    query_text=query,
                    limit=max(3, settings.KB_SEMANTIC_TOP_K // 2),
                    source_type=document_source_type,
                )
            )

        if route in {
            QueryRoute.POLICY_QUERY,
            QueryRoute.DOCUMENT_QUERY,
            QueryRoute.PDF_QUERY,
            QueryRoute.WEB_QUERY,
            QueryRoute.MARKDOWN_QUERY,
            QueryRoute.SQL_QUERY,
            QueryRoute.GENERIC_HYBRID_QUERY,
            QueryRoute.MULTI_SOURCE_QUERY,
        }:
            desired_tags = ["policy", "security", "compliance"] if route == QueryRoute.POLICY_QUERY else []
            candidates.extend(
                self._lexical.retrieve_documents(
                    repo_id=repo_id,
                    query=query,
                    limit=max(4, settings.KB_LEXICAL_TOP_K // 2),
                    source_type=document_source_type,
                    tags=desired_tags or None,
                )
            )
            candidates.extend(
                await self._semantic.retrieve_documents(
                    repo_id=repo_id,
                    query_text=query,
                    limit=max(4, settings.KB_SEMANTIC_TOP_K // 2),
                    source_type=document_source_type,
                    tags=desired_tags or None,
                )
            )
            candidates.extend(
                self._lexical.retrieve_global_documents(
                    query=query,
                    limit=global_document_limit,
                    source_type=document_source_type,
                    tags=desired_tags or None,
                )
            )
            candidates.extend(
                await self._semantic.retrieve_global_documents(
                    query_text=query,
                    limit=max(3, settings.KB_SEMANTIC_TOP_K // 2),
                    source_type=document_source_type,
                    tags=desired_tags or None,
                )
            )

        if route == QueryRoute.POLICY_QUERY:
            candidates.extend(
                self._lexical.retrieve_code(
                    repo_id=repo_id,
                    query=query,
                    limit=max(2, settings.KB_LEXICAL_TOP_K // 3),
                )
            )
            candidates.extend(
                await self._semantic.retrieve_code(
                    repo_id=repo_id,
                    query_text=query,
                    limit=max(2, settings.KB_SEMANTIC_TOP_K // 3),
                )
            )

        if route in {QueryRoute.DOCUMENT_QUERY, QueryRoute.PDF_QUERY, QueryRoute.WEB_QUERY, QueryRoute.MARKDOWN_QUERY, QueryRoute.SQL_QUERY}:
            candidates.extend(self._exact.retrieve_query_hints(repo_id=repo_id, query=query, limit=2))

        if route in {QueryRoute.GENERIC_HYBRID_QUERY, QueryRoute.MULTI_SOURCE_QUERY}:
            candidates.extend(
                self._lexical.retrieve_code(
                    repo_id=repo_id,
                    query=query,
                    limit=max(2, settings.KB_LEXICAL_TOP_K // 2),
                )
            )

        ranked = self._reranker.rank(
            query=query,
            candidates=candidates,
            route=route,
            limit=max(limit * 6, settings.KB_RERANK_TOP_K * 3),
        )
        packed = self._packer.pack(candidates=ranked, route=route, limit=limit)
        profile = await self.get_repo_profile(repo_id)
        return packed, profile

    async def retrieve_for_diff(
        self,
        *,
        repo_id: str,
        diff_text: str,
        changed_files: list[str] | None = None,
        limit: int = 8,
    ) -> tuple[list[RetrievedContextChunk], dict[str, Any] | None]:
        signals = _extract_diff_signals(diff_text)
        inferred_files = sorted(set(changed_files or signals.paths))
        changed_files_set = set(inferred_files)
        symbols = set(signals.symbols)
        lexical_query = _build_lexical_query_from_diff(signals)
        global_document_limit = max(3, settings.KB_LEXICAL_TOP_K // 2)

        candidates = [
            *self._exact.retrieve_file_chunks(
                repo_id=repo_id,
                paths=inferred_files,
                per_file_limit=settings.KB_EXACT_TOP_K,
            ),
            *self._exact.retrieve_symbol_chunks(
                repo_id=repo_id,
                symbols=symbols,
                per_symbol_limit=max(2, settings.KB_EXACT_TOP_K // 2),
            ),
            *self._exact.retrieve_related_tests(
                repo_id=repo_id,
                changed_files=inferred_files,
                limit=max(4, settings.KB_EXACT_TOP_K // 2),
            ),
            *self._lexical.retrieve_code(
                repo_id=repo_id,
                query=lexical_query,
                limit=settings.KB_LEXICAL_TOP_K,
                changed_files=changed_files_set,
            ),
            *self._lexical.retrieve_documents(
                repo_id=repo_id,
                query=lexical_query,
                limit=max(2, settings.KB_LEXICAL_TOP_K // 3),
                tags=["policy", "security", "compliance"],
            ),
            *self._lexical.retrieve_global_documents(
                query=lexical_query,
                limit=global_document_limit,
            ),
            *(await self._semantic.retrieve_code(
                repo_id=repo_id,
                query_text=signals.semantic_query,
                limit=settings.KB_SEMANTIC_TOP_K,
                changed_files=changed_files_set,
            )),
            *(await self._semantic.retrieve_documents(
                repo_id=repo_id,
                query_text=signals.semantic_query,
                limit=max(2, settings.KB_SEMANTIC_TOP_K // 3),
                tags=["policy", "security", "compliance"],
            )),
            *(await self._semantic.retrieve_global_documents(
                query_text=signals.semantic_query,
                limit=max(3, settings.KB_SEMANTIC_TOP_K // 2),
            )),
        ]

        ranked = self._reranker.rank(
            query=signals.semantic_query,
            candidates=candidates,
            route=QueryRoute.DIFF_REVIEW,
            limit=max(limit * 6, settings.KB_RERANK_TOP_K * 3),
        )
        packed = self._packer.pack(candidates=ranked, route=QueryRoute.DIFF_REVIEW, limit=limit)
        profile = await self.get_repo_profile(repo_id)
        return packed, profile

    async def retrieve_document_chunks(
        self,
        *,
        repo_id: str,
        query: str,
        source_type: str | None = None,
        tags: list[str] | None = None,
        limit: int = 8,
    ) -> list[RetrievedContextChunk]:
        policy_tags = {tag.lower() for tag in (tags or []) if isinstance(tag, str)}
        route = (
            QueryRoute.POLICY_QUERY
            if source_type == "policy" or policy_tags.intersection({"policy", "security", "compliance"})
            else _route_for_source_type(source_type) or QueryRoute.DOCUMENT_QUERY
        )
        candidates = [
            *self._lexical.retrieve_documents(
                repo_id=repo_id,
                query=query,
                limit=max(limit * 2, settings.KB_LEXICAL_TOP_K // 2),
                source_type=source_type,
                tags=tags,
            ),
            *(await self._semantic.retrieve_documents(
                repo_id=repo_id,
                query_text=query,
                limit=max(limit * 2, settings.KB_SEMANTIC_TOP_K // 2),
                source_type=source_type,
                tags=tags,
            )),
        ]
        ranked = self._reranker.rank(
            query=query,
            candidates=candidates,
            route=route,
            limit=max(limit * 4, settings.KB_RERANK_TOP_K * 2),
        )
        return self._packer.pack(candidates=ranked, route=route, limit=limit)


def retrieve(query: str) -> list[str]:
    _ = query
    return []


def build_llm_context(chunks: list[RetrievedContextChunk]) -> str:
    context, _ = build_llm_context_with_chunks(chunks)
    return context


def build_llm_context_with_chunks(
    chunks: list[RetrievedContextChunk],
    *,
    max_chars: int | None = None,
) -> tuple[str, list[RetrievedContextChunk]]:
    if not chunks:
        return "[NO_CONTEXT_AVAILABLE]", []

    sections: list[str] = []
    used_chunks: list[RetrievedContextChunk] = []
    total_chars = 0
    for item in chunks:
        content = item.content.strip()
        if not content:
            continue
        section = format_context_section(item)
        separator_chars = 2 if sections else 0
        projected_chars = total_chars + separator_chars + len(section)
        if max_chars is not None and projected_chars > max_chars:
            if sections:
                break
            header, _, _ = section.partition("\n")
            remaining = max_chars - len(header) - 1
            if remaining <= 0:
                break
            truncated_content = content[:remaining].rstrip()
            if not truncated_content:
                break
            truncated_chunk = replace(item, content=truncated_content)
            section = format_context_section(truncated_chunk)
            used_chunks.append(truncated_chunk)
            sections.append(section)
            total_chars = len(section)
            break
        sections.append(section)
        used_chunks.append(item)
        total_chars = projected_chars
    if not sections:
        return "[NO_CONTEXT_AVAILABLE]", []
    return "\n\n".join(sections), used_chunks


def format_context_section(item: RetrievedContextChunk) -> str:
    location = ""
    if item.start_line is not None and item.end_line is not None:
        location = f"Lines {item.start_line}-{item.end_line}"
    elif item.start_line is not None:
        location = f"Line {item.start_line}"

    header_parts = [f"[FILE: {item.path}]"]
    if location:
        header_parts.append(location)
    if item.page is not None:
        header_parts.append(f"page={item.page}")
    if item.chunk_type:
        header_parts.append(f"type={item.chunk_type}")
    if item.symbol_name:
        header_parts.append(f"symbol={item.symbol_name}")
    if item.section_title:
        header_parts.append(f"section={item.section_title}")
    if item.entity_type and item.entity_name:
        header_parts.append(f"{item.entity_type}={item.entity_name}")

    return "\n".join([" | ".join(header_parts), item.content.strip()])


def _extract_paths_from_diff(diff_text: str) -> list[str]:
    try:
        parsed = parse_unified_diff(diff_text)
        paths = [item.path_new for item in parsed.files if item.path_new]
        return sorted(set(path for path in paths if path))
    except DiffParseError:
        paths: list[str] = []
        for line in diff_text.splitlines():
            if not line.startswith("diff --git a/"):
                continue
            right = line.split(" b/", maxsplit=1)
            if len(right) != 2:
                continue
            candidate = right[1].strip()
            if candidate:
                paths.append(candidate)
        return sorted(set(paths))


def _extract_diff_signals(diff_text: str) -> DiffSignals:
    paths = _extract_paths_from_diff(diff_text)
    symbols = _extract_symbols_from_diff(diff_text)
    added_lines = _extract_added_lines_from_diff(diff_text)
    semantic_query = _build_query_from_diff(
        diff_text=diff_text,
        changed_files=paths,
        symbols=symbols,
        added_lines=added_lines,
    )
    return DiffSignals(paths=paths, symbols=symbols, added_lines=added_lines, semantic_query=semantic_query)


class DiffSignals:
    def __init__(self, *, paths: list[str], symbols: list[str], added_lines: list[str], semantic_query: str) -> None:
        self.paths = paths
        self.symbols = symbols
        self.added_lines = added_lines
        self.semantic_query = semantic_query


def _extract_symbols_from_diff(diff_text: str) -> list[str]:
    patterns = [
        re.compile(r"^\+\s*def\s+([A-Za-z_]\w*)\s*\("),
        re.compile(r"^\+\s*class\s+([A-Za-z_]\w*)"),
        re.compile(r"^\+\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_]\w*)\s*\("),
        re.compile(r"^\+\s*(?:export\s+)?class\s+([A-Za-z_]\w*)"),
        re.compile(r"^\+\s*func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)\s*\("),
        re.compile(r"^\+\s*(?:pub\s+)?fn\s+([A-Za-z_]\w*)\s*\("),
    ]
    symbols: list[str] = []
    for line in diff_text.splitlines():
        if not line.startswith("+") or line.startswith("+++"):
            continue
        for pattern in patterns:
            match = pattern.match(line)
            if match:
                symbols.append(match.group(1))
                break
    return sorted(set(symbols))


def _extract_added_lines_from_diff(diff_text: str, *, max_lines: int = 200) -> list[str]:
    cleaned: list[str] = []
    for line in diff_text.splitlines():
        if not line.startswith("+") or line.startswith("+++"):
            continue
        body = line[1:].strip()
        if not body:
            continue
        body = re.sub(r"//.*$", "", body).strip()
        body = re.sub(r"#.*$", "", body).strip()
        if not body:
            continue
        cleaned.append(body)
        if len(cleaned) >= max_lines:
            break
    return cleaned


def _build_query_from_diff(
    *,
    diff_text: str,
    changed_files: list[str],
    symbols: list[str] | None = None,
    added_lines: list[str] | None = None,
) -> str:
    file_hint = ", ".join(changed_files[:20])
    symbol_hint = ", ".join((symbols or [])[:20])
    added_excerpt = "\n".join((added_lines or [])[:60])[:2500]
    diff_excerpt = diff_text[:1600]
    return (
        "Repository diff context request (impact analysis).\n"
        f"Changed files: {file_hint}\n"
        f"Changed symbols: {symbol_hint}\n"
        "Added code excerpt:\n"
        f"{added_excerpt}\n"
        "Raw diff excerpt:\n"
        f"{diff_excerpt}"
    )


def _build_lexical_query_from_diff(signals: DiffSignals) -> str:
    if signals.added_lines:
        return " ".join(signals.added_lines[:24])[:2000]
    if signals.symbols:
        return " ".join(signals.symbols[:20])
    if signals.paths:
        return " ".join(signals.paths[:20])
    return signals.semantic_query[:800]


def _to_retrieved_chunks(hits: list[Any], *, source: str, fallback_score: float = 0.0) -> list[RetrievedContextChunk]:
    chunks: list[RetrievedContextChunk] = []
    for hit in hits:
        payload = getattr(hit, "payload", None) or {}
        path = str(payload.get("path") or payload.get("path_or_url") or payload.get("title") or payload.get("doc_id") or "")
        content = str(payload.get("content") or payload.get("text") or "")
        if not path or not content:
            continue
        score = float(getattr(hit, "score", fallback_score) or fallback_score)
        token_count = _as_optional_int(payload.get("token_count"))
        tags = payload.get("tags")
        normalized_tags = tuple(str(tag).strip() for tag in tags if str(tag).strip()) if isinstance(tags, list) else ()
        chunks.append(
            RetrievedContextChunk(
                score=score,
                path=path,
                chunk_index=int(payload.get("chunk_index") or 0),
                language=str(payload.get("language") or payload.get("source_type") or "text"),
                content=content,
                token_count=token_count if token_count is not None else max(1, len(content) // 4),
                file_type=str(payload.get("file_type") or payload.get("source_type") or "text"),
                chunk_type=str(payload.get("chunk_type") or "text_chunk"),
                symbol_name=_as_optional_str(payload.get("symbol_name")),
                start_line=_as_optional_int(payload.get("start_line")),
                end_line=_as_optional_int(payload.get("end_line")),
                source=source,
                source_type=_as_optional_str(payload.get("source_type")),
                tags=normalized_tags,
                document_id=_as_optional_str(payload.get("doc_id")),
                title=_as_optional_str(payload.get("title")),
                repo_id=_as_optional_str(payload.get("repo_id")),
                source_id=_as_optional_str(payload.get("source_id")),
                chunk_id=_as_optional_str(payload.get("chunk_id")),
                document_version=_as_optional_str(payload.get("document_version")),
                section_title=_as_optional_str(payload.get("section_title") or payload.get("title")),
                heading_path=_normalize_heading_path(payload.get("heading_path")),
                page=_as_optional_int(payload.get("page")),
                source_uri=_as_optional_str(payload.get("source_uri") or payload.get("path_or_url")),
                content_hash=_as_optional_str(payload.get("content_hash")),
                version=_as_optional_str(payload.get("version") or payload.get("document_version")),
                entity_type=_as_optional_str(payload.get("entity_type")),
                entity_name=_as_optional_str(payload.get("entity_name")),
                domain=_as_optional_str(payload.get("domain")),
                crawl_timestamp=_as_optional_str(payload.get("crawl_timestamp")),
                retrieval_reason=f"semantic_match:{source}",
                retriever_channel=source,
                score_raw=score,
                score_final=score,
                collection_version=_as_optional_str(payload.get("collection_version")),
            )
        )
    return chunks


def _as_optional_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return None
    return None


def _as_optional_str(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_heading_path(value: Any) -> tuple[str, ...]:
    if isinstance(value, list):
        return tuple(str(item).strip() for item in value if str(item).strip())
    if isinstance(value, tuple):
        return tuple(str(item).strip() for item in value if str(item).strip())
    if isinstance(value, str):
        return tuple(part.strip() for part in value.split(">") if part.strip())
    return ()


def _route_for_source_type(source_type: str | None) -> QueryRoute | None:
    normalized = (source_type or "").strip().lower()
    mapping = {
        "pdf": QueryRoute.PDF_QUERY,
        "web": QueryRoute.WEB_QUERY,
        "markdown": QueryRoute.MARKDOWN_QUERY,
        "sql": QueryRoute.SQL_QUERY,
        "code": QueryRoute.CODE_QUERY,
        "policy": QueryRoute.POLICY_QUERY,
    }
    return mapping.get(normalized)


def _document_source_type_for_route(route: QueryRoute) -> str | None:
    mapping = {
        QueryRoute.PDF_QUERY: "pdf",
        QueryRoute.WEB_QUERY: "web",
        QueryRoute.MARKDOWN_QUERY: "markdown",
        QueryRoute.SQL_QUERY: "sql",
    }
    return mapping.get(route)

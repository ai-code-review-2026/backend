from __future__ import annotations

import hashlib
import html
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse


_HEADING_PATTERN = re.compile(r"^(#{1,6})\s+(?P<title>.+?)\s*$")
_SQL_ENTITY_PATTERN = re.compile(
    r"^\s*create\s+(?:or\s+replace\s+)?(?P<entity_type>table|view|materialized\s+view|function|procedure|index)\s+(?:if\s+not\s+exists\s+)?(?P<entity_name>[^\s(]+)",
    re.IGNORECASE,
)
_HTML_TAG_PATTERN = re.compile(r"<[a-z!/][^>]*>", re.IGNORECASE)
_SECTION_HEADING_PATTERN = re.compile(r"^(?:\d+(?:\.\d+)*\s+)?[A-Z][A-Za-z0-9 /()_-]{2,120}$")


@dataclass(frozen=True)
class DocumentSectionInput:
    content: str
    section_title: str | None = None
    heading_path: tuple[str, ...] = ()
    page: int | None = None
    entity_type: str | None = None
    entity_name: str | None = None
    line_start: int | None = None
    line_end: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class DocumentChunkDraft:
    content: str
    embedding_text: str
    metadata: dict[str, Any]


@dataclass(frozen=True)
class DocumentIngestionResult:
    source_type: str
    source_uri: str | None
    domain: str | None
    content_hash: str
    version: str | None
    chunks: list[DocumentChunkDraft]


def build_document_ingestion_result(
    *,
    title: str,
    source_type: str,
    content: str,
    path_or_url: str | None = None,
    source_uri: str | None = None,
    content_hash: str | None = None,
    version: str | None = None,
    doc_version: int | None = None,
    tags: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
    pages: list[str] | None = None,
    sections: list[DocumentSectionInput] | None = None,
) -> DocumentIngestionResult:
    resolved_source_uri = _normalize_optional_str(source_uri) or _normalize_optional_str(path_or_url)
    resolved_domain = _extract_domain(resolved_source_uri)
    resolved_metadata = dict(metadata or {})
    resolved_version = _normalize_optional_str(version) or (str(doc_version) if doc_version is not None else None)
    hash_basis = content
    if not hash_basis and pages:
        hash_basis = "\n\f\n".join(pages)
    if not hash_basis and sections:
        hash_basis = "\n\n".join(section.content for section in sections)
    resolved_hash = _normalize_optional_str(content_hash) or _hash_content(hash_basis)
    normalized_tags = tuple(_normalize_string_list(tags))

    if sections:
        chunk_sections = sections
    elif source_type == "pdf":
        chunk_sections = _build_pdf_sections(content=content, pages=pages)
    elif source_type == "web":
        chunk_sections = _build_web_sections(content=content, source_uri=resolved_source_uri)
    elif source_type == "markdown":
        chunk_sections = _build_markdown_sections(content)
    elif source_type == "sql":
        chunk_sections = _build_sql_sections(content)
    else:
        chunk_sections = _build_generic_sections(content)

    chunks: list[DocumentChunkDraft] = []
    for section_index, section in enumerate(chunk_sections):
        base_metadata = {
            "source_uri": resolved_source_uri,
            "content_hash": resolved_hash,
            "version": resolved_version,
            "document_version": resolved_version,
            "domain": resolved_domain,
            "doc_version": resolved_version,
            **resolved_metadata,
            **dict(section.metadata or {}),
        }
        chunked_sections = _chunk_section_content(
            title=title,
            source_type=source_type,
            content=section.content,
            section_title=section.section_title,
            heading_path=section.heading_path,
            page=section.page,
            entity_type=section.entity_type,
            entity_name=section.entity_name,
            line_start=section.line_start,
            line_end=section.line_end,
            path_or_url=path_or_url,
            source_uri=resolved_source_uri,
            tags=normalized_tags,
            metadata=base_metadata,
            section_index=section_index,
        )
        chunks.extend(chunked_sections)

    return DocumentIngestionResult(
        source_type=source_type,
        source_uri=resolved_source_uri,
        domain=resolved_domain,
        content_hash=resolved_hash,
        version=resolved_version,
        chunks=chunks,
    )


def chunk_metadata_for_storage(metadata: dict[str, Any]) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for key, value in metadata.items():
        if value is None:
            continue
        if isinstance(value, (str, int, float, bool)):
            normalized[key] = value
            continue
        if isinstance(value, tuple):
            normalized[key] = [item for item in value if isinstance(item, str) and item.strip()]
            continue
        if isinstance(value, list):
            normalized[key] = value
            continue
        if isinstance(value, dict):
            normalized[key] = value
    return normalized


class _WebContentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title: str | None = None
        self.sections: list[DocumentSectionInput] = []
        self._skip_depth = 0
        self._current_title: str | None = None
        self._heading_path: list[str] = []
        self._active_heading_level: int | None = None
        self._buffer: list[str] = []
        self._title_buffer: list[str] = []
        self._inside_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        if lowered in {"script", "style", "noscript", "svg"}:
            self._skip_depth += 1
            return
        if self._skip_depth > 0:
            return
        if lowered == "title":
            self._title_buffer = []
            self._inside_title = True
            return
        if lowered in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            self._flush_section()
            self._active_heading_level = int(lowered[1])
            self._buffer = []
            return
        if lowered in {"p", "li", "pre", "code", "table", "blockquote"} and self._buffer and self._buffer[-1] != "\n":
            self._buffer.append("\n")

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        if lowered in {"script", "style", "noscript", "svg"}:
            self._skip_depth = max(self._skip_depth - 1, 0)
            return
        if self._skip_depth > 0:
            return
        if lowered == "title":
            candidate = _normalize_text("".join(self._title_buffer))
            if candidate:
                self.title = candidate
            self._title_buffer = []
            self._inside_title = False
            return
        if lowered in {"h1", "h2", "h3", "h4", "h5", "h6"}:
            heading_text = _normalize_text("".join(self._buffer))
            if heading_text:
                level = self._active_heading_level or 1
                while len(self._heading_path) >= level:
                    self._heading_path.pop()
                self._heading_path.append(heading_text)
                self._current_title = heading_text
            self._buffer = []
            self._active_heading_level = None
            return
        if lowered in {"p", "li", "pre", "code", "table", "blockquote", "div", "section", "article"} and self._buffer:
            if self._buffer[-1] != "\n":
                self._buffer.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        if self._inside_title:
            self._title_buffer.append(data)
            return
        self._buffer.append(data)

    def close(self) -> None:
        self._flush_section()
        super().close()

    def _flush_section(self) -> None:
        content = _normalize_text("".join(self._buffer))
        self._buffer = []
        if not content:
            return
        self.sections.append(
            DocumentSectionInput(
                content=content,
                section_title=self._current_title or self.title,
                heading_path=tuple(self._heading_path),
            )
        )


def _build_pdf_sections(*, content: str, pages: list[str] | None) -> list[DocumentSectionInput]:
    page_chunks = pages or _split_pdf_pages(content)
    if not page_chunks:
        return _build_generic_sections(content)

    sections: list[DocumentSectionInput] = []
    for index, page_text in enumerate(page_chunks, start=1):
        normalized_page = _normalize_text(page_text)
        if not normalized_page:
            continue
        paragraphs = _split_paragraphs(normalized_page)
        if not paragraphs:
            continue
        active_heading: str | None = None
        buffer: list[str] = []
        for paragraph in paragraphs:
            if _looks_like_section_heading(paragraph):
                if buffer:
                    sections.append(
                        DocumentSectionInput(
                            content="\n\n".join(buffer),
                            section_title=active_heading,
                            page=index,
                        )
                    )
                    buffer = []
                active_heading = paragraph
                continue
            buffer.append(paragraph)
        if buffer:
            sections.append(
                DocumentSectionInput(
                    content="\n\n".join(buffer),
                    section_title=active_heading,
                    page=index,
                )
            )
    return sections or _build_generic_sections(content)


def _split_pdf_pages(content: str) -> list[str]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    if "\f" in normalized:
        return [item for item in normalized.split("\f") if item.strip()]
    return [normalized] if normalized.strip() else []


def _build_web_sections(content: str, *, source_uri: str | None) -> list[DocumentSectionInput]:
    if _HTML_TAG_PATTERN.search(content):
        parser = _WebContentParser()
        parser.feed(content)
        parser.close()
        sections = parser.sections
        if sections:
            return sections
        title = parser.title or _normalize_optional_str(source_uri)
        if title:
            return [DocumentSectionInput(content=_strip_html(content), section_title=title)]
    plain_text = _normalize_text(_strip_html(content))
    if not plain_text:
        return []
    section_title = _normalize_optional_str(source_uri)
    return [DocumentSectionInput(content=plain_text, section_title=section_title)]


def _build_markdown_sections(content: str) -> list[DocumentSectionInput]:
    normalized = content.replace("\r\n", "\n").replace("\r", "\n")
    lines = normalized.split("\n")
    heading_path: list[str] = []
    current_lines: list[str] = []
    current_title: str | None = None
    sections: list[DocumentSectionInput] = []

    def flush() -> None:
        if not current_lines:
            return
        section_content = _normalize_text("\n".join(current_lines))
        if not section_content:
            return
        sections.append(
            DocumentSectionInput(
                content=section_content,
                section_title=current_title,
                heading_path=tuple(heading_path),
            )
        )

    for line in lines:
        match = _HEADING_PATTERN.match(line)
        if match:
            flush()
            current_lines = []
            current_title = match.group("title").strip()
            level = len(match.group(1))
            while len(heading_path) >= level:
                heading_path.pop()
            heading_path.append(current_title)
            continue
        current_lines.append(line)
    flush()
    return sections or _build_generic_sections(content)


def _build_sql_sections(content: str) -> list[DocumentSectionInput]:
    statements = _split_sql_statements(content)
    if not statements:
        return _build_generic_sections(content)

    sections: list[DocumentSectionInput] = []
    line_number = 1
    for statement in statements:
        normalized = _normalize_text(statement)
        if not normalized:
            continue
        entity_type = None
        entity_name = None
        match = _SQL_ENTITY_PATTERN.match(normalized)
        if match:
            entity_type = match.group("entity_type").lower().replace(" ", "_")
            entity_name = match.group("entity_name").strip().strip('"')
        start_line = line_number
        end_line = start_line + statement.count("\n")
        line_number = end_line + 1
        sections.append(
            DocumentSectionInput(
                content=normalized,
                section_title=entity_name or entity_type or "sql_statement",
                entity_type=entity_type,
                entity_name=entity_name,
                line_start=start_line,
                line_end=end_line,
            )
        )
    return sections


def _split_sql_statements(content: str) -> list[str]:
    statements: list[str] = []
    current: list[str] = []
    for line in content.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        stripped = line.strip()
        if stripped.startswith("--") and not current:
            continue
        current.append(line)
        if stripped.endswith(";"):
            statements.append("\n".join(current))
            current = []
    if current:
        statements.append("\n".join(current))
    return [item for item in statements if _normalize_text(item)]


def _build_generic_sections(content: str) -> list[DocumentSectionInput]:
    normalized = _normalize_text(content)
    if not normalized:
        return []
    paragraphs = _split_paragraphs(normalized)
    if not paragraphs:
        return []
    return [DocumentSectionInput(content="\n\n".join(paragraphs))]


def _chunk_section_content(
    *,
    title: str,
    source_type: str,
    content: str,
    section_title: str | None,
    heading_path: tuple[str, ...],
    page: int | None,
    entity_type: str | None,
    entity_name: str | None,
    line_start: int | None,
    line_end: int | None,
    path_or_url: str | None,
    source_uri: str | None,
    tags: tuple[str, ...],
    metadata: dict[str, Any],
    section_index: int,
) -> list[DocumentChunkDraft]:
    chunk_size = 1800
    overlap = 220
    text = _normalize_text(content)
    if not text:
        return []

    raw_chunks = _chunk_text(text, chunk_size=chunk_size, overlap=overlap)
    drafts: list[DocumentChunkDraft] = []
    for chunk_offset, chunk in enumerate(raw_chunks):
        resolved_section = section_title or (heading_path[-1] if heading_path else None) or title
        chunk_metadata = {
            **metadata,
            "section_title": resolved_section,
            "heading_path": list(heading_path),
            "page": page,
            "entity_type": entity_type,
            "entity_name": entity_name,
            "line_start": line_start,
            "line_end": line_end,
            "path_or_url": path_or_url,
            "source_uri": source_uri,
            "source_type": source_type,
            "tags": list(tags),
            "section_index": section_index,
            "chunk_offset": chunk_offset,
        }
        drafts.append(
            DocumentChunkDraft(
                content=chunk,
                embedding_text=_build_embedding_text(
                    title=title,
                    source_type=source_type,
                    content=chunk,
                    path_or_url=path_or_url,
                    source_uri=source_uri,
                    section_title=resolved_section,
                    heading_path=heading_path,
                    page=page,
                    entity_type=entity_type,
                    entity_name=entity_name,
                    tags=tags,
                ),
                metadata=chunk_metadata_for_storage(chunk_metadata),
            )
        )
    return drafts


def _build_embedding_text(
    *,
    title: str,
    source_type: str,
    content: str,
    path_or_url: str | None,
    source_uri: str | None,
    section_title: str | None,
    heading_path: tuple[str, ...],
    page: int | None,
    entity_type: str | None,
    entity_name: str | None,
    tags: tuple[str, ...],
) -> str:
    lines = [
        f"title:{title}",
        f"source_type:{source_type}",
    ]
    if path_or_url:
        lines.append(f"path:{path_or_url}")
    if source_uri:
        lines.append(f"source_uri:{source_uri}")
    if section_title:
        lines.append(f"section:{section_title}")
    if heading_path:
        lines.append(f"heading_path:{' > '.join(heading_path)}")
    if page is not None:
        lines.append(f"page:{page}")
    if entity_type:
        lines.append(f"entity_type:{entity_type}")
    if entity_name:
        lines.append(f"entity_name:{entity_name}")
    if tags:
        lines.append(f"tags:{', '.join(tags)}")
    lines.append(content)
    return "\n".join(lines)


def _chunk_text(content: str, *, chunk_size: int, overlap: int) -> list[str]:
    if not content.strip():
        return []
    chunks: list[str] = []
    start = 0
    while start < len(content):
        end = min(len(content), start + chunk_size)
        if end < len(content):
            split_at = max(content.rfind("\n\n", start, end), content.rfind(". ", start, end))
            if split_at > start + max(chunk_size // 3, 200):
                end = split_at + 1
        part = content[start:end].strip()
        if part:
            chunks.append(part)
        if end >= len(content):
            break
        start = max(0, end - overlap)
    return chunks


def _hash_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _extract_domain(source_uri: str | None) -> str | None:
    if not source_uri:
        return None
    parsed = urlparse(source_uri)
    hostname = parsed.hostname
    return hostname.lower() if hostname else None


def _normalize_optional_str(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    return normalized or None


def _normalize_text(value: str) -> str:
    text = value.replace("\r\n", "\n").replace("\r", "\n")
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _normalize_string_list(values: list[str] | None) -> list[str]:
    items: list[str] = []
    for value in values or []:
        if not isinstance(value, str):
            continue
        normalized = value.strip()
        if normalized and normalized not in items:
            items.append(normalized)
    return items


def _split_paragraphs(content: str) -> list[str]:
    parts = [part.strip() for part in re.split(r"\n\s*\n", content) if part.strip()]
    return parts


def _looks_like_section_heading(value: str) -> bool:
    normalized = value.strip()
    if not normalized or len(normalized.split()) > 12:
        return False
    return bool(_SECTION_HEADING_PATTERN.match(normalized))


def _strip_html(content: str) -> str:
    without_scripts = re.sub(r"(?is)<(script|style|noscript).*?>.*?</\1>", " ", content)
    stripped = re.sub(r"(?s)<[^>]+>", " ", without_scripts)
    return _normalize_text(stripped)


def utc_iso_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

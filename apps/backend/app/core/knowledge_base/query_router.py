from __future__ import annotations

import re

from app.core.knowledge_base.retrieval_models import QueryRoute

_POLICY_KEYWORDS = {
    "policy",
    "policies",
    "rule",
    "rules",
    "security",
    "compliance",
    "owasp",
    "secret",
    "secrets",
    "permission",
    "permissions",
    "rbac",
    "governance",
}
_DOCUMENT_KEYWORDS = {
    "pdf",
    "document",
    "documentation",
    "docs",
    "readme",
    "markdown",
    "architecture",
    "design",
    "adr",
    "guide",
    "manual",
}
_PDF_KEYWORDS = {"pdf", "appendix", "report", "whitepaper"}
_WEB_KEYWORDS = {"http", "https", "url", "website", "web", "webpage", "site", "domain", "faq"}
_MARKDOWN_KEYWORDS = {"markdown", "readme", "md", "mdx", "adr", "rfc", "runbook", "changelog"}
_SQL_KEYWORDS = {
    "sql",
    "schema",
    "table",
    "tables",
    "column",
    "columns",
    "view",
    "views",
    "procedure",
    "procedures",
    "migration",
    "migrations",
    "foreign",
    "index",
}
_MULTI_SOURCE_PATTERNS = (
    "across docs and code",
    "across sources",
    "multiple sources",
    "cross reference",
    "cross-reference",
)
_CODE_PATH_PATTERN = re.compile(r"\b[\w./-]+\.(?:py|pyi|ts|tsx|js|jsx|go|java|kt|rs|rb|php|sql|md|mdx|ya?ml|json|toml)\b")
_CODE_SYMBOL_PATTERN = re.compile(r"`[A-Za-z_][A-Za-z0-9_./:-]*`|[A-Za-z_][A-Za-z0-9_]*\(")


class QueryRouter:
    def route_query(self, *, query: str, route_hint: str = "auto") -> QueryRoute:
        normalized_hint = (route_hint or "auto").strip().lower()
        if normalized_hint == QueryRoute.REPO_QUERY.value:
            return QueryRoute.REPO_QUERY
        if normalized_hint == QueryRoute.CODE_QUERY.value:
            return QueryRoute.CODE_QUERY
        if normalized_hint == QueryRoute.POLICY_QUERY.value:
            return QueryRoute.POLICY_QUERY
        if normalized_hint == QueryRoute.DOCUMENT_QUERY.value:
            return QueryRoute.DOCUMENT_QUERY
        if normalized_hint == QueryRoute.PDF_QUERY.value:
            return QueryRoute.PDF_QUERY
        if normalized_hint == QueryRoute.WEB_QUERY.value:
            return QueryRoute.WEB_QUERY
        if normalized_hint == QueryRoute.MARKDOWN_QUERY.value:
            return QueryRoute.MARKDOWN_QUERY
        if normalized_hint == QueryRoute.SQL_QUERY.value:
            return QueryRoute.SQL_QUERY
        if normalized_hint == QueryRoute.MULTI_SOURCE_QUERY.value:
            return QueryRoute.MULTI_SOURCE_QUERY

        normalized_query = query.strip().lower()
        if not normalized_query:
            return QueryRoute.GENERIC_HYBRID_QUERY

        if any(pattern in normalized_query for pattern in _MULTI_SOURCE_PATTERNS):
            return QueryRoute.MULTI_SOURCE_QUERY

        query_terms = set(re.findall(r"[a-z0-9_./-]+", normalized_query))
        if query_terms.intersection(_POLICY_KEYWORDS):
            return QueryRoute.POLICY_QUERY

        looks_like_path = bool(_CODE_PATH_PATTERN.search(query))
        looks_like_symbol = bool(_CODE_SYMBOL_PATTERN.search(query))
        if looks_like_path or looks_like_symbol:
            return QueryRoute.CODE_QUERY

        if query_terms.intersection(_SQL_KEYWORDS):
            return QueryRoute.SQL_QUERY

        if normalized_query.startswith("http://") or normalized_query.startswith("https://") or query_terms.intersection(_WEB_KEYWORDS):
            return QueryRoute.WEB_QUERY

        if query_terms.intersection(_MARKDOWN_KEYWORDS):
            return QueryRoute.MARKDOWN_QUERY

        if query_terms.intersection(_PDF_KEYWORDS):
            return QueryRoute.PDF_QUERY

        if query_terms.intersection(_DOCUMENT_KEYWORDS):
            return QueryRoute.DOCUMENT_QUERY

        return QueryRoute.GENERIC_HYBRID_QUERY

    def route_diff(self) -> QueryRoute:
        return QueryRoute.DIFF_REVIEW

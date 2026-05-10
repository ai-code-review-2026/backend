from __future__ import annotations

from app.core.knowledge_base.query_router import QueryRouter
from app.core.knowledge_base.retrieval_models import QueryRoute


def test_query_router_prefers_route_hint() -> None:
    router = QueryRouter()
    assert router.route_query(query="anything", route_hint="policy_query") == QueryRoute.POLICY_QUERY


def test_query_router_detects_policy_query() -> None:
    router = QueryRouter()
    assert router.route_query(query="Which security policy blocks secrets?") == QueryRoute.POLICY_QUERY


def test_query_router_detects_document_query() -> None:
    router = QueryRouter()
    assert router.route_query(query="Summarize this architecture documentation guide") == QueryRoute.DOCUMENT_QUERY


def test_query_router_detects_pdf_query() -> None:
    router = QueryRouter()
    assert router.route_query(query="What does the PDF report say about retention?") == QueryRoute.PDF_QUERY


def test_query_router_detects_web_query() -> None:
    router = QueryRouter()
    assert router.route_query(query="https://docs.example.com/auth login flow") == QueryRoute.WEB_QUERY


def test_query_router_detects_markdown_query() -> None:
    router = QueryRouter()
    assert router.route_query(query="Summarize the README markdown setup steps") == QueryRoute.MARKDOWN_QUERY


def test_query_router_detects_sql_query() -> None:
    router = QueryRouter()
    assert router.route_query(query="Which SQL table stores sessions and what columns does it use?") == QueryRoute.SQL_QUERY


def test_query_router_detects_repo_query_from_path() -> None:
    router = QueryRouter()
    assert router.route_query(query="Explain apps/backend/app/main.py") == QueryRoute.CODE_QUERY


def test_query_router_detects_multi_source_query() -> None:
    router = QueryRouter()
    assert router.route_query(query="Compare this issue across docs and code") == QueryRoute.MULTI_SOURCE_QUERY


def test_query_router_defaults_to_generic_hybrid() -> None:
    router = QueryRouter()
    assert router.route_query(query="How does the platform work overall?") == QueryRoute.GENERIC_HYBRID_QUERY

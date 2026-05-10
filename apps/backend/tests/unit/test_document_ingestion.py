from __future__ import annotations

from app.core.knowledge_base.document_ingestion import DocumentSectionInput, build_document_ingestion_result


def test_markdown_ingestion_preserves_heading_metadata() -> None:
    result = build_document_ingestion_result(
        title="Auth Guide",
        source_type="markdown",
        path_or_url="docs/auth.md",
        content="# Login\nUse SSO.\n\n## Refresh\nRotate tokens safely.",
        tags=["markdown"],
        doc_version=3,
    )

    assert result.source_type == "markdown"
    assert len(result.chunks) >= 2
    assert result.chunks[0].metadata["section_title"] == "Login"
    assert result.chunks[0].metadata["heading_path"] == ["Login"]
    assert result.chunks[1].metadata["section_title"] == "Refresh"
    assert result.chunks[1].metadata["heading_path"] == ["Login", "Refresh"]


def test_pdf_ingestion_uses_pages_and_sections() -> None:
    result = build_document_ingestion_result(
        title="Security Policy",
        source_type="pdf",
        content="",
        pages=[
            "Authentication Policy\nPasswords must be rotated every 90 days.",
            "Admin Access\nTwo person approval is required.",
        ],
        doc_version=1,
    )

    assert len(result.chunks) == 2
    assert result.chunks[0].metadata["page"] == 1
    assert result.chunks[1].metadata["page"] == 2


def test_sql_ingestion_extracts_entity_metadata() -> None:
    result = build_document_ingestion_result(
        title="Schema",
        source_type="sql",
        content="""
        CREATE TABLE public.users (
            id UUID PRIMARY KEY,
            email TEXT NOT NULL
        );

        CREATE VIEW public.active_users AS
        SELECT id, email FROM public.users;
        """,
        doc_version=2,
    )

    assert len(result.chunks) == 2
    assert result.chunks[0].metadata["entity_type"] == "table"
    assert result.chunks[0].metadata["entity_name"] == "public.users"
    assert result.chunks[1].metadata["entity_type"] == "view"
    assert result.chunks[1].metadata["entity_name"] == "public.active_users"


def test_structured_sections_work_without_root_content() -> None:
    result = build_document_ingestion_result(
        title="Web FAQ",
        source_type="web",
        content="",
        source_uri="https://docs.example.com/auth",
        sections=[
            DocumentSectionInput(
                content="Reset passwords from the account page.",
                section_title="Reset password",
                heading_path=("Auth", "Reset password"),
                metadata={"crawl_timestamp": "2026-03-19T00:00:00Z"},
            )
        ],
        doc_version=4,
    )

    assert len(result.chunks) == 1
    assert result.chunks[0].metadata["source_uri"] == "https://docs.example.com/auth"
    assert result.chunks[0].metadata["domain"] == "docs.example.com"
    assert result.chunks[0].metadata["heading_path"] == ["Auth", "Reset password"]

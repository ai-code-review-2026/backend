from __future__ import annotations

from app.core.knowledge_base.lexical_retriever import LexicalRetriever
from app.data.repos.kb_repo import KBDocumentChunkRow
from app.data.repos.repo_context_chunks_repo import RepoContextChunkRow


class _FakeCodeRepo:
    def search_lexical(self, repo_id: str, query: str, limit: int = 12) -> list[RepoContextChunkRow]:  # noqa: ARG002
        return [
            RepoContextChunkRow(
                id="1",
                repo_id="repo",
                path="apps/backend/app/main.py",
                chunk_index=0,
                content="def login_user(payload): return payload",
                language="python",
                file_type="code",
                chunk_type="function",
                symbol_name="login_user",
                start_line=1,
                end_line=1,
                indexed_commit="abc",
                metadata={},
                lexical_score=0.9,
            ),
            RepoContextChunkRow(
                id="2",
                repo_id="repo",
                path="apps/backend/app/other.py",
                chunk_index=0,
                content="def other(payload): return payload",
                language="python",
                file_type="code",
                chunk_type="function",
                symbol_name="other",
                start_line=1,
                end_line=1,
                indexed_commit="abc",
                metadata={},
                lexical_score=0.5,
            ),
        ][:limit]


class _FakeKBRepo:
    def search_document_chunks(
        self,
        *,
        repo_id: str,
        query: str,
        limit: int = 8,
        source_type: str | None = None,
        tags: list[str] | None = None,
    ) -> list[KBDocumentChunkRow]:  # noqa: ARG002
        return [
            KBDocumentChunkRow(
                doc_id="doc_1",
                title="Security Policy",
                source_type=source_type or "policy",
                path_or_url="policy/security.md",
                chunk_index=0,
                content="Never expose secrets in logs.",
                token_count=6,
                tags=tags or ["policy"],
                lexical_score=0.8,
                metadata={
                    "section_title": "Secrets",
                    "source_uri": "https://docs.example.com/security",
                    "page": 3,
                },
            )
        ][:limit]

    def search_global_document_chunks(
        self,
        *,
        query: str,
        limit: int = 8,
        source_type: str | None = None,
        tags: list[str] | None = None,
    ) -> list[KBDocumentChunkRow]:  # noqa: ARG002
        return [
            KBDocumentChunkRow(
                doc_id="doc_global",
                title="Architecture Guide",
                source_type=source_type or "pdf",
                path_or_url="global/architecture.pdf",
                chunk_index=1,
                content="Use repository context and security guardrails during reviews.",
                token_count=9,
                tags=tags or ["pdf", "dashboard_upload"],
                lexical_score=0.77,
                metadata={"page": 5},
            )
        ][:limit]


def test_lexical_retriever_filters_code_by_changed_files() -> None:
    retriever = LexicalRetriever(code_repo=_FakeCodeRepo(), kb_repo=_FakeKBRepo())  # type: ignore[arg-type]
    candidates = retriever.retrieve_code(
        repo_id="repo",
        query="login_user",
        limit=4,
        changed_files={"apps/backend/app/main.py"},
    )

    assert len(candidates) == 1
    assert candidates[0].chunk.path == "apps/backend/app/main.py"


def test_lexical_retriever_maps_document_results() -> None:
    retriever = LexicalRetriever(code_repo=_FakeCodeRepo(), kb_repo=_FakeKBRepo())  # type: ignore[arg-type]
    candidates = retriever.retrieve_documents(
        repo_id="repo",
        query="secrets",
        limit=4,
        source_type="policy",
        tags=["policy"],
    )

    assert len(candidates) == 1
    assert candidates[0].chunk.source_type == "policy"
    assert candidates[0].chunk.document_id == "doc_1"
    assert candidates[0].chunk.section_title == "Secrets"
    assert candidates[0].chunk.source_uri == "https://docs.example.com/security"
    assert candidates[0].chunk.page == 3


def test_lexical_retriever_maps_global_document_results() -> None:
    retriever = LexicalRetriever(code_repo=_FakeCodeRepo(), kb_repo=_FakeKBRepo())  # type: ignore[arg-type]
    candidates = retriever.retrieve_global_documents(
        query="architecture security guardrails",
        limit=4,
    )

    assert len(candidates) == 1
    assert candidates[0].chunk.document_id == "doc_global"
    assert candidates[0].channel == "lexical_global_document"

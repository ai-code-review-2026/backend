from __future__ import annotations

from app.core.knowledge_base.exact_retriever import ExactRetriever
from app.data.repos.repo_context_chunks_repo import RepoContextChunkRow


class _FakeRepo:
    def list_by_path(self, repo_id: str, path: str, limit: int = 8) -> list[RepoContextChunkRow]:  # noqa: ARG002
        return [
            RepoContextChunkRow(
                id="row_path",
                repo_id="repo",
                path=path,
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
            )
        ][:limit]

    def list_by_symbol(self, repo_id: str, symbol_name: str, limit: int = 8) -> list[RepoContextChunkRow]:  # noqa: ARG002
        return [
            RepoContextChunkRow(
                id="row_symbol",
                repo_id="repo",
                path="apps/backend/app/main.py",
                chunk_index=1,
                content=f"def {symbol_name}(payload): return payload",
                language="python",
                file_type="code",
                chunk_type="function",
                symbol_name=symbol_name,
                start_line=10,
                end_line=11,
                indexed_commit="abc",
                metadata={},
            )
        ][:limit]

    def list_related_test_chunks(self, repo_id: str, changed_files: list[str], limit: int = 8) -> list[RepoContextChunkRow]:  # noqa: ARG002
        return [
            RepoContextChunkRow(
                id="row_test",
                repo_id="repo",
                path="tests/test_login.py",
                chunk_index=0,
                content="def test_login_user(): assert True",
                language="python",
                file_type="test",
                chunk_type="test_case",
                symbol_name="test_login_user",
                start_line=1,
                end_line=1,
                indexed_commit="abc",
                metadata={},
            )
        ][:limit]


def test_exact_retriever_maps_path_and_symbol_results() -> None:
    retriever = ExactRetriever(repo=_FakeRepo())  # type: ignore[arg-type]

    file_candidates = retriever.retrieve_file_chunks(repo_id="repo", paths=["apps/backend/app/main.py"], per_file_limit=2)
    symbol_candidates = retriever.retrieve_symbol_chunks(repo_id="repo", symbols={"login_user"}, per_symbol_limit=2)

    assert file_candidates[0].chunk.path == "apps/backend/app/main.py"
    assert symbol_candidates[0].chunk.symbol_name == "login_user"
    assert symbol_candidates[0].channel == "symbol_exact"


def test_exact_retriever_extracts_query_hints() -> None:
    retriever = ExactRetriever(repo=_FakeRepo())  # type: ignore[arg-type]
    candidates = retriever.retrieve_query_hints(
        repo_id="repo",
        query="Where is `login_user` in apps/backend/app/main.py?",
        limit=4,
    )

    assert any(item.channel == "file_exact" for item in candidates)
    assert any(item.channel == "symbol_exact" for item in candidates)


def test_exact_retriever_returns_related_tests() -> None:
    retriever = ExactRetriever(repo=_FakeRepo())  # type: ignore[arg-type]
    candidates = retriever.retrieve_related_tests(repo_id="repo", changed_files=["apps/backend/app/main.py"], limit=2)

    assert len(candidates) == 1
    assert candidates[0].chunk.file_type == "test"

from __future__ import annotations

from types import SimpleNamespace

from app.core.knowledge_base.retriever import (
    _build_query_from_diff,
    _extract_added_lines_from_diff,
    _extract_paths_from_diff,
    _extract_symbols_from_diff,
    _to_retrieved_chunks,
)


def test_extract_paths_from_valid_diff() -> None:
    diff_text = """diff --git a/app/main.py b/app/main.py
index 123..456 100644
--- a/app/main.py
+++ b/app/main.py
@@ -1 +1 @@
-print("old")
+print("new")
"""

    paths = _extract_paths_from_diff(diff_text)
    assert paths == ["app/main.py"]


def test_extract_paths_fallback_on_partial_diff() -> None:
    diff_text = """something else
diff --git a/apps/a.py b/apps/a.py
random
diff --git a/apps/b.py b/apps/b.py
"""

    paths = _extract_paths_from_diff(diff_text)
    assert paths == ["apps/a.py", "apps/b.py"]


def test_build_query_contains_files_and_excerpt() -> None:
    diff_text = "diff --git a/x.py b/x.py\n+print('hello')"
    query = _build_query_from_diff(diff_text=diff_text, changed_files=["x.py"])

    assert "Changed files: x.py" in query
    assert "Raw diff excerpt:" in query


def test_extract_symbols_from_diff_detects_function_and_class() -> None:
    diff_text = """diff --git a/app/main.py b/app/main.py
+def login_user(payload):
+    return payload
+class AuthService:
+    pass
"""

    symbols = _extract_symbols_from_diff(diff_text)
    assert "login_user" in symbols
    assert "AuthService" in symbols


def test_extract_added_lines_from_diff_cleans_comments() -> None:
    diff_text = """diff --git a/a.py b/a.py
+value = compute()  # inline comment
+// js comment
+keep_me = 1
"""
    lines = _extract_added_lines_from_diff(diff_text)
    assert "value = compute()" in lines
    assert "keep_me = 1" in lines


def test_to_retrieved_chunks_supports_document_payloads() -> None:
    hits = [
        SimpleNamespace(
            score=0.91,
            payload={
                "title": "design.pdf",
                "content": "architecture patterns and guardrails",
                "chunk_index": 2,
                "source_type": "pdf",
                "chunk_type": "document_chunk",
                "page": 7,
                "section_title": "Architecture",
            },
        )
    ]

    chunks = _to_retrieved_chunks(hits, source="document")

    assert len(chunks) == 1
    assert chunks[0].path == "design.pdf"
    assert chunks[0].file_type == "pdf"
    assert chunks[0].chunk_type == "document_chunk"
    assert chunks[0].page == 7
    assert chunks[0].section_title == "Architecture"

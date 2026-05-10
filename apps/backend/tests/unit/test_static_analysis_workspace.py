from __future__ import annotations

from pathlib import Path

from app.core.review_engine.diff_engine import parse_unified_diff
from app.core.static_analysis.workspace import prepare_workspace


def test_prepare_workspace_reconstructs_imported_folder_snapshot() -> None:
    diff_text = "\n".join(
        [
            "diff --git a/src/main.py b/src/main.py",
            "new file mode 100644",
            "index 0000000..1111111",
            "--- /dev/null",
            "+++ b/src/main.py",
            "@@ -0,0 +1,2 @@",
            "+print('hello')",
            "+value = 1",
            "",
            "diff --git a/README.md b/README.md",
            "new file mode 100644",
            "index 0000000..1111111",
            "--- /dev/null",
            "+++ b/README.md",
            "@@ -0,0 +1,1 @@",
            "+# Demo",
            "",
        ]
    )
    parsed = parse_unified_diff(diff_text)

    workspace = prepare_workspace(
        repo="local/demo",
        commit_sha=None,
        default_workspace_path=".",
        auto_checkout_enabled=True,
        git_host="github.com",
        git_token=None,
        checkout_timeout_seconds=1,
        checkout_base_path=None,
        parsed=parsed,
        metadata={"workspace_source": "imported_folder_snapshot"},
    )

    try:
        root = Path(workspace.path)
        assert workspace.source == "snapshot"
        assert (root / "src" / "main.py").read_text(encoding="utf-8") == "print('hello')\nvalue = 1"
        assert (root / "README.md").read_text(encoding="utf-8") == "# Demo"
    finally:
        cleanup_root = Path(workspace.path).parent
        workspace.cleanup()

    assert not cleanup_root.exists()

from __future__ import annotations

import importlib.util
from pathlib import Path


def _load_script_module():
    script_path = Path(__file__).resolve().parents[4] / "scripts" / "github_pr_review.py"
    spec = importlib.util.spec_from_file_location("github_pr_review_script", script_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_format_review_markdown_includes_clean_code_findings_section() -> None:
    module = _load_script_module()
    analysis = {
        "analysis_id": "analysis-1",
        "status": "COMPLETED",
        "summary": "Fallback summary",
        "static_findings": [
            {
                "source": "STATIC_CLEAN_CODE",
                "rule_id": "magic_number.detected",
                "file_path": "src/auth/login.py",
                "line_start": 42,
                "severity": "INFO",
                "message": "Magic number detected (3). Replace it with a named constant.",
                "suggestion": "Define MAX_LOGIN_ATTEMPTS = 3",
            }
        ],
        "review_output": {
            "summary": {
                "short_summary": "Short summary",
                "detailed_summary": "Detailed summary text for the review output.",
                "change_type": "refactor",
                "risk_level": "medium",
            },
            "change_explanation": {"watch_areas": []},
            "merge_readiness": {"status": "ready", "reason": "No blocking risk."},
            "risk_findings": [],
            "generated_tests": [],
            "key_changes": [],
        },
    }

    markdown = module.format_review_markdown(analysis)

    assert "### Clean Code Findings" in markdown
    assert "magic_number.detected" in markdown
    assert "MAX_LOGIN_ATTEMPTS = 3" in markdown

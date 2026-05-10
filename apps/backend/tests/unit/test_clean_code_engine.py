from __future__ import annotations

from pathlib import Path

from app.core.clean_code import CleanCodeRuleEngine
from app.core.static_analysis.clean_code_analyzer import CleanCodeAnalyzer
from app.core.static_analysis.normalizer import normalize_raw_finding


def test_clean_code_engine_detects_rule_families(tmp_path: Path) -> None:
    workspace = tmp_path / "repo"
    workspace.mkdir()

    python_file = workspace / "src" / "auth" / "login.py"
    python_file.parent.mkdir(parents=True)
    python_file.write_text(
        "\n".join(
            [
                "def Process(data):",
                "    tmp = 3",
                "    if data > 2:",
                "        tmp += 4",
                "    if data > 5:",
                "        tmp += 6",
                "    if data > 7:",
                "        tmp += 8",
                "    try:",
                "        risky_call()",
                "    except Exception:",
                "        pass",
                "    total = tmp * 42",
                "    # return total",
                "    return total",
            ]
        ),
        encoding="utf-8",
    )

    ts_file = workspace / "src" / "ui" / "widget.ts"
    ts_file.parent.mkdir(parents=True)
    ts_file.write_text(
        "\n".join(
            [
                "export function xx(data: number) {",
                "  const value = data + 3;",
                "  if (value > 4) {",
                "    return value * 9;",
                "  }",
                "  // return value",
                "  return value;",
                "}",
            ]
        ),
        encoding="utf-8",
    )

    duplicate_a = workspace / "src" / "dup_a.ts"
    duplicate_b = workspace / "src" / "dup_b.ts"
    duplicate_a.write_text("const score = 5;\nreturn score + 4;\n", encoding="utf-8")
    duplicate_b.write_text("const score = 8;\nreturn score + 7;\n", encoding="utf-8")

    engine = CleanCodeRuleEngine(
        function_max_lines=4,
        complexity_warn_threshold=2,
        duplication_min_lines=2,
        file_max_logical_lines=20,
        max_top_level_symbols=6,
        max_findings=80,
    )
    result = engine.analyze(
        paths=[str(python_file), str(ts_file), str(duplicate_a), str(duplicate_b)],
        workspace=str(workspace),
        repo="octo/external-repo",
        metadata={"imported_folder_name": "external-repo"},
    )

    rule_ids = {item.rule_id for item in result.findings}

    assert "readability.generic_name" in rule_ids
    assert "style.naming_convention" in rule_ids
    assert "function.too_long" in rule_ids
    assert "complexity.high" in rule_ids
    assert "magic_number.detected" in rule_ids
    assert "comment.redundant" in rule_ids
    assert "error_handling.ignored" in rule_ids
    assert "dry.duplicate_block" in rule_ids
    assert result.stats["duplicate_groups"] >= 1
    assert sorted(result.stats["languages_scanned"]) == ["python", "typescript"]


def test_clean_code_engine_skips_platform_repo(tmp_path: Path) -> None:
    workspace = tmp_path / "ai-code-review-platform"
    workspace.mkdir()
    target = workspace / "main.py"
    target.write_text("value = 3\n", encoding="utf-8")

    engine = CleanCodeRuleEngine(max_findings=10)
    result = engine.analyze(
        paths=[str(target)],
        workspace=str(workspace),
        repo="AhmedAmineBejaoui/ai-code-review-platform",
        metadata={"imported_folder_name": "ai-code-review-platform"},
    )

    assert result.self_repo_skipped is True
    assert result.findings == []
    assert result.stats["self_repo_skipped"] is True


def test_clean_code_analyzer_and_normalizer_use_static_clean_code_source(tmp_path: Path) -> None:
    workspace = tmp_path / "repo"
    workspace.mkdir()
    target = workspace / "src" / "db" / "config.py"
    target.parent.mkdir(parents=True)
    target.write_text("def Process(value):\n    return value + 3\n", encoding="utf-8")

    analyzer = CleanCodeAnalyzer(
        engine=CleanCodeRuleEngine(
            function_max_lines=1,
            complexity_warn_threshold=1,
            duplication_min_lines=2,
            max_findings=20,
        )
    )
    result = analyzer.run(
        paths=[str(target)],
        workspace=str(workspace),
        timeout_seconds=5,
        repo="octo/external-repo",
        metadata={},
    )

    assert result.tool == "clean_code"
    assert result.status == "SUCCESS"
    assert result.findings

    normalized = normalize_raw_finding(result.findings[0])
    assert normalized.source == "STATIC_CLEAN_CODE"
    assert normalized.severity in {"INFO", "WARN"}

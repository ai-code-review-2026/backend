from __future__ import annotations

from app.core.static_analysis.cli_utils import chunk_paths_for_command
from app.core.static_analysis.ruff_analyzer import parse_ruff_output
from app.core.static_analysis.ruff_analyzer import parse_ruff_output_json_lines
from app.core.static_analysis.semgrep_analyzer import parse_semgrep_output
from app.core.static_analysis.service import _is_scannable_diff_path


def test_ruff_parser_accepts_prefixed_json_payload() -> None:
    stdout = "warning: tool banner\n[{\"code\": \"F401\", \"filename\": \"src/main.py\", \"message\": \"unused import\", \"location\": {\"row\": 4}, \"end_location\": {\"row\": 4}}]"
    findings = parse_ruff_output(stdout)
    assert len(findings) == 1
    assert findings[0].rule_id == "F401"
    assert findings[0].file_path == "src/main.py"


def test_semgrep_parser_accepts_prefixed_json_payload() -> None:
    stdout = "semgrep notice\n{\"results\":[{\"check_id\":\"python.lang.security.audit.eval-detected\",\"path\":\"src/app.py\",\"start\":{\"line\":12},\"end\":{\"line\":12},\"extra\":{\"severity\":\"WARNING\",\"message\":\"Avoid eval\",\"metadata\":{\"category\":\"security\"}}}],\"errors\":[]}"
    findings = parse_semgrep_output(stdout)
    assert len(findings) == 1
    assert findings[0].rule_id == "python.lang.security.audit.eval-detected"
    assert findings[0].file_path == "src/app.py"


def test_ruff_parser_accepts_json_lines_payload() -> None:
    stdout = "\n".join(
        [
            '{"code":"F401","filename":"src/main.py","message":"unused import","location":{"row":4},"end_location":{"row":4}}',
            '{"code":"E501","filename":"src/main.py","message":"line too long","location":{"row":8},"end_location":{"row":8}}',
        ]
    )
    findings = parse_ruff_output_json_lines(stdout)
    assert len(findings) == 2
    assert findings[0].rule_id == "F401"
    assert findings[1].rule_id == "E501"


def test_chunk_paths_for_command_splits_long_commands() -> None:
    base = ["ruff", "check", "--output-format=json"]
    paths = [f"C:/repo/file_{index}.py" for index in range(25)]
    batches = chunk_paths_for_command(base_command=base, paths=paths, max_command_chars=180, max_paths_per_batch=100)
    assert len(batches) > 1
    flattened = [item for batch in batches for item in batch]
    assert flattened == paths


def test_static_analysis_filters_dependency_and_build_paths() -> None:
    assert _is_scannable_diff_path("src/api/router.py") is True
    assert _is_scannable_diff_path("apps/backend/.venv/Lib/site-packages/pkg/mod.py") is False
    assert _is_scannable_diff_path("frontend/node_modules/react/index.js") is False
    assert _is_scannable_diff_path("dist/bundle.js") is False

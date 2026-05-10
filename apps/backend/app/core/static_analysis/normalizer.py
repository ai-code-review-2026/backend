from __future__ import annotations

from typing import Callable

from app.core.static_analysis.base import StaticCategory, StaticFinding, StaticRawFinding, StaticSeverity


# ---------------------------------------------------------------------------
# Severity normalizers
# ---------------------------------------------------------------------------

def _normalize_clean_code_severity(raw: StaticRawFinding) -> StaticSeverity:
    value = raw.severity.strip().upper()
    if value == "INFO":
        return "INFO"
    if value == "BLOCKER":
        return "BLOCKER"
    return "WARN"


def _normalize_semgrep_severity(raw: StaticRawFinding) -> StaticSeverity:
    value = raw.severity.strip().upper()
    if value == "ERROR":
        return "BLOCKER"
    if value == "INFO":
        return "INFO"
    return "WARN"


def _normalize_ruff_severity(raw: StaticRawFinding) -> StaticSeverity:
    code = raw.rule_id.strip().upper()
    if code.startswith("S"):
        return "BLOCKER"
    if code.startswith("I"):
        return "INFO"
    return "WARN"


def _normalize_eslint_severity(raw: StaticRawFinding) -> StaticSeverity:
    # ESLint stores the numeric severity in evidence; fallback to raw.severity string
    raw_sev = raw.evidence.get("raw_severity")
    if isinstance(raw_sev, int) and raw_sev >= 2:
        return "BLOCKER"
    if raw.severity == "BLOCKER":
        return "BLOCKER"
    return "WARN"


def _normalize_rubocop_severity(raw: StaticRawFinding) -> StaticSeverity:
    # RuboCop severity strings are already mapped to INFO/WARN/BLOCKER in the parser
    value = raw.severity.strip().upper()
    if value == "INFO":
        return "INFO"
    if value == "BLOCKER":
        return "BLOCKER"
    return "WARN"


def _normalize_default_severity(raw: StaticRawFinding) -> StaticSeverity:
    value = raw.severity.strip().upper()
    if value in {"INFO"}:
        return "INFO"
    if value in {"BLOCKER", "ERROR"}:
        return "BLOCKER"
    return "WARN"


# ---------------------------------------------------------------------------
# Category normalizers
# ---------------------------------------------------------------------------

def _normalize_clean_code_category(raw: StaticRawFinding) -> StaticCategory:
    category = str(raw.evidence.get("category") or "quality").strip().lower()
    if category in {"style", "quality", "maintainability", "other"}:
        return category  # type: ignore[return-value]
    return "quality"


def _normalize_semgrep_category(raw: StaticRawFinding) -> StaticCategory:
    lowered_rule = raw.rule_id.lower()
    lowered_message = raw.message.lower()
    metadata_category = str(raw.evidence.get("metadata_category", "")).lower()
    if "security" in lowered_rule or "security" in lowered_message or "security" in metadata_category:
        return "security"
    if "perf" in lowered_rule:
        return "perf"
    return "quality"


def _normalize_ruff_category(raw: StaticRawFinding) -> StaticCategory:
    code = raw.rule_id.strip().upper()
    if code.startswith("S"):
        return "security"
    if code.startswith("PERF"):
        return "perf"
    if code.startswith("I"):
        return "style"
    if code.startswith("C90"):
        return "maintainability"
    return "quality"


def _normalize_eslint_category(raw: StaticRawFinding) -> StaticCategory:
    rule = raw.rule_id.lower()
    if rule.startswith("security/") or "no-eval" in rule or "no-implied-eval" in rule:
        return "security"
    if "import/" in rule or "node/" in rule:
        return "quality"
    if "prettier" in rule or "style" in rule:
        return "style"
    return "quality"


def _normalize_rubocop_category(raw: StaticRawFinding) -> StaticCategory:
    cop = raw.rule_id.lower()
    if cop.startswith("security/"):
        return "security"
    if cop.startswith("performance/"):
        return "perf"
    if cop.startswith("style/") or cop.startswith("layout/"):
        return "style"
    if cop.startswith("metrics/"):
        return "maintainability"
    return "quality"


def _normalize_default_category(_raw: StaticRawFinding) -> StaticCategory:
    return "quality"


# ---------------------------------------------------------------------------
# Dispatch tables
# ---------------------------------------------------------------------------

_SEVERITY_NORMALIZERS: dict[str, Callable[[StaticRawFinding], StaticSeverity]] = {
    "ruff": _normalize_ruff_severity,
    "semgrep": _normalize_semgrep_severity,
    "clean_code": _normalize_clean_code_severity,
    "eslint": _normalize_eslint_severity,
    "rubocop": _normalize_rubocop_severity,
    "stylelint": _normalize_default_severity,
    "staticcheck": _normalize_default_severity,
    "sqlfluff": _normalize_default_severity,
}

_CATEGORY_NORMALIZERS: dict[str, Callable[[StaticRawFinding], StaticCategory]] = {
    "ruff": _normalize_ruff_category,
    "semgrep": _normalize_semgrep_category,
    "clean_code": _normalize_clean_code_category,
    "eslint": _normalize_eslint_category,
    "rubocop": _normalize_rubocop_category,
    "stylelint": _normalize_default_category,
    "staticcheck": _normalize_default_category,
    "sqlfluff": _normalize_default_category,
}

_SOURCE_NAMES: dict[str, str] = {
    "ruff": "STATIC_RUFF",
    "semgrep": "STATIC_SEMGREP",
    "clean_code": "STATIC_CLEAN_CODE",
    "eslint": "STATIC_ESLINT",
    "stylelint": "STATIC_STYLELINT",
    "rubocop": "STATIC_RUBOCOP",
    "staticcheck": "STATIC_STATICCHECK",
    "sqlfluff": "STATIC_SQLFLUFF",
}


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

def normalize_raw_finding(raw: StaticRawFinding) -> StaticFinding:
    tool = raw.tool
    source = _SOURCE_NAMES.get(tool, f"STATIC_{tool.upper()}")
    severity = _SEVERITY_NORMALIZERS.get(tool, _normalize_default_severity)(raw)
    category = _CATEGORY_NORMALIZERS.get(tool, _normalize_default_category)(raw)

    return StaticFinding(
        source=source,
        rule_id=raw.rule_id,
        file_path=raw.file_path,
        line_start=raw.line_start,
        line_end=raw.line_end,
        severity=severity,
        category=category,
        message=raw.message,
        suggestion=raw.suggestion,
        confidence=float(raw.evidence.get("confidence", 1.0)),
        evidence=raw.evidence,
    )

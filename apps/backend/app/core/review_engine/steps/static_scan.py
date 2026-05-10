from __future__ import annotations

from app.core.review_engine.diff_engine import ParsedDiff
from app.core.static_analysis import StaticAnalysisService
from app.core.static_analysis.base import StaticAnalysisResult
from app.core.static_analysis.registry import AnalyzerRegistry
from app.settings import settings


def _build_default_service() -> StaticAnalysisService:
    registry = AnalyzerRegistry.build_default(settings)
    return StaticAnalysisService(analyzers=registry.get_all_analyzers())


_DEFAULT_SERVICE: StaticAnalysisService | None = None


def _get_service() -> StaticAnalysisService:
    global _DEFAULT_SERVICE
    if _DEFAULT_SERVICE is None:
        _DEFAULT_SERVICE = _build_default_service()
    return _DEFAULT_SERVICE


def run_static_scan(
    *,
    parsed: ParsedDiff,
    workspace_path: str,
    repo: str | None = None,
    timeout_seconds: int | None = None,
    max_files: int | None = None,
    max_findings: int | None = None,
    filter_changed_lines: bool = True,
) -> StaticAnalysisResult:
    """
    Pipeline step: runs all enabled static analysis tools on the files
    present in the parsed diff (Ruff, Semgrep, CleanCode, ESLint, Stylelint,
    RuboCop, Staticcheck, SQLFluff — gated by feature flags in settings).
    """
    service = _get_service()
    return service.run(
        parsed=parsed,
        workspace_path=workspace_path,
        timeout_seconds=timeout_seconds or settings.STATIC_ANALYSIS_TIMEOUT_SECONDS,
        max_files=max_files or settings.STATIC_ANALYSIS_MAX_FILES,
        max_findings=max_findings or settings.STATIC_ANALYSIS_MAX_FINDINGS,
        filter_changed_lines=filter_changed_lines,
        repo=repo,
    )

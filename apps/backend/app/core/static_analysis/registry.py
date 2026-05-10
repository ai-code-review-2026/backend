from __future__ import annotations

from collections import OrderedDict
from typing import TYPE_CHECKING

from app.core.clean_code.language_profiles import detect_language
from app.core.static_analysis.base import StaticToolAnalyzer

if TYPE_CHECKING:
    from app.settings import Settings


class AnalyzerRegistry:
    """
    Maps languages to analyzer instances and provides a flat list for StaticAnalysisService.

    Registration rules:
    - languages=None  → universal analyzer (runs on every diff regardless of language)
    - languages=[...] → language-specific analyzer (only included when those languages appear)
    """

    def __init__(self) -> None:
        self._universal: list[StaticToolAnalyzer] = []
        self._language_map: dict[str, list[StaticToolAnalyzer]] = {}

    def register(
        self,
        analyzer: StaticToolAnalyzer,
        *,
        languages: list[str] | None = None,
    ) -> None:
        if languages is None:
            self._universal.append(analyzer)
        else:
            for lang in languages:
                self._language_map.setdefault(lang, []).append(analyzer)

    def get_all_analyzers(self) -> list[StaticToolAnalyzer]:
        """Return all registered analyzers (universal + all language-specific), deduplicated."""
        seen_ids: set[int] = set()
        result: list[StaticToolAnalyzer] = []
        for a in self._universal:
            if id(a) not in seen_ids:
                seen_ids.add(id(a))
                result.append(a)
        for analyzers in self._language_map.values():
            for a in analyzers:
                if id(a) not in seen_ids:
                    seen_ids.add(id(a))
                    result.append(a)
        return result

    def get_analyzers_for_paths(self, paths: list[str]) -> list[StaticToolAnalyzer]:
        """Return analyzers relevant to the given file paths (universal + matching languages)."""
        languages_present: set[str] = set()
        for path in paths:
            lang = detect_language(path)
            if lang != "text":
                languages_present.add(lang)

        seen_ids: set[int] = set()
        result: list[StaticToolAnalyzer] = []

        for a in self._universal:
            if id(a) not in seen_ids:
                seen_ids.add(id(a))
                result.append(a)

        for lang in languages_present:
            for a in self._language_map.get(lang, []):
                if id(a) not in seen_ids:
                    seen_ids.add(id(a))
                    result.append(a)

        return result

    @classmethod
    def build_default(cls, settings: Settings) -> AnalyzerRegistry:
        """Factory: construct the live registry from settings feature flags."""
        # Import here to avoid circular imports at module load time
        from app.core.clean_code.analyzer import CleanCodeAnalyzer
        from app.core.static_analysis.eslint_analyzer import EslintAnalyzer
        from app.core.static_analysis.rubocop_analyzer import RubocopAnalyzer
        from app.core.static_analysis.ruff_analyzer import RuffAnalyzer
        from app.core.static_analysis.semgrep_analyzer import SemgrepAnalyzer
        from app.core.static_analysis.sqlfluff_analyzer import SqlFluffAnalyzer
        from app.core.static_analysis.staticcheck_analyzer import StaticcheckAnalyzer
        from app.core.static_analysis.stylelint_analyzer import StylelintAnalyzer

        registry = cls()

        if settings.STATIC_ANALYSIS_RUFF_ENABLED:
            registry.register(RuffAnalyzer())

        if settings.STATIC_ANALYSIS_SEMGREP_ENABLED:
            registry.register(SemgrepAnalyzer())

        if settings.CLEAN_CODE_RULE_ENGINE_ENABLED:
            registry.register(CleanCodeAnalyzer())

        if settings.STATIC_ANALYSIS_ESLINT_ENABLED:
            registry.register(EslintAnalyzer(), languages=["javascript", "typescript"])

        if settings.STATIC_ANALYSIS_STYLELINT_ENABLED:
            registry.register(StylelintAnalyzer(), languages=["css"])

        if settings.STATIC_ANALYSIS_RUBOCOP_ENABLED:
            registry.register(RubocopAnalyzer(), languages=["ruby"])

        if settings.STATIC_ANALYSIS_STATICCHECK_ENABLED:
            registry.register(StaticcheckAnalyzer(), languages=["go"])

        if settings.STATIC_ANALYSIS_SQLFLUFF_ENABLED:
            registry.register(SqlFluffAnalyzer(), languages=["sql"])

        return registry

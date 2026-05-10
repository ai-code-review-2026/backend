from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.clean_code.duplication import detect_duplicate_groups
from app.core.clean_code.generic_symbols import GenericSymbol, extract_generic_symbols, extract_generic_variable_candidates
from app.core.clean_code.language_profiles import (
    ALLOWED_SHORT_NAMES,
    GENERIC_NAMES,
    comment_prefixes_for_language,
    detect_language,
    is_known_code_path,
    is_valid_name,
)
from app.core.clean_code.python_ast import PythonModuleAnalysis, PythonSymbol, analyze_python_module
from app.core.clean_code.rules import (
    CleanCodeFinding,
    build_finding,
    build_large_file_finding,
    build_testing_gap_finding,
    detect_generic_ignored_errors,
    detect_hard_to_test_generic,
    detect_magic_numbers_text,
    detect_redundant_comments,
    has_companion_test,
    is_critical_module,
)
from app.core.clean_code.self_target_guard import should_skip_clean_code_analysis
from app.core.review_engine.diff_engine import ParsedDiff
from app.settings import settings


@dataclass(frozen=True)
class CleanCodeAnalysisResult:
    findings: list[CleanCodeFinding]
    stats: dict[str, Any]
    warnings: list[str]
    self_repo_skipped: bool = False


class CleanCodeRuleEngine:
    def __init__(
        self,
        *,
        function_max_lines: int | None = None,
        complexity_warn_threshold: int | None = None,
        duplication_min_lines: int | None = None,
        file_max_logical_lines: int | None = None,
        max_top_level_symbols: int | None = None,
        max_findings: int | None = None,
    ) -> None:
        self._function_max_lines = function_max_lines or settings.CLEAN_CODE_FUNCTION_MAX_LINES
        self._complexity_warn_threshold = complexity_warn_threshold or settings.CLEAN_CODE_COMPLEXITY_WARN_THRESHOLD
        self._duplication_min_lines = duplication_min_lines or settings.CLEAN_CODE_DUPLICATION_MIN_LINES
        self._file_max_logical_lines = file_max_logical_lines or settings.CLEAN_CODE_FILE_MAX_LOGICAL_LINES
        self._max_top_level_symbols = max_top_level_symbols or settings.CLEAN_CODE_MAX_TOP_LEVEL_SYMBOLS
        self._max_findings = max_findings or settings.CLEAN_CODE_MAX_FINDINGS

    def analyze(
        self,
        *,
        paths: list[str],
        workspace: str,
        parsed: ParsedDiff | None = None,
        repo: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> CleanCodeAnalysisResult:
        warnings: list[str] = []
        skip, skip_context = should_skip_clean_code_analysis(
            repo=repo,
            metadata=metadata,
            workspace=workspace,
            excluded_repos=settings.clean_code_excluded_repos,
        )
        if skip:
            if skip_context:
                warnings.append(f"clean_code skipped: {skip_context.get('matched', 'excluded_repo')}")
            return CleanCodeAnalysisResult(
                findings=[],
                stats={
                    "enabled": True,
                    "mode": "rule_engine",
                    "languages_scanned": [],
                    "files_scanned": 0,
                    "findings_count": 0,
                    "rule_counts": {},
                    "duplicate_groups": 0,
                    "self_repo_skipped": True,
                    "warnings": warnings,
                },
                warnings=warnings,
                self_repo_skipped=True,
            )

        workspace_root = Path(workspace).resolve()
        changed_sizes = _build_changed_size_map(parsed)
        known_test_paths = _collect_workspace_test_paths(workspace_root)
        findings: list[CleanCodeFinding] = []
        duplication_inputs: list[tuple[str, str, str]] = []
        languages: set[str] = set()
        files_scanned = 0

        for raw_path in paths:
            file_path = Path(raw_path).resolve()
            try:
                relative_path = file_path.relative_to(workspace_root).as_posix()
            except Exception:
                relative_path = file_path.name
            if not is_known_code_path(relative_path):
                continue
            try:
                text = file_path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                warnings.append(f"unreadable file skipped: {relative_path}")
                continue

            language = detect_language(relative_path)
            languages.add(language)
            files_scanned += 1
            duplication_inputs.append((relative_path, language, text))

            file_findings, top_level_symbols = self._analyze_file(
                relative_path=relative_path,
                language=language,
                text=text,
            )
            findings.extend(file_findings)

            logical_lines = _logical_line_count(text=text, language=language)
            if logical_lines > self._file_max_logical_lines or top_level_symbols > self._max_top_level_symbols:
                findings.append(
                    build_large_file_finding(
                        relative_path=relative_path,
                        logical_lines=logical_lines,
                        symbol_count=top_level_symbols,
                    )
                )
            if is_critical_module(relative_path=relative_path, changed_lines=changed_sizes.get(relative_path, 0)) and not has_companion_test(
                relative_path=relative_path,
                known_test_paths=known_test_paths,
            ):
                findings.append(build_testing_gap_finding(relative_path=relative_path))

        duplicate_groups = detect_duplicate_groups(files=duplication_inputs, min_lines=self._duplication_min_lines)
        for group in duplicate_groups:
            for occurrence in group.occurrences[:4]:
                findings.append(
                    build_finding(
                        rule_id="dry.duplicate_block",
                        file_path=occurrence.file_path,
                        line_start=occurrence.start_line,
                        line_end=occurrence.end_line,
                        severity="WARN",
                        category="maintainability",
                        message=f"Duplicated logic found in {len(group.occurrences)} locations. Extract a shared helper.",
                        suggestion="Move the repeated block into a reusable function or module.",
                        evidence={"occurrences": len(group.occurrences)},
                    )
                )

        limited_findings = _limit_findings(findings=findings, max_findings=self._max_findings)
        return CleanCodeAnalysisResult(
            findings=limited_findings,
            stats={
                "enabled": True,
                "mode": "rule_engine",
                "languages_scanned": sorted(languages),
                "files_scanned": files_scanned,
                "findings_count": len(limited_findings),
                "rule_counts": _rule_counts(limited_findings),
                "duplicate_groups": len(duplicate_groups),
                "self_repo_skipped": False,
                "warnings": warnings,
            },
            warnings=warnings,
            self_repo_skipped=False,
        )

    def _analyze_file(
        self,
        *,
        relative_path: str,
        language: str,
        text: str,
    ) -> tuple[list[CleanCodeFinding], int]:
        findings: list[CleanCodeFinding] = []
        findings.extend(detect_redundant_comments(text=text, relative_path=relative_path, language=language))

        if language == "python":
            try:
                module = analyze_python_module(text)
            except SyntaxError:
                fallback_findings, top_level_symbols = self._analyze_generic_file(
                    relative_path=relative_path,
                    language=language,
                    text=text,
                )
                findings.extend(fallback_findings)
                fallback_findings.append(
                    build_finding(
                        rule_id="other.python_parse_fallback",
                        file_path=relative_path,
                        line_start=1,
                        line_end=1,
                        severity="INFO",
                        category="other",
                        message="Python AST parsing failed; generic clean code checks were used instead.",
                        suggestion=None,
                        evidence={"scope": "file"},
                    )
                )
                return findings, top_level_symbols
            python_findings, top_level_symbols = self._analyze_python_file(
                relative_path=relative_path,
                language=language,
                module=module,
                text=text,
            )
            findings.extend(python_findings)
            return findings, top_level_symbols
        generic_findings, top_level_symbols = self._analyze_generic_file(
            relative_path=relative_path,
            language=language,
            text=text,
        )
        findings.extend(generic_findings)
        return findings, top_level_symbols

    def _analyze_python_file(
        self,
        *,
        relative_path: str,
        language: str,
        module: PythonModuleAnalysis,
        text: str,
    ) -> tuple[list[CleanCodeFinding], int]:
        findings: list[CleanCodeFinding] = []
        for variable in module.variables:
            findings.extend(
                _name_findings(
                    name=variable.name,
                    line_no=variable.line_no,
                    symbol_kind="constant" if variable.is_constant else "variable",
                    language=language,
                    relative_path=relative_path,
                    is_constant=variable.is_constant,
                )
            )
        for symbol in module.symbols:
            findings.extend(
                _name_findings(
                    name=symbol.name,
                    line_no=symbol.start_line,
                    symbol_kind="class" if symbol.kind == "class" else "function",
                    language=language,
                    relative_path=relative_path,
                    is_constant=False,
                )
            )
            findings.extend(self._symbol_quality_findings(relative_path=relative_path, language=language, symbol=symbol))
        for item in module.magic_numbers:
            findings.append(
                build_finding(
                    rule_id="magic_number.detected",
                    file_path=relative_path,
                    line_start=item.line_no,
                    line_end=item.line_no,
                    severity="INFO",
                    category="quality",
                    message=f"Magic number detected ({item.value}). Replace it with a named constant.",
                    suggestion=f"Extract {item.value} into a constant that documents its meaning.",
                    evidence={"language": language},
                )
            )
        for item in module.ignored_errors:
            findings.append(
                build_finding(
                    rule_id="error_handling.ignored",
                    file_path=relative_path,
                    line_start=item.line_no,
                    line_end=item.line_no,
                    severity="WARN",
                    category="quality",
                    message="Exception handling is effectively ignored in this block.",
                    suggestion="Handle the exception explicitly or re-raise it with context.",
                    evidence={"language": language, "reason": item.reason},
                )
            )
        findings.extend(detect_magic_numbers_text(text=text, relative_path=relative_path, language=language))
        return findings, module.top_level_symbol_count

    def _analyze_generic_file(
        self,
        *,
        relative_path: str,
        language: str,
        text: str,
    ) -> tuple[list[CleanCodeFinding], int]:
        findings: list[CleanCodeFinding] = []
        symbols = extract_generic_symbols(text=text, relative_path=relative_path, language=language)
        for variable in extract_generic_variable_candidates(text):
            findings.extend(
                _name_findings(
                    name=variable.name,
                    line_no=variable.line_no,
                    symbol_kind="constant" if variable.is_constant else "variable",
                    language=language,
                    relative_path=relative_path,
                    is_constant=variable.is_constant,
                )
            )
        for symbol in symbols:
            findings.extend(
                _name_findings(
                    name=symbol.name,
                    line_no=symbol.start_line,
                    symbol_kind=symbol.kind,
                    language=language,
                    relative_path=relative_path,
                    is_constant=symbol.is_constant,
                )
            )
            findings.extend(self._symbol_quality_findings(relative_path=relative_path, language=language, symbol=symbol))
        findings.extend(detect_magic_numbers_text(text=text, relative_path=relative_path, language=language))
        findings.extend(detect_generic_ignored_errors(text=text, relative_path=relative_path, language=language))
        return findings, len(symbols)

    def _symbol_quality_findings(
        self,
        *,
        relative_path: str,
        language: str,
        symbol: PythonSymbol | GenericSymbol,
    ) -> list[CleanCodeFinding]:
        findings: list[CleanCodeFinding] = []
        if symbol.kind != "class" and symbol.logical_lines > self._function_max_lines:
            findings.append(
                build_finding(
                    rule_id="function.too_long",
                    file_path=relative_path,
                    line_start=symbol.start_line,
                    line_end=symbol.end_line,
                    severity="WARN",
                    category="maintainability",
                    message=f"{symbol.name} is too long ({symbol.logical_lines} logical lines).",
                    suggestion="Split this logic into smaller functions with a single responsibility.",
                    evidence={"language": language, "logical_lines": symbol.logical_lines},
                )
            )
        if symbol.complexity > self._complexity_warn_threshold:
            findings.append(
                build_finding(
                    rule_id="complexity.high",
                    file_path=relative_path,
                    line_start=symbol.start_line,
                    line_end=symbol.end_line,
                    severity="WARN",
                    category="maintainability",
                    message=f"{symbol.name} has high branching complexity ({symbol.complexity}).",
                    suggestion="Reduce nested branches and move decisions into smaller focused helpers.",
                    evidence={"language": language, "complexity": symbol.complexity},
                )
            )

        dependencies = tuple(getattr(symbol, "dependencies", ()))
        uses_global_state = bool(getattr(symbol, "uses_global_state", False))
        if (dependencies or uses_global_state) and (
            symbol.logical_lines > self._function_max_lines or symbol.complexity > self._complexity_warn_threshold
        ):
            dependency_list = list(dependencies)
            if uses_global_state:
                dependency_list.append("global_state")
            finding = detect_hard_to_test_generic(
                relative_path=relative_path,
                language=language,
                symbol_name=symbol.name,
                line_start=symbol.start_line,
                line_end=symbol.end_line,
                dependencies=tuple(dependency_list),
            )
            if finding is not None:
                findings.append(finding)
        return findings


def _name_findings(
    *,
    name: str,
    line_no: int,
    symbol_kind: str,
    language: str,
    relative_path: str,
    is_constant: bool,
) -> list[CleanCodeFinding]:
    findings: list[CleanCodeFinding] = []
    lowered = name.strip("_").lower()
    if lowered in GENERIC_NAMES:
        findings.append(
            build_finding(
                rule_id="readability.generic_name",
                file_path=relative_path,
                line_start=line_no,
                line_end=line_no,
                severity="INFO",
                category="style",
                message=f"{name} is too generic to communicate intent clearly.",
                suggestion="Rename it with a domain-specific name that describes its role.",
                evidence={"language": language, "symbol_kind": symbol_kind},
            )
        )
    if len(name.strip("_")) < 3 and lowered not in ALLOWED_SHORT_NAMES and not is_constant:
        findings.append(
            build_finding(
                rule_id="readability.short_name",
                file_path=relative_path,
                line_start=line_no,
                line_end=line_no,
                severity="INFO",
                category="style",
                message=f"{name} is too short to be self-explanatory.",
                suggestion="Use a longer name that makes the intent obvious without extra context.",
                evidence={"language": language, "symbol_kind": symbol_kind},
            )
        )
    valid, expected = is_valid_name(
        name=name,
        symbol_kind=symbol_kind,
        language=language,
        relative_path=relative_path,
        is_constant=is_constant,
    )
    if not valid:
        findings.append(
            build_finding(
                rule_id="style.naming_convention",
                file_path=relative_path,
                line_start=line_no,
                line_end=line_no,
                severity="INFO",
                category="style",
                message=f"{name} does not follow the expected {expected} naming convention.",
                suggestion=f"Rename {name} to follow {expected}.",
                evidence={"language": language, "symbol_kind": symbol_kind, "expected": expected},
            )
        )
    return findings


def _build_changed_size_map(parsed: ParsedDiff | None) -> dict[str, int]:
    if parsed is None:
        return {}
    result: dict[str, int] = {}
    for file_item in parsed.files:
        result[file_item.path_new] = file_item.additions_count + file_item.deletions_count
    return result


def _collect_workspace_test_paths(workspace_root: Path) -> set[str]:
    results: set[str] = set()
    try:
        for item in workspace_root.rglob("*"):
            if not item.is_file():
                continue
            relative = item.relative_to(workspace_root).as_posix()
            lowered = relative.lower()
            if "test" in lowered or "spec" in lowered:
                results.add(relative)
    except Exception:
        return set()
    return results


def _logical_line_count(*, text: str, language: str) -> int:
    prefixes = comment_prefixes_for_language(language)
    count = 0
    for raw_line in text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            continue
        if any(stripped.startswith(prefix) for prefix in prefixes):
            continue
        if stripped in {"{", "}", "};"}:
            continue
        count += 1
    return count


def _limit_findings(*, findings: list[CleanCodeFinding], max_findings: int) -> list[CleanCodeFinding]:
    deduped: list[CleanCodeFinding] = []
    seen: set[tuple[str, str, int | None, str]] = set()
    sorted_findings = sorted(
        findings,
        key=lambda item: (
            0 if item.severity == "WARN" else 1,
            item.file_path,
            item.line_start or 0,
            item.rule_id,
            item.message,
        ),
    )
    for finding in sorted_findings:
        key = (finding.rule_id, finding.file_path, finding.line_start, finding.message)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(finding)
        if len(deduped) >= max_findings:
            break
    return deduped


def _rule_counts(findings: list[CleanCodeFinding]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding.rule_id] = counts.get(finding.rule_id, 0) + 1
    return dict(sorted(counts.items()))

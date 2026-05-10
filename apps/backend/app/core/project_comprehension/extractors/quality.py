"""Quality indicators extractor for project comprehension."""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.core.project_comprehension.extractors.base import BaseExtractor, ExtractionResult
from app.core.project_comprehension.profile import QualityIndicators


# Test framework detection
TEST_FRAMEWORKS = {
    "pytest": ["pytest.ini", "conftest.py", ("pyproject.toml", r"\[tool\.pytest")],
    "unittest": [("*.py", r"import unittest|from unittest")],
    "jest": ["jest.config.js", "jest.config.ts", ("package.json", r'"jest"')],
    "vitest": ["vitest.config.js", "vitest.config.ts", ("package.json", r'"vitest"')],
    "mocha": [("package.json", r'"mocha"')],
    "rspec": [".rspec", ("Gemfile", r"rspec")],
    "junit": [("pom.xml", r"junit"), ("build.gradle", r"junit")],
    "go_test": ["*_test.go"],
    "cargo_test": [("Cargo.toml", r"\[dev-dependencies\]")],
}

# CI/CD platform detection
CI_CD_PLATFORMS = {
    "github_actions": [".github/workflows/"],
    "gitlab_ci": [".gitlab-ci.yml"],
    "jenkins": ["Jenkinsfile"],
    "circleci": [".circleci/config.yml"],
    "travis": [".travis.yml"],
    "azure_pipelines": ["azure-pipelines.yml"],
    "bitbucket_pipelines": ["bitbucket-pipelines.yml"],
}

# Linting tool detection
LINTING_TOOLS = {
    "eslint": [".eslintrc", ".eslintrc.js", ".eslintrc.json", ".eslintrc.yml", "eslint.config.js"],
    "prettier": [".prettierrc", ".prettierrc.js", ".prettierrc.json", "prettier.config.js"],
    "ruff": ["ruff.toml", ("pyproject.toml", r"\[tool\.ruff\]")],
    "flake8": [".flake8", ("setup.cfg", r"\[flake8\]")],
    "black": [("pyproject.toml", r"\[tool\.black\]")],
    "mypy": ["mypy.ini", ("pyproject.toml", r"\[tool\.mypy\]")],
    "pylint": [".pylintrc", ("pyproject.toml", r"\[tool\.pylint\]")],
    "rubocop": [".rubocop.yml"],
    "golint": [".golangci.yml", ".golangci.yaml"],
    "rustfmt": ["rustfmt.toml"],
    "clippy": [("Cargo.toml", r"clippy")],
}


class QualityExtractor(BaseExtractor[QualityIndicators]):
    """Extracts quality indicators from the repository."""

    def extract(self) -> ExtractionResult[QualityIndicators]:
        """Extract quality indicators from the repository."""
        try:
            # Detect tests
            has_tests, test_framework = self._detect_tests()
            test_coverage = self._estimate_test_coverage() if has_tests else None

            # Detect CI/CD
            has_ci_cd, ci_cd_platform = self._detect_ci_cd()

            # Detect documentation
            has_docs, doc_score = self._assess_documentation()

            # Detect standard files
            has_readme = self._file_exists("README.md", "README.rst", "README.txt", "README")
            has_contributing = self._file_exists("CONTRIBUTING.md", "CONTRIBUTING.rst", "CONTRIBUTING")
            has_license = self._file_exists("LICENSE", "LICENSE.md", "LICENSE.txt", "LICENCE")
            has_changelog = self._file_exists(
                "CHANGELOG.md", "CHANGELOG.rst", "CHANGELOG", "HISTORY.md", "CHANGES.md"
            )

            # Detect linting
            has_linting, linting_tools = self._detect_linting()

            # Detect type hints
            has_types, type_coverage = self._detect_type_hints()

            return ExtractionResult(
                success=True,
                data=QualityIndicators(
                    has_tests=has_tests,
                    test_framework=test_framework,
                    test_coverage_estimated=test_coverage,
                    has_ci_cd=has_ci_cd,
                    ci_cd_platform=ci_cd_platform,
                    has_documentation=has_docs,
                    documentation_quality_score=doc_score,
                    has_readme=has_readme,
                    has_contributing=has_contributing,
                    has_license=has_license,
                    has_changelog=has_changelog,
                    has_linting=has_linting,
                    linting_tools=tuple(linting_tools),
                    has_type_hints=has_types,
                    type_coverage_estimated=type_coverage,
                ),
            )

        except Exception as e:
            return ExtractionResult(
                success=False,
                error=f"Failed to extract quality indicators: {e}",
            )

    def _detect_tests(self) -> tuple[bool, str | None]:
        """Detect test framework and presence of tests."""
        # Check for test directories
        test_dirs = ["tests", "test", "spec", "specs", "__tests__"]
        has_test_dir = any((self.repo_path / d).is_dir() for d in test_dirs)

        # Check for test files
        test_patterns = ["**/test_*.py", "**/*_test.py", "**/*.test.js", "**/*.spec.js", "**/*.test.ts", "**/*.spec.ts"]
        test_files: list[Path] = []
        for pattern in test_patterns:
            test_files.extend(self._find_files(pattern)[:20])

        has_tests = has_test_dir or len(test_files) > 0

        # Detect framework
        detected_framework = None
        for framework, patterns in TEST_FRAMEWORKS.items():
            if self._check_patterns(patterns):
                detected_framework = framework
                break

        return has_tests, detected_framework

    def _estimate_test_coverage(self) -> float | None:
        """Estimate test coverage based on test file ratio."""
        # Get Python code files
        code_files = self._find_files("**/*.py")
        code_files = [f for f in code_files if "test" not in str(f).lower()]

        # Get test files
        test_files = self._find_files("**/test_*.py") + self._find_files("**/*_test.py")

        if not code_files:
            return None

        # Rough estimate: assume each test file covers 2-3 source files on average
        coverage_estimate = min(1.0, (len(test_files) * 2.5) / len(code_files))
        return round(coverage_estimate, 2)

    def _detect_ci_cd(self) -> tuple[bool, str | None]:
        """Detect CI/CD platform."""
        for platform, patterns in CI_CD_PLATFORMS.items():
            for pattern in patterns:
                if "/" in pattern:
                    # Directory check
                    if (self.repo_path / pattern.rstrip("/")).is_dir():
                        return True, platform
                elif self._file_exists(pattern):
                    return True, platform

        return False, None

    def _assess_documentation(self) -> tuple[bool, float]:
        """Assess documentation presence and quality."""
        doc_score = 0.0
        doc_files: list[Path] = []

        # Check for docs directory
        for doc_dir in ["docs", "doc", "documentation"]:
            if (self.repo_path / doc_dir).is_dir():
                doc_files.extend(self._find_files(f"{doc_dir}/**/*.md")[:50])
                doc_score += 0.3

        # Check for README quality
        readme_path = None
        for readme_name in ["README.md", "README.rst", "README.txt", "README"]:
            path = self.repo_path / readme_name
            if path.exists():
                readme_path = path
                break

        if readme_path:
            content = self._read_file(readme_path) or ""
            # Score based on README length and sections
            if len(content) > 500:
                doc_score += 0.2
            if len(content) > 2000:
                doc_score += 0.1
            if re.search(r"^##?\s+", content, re.MULTILINE):  # Has headings
                doc_score += 0.1
            if "```" in content:  # Has code examples
                doc_score += 0.1

        # Check for API documentation
        if self._file_exists("openapi.yaml", "openapi.json", "swagger.yaml", "swagger.json"):
            doc_score += 0.2

        has_docs = doc_score > 0.2 or len(doc_files) > 3

        return has_docs, min(1.0, doc_score)

    def _detect_linting(self) -> tuple[bool, list[str]]:
        """Detect linting tools."""
        detected: list[str] = []

        for tool, patterns in LINTING_TOOLS.items():
            if self._check_patterns(patterns):
                detected.append(tool)

        return len(detected) > 0, detected

    def _detect_type_hints(self) -> tuple[bool, float | None]:
        """Detect type hints usage (Python/TypeScript)."""
        # Check for TypeScript
        ts_files = self._find_files("**/*.ts")[:10]
        if ts_files:
            return True, 1.0  # TypeScript is inherently typed

        # Check for Python type hints
        py_files = self._find_files("**/*.py")[:50]
        if not py_files:
            return False, None

        typed_files = 0
        for f in py_files:
            content = self._read_file(f)
            if content:
                # Look for type hints
                if re.search(r":\s*(str|int|float|bool|list|dict|tuple|Any|Optional|Union)\b", content):
                    typed_files += 1
                elif re.search(r"->\s*\w+", content):  # Return type hints
                    typed_files += 1

        if typed_files == 0:
            return False, 0.0

        coverage = typed_files / len(py_files)
        return coverage > 0.3, round(coverage, 2)

    def _check_patterns(self, patterns: list) -> bool:
        """Check if any of the patterns match."""
        for pattern in patterns:
            if isinstance(pattern, str):
                if "/" in pattern:
                    if (self.repo_path / pattern.rstrip("/")).is_dir():
                        return True
                elif "*" in pattern:
                    if self._find_files(pattern):
                        return True
                elif self._file_exists(pattern):
                    return True
            else:
                # Tuple: (file_pattern, regex)
                file_pattern, regex = pattern
                if self._check_file_content(file_pattern, regex):
                    return True
        return False

    def _check_file_content(self, file_pattern: str, regex: str) -> bool:
        """Check if any file matching pattern contains the regex."""
        if "*" in file_pattern:
            files = self._find_files(file_pattern)[:10]
        else:
            path = self.repo_path / file_pattern
            files = [path] if path.exists() else []

        compiled_re = re.compile(regex, re.IGNORECASE)

        for f in files:
            content = self._read_file(f)
            if content and compiled_re.search(content):
                return True

        return False

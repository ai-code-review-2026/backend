"""Framework extractor for project comprehension."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import NamedTuple

from app.core.project_comprehension.extractors.base import BaseExtractor, ExtractionResult


class FrameworkDetection(NamedTuple):
    """Result of framework detection."""

    frameworks: tuple[str, ...]
    frontend_frameworks: tuple[str, ...]
    backend_frameworks: tuple[str, ...]
    testing_frameworks: tuple[str, ...]
    build_tools: tuple[str, ...]
    databases: tuple[str, ...]


# Framework detection patterns by file/content
FRAMEWORK_PATTERNS: dict[str, list[str | tuple[str, str]]] = {
    # Python frameworks
    "django": [
        "manage.py",
        ("requirements.txt", r"django[>=<\s]"),
        ("pyproject.toml", r"django[>=<\s\"]"),
        "django/",
    ],
    "flask": [
        ("requirements.txt", r"flask[>=<\s]"),
        ("pyproject.toml", r"flask[>=<\s\"]"),
        ("*.py", r"from flask import"),
    ],
    "fastapi": [
        ("requirements.txt", r"fastapi[>=<\s]"),
        ("pyproject.toml", r"fastapi[>=<\s\"]"),
        ("*.py", r"from fastapi import"),
    ],
    "sqlalchemy": [
        ("requirements.txt", r"sqlalchemy[>=<\s]"),
        ("pyproject.toml", r"sqlalchemy[>=<\s\"]"),
    ],
    "celery": [
        ("requirements.txt", r"celery[>=<\s]"),
        ("pyproject.toml", r"celery[>=<\s\"]"),
    ],
    "pytest": [
        ("requirements.txt", r"pytest[>=<\s]"),
        ("pyproject.toml", r"pytest[>=<\s\"]"),
        "pytest.ini",
        "conftest.py",
    ],

    # JavaScript/TypeScript frameworks
    "react": [
        ("package.json", r"\"react\""),
    ],
    "next.js": [
        ("package.json", r"\"next\""),
        "next.config.js",
        "next.config.mjs",
        "next.config.ts",
    ],
    "vue": [
        ("package.json", r"\"vue\""),
        "vue.config.js",
    ],
    "nuxt": [
        ("package.json", r"\"nuxt\""),
        "nuxt.config.js",
        "nuxt.config.ts",
    ],
    "angular": [
        ("package.json", r"\"@angular/core\""),
        "angular.json",
    ],
    "svelte": [
        ("package.json", r"\"svelte\""),
        "svelte.config.js",
    ],
    "express": [
        ("package.json", r"\"express\""),
    ],
    "nestjs": [
        ("package.json", r"\"@nestjs/core\""),
    ],
    "jest": [
        ("package.json", r"\"jest\""),
        "jest.config.js",
        "jest.config.ts",
    ],
    "vitest": [
        ("package.json", r"\"vitest\""),
        "vitest.config.js",
        "vitest.config.ts",
    ],
    "cypress": [
        ("package.json", r"\"cypress\""),
        "cypress.json",
        "cypress.config.js",
        "cypress.config.ts",
    ],
    "playwright": [
        ("package.json", r"\"@playwright/test\""),
        "playwright.config.js",
        "playwright.config.ts",
    ],
    "webpack": [
        ("package.json", r"\"webpack\""),
        "webpack.config.js",
    ],
    "vite": [
        ("package.json", r"\"vite\""),
        "vite.config.js",
        "vite.config.ts",
    ],
    "tailwindcss": [
        ("package.json", r"\"tailwindcss\""),
        "tailwind.config.js",
        "tailwind.config.ts",
    ],

    # Java frameworks
    "spring": [
        ("pom.xml", r"spring"),
        ("build.gradle", r"spring"),
    ],
    "junit": [
        ("pom.xml", r"junit"),
        ("build.gradle", r"junit"),
    ],

    # Go frameworks
    "gin": [
        ("go.mod", r"github\.com/gin-gonic/gin"),
    ],
    "echo": [
        ("go.mod", r"github\.com/labstack/echo"),
    ],

    # Rust frameworks
    "actix": [
        ("Cargo.toml", r"actix"),
    ],
    "tokio": [
        ("Cargo.toml", r"tokio"),
    ],

    # Ruby frameworks
    "rails": [
        "config/routes.rb",
        ("Gemfile", r"rails"),
    ],
    "rspec": [
        ("Gemfile", r"rspec"),
        ".rspec",
    ],

    # PHP frameworks
    "laravel": [
        "artisan",
        ("composer.json", r"laravel"),
    ],
    "symfony": [
        ("composer.json", r"symfony"),
    ],

    # Databases
    "postgresql": [
        ("*.py", r"psycopg|postgresql"),
        ("package.json", r"\"pg\""),
        ("docker-compose.yml", r"postgres"),
    ],
    "mongodb": [
        ("*.py", r"pymongo|motor"),
        ("package.json", r"\"mongodb\""),
        ("docker-compose.yml", r"mongo"),
    ],
    "redis": [
        ("*.py", r"redis"),
        ("package.json", r"\"redis\""),
        ("docker-compose.yml", r"redis"),
    ],
    "mysql": [
        ("*.py", r"mysql"),
        ("package.json", r"\"mysql"),
        ("docker-compose.yml", r"mysql"),
    ],

    # Build tools
    "docker": [
        "Dockerfile",
        "docker-compose.yml",
        "docker-compose.yaml",
    ],
    "kubernetes": [
        "k8s/",
        "kubernetes/",
        ("*.yaml", r"kind:\s*(Deployment|Service|Pod|ConfigMap)"),
    ],
    "terraform": [
        "*.tf",
        "terraform/",
    ],
    "github-actions": [
        ".github/workflows/",
    ],
    "gitlab-ci": [
        ".gitlab-ci.yml",
    ],
}

# Framework categorization
FRONTEND_FRAMEWORKS = {"react", "vue", "angular", "svelte", "next.js", "nuxt", "tailwindcss"}
BACKEND_FRAMEWORKS = {"django", "flask", "fastapi", "express", "nestjs", "spring", "rails", "laravel", "symfony", "gin", "echo", "actix"}
TESTING_FRAMEWORKS = {"pytest", "jest", "vitest", "cypress", "playwright", "junit", "rspec"}
BUILD_TOOLS = {"webpack", "vite", "docker", "kubernetes", "terraform", "github-actions", "gitlab-ci"}
DATABASES = {"postgresql", "mongodb", "redis", "mysql"}


class FrameworkExtractor(BaseExtractor[FrameworkDetection]):
    """Extracts framework and technology information from the repository."""

    def extract(self) -> ExtractionResult[FrameworkDetection]:
        """Extract framework information from the repository."""
        try:
            detected_frameworks: set[str] = set()
            warnings: list[str] = []

            for framework, patterns in FRAMEWORK_PATTERNS.items():
                if self._check_framework(framework, patterns):
                    detected_frameworks.add(framework)

            # Categorize
            frontend = tuple(f for f in detected_frameworks if f in FRONTEND_FRAMEWORKS)
            backend = tuple(f for f in detected_frameworks if f in BACKEND_FRAMEWORKS)
            testing = tuple(f for f in detected_frameworks if f in TESTING_FRAMEWORKS)
            build = tuple(f for f in detected_frameworks if f in BUILD_TOOLS)
            dbs = tuple(f for f in detected_frameworks if f in DATABASES)

            return ExtractionResult(
                success=True,
                data=FrameworkDetection(
                    frameworks=tuple(sorted(detected_frameworks)),
                    frontend_frameworks=frontend,
                    backend_frameworks=backend,
                    testing_frameworks=testing,
                    build_tools=build,
                    databases=dbs,
                ),
                warnings=warnings,
            )

        except Exception as e:
            return ExtractionResult(
                success=False,
                error=f"Failed to extract frameworks: {e}",
            )

    def _check_framework(self, framework: str, patterns: list[str | tuple[str, str]]) -> bool:
        """Check if a framework is detected based on patterns."""
        for pattern in patterns:
            if isinstance(pattern, str):
                # File existence check
                if "*" in pattern:
                    if self._find_files(pattern):
                        return True
                elif "/" in pattern:
                    # Directory check
                    if (self.repo_path / pattern.rstrip("/")).is_dir():
                        return True
                else:
                    if self._file_exists(pattern):
                        return True
            else:
                # File content check (file_pattern, regex)
                file_pattern, regex = pattern
                if self._check_file_content(file_pattern, regex):
                    return True

        return False

    def _check_file_content(self, file_pattern: str, regex: str) -> bool:
        """Check if any file matching pattern contains the regex."""
        if "*" in file_pattern:
            files = self._find_files(file_pattern)[:10]  # Limit for performance
        else:
            path = self.repo_path / file_pattern
            files = [path] if path.exists() else []

        compiled_re = re.compile(regex, re.IGNORECASE)

        for f in files:
            content = self._read_file(f)
            if content and compiled_re.search(content):
                return True

        return False

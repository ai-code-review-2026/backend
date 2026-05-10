"""Structure extractor for project comprehension."""

from __future__ import annotations

from collections import Counter
from pathlib import Path

from app.core.project_comprehension.extractors.base import BaseExtractor, ExtractionResult
from app.core.project_comprehension.profile import PackageManager, StructureInfo


# Language detection by file extension
LANGUAGE_EXTENSIONS: dict[str, str] = {
    ".py": "python",
    ".pyi": "python",
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".jsx": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".go": "go",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".scala": "scala",
    ".rs": "rust",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".hpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".cs": "csharp",
    ".swift": "swift",
    ".m": "objective-c",
    ".mm": "objective-cpp",
    ".dart": "dart",
    ".lua": "lua",
    ".r": "r",
    ".R": "r",
    ".jl": "julia",
    ".ex": "elixir",
    ".exs": "elixir",
    ".erl": "erlang",
    ".hrl": "erlang",
    ".clj": "clojure",
    ".cljs": "clojure",
    ".vue": "vue",
    ".svelte": "svelte",
}

# Configuration file extensions
CONFIG_EXTENSIONS = {
    ".json",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".config",
    ".env",
    ".properties",
    ".xml",
}

# Documentation extensions
DOC_EXTENSIONS = {
    ".md",
    ".mdx",
    ".rst",
    ".txt",
    ".adoc",
    ".asciidoc",
}

# Test file patterns
TEST_PATTERNS = {
    "test_",
    "_test.",
    ".test.",
    ".spec.",
    "_spec.",
    "tests/",
    "test/",
    "__tests__/",
    "spec/",
    "specs/",
}

# Package manager detection
PACKAGE_MANAGER_FILES: dict[str, PackageManager] = {
    "package.json": PackageManager.NPM,
    "yarn.lock": PackageManager.YARN,
    "pnpm-lock.yaml": PackageManager.PNPM,
    "requirements.txt": PackageManager.PIP,
    "pyproject.toml": PackageManager.POETRY,
    "Pipfile": PackageManager.PIPENV,
    "uv.lock": PackageManager.UV,
    "Cargo.toml": PackageManager.CARGO,
    "go.mod": PackageManager.GO_MOD,
    "pom.xml": PackageManager.MAVEN,
    "build.gradle": PackageManager.GRADLE,
    "build.gradle.kts": PackageManager.GRADLE,
    "composer.json": PackageManager.COMPOSER,
    "Gemfile": PackageManager.BUNDLER,
    "*.csproj": PackageManager.NUGET,
    "packages.config": PackageManager.NUGET,
}


class StructureExtractor(BaseExtractor[StructureInfo]):
    """Extracts project structure information."""

    def extract(self) -> ExtractionResult[StructureInfo]:
        """Extract structure information from the repository."""
        try:
            all_files = self._get_all_files()

            # Count by category
            language_counts: Counter[str] = Counter()
            code_files = 0
            config_files = 0
            doc_files = 0
            test_files = 0

            for f in all_files:
                suffix = f.suffix.lower()
                rel_path = self._get_relative_path(f).lower()

                # Check if test file
                is_test = any(pattern in rel_path for pattern in TEST_PATTERNS)

                if suffix in LANGUAGE_EXTENSIONS:
                    lang = LANGUAGE_EXTENSIONS[suffix]
                    language_counts[lang] += 1
                    code_files += 1
                    if is_test:
                        test_files += 1
                elif suffix in CONFIG_EXTENSIONS:
                    config_files += 1
                elif suffix in DOC_EXTENSIONS:
                    doc_files += 1

            # Determine main and secondary languages
            sorted_langs = language_counts.most_common()
            main_languages: list[str] = []
            secondary_languages: list[str] = []

            if sorted_langs:
                total = sum(language_counts.values())
                for lang, count in sorted_langs:
                    if count / total >= 0.1:  # At least 10% of code
                        main_languages.append(lang)
                    else:
                        secondary_languages.append(lang)

            # Detect package managers
            package_managers = self._detect_package_managers()

            # Get root directories
            root_dirs = self._get_root_directories()

            # Count directories
            all_dirs = set()
            for f in all_files:
                parent = f.parent
                while parent != self.repo_path and parent != parent.parent:
                    all_dirs.add(parent)
                    parent = parent.parent

            structure_info = StructureInfo(
                root_directories=tuple(root_dirs),
                main_languages=tuple(main_languages[:5]),
                secondary_languages=tuple(secondary_languages[:5]),
                frameworks_detected=(),  # Will be filled by FrameworkExtractor
                package_managers=tuple(package_managers),
                total_files=len(all_files),
                total_directories=len(all_dirs),
                code_files_count=code_files,
                config_files_count=config_files,
                doc_files_count=doc_files,
                test_files_count=test_files,
            )

            return ExtractionResult(success=True, data=structure_info)

        except Exception as e:
            return ExtractionResult(
                success=False,
                error=f"Failed to extract structure: {e}",
            )

    def _detect_package_managers(self) -> list[PackageManager]:
        """Detect which package managers are used in the project."""
        detected: list[PackageManager] = []

        for file_pattern, pm in PACKAGE_MANAGER_FILES.items():
            if "*" in file_pattern:
                if self._find_files(file_pattern):
                    if pm not in detected:
                        detected.append(pm)
            else:
                if self._file_exists(file_pattern):
                    if pm not in detected:
                        detected.append(pm)

        # Special case: check pyproject.toml for poetry vs other tools
        if PackageManager.POETRY in detected:
            pyproject_path = self.repo_path / "pyproject.toml"
            if pyproject_path.exists():
                content = self._read_file(pyproject_path) or ""
                if "[tool.poetry]" not in content:
                    detected.remove(PackageManager.POETRY)
                    if PackageManager.PIP not in detected:
                        detected.append(PackageManager.PIP)

        return detected

    def _get_root_directories(self) -> list[str]:
        """Get the main root directories of the project."""
        root_dirs: list[str] = []
        common_roots = ["src", "lib", "app", "apps", "packages", "modules", "core", "api", "backend", "frontend"]

        for dir_name in common_roots:
            if (self.repo_path / dir_name).is_dir():
                root_dirs.append(dir_name)

        return root_dirs if root_dirs else ["."]

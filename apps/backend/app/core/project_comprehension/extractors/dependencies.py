"""Dependencies extractor for project comprehension."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import NamedTuple

from app.core.project_comprehension.extractors.base import BaseExtractor, ExtractionResult
from app.core.project_comprehension.profile import DependencyInfo


class DependencyExtractor(BaseExtractor[DependencyInfo]):
    """Extracts dependency information from the repository."""

    def extract(self) -> ExtractionResult[DependencyInfo]:
        """Extract dependency information from the repository."""
        try:
            external_deps: set[str] = set()
            dev_deps_count = 0
            has_lockfile = False

            # Python dependencies
            python_deps = self._extract_python_dependencies()
            external_deps.update(python_deps.get("dependencies", []))
            dev_deps_count += python_deps.get("dev_count", 0)
            has_lockfile = has_lockfile or python_deps.get("has_lockfile", False)

            # Node.js dependencies
            node_deps = self._extract_node_dependencies()
            external_deps.update(node_deps.get("dependencies", []))
            dev_deps_count += node_deps.get("dev_count", 0)
            has_lockfile = has_lockfile or node_deps.get("has_lockfile", False)

            # Go dependencies
            go_deps = self._extract_go_dependencies()
            external_deps.update(go_deps.get("dependencies", []))
            has_lockfile = has_lockfile or go_deps.get("has_lockfile", False)

            # Rust dependencies
            rust_deps = self._extract_rust_dependencies()
            external_deps.update(rust_deps.get("dependencies", []))
            has_lockfile = has_lockfile or rust_deps.get("has_lockfile", False)

            # Find internal modules
            internal_modules = self._find_internal_modules()

            # Build basic dependency graph
            dep_graph = self._build_dependency_graph(internal_modules)

            return ExtractionResult(
                success=True,
                data=DependencyInfo(
                    external_dependencies=tuple(sorted(external_deps)[:100]),  # Limit for storage
                    external_dependencies_count=len(external_deps),
                    dev_dependencies_count=dev_deps_count,
                    internal_modules=tuple(internal_modules),
                    internal_dependencies_graph=dep_graph,
                    has_lockfile=has_lockfile,
                    outdated_dependencies_count=None,  # Would need external tool
                    security_vulnerabilities_count=None,  # Would need external tool
                ),
            )

        except Exception as e:
            return ExtractionResult(
                success=False,
                error=f"Failed to extract dependencies: {e}",
            )

    def _extract_python_dependencies(self) -> dict:
        """Extract Python dependencies."""
        result = {"dependencies": [], "dev_count": 0, "has_lockfile": False}

        # Check for lock files
        if self._file_exists("poetry.lock", "Pipfile.lock", "uv.lock", "requirements.lock"):
            result["has_lockfile"] = True

        # pyproject.toml (Poetry/PEP 621)
        pyproject_path = self.repo_path / "pyproject.toml"
        if pyproject_path.exists():
            content = self._read_file(pyproject_path) or ""

            # Poetry dependencies
            deps_section = re.search(r"\[tool\.poetry\.dependencies\](.*?)(?=\[|$)", content, re.DOTALL)
            if deps_section:
                deps = re.findall(r'^(\w[\w-]*)\s*=', deps_section.group(1), re.MULTILINE)
                result["dependencies"].extend(deps)

            # Dev dependencies
            dev_section = re.search(r"\[tool\.poetry\.dev-dependencies\](.*?)(?=\[|$)", content, re.DOTALL)
            if dev_section:
                dev_deps = re.findall(r'^(\w[\w-]*)\s*=', dev_section.group(1), re.MULTILINE)
                result["dev_count"] = len(dev_deps)

            # PEP 621 dependencies
            project_deps = re.search(r"\[project\].*?dependencies\s*=\s*\[(.*?)\]", content, re.DOTALL)
            if project_deps:
                deps = re.findall(r'"([a-zA-Z][\w-]*)', project_deps.group(1))
                result["dependencies"].extend(deps)

        # requirements.txt
        req_files = ["requirements.txt", "requirements/base.txt", "requirements/prod.txt"]
        for req_file in req_files:
            path = self.repo_path / req_file
            if path.exists():
                content = self._read_file(path) or ""
                deps = re.findall(r'^([a-zA-Z][\w-]*)', content, re.MULTILINE)
                result["dependencies"].extend(deps)

        # requirements-dev.txt
        dev_req_files = ["requirements-dev.txt", "requirements/dev.txt", "requirements/test.txt"]
        for req_file in dev_req_files:
            path = self.repo_path / req_file
            if path.exists():
                content = self._read_file(path) or ""
                dev_deps = re.findall(r'^([a-zA-Z][\w-]*)', content, re.MULTILINE)
                result["dev_count"] += len(dev_deps)

        # Deduplicate
        result["dependencies"] = list(set(result["dependencies"]))
        return result

    def _extract_node_dependencies(self) -> dict:
        """Extract Node.js dependencies."""
        result = {"dependencies": [], "dev_count": 0, "has_lockfile": False}

        # Check for lock files
        if self._file_exists("package-lock.json", "yarn.lock", "pnpm-lock.yaml"):
            result["has_lockfile"] = True

        # package.json
        package_path = self.repo_path / "package.json"
        if package_path.exists():
            content = self._read_file(package_path)
            if content:
                try:
                    pkg = json.loads(content)
                    deps = pkg.get("dependencies", {})
                    result["dependencies"] = list(deps.keys())
                    dev_deps = pkg.get("devDependencies", {})
                    result["dev_count"] = len(dev_deps)
                except json.JSONDecodeError:
                    pass

        return result

    def _extract_go_dependencies(self) -> dict:
        """Extract Go dependencies."""
        result = {"dependencies": [], "has_lockfile": False}

        # Check for go.sum (lock file)
        if self._file_exists("go.sum"):
            result["has_lockfile"] = True

        # go.mod
        gomod_path = self.repo_path / "go.mod"
        if gomod_path.exists():
            content = self._read_file(gomod_path) or ""
            # Extract require statements
            require_section = re.search(r"require\s*\((.*?)\)", content, re.DOTALL)
            if require_section:
                deps = re.findall(r'^\s*([\w./-]+)\s+v', require_section.group(1), re.MULTILINE)
                result["dependencies"] = deps
            else:
                deps = re.findall(r'^require\s+([\w./-]+)\s+v', content, re.MULTILINE)
                result["dependencies"] = deps

        return result

    def _extract_rust_dependencies(self) -> dict:
        """Extract Rust dependencies."""
        result = {"dependencies": [], "has_lockfile": False}

        # Check for Cargo.lock
        if self._file_exists("Cargo.lock"):
            result["has_lockfile"] = True

        # Cargo.toml
        cargo_path = self.repo_path / "Cargo.toml"
        if cargo_path.exists():
            content = self._read_file(cargo_path) or ""
            deps_section = re.search(r"\[dependencies\](.*?)(?=\[|$)", content, re.DOTALL)
            if deps_section:
                deps = re.findall(r'^(\w[\w-]*)\s*=', deps_section.group(1), re.MULTILINE)
                result["dependencies"] = deps

        return result

    def _find_internal_modules(self) -> list[str]:
        """Find internal module names."""
        modules: set[str] = set()

        # Python packages (directories with __init__.py)
        init_files = self._find_files("**/__init__.py")
        for init_file in init_files:
            parent = init_file.parent
            rel_path = self._get_relative_path(parent)
            # Skip common non-module directories
            if not any(skip in rel_path for skip in ["test", "venv", ".venv", "node_modules"]):
                # Get the top-level module name
                parts = rel_path.replace("\\", "/").split("/")
                if parts and parts[0] not in {"src", "lib", "app"}:
                    modules.add(parts[0])
                elif len(parts) > 1:
                    modules.add(parts[1])

        # JavaScript/TypeScript packages (directories with package.json or index.js/ts)
        for pattern in ["**/package.json", "**/index.js", "**/index.ts"]:
            files = self._find_files(pattern)
            for f in files:
                if "node_modules" not in str(f):
                    parent = f.parent
                    rel_path = self._get_relative_path(parent)
                    parts = rel_path.replace("\\", "/").split("/")
                    if parts and parts[0] not in {"src", "lib", "packages"}:
                        modules.add(parts[0])
                    elif len(parts) > 1:
                        modules.add(parts[1])

        return sorted(list(modules))[:50]

    def _build_dependency_graph(self, modules: list[str]) -> dict[str, tuple[str, ...]]:
        """Build a basic internal dependency graph."""
        graph: dict[str, list[str]] = {m: [] for m in modules}

        # This is a simplified version - could be extended with AST analysis
        # For now, just detect explicit imports in Python files
        python_files = self._find_files("**/*.py")[:200]  # Limit for performance

        for f in python_files:
            content = self._read_file(f)
            if not content:
                continue

            # Determine which module this file belongs to
            rel_path = self._get_relative_path(f)
            parts = rel_path.replace("\\", "/").split("/")
            current_module = None
            for module in modules:
                if module in parts:
                    current_module = module
                    break

            if not current_module:
                continue

            # Find imports of other internal modules
            imports = re.findall(r'^(?:from|import)\s+([\w.]+)', content, re.MULTILINE)
            for imp in imports:
                imp_parts = imp.split(".")
                for module in modules:
                    if module in imp_parts and module != current_module:
                        if module not in graph[current_module]:
                            graph[current_module].append(module)
                        break

        return {k: tuple(v) for k, v in graph.items()}

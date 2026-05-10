"""Architecture extractor for project comprehension."""

from __future__ import annotations

import re
from pathlib import Path

from app.core.project_comprehension.extractors.base import BaseExtractor, ExtractionResult
from app.core.project_comprehension.profile import ArchitectureInfo, ArchitecturePattern


# Common directory names for different layers
API_LAYER_DIRS = {"api", "apis", "routes", "routers", "controllers", "endpoints", "handlers", "views"}
SERVICE_LAYER_DIRS = {"services", "service", "usecases", "use_cases", "business", "domain", "logic"}
DATA_LAYER_DIRS = {"data", "database", "db", "repositories", "repos", "models", "entities", "dal", "orm", "storage"}
PRESENTATION_LAYER_DIRS = {"ui", "views", "templates", "pages", "components", "frontend", "client", "web"}

# Entry point patterns
ENTRY_POINT_FILES = {
    "main.py",
    "app.py",
    "__main__.py",
    "index.js",
    "index.ts",
    "main.js",
    "main.ts",
    "server.js",
    "server.ts",
    "app.js",
    "app.ts",
    "main.go",
    "cmd/main.go",
    "src/main.rs",
    "main.rs",
    "Application.java",
    "Main.java",
}


class ArchitectureExtractor(BaseExtractor[ArchitectureInfo]):
    """Extracts architecture pattern information from the repository."""

    def extract(self) -> ExtractionResult[ArchitectureInfo]:
        """Extract architecture information from the repository."""
        try:
            # Detect layers
            has_api = self._has_layer(API_LAYER_DIRS)
            has_service = self._has_layer(SERVICE_LAYER_DIRS)
            has_data = self._has_layer(DATA_LAYER_DIRS)
            has_presentation = self._has_layer(PRESENTATION_LAYER_DIRS)

            # Detect architecture pattern
            pattern, confidence = self._detect_pattern(has_api, has_service, has_data, has_presentation)

            # Find entry points
            entry_points = self._find_entry_points()

            # Find core modules
            core_modules = self._find_core_modules()

            # Count API endpoints
            api_count = self._count_api_endpoints()

            # Calculate layer separation score
            layer_score = self._calculate_layer_separation_score(has_api, has_service, has_data, has_presentation)

            return ExtractionResult(
                success=True,
                data=ArchitectureInfo(
                    pattern=pattern,
                    pattern_confidence=confidence,
                    entry_points=tuple(entry_points[:10]),
                    core_modules=tuple(core_modules[:20]),
                    api_endpoints_count=api_count,
                    has_api_layer=has_api,
                    has_data_layer=has_data,
                    has_service_layer=has_service,
                    has_presentation_layer=has_presentation,
                    layer_separation_score=layer_score,
                ),
            )

        except Exception as e:
            return ExtractionResult(
                success=False,
                error=f"Failed to extract architecture: {e}",
            )

    def _has_layer(self, layer_dirs: set[str]) -> bool:
        """Check if any of the layer directories exist."""
        for dir_name in layer_dirs:
            # Check root level
            if (self.repo_path / dir_name).is_dir():
                return True
            # Check in common parent directories
            for parent in ["src", "app", "lib", "pkg"]:
                if (self.repo_path / parent / dir_name).is_dir():
                    return True
        return False

    def _detect_pattern(
        self,
        has_api: bool,
        has_service: bool,
        has_data: bool,
        has_presentation: bool,
    ) -> tuple[ArchitecturePattern, float]:
        """Detect the architecture pattern based on detected layers and structure."""

        # Check for microservices indicators
        if self._is_microservices():
            return ArchitecturePattern.MICROSERVICES, 0.8

        # Check for serverless indicators
        if self._is_serverless():
            return ArchitecturePattern.SERVERLESS, 0.75

        # Check for hexagonal/clean architecture
        if self._is_hexagonal():
            return ArchitecturePattern.HEXAGONAL, 0.7

        # Check for event-driven architecture
        if self._is_event_driven():
            return ArchitecturePattern.EVENT_DRIVEN, 0.65

        # Check for modular monolith
        if self._is_modular_monolith():
            return ArchitecturePattern.MODULAR_MONOLITH, 0.7

        # Check for layered architecture
        layer_count = sum([has_api, has_service, has_data, has_presentation])
        if layer_count >= 3:
            return ArchitecturePattern.LAYERED, 0.75
        elif layer_count == 2:
            return ArchitecturePattern.LAYERED, 0.5

        # Default to monolith
        return ArchitecturePattern.MONOLITH, 0.4

    def _is_microservices(self) -> bool:
        """Check for microservices architecture indicators."""
        # Multiple docker-compose services
        compose_files = self._find_files("docker-compose*.yml") + self._find_files("docker-compose*.yaml")
        for f in compose_files:
            content = self._read_file(f)
            if content:
                services_count = content.count("services:") + len(re.findall(r"^\s+\w+:\s*$", content, re.MULTILINE))
                if services_count > 3:
                    return True

        # Multiple independent apps/services directories
        service_dirs = set()
        for dir_name in ["services", "apps", "packages", "microservices"]:
            parent = self.repo_path / dir_name
            if parent.is_dir():
                for child in parent.iterdir():
                    if child.is_dir() and not child.name.startswith("."):
                        service_dirs.add(child.name)

        return len(service_dirs) >= 3

    def _is_serverless(self) -> bool:
        """Check for serverless architecture indicators."""
        serverless_indicators = [
            "serverless.yml",
            "serverless.yaml",
            "sam.yaml",
            "template.yaml",  # AWS SAM
            "netlify.toml",
            "vercel.json",
            "functions/",
            "lambdas/",
        ]
        for indicator in serverless_indicators:
            if "/" in indicator:
                if (self.repo_path / indicator.rstrip("/")).is_dir():
                    return True
            elif self._file_exists(indicator):
                return True
        return False

    def _is_hexagonal(self) -> bool:
        """Check for hexagonal/clean architecture indicators."""
        hexagonal_dirs = [
            "adapters",
            "ports",
            "infrastructure",
            "domain",
            "application",
            "interfaces",
        ]
        found = sum(1 for d in hexagonal_dirs if self._has_layer({d}))
        return found >= 3

    def _is_event_driven(self) -> bool:
        """Check for event-driven architecture indicators."""
        event_indicators = [
            "events/",
            "handlers/",
            "listeners/",
            "subscribers/",
            "publishers/",
            "queues/",
        ]
        # Also check for message queue libraries
        for indicator in event_indicators:
            if (self.repo_path / indicator.rstrip("/")).is_dir():
                return True

        # Check for common event-driven dependencies
        content_patterns = [
            ("requirements.txt", r"(celery|kombu|pika|kafka|rabbitmq)"),
            ("package.json", r"(amqplib|bull|kafka|rabbitmq)"),
        ]
        for file_name, pattern in content_patterns:
            path = self.repo_path / file_name
            if path.exists():
                content = self._read_file(path)
                if content and re.search(pattern, content, re.IGNORECASE):
                    return True

        return False

    def _is_modular_monolith(self) -> bool:
        """Check for modular monolith indicators."""
        # Check for multiple well-defined modules within a single deployable
        module_dirs = ["modules", "features", "bounded_contexts"]
        for dir_name in module_dirs:
            parent = self.repo_path / dir_name
            if parent.is_dir():
                modules = [d for d in parent.iterdir() if d.is_dir() and not d.name.startswith(".")]
                if len(modules) >= 3:
                    return True

        # Check for domain-driven structure in src or app
        for parent_name in ["src", "app"]:
            parent = self.repo_path / parent_name
            if parent.is_dir():
                subdirs = [d for d in parent.iterdir() if d.is_dir() and not d.name.startswith(".")]
                # Exclude common layer names
                layer_names = API_LAYER_DIRS | SERVICE_LAYER_DIRS | DATA_LAYER_DIRS | PRESENTATION_LAYER_DIRS
                module_subdirs = [d for d in subdirs if d.name.lower() not in layer_names]
                if len(module_subdirs) >= 4:
                    return True

        return False

    def _find_entry_points(self) -> list[str]:
        """Find entry point files in the repository."""
        entry_points: list[str] = []

        for entry_file in ENTRY_POINT_FILES:
            if "/" in entry_file:
                path = self.repo_path / entry_file
                if path.exists():
                    entry_points.append(entry_file)
            else:
                # Search in common locations
                for prefix in ["", "src/", "app/", "cmd/"]:
                    path = self.repo_path / prefix / entry_file
                    if path.exists():
                        entry_points.append(f"{prefix}{entry_file}".lstrip("/"))

        return entry_points

    def _find_core_modules(self) -> list[str]:
        """Find core module directories."""
        core_modules: list[str] = []

        # Look in common parent directories
        for parent_name in ["src", "app", "lib", "pkg", "core", "modules", "packages"]:
            parent = self.repo_path / parent_name
            if parent.is_dir():
                for child in sorted(parent.iterdir()):
                    if child.is_dir() and not child.name.startswith((".", "_")):
                        rel_path = self._get_relative_path(child)
                        core_modules.append(rel_path)

        # If nothing found in standard dirs, look at root level
        if not core_modules:
            for child in sorted(self.repo_path.iterdir()):
                if child.is_dir() and not child.name.startswith((".", "_")):
                    if child.name.lower() not in {"node_modules", "venv", ".venv", "dist", "build", "target"}:
                        core_modules.append(child.name)

        return core_modules

    def _count_api_endpoints(self) -> int:
        """Estimate the number of API endpoints."""
        count = 0

        # Python FastAPI/Flask routes
        python_files = self._find_files("**/*.py")
        route_patterns = [
            r"@app\.(get|post|put|delete|patch)\s*\(",
            r"@router\.(get|post|put|delete|patch)\s*\(",
            r"@api_view\s*\(",
            r"path\s*\(\s*['\"]",
        ]
        for f in python_files[:100]:  # Limit for performance
            content = self._read_file(f)
            if content:
                for pattern in route_patterns:
                    count += len(re.findall(pattern, content))

        # JavaScript/TypeScript routes
        js_files = self._find_files("**/*.js") + self._find_files("**/*.ts")
        js_patterns = [
            r"app\.(get|post|put|delete|patch)\s*\(",
            r"router\.(get|post|put|delete|patch)\s*\(",
            r"@(Get|Post|Put|Delete|Patch)\s*\(",
        ]
        for f in js_files[:100]:
            content = self._read_file(f)
            if content:
                for pattern in js_patterns:
                    count += len(re.findall(pattern, content))

        return count

    def _calculate_layer_separation_score(
        self,
        has_api: bool,
        has_service: bool,
        has_data: bool,
        has_presentation: bool,
    ) -> float:
        """Calculate how well the layers are separated (0-1)."""
        layers = [has_api, has_service, has_data, has_presentation]
        layer_count = sum(layers)

        if layer_count == 0:
            return 0.0
        elif layer_count == 1:
            return 0.25
        elif layer_count == 2:
            return 0.5
        elif layer_count == 3:
            return 0.75
        else:  # All 4 layers
            return 1.0

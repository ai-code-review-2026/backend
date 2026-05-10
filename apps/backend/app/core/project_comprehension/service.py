"""Project Comprehension Service.

Main service that orchestrates project analysis and understanding.
It combines all extractors to build a comprehensive project profile.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING

from app.core.project_comprehension.extractors import (
    ArchitectureExtractor,
    DependencyExtractor,
    FrameworkExtractor,
    LanguageExtractor,
    QualityExtractor,
    StructureExtractor,
)
from app.core.project_comprehension.profile import ProjectProfile, StructureInfo

if TYPE_CHECKING:
    from app.integrations.graph_database.neo4j_client import Neo4jClient

logger = logging.getLogger(__name__)


class ProjectComprehensionService:
    """Service for comprehensive project analysis and understanding.

    This service:
    1. Extracts project structure, languages, frameworks, architecture, quality
    2. Generates human-readable descriptions (business and technical)
    3. Stores the profile in Neo4j for semantic search
    4. Provides context for RAG-based code review
    """

    def __init__(
        self,
        *,
        neo4j_client: Neo4jClient | None = None,
        llm_client: object | None = None,  # For description generation
    ):
        self.neo4j_client = neo4j_client
        self.llm_client = llm_client

    async def analyze_repository(
        self,
        repo_path: str | Path,
        repo_id: str,
        org_id: str | None = None,
        existing_version: int = 0,
    ) -> ProjectProfile:
        """Analyze a repository and build a comprehensive profile.

        Args:
            repo_path: Path to the repository root
            repo_id: Unique identifier for the repository
            org_id: Optional organization identifier
            existing_version: Current context version (for incremental updates)

        Returns:
            ProjectProfile with all extracted information
        """
        path = Path(repo_path)
        if not path.is_dir():
            raise ValueError(f"Repository path does not exist: {repo_path}")

        logger.info(f"Starting comprehensive analysis for repo: {repo_id}")

        # Initialize profile
        profile = ProjectProfile(
            repo_id=repo_id,
            org_id=org_id,
            context_version=existing_version + 1,
            created_at=datetime.now(timezone.utc),
            last_analyzed_at=datetime.now(timezone.utc),
            analysis_status="analyzing",
        )

        try:
            # Extract structure
            structure_extractor = StructureExtractor(path)
            structure_result = structure_extractor.extract()
            if structure_result.success and structure_result.data:
                profile.structure = structure_result.data
                logger.debug(f"Structure extracted: {len(structure_result.data.main_languages)} languages")

            # Extract detailed language info
            lang_extractor = LanguageExtractor(path)
            lang_result = lang_extractor.extract()
            if lang_result.success and lang_result.data:
                logger.debug(f"Languages: primary={lang_result.data.primary_language}")

            # Extract frameworks
            framework_extractor = FrameworkExtractor(path)
            framework_result = framework_extractor.extract()
            if framework_result.success and framework_result.data:
                # Update structure with detected frameworks
                if profile.structure:
                    profile.structure = StructureInfo(
                        root_directories=profile.structure.root_directories,
                        main_languages=profile.structure.main_languages,
                        secondary_languages=profile.structure.secondary_languages,
                        frameworks_detected=framework_result.data.frameworks,
                        package_managers=profile.structure.package_managers,
                        total_files=profile.structure.total_files,
                        total_directories=profile.structure.total_directories,
                        code_files_count=profile.structure.code_files_count,
                        config_files_count=profile.structure.config_files_count,
                        doc_files_count=profile.structure.doc_files_count,
                        test_files_count=profile.structure.test_files_count,
                    )
                logger.debug(f"Frameworks: {framework_result.data.frameworks}")

            # Extract architecture
            arch_extractor = ArchitectureExtractor(path)
            arch_result = arch_extractor.extract()
            if arch_result.success and arch_result.data:
                profile.architecture = arch_result.data
                logger.debug(f"Architecture: {arch_result.data.pattern.value}")

            # Extract quality indicators
            quality_extractor = QualityExtractor(path)
            quality_result = quality_extractor.extract()
            if quality_result.success and quality_result.data:
                profile.quality = quality_result.data
                logger.debug(f"Quality: has_tests={quality_result.data.has_tests}")

            # Extract dependencies
            dep_extractor = DependencyExtractor(path)
            dep_result = dep_extractor.extract()
            if dep_result.success and dep_result.data:
                profile.dependencies = dep_result.data
                logger.debug(f"Dependencies: {dep_result.data.external_dependencies_count} external")

            # Generate descriptions
            profile.business_description = self._generate_business_description(profile)
            profile.technical_summary = self._generate_technical_summary(profile)

            # Mark as completed
            profile.analysis_status = "completed"
            profile.last_analyzed_at = datetime.now(timezone.utc)

            logger.info(f"Analysis completed for repo: {repo_id}")
            return profile

        except Exception as e:
            logger.error(f"Analysis failed for repo {repo_id}: {e}")
            profile.analysis_status = "failed"
            profile.analysis_error = str(e)
            return profile

    def _generate_business_description(self, profile: ProjectProfile) -> str:
        """Generate a non-technical business description.

        This description is meant to be displayed in the frontend UI
        for users who may not be technical.
        """
        parts = []

        # Start with type of project
        if profile.structure:
            langs = profile.structure.main_languages
            frameworks = profile.structure.frameworks_detected

            if "next.js" in frameworks or "nuxt" in frameworks:
                parts.append("This is a modern web application")
            elif "react" in frameworks or "vue" in frameworks or "angular" in frameworks:
                parts.append("This is a frontend web application")
            elif "fastapi" in frameworks or "flask" in frameworks or "django" in frameworks:
                parts.append("This is a backend API service")
            elif "express" in frameworks or "nestjs" in frameworks:
                parts.append("This is a Node.js backend service")
            elif "typescript" in langs or "javascript" in langs:
                parts.append("This is a JavaScript/TypeScript project")
            elif "python" in langs:
                parts.append("This is a Python project")
            elif "go" in langs:
                parts.append("This is a Go project")
            elif "rust" in langs:
                parts.append("This is a Rust project")
            elif "java" in langs:
                parts.append("This is a Java project")
            else:
                parts.append("This is a software project")

        # Add architecture description
        if profile.architecture:
            pattern = profile.architecture.pattern.value
            if pattern == "microservices":
                parts.append("built as multiple independent services")
            elif pattern == "serverless":
                parts.append("designed for serverless/cloud deployment")
            elif pattern == "modular_monolith":
                parts.append("organized into well-defined modules")
            elif pattern == "layered":
                parts.append("with a layered architecture")

        # Add quality summary
        if profile.quality:
            quality_aspects = []
            if profile.quality.has_tests:
                quality_aspects.append("automated tests")
            if profile.quality.has_ci_cd:
                quality_aspects.append("CI/CD pipeline")
            if profile.quality.has_documentation:
                quality_aspects.append("documentation")

            if quality_aspects:
                parts.append(f"including {', '.join(quality_aspects)}")

        # Add size indication
        if profile.structure:
            if profile.structure.code_files_count > 500:
                parts.append(". This is a large codebase")
            elif profile.structure.code_files_count > 100:
                parts.append(". This is a medium-sized codebase")
            else:
                parts.append(". This is a small to medium codebase")

        description = " ".join(parts) + "."

        # Clean up punctuation
        description = description.replace(" .", ".").replace("..", ".")

        return description

    def _generate_technical_summary(self, profile: ProjectProfile) -> str:
        """Generate a technical summary for developers."""
        lines = []

        # Languages and frameworks
        if profile.structure:
            langs = ", ".join(profile.structure.main_languages) or "unknown"
            lines.append(f"**Languages**: {langs}")

            if profile.structure.frameworks_detected:
                frameworks = ", ".join(profile.structure.frameworks_detected)
                lines.append(f"**Frameworks**: {frameworks}")

            pkg_managers = [pm.value for pm in profile.structure.package_managers]
            if pkg_managers:
                lines.append(f"**Package Managers**: {', '.join(pkg_managers)}")

        # Architecture
        if profile.architecture:
            lines.append(f"**Architecture**: {profile.architecture.pattern.value} (confidence: {profile.architecture.pattern_confidence:.0%})")

            if profile.architecture.entry_points:
                entries = ", ".join(profile.architecture.entry_points[:3])
                lines.append(f"**Entry Points**: {entries}")

            if profile.architecture.api_endpoints_count > 0:
                lines.append(f"**API Endpoints**: ~{profile.architecture.api_endpoints_count}")

        # Quality
        if profile.quality:
            quality_items = []
            if profile.quality.has_tests:
                test_info = f"Tests ({profile.quality.test_framework or 'detected'})"
                if profile.quality.test_coverage_estimated:
                    test_info += f" ~{profile.quality.test_coverage_estimated:.0%} coverage"
                quality_items.append(test_info)

            if profile.quality.has_ci_cd:
                quality_items.append(f"CI/CD ({profile.quality.ci_cd_platform or 'detected'})")

            if profile.quality.linting_tools:
                quality_items.append(f"Linting ({', '.join(profile.quality.linting_tools[:3])})")

            if quality_items:
                lines.append(f"**Quality**: {', '.join(quality_items)}")

        # Dependencies
        if profile.dependencies:
            lines.append(f"**Dependencies**: {profile.dependencies.external_dependencies_count} external, {profile.dependencies.dev_dependencies_count} dev")

        # Size metrics
        if profile.structure:
            lines.append(f"**Size**: {profile.structure.code_files_count} code files, {profile.structure.test_files_count} test files")

        return "\n".join(lines)

    async def store_profile(self, profile: ProjectProfile) -> bool:
        """Store the profile in Neo4j.

        Args:
            profile: The project profile to store

        Returns:
            True if stored successfully
        """
        if not self.neo4j_client:
            logger.warning("Neo4j client not configured, skipping profile storage")
            return False

        try:
            import asyncio
            await asyncio.to_thread(
                self.neo4j_client.upsert_repository,
                repo_id=profile.repo_id,
                org_id=profile.org_id,
                properties={
                    "context_version": profile.context_version,
                    "business_description": profile.business_description,
                    "technical_summary": profile.technical_summary,
                    "analysis_status": profile.analysis_status,
                    "last_analyzed_at": profile.last_analyzed_at.isoformat() if profile.last_analyzed_at else None,
                },
            )
            logger.info(f"Stored profile for repo: {profile.repo_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to store profile for {profile.repo_id}: {e}")
            return False

    async def get_profile(self, repo_id: str) -> ProjectProfile | None:
        """Retrieve a stored profile from Neo4j.

        Args:
            repo_id: The repository identifier

        Returns:
            ProjectProfile if found, None otherwise
        """
        if not self.neo4j_client:
            return None

        try:
            import asyncio
            data = await asyncio.to_thread(
                self.neo4j_client.get_repo_profile,
                repo_id,
            )
            if not data:
                return None
            return ProjectProfile(
                repo_id=repo_id,
                org_id=data.get("org_id"),
                context_version=int(data.get("context_version", 1)),
                business_description=data.get("business_description"),
                technical_summary=data.get("technical_summary"),
                analysis_status=data.get("analysis_status", "unknown"),
            )
        except Exception as e:
            logger.error(f"Failed to get profile for {repo_id}: {e}")
            return None

    async def update_profile_incremental(
        self,
        repo_id: str,
        changed_files: list[str],
        repo_path: str | Path,
    ) -> ProjectProfile | None:
        """Update a profile incrementally based on changed files.

        Args:
            repo_id: The repository identifier
            changed_files: List of files that changed
            repo_path: Path to the repository

        Returns:
            Updated profile or None if not found
        """
        # Get existing profile
        existing = await self.get_profile(repo_id)
        if not existing:
            # No existing profile, do full analysis
            return await self.analyze_repository(repo_path, repo_id)

        # Determine what needs to be re-extracted based on changed files
        need_structure = any(
            f.endswith((".py", ".js", ".ts", ".go", ".java", ".rs"))
            for f in changed_files
        )
        need_quality = any(
            "test" in f.lower() or f.endswith((".yml", ".yaml"))
            for f in changed_files
        )
        need_deps = any(
            f in ("package.json", "requirements.txt", "pyproject.toml", "Cargo.toml", "go.mod")
            for f in changed_files
        )

        path = Path(repo_path)

        # Selective re-extraction
        if need_structure:
            structure_extractor = StructureExtractor(path)
            result = structure_extractor.extract()
            if result.success and result.data:
                existing.structure = result.data

        if need_quality:
            quality_extractor = QualityExtractor(path)
            result = quality_extractor.extract()
            if result.success and result.data:
                existing.quality = result.data

        if need_deps:
            dep_extractor = DependencyExtractor(path)
            result = dep_extractor.extract()
            if result.success and result.data:
                existing.dependencies = result.data

        # Update metadata
        existing.context_version += 1
        existing.last_context_update_at = datetime.now(timezone.utc)

        # Regenerate descriptions
        existing.business_description = self._generate_business_description(existing)
        existing.technical_summary = self._generate_technical_summary(existing)

        return existing

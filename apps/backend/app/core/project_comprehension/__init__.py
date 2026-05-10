"""Project Comprehension Module.

This module provides comprehensive project analysis and understanding capabilities
for the AI code review platform. It extracts project structure, detects languages
and frameworks, identifies architectural patterns, and generates human-readable
descriptions for the frontend UI.
"""

from app.core.project_comprehension.profile import (
    ArchitectureInfo,
    DependencyInfo,
    ProjectProfile,
    QualityIndicators,
    StructureInfo,
)
from app.core.project_comprehension.service import ProjectComprehensionService

__all__ = [
    "ArchitectureInfo",
    "DependencyInfo",
    "ProjectProfile",
    "ProjectComprehensionService",
    "QualityIndicators",
    "StructureInfo",
]

"""Project comprehension extractors.

These extractors analyze different aspects of a repository to build
a comprehensive project profile.
"""

from app.core.project_comprehension.extractors.base import BaseExtractor, ExtractionResult
from app.core.project_comprehension.extractors.structure import StructureExtractor
from app.core.project_comprehension.extractors.languages import LanguageExtractor
from app.core.project_comprehension.extractors.frameworks import FrameworkExtractor
from app.core.project_comprehension.extractors.architecture import ArchitectureExtractor
from app.core.project_comprehension.extractors.dependencies import DependencyExtractor
from app.core.project_comprehension.extractors.quality import QualityExtractor

__all__ = [
    "BaseExtractor",
    "ExtractionResult",
    "StructureExtractor",
    "LanguageExtractor",
    "FrameworkExtractor",
    "ArchitectureExtractor",
    "DependencyExtractor",
    "QualityExtractor",
]

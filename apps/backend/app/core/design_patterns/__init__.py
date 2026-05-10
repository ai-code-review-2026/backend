"""
Design Patterns Module - Extract, compare, and analyze design patterns.

This module provides:
- Pattern extraction from legacy code
- Pattern comparison between PR and legacy code
- Intelligent comment generation for violations
- Neo4j storage for patterns and violations
- Integration with GraphRAG pipeline
"""

from app.core.design_patterns.pattern_extractor import (
    PatternExtractor,
    DesignPattern,
    CodeElement,
)
from app.core.design_patterns.pattern_comparator import (
    PatternComparator,
    PatternViolation,
)
from app.core.design_patterns.pattern_comment_generator import (
    PatternCommentGenerator,
    GitHubComment,
)
from app.core.design_patterns.pattern_neo4j_repo import (
    PatternNeo4jRepository,
)
from app.core.design_patterns.pattern_analysis_service import (
    PatternAnalysisService,
    get_pattern_analysis_service,
)

__all__ = [
    "PatternExtractor",
    "DesignPattern",
    "CodeElement",
    "PatternComparator",
    "PatternViolation",
    "PatternCommentGenerator",
    "GitHubComment",
    "PatternNeo4jRepository",
    "PatternAnalysisService",
    "get_pattern_analysis_service",
]

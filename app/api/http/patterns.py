"""
Pattern API - REST API endpoints for design pattern management and visualization.

Endpoints:
- POST /api/v1/patterns/extract - Extract patterns from a repository
- POST /api/v1/patterns/analyze-pr - Analyze a PR against patterns
- GET /api/v1/patterns/repository/{repo_name} - Get patterns for a repository
- GET /api/v1/patterns/statistics - Get pattern statistics
- GET /api/v1/patterns/violations/analysis/{analysis_id} - Get violations for an analysis
- GET /api/v1/patterns/most-violated - Get most violated patterns
- POST /api/v1/patterns/import-profile - Import GitHub profile repositories
"""

import logging
from typing import List, Dict, Optional, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel, Field

from app.api.middleware.auth import AuthenticatedRequest
from app.core.design_patterns import (
    PatternExtractor,
    PatternNeo4jRepository,
    PatternComparator,
    get_pattern_analysis_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/patterns", tags=["patterns"])


# ==================== Request/Response Models ====================

class ExtractPatternsRequest(BaseModel):
    """Request to extract patterns from a repository."""
    repository_name: str = Field(..., description="Repository name")
    repository_path: str = Field(..., description="Path to repository on disk")


class ExtractPatternsResponse(BaseModel):
    """Response from pattern extraction."""
    repository_name: str
    patterns_extracted: int
    patterns: List[Dict[str, Any]]


class AnalyzePRRequest(BaseModel):
    """Request to analyze a PR against patterns."""
    repository_name: str = Field(..., description="Repository name")
    pr_diff: str = Field(..., description="Git diff content")
    pr_files: Optional[Dict[str, str]] = Field(None, description="File path -> content mapping")


class AnalyzePRResponse(BaseModel):
    """Response from PR analysis."""
    repository_name: str
    violations: int
    violations_by_severity: Dict[str, int]
    violations_by_pattern: Dict[str, int]
    comments: List[Dict[str, Any]]


class PatternResponse(BaseModel):
    """Pattern information."""
    pattern_id: str
    name: str
    type: str
    confidence: float
    occurrences: int
    description: str
    recommendation: str
    evidence: List[str]


class PatternStatisticsResponse(BaseModel):
    """Pattern statistics."""
    total_patterns: int
    avg_confidence: float
    total_occurrences: int
    patterns_by_type: Dict[str, int]
    total_violations: int
    violations_by_severity: Dict[str, int]


class ViolationResponse(BaseModel):
    """Pattern violation information."""
    violation_id: str
    severity: str
    title: str
    description: str
    file_path: str
    line_number: int
    recommendation: str
    pattern_name: str
    pattern_id: str


class ImportProfileRequest(BaseModel):
    """Request to import GitHub profile."""
    username: str = Field(..., description="GitHub username")
    include_forks: bool = Field(False, description="Include forked repositories")
    include_archived: bool = Field(False, description="Include archived repositories")
    filter_languages: Optional[List[str]] = Field(None, description="Filter by programming languages")
    max_repos: Optional[int] = Field(None, description="Maximum repositories to import")


class ImportProfileResponse(BaseModel):
    """Response from profile import."""
    username: str
    total_repos: int
    cloned: int
    patterns_extracted: int
    total_patterns: int
    failed: int
    skipped: int
    status: str


# ==================== Endpoints ====================

@router.post("/extract", response_model=ExtractPatternsResponse)
async def extract_patterns(
    request: AuthenticatedRequest,
    body: ExtractPatternsRequest,
    background_tasks: BackgroundTasks,
):
    """
    Extract design patterns from a repository.
    
    This endpoint analyzes a repository's codebase and extracts architectural patterns.
    Patterns are stored in Neo4j for future comparisons.
    """
    logger.info(f"Extracting patterns for repository: {body.repository_name}")
    
    try:
        # Extract patterns
        extractor = PatternExtractor()
        patterns = extractor.extract_patterns_from_repository(
            repo_path=body.repository_path,
            repo_name=body.repository_name,
        )
        
        # Store in Neo4j (in background)
        neo4j_repo = PatternNeo4jRepository()
        
        def store_patterns():
            for pattern in patterns:
                neo4j_repo.store_pattern(
                    pattern=pattern,
                    repository_name=body.repository_name,
                )
        
        background_tasks.add_task(store_patterns)
        
        # Prepare response
        patterns_data = [
            {
                "pattern_id": p.pattern_id,
                "name": p.name,
                "type": p.type,
                "confidence": p.confidence,
                "occurrences": p.occurrences,
                "description": p.description,
                "evidence": p.evidence[:3],  # Top 3
            }
            for p in patterns
        ]
        
        return ExtractPatternsResponse(
            repository_name=body.repository_name,
            patterns_extracted=len(patterns),
            patterns=patterns_data,
        )
    
    except Exception as e:
        logger.error(f"Failed to extract patterns: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Pattern extraction failed: {str(e)}")


@router.post("/analyze-pr", response_model=AnalyzePRResponse)
async def analyze_pr(
    request: AuthenticatedRequest,
    body: AnalyzePRRequest,
):
    """
    Analyze a Pull Request against extracted patterns.
    
    This endpoint compares PR code against patterns detected in the repository
    and returns violations with recommendations.
    """
    logger.info(f"Analyzing PR for repository: {body.repository_name}")
    
    try:
        # Get patterns from Neo4j
        neo4j_repo = PatternNeo4jRepository()
        patterns_data = neo4j_repo.get_patterns_for_repository(body.repository_name)
        
        if not patterns_data:
            raise HTTPException(
                status_code=404,
                detail=f"No patterns found for repository {body.repository_name}. Extract patterns first."
            )
        
        # Convert to DesignPattern objects
        from app.core.design_patterns import DesignPattern
        patterns = [
            DesignPattern(**data) for data in patterns_data
        ]
        
        # Compare PR
        comparator = PatternComparator()
        violations = comparator.compare_pr_with_patterns(
            pr_diff=body.pr_diff,
            pr_files=body.pr_files or {},
            legacy_patterns=patterns,
            repository_path="",  # Not needed for comparison
        )
        
        # Generate comments
        from app.core.design_patterns import PatternCommentGenerator
        comment_generator = PatternCommentGenerator()
        comments = comment_generator.generate_comments(violations)
        
        # Statistics
        violations_by_severity = {
            "critical": len([v for v in violations if v.severity == "critical"]),
            "high": len([v for v in violations if v.severity == "high"]),
            "medium": len([v for v in violations if v.severity == "medium"]),
            "low": len([v for v in violations if v.severity == "low"]),
        }
        
        violations_by_pattern = {}
        for violation in violations:
            pattern_name = violation.pattern.name
            if pattern_name not in violations_by_pattern:
                violations_by_pattern[pattern_name] = 0
            violations_by_pattern[pattern_name] += 1
        
        comments_data = [
            {
                "file_path": c.file_path,
                "line_number": c.line_number,
                "severity": c.severity,
                "body": c.body,
            }
            for c in comments
        ]
        
        return AnalyzePRResponse(
            repository_name=body.repository_name,
            violations=len(violations),
            violations_by_severity=violations_by_severity,
            violations_by_pattern=violations_by_pattern,
            comments=comments_data,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to analyze PR: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PR analysis failed: {str(e)}")


@router.get("/repository/{repo_name}", response_model=List[PatternResponse])
async def get_repository_patterns(
    request: AuthenticatedRequest,
    repo_name: str,
):
    """
    Get all patterns for a repository.
    
    Returns the list of design patterns detected in the specified repository.
    """
    logger.info(f"Fetching patterns for repository: {repo_name}")
    
    try:
        neo4j_repo = PatternNeo4jRepository()
        patterns_data = neo4j_repo.get_patterns_for_repository(repo_name)
        
        if not patterns_data:
            return []
        
        return [PatternResponse(**data) for data in patterns_data]
    
    except Exception as e:
        logger.error(f"Failed to fetch patterns: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch patterns: {str(e)}")


@router.get("/statistics", response_model=PatternStatisticsResponse)
async def get_pattern_statistics(
    request: AuthenticatedRequest,
    repository_name: Optional[str] = Query(None, description="Filter by repository"),
):
    """
    Get pattern statistics.
    
    Returns aggregated statistics about patterns and violations.
    """
    logger.info(f"Fetching pattern statistics (repository={repository_name})")
    
    try:
        neo4j_repo = PatternNeo4jRepository()
        stats = neo4j_repo.get_pattern_statistics(repository_name=repository_name)
        
        return PatternStatisticsResponse(**stats)
    
    except Exception as e:
        logger.error(f"Failed to fetch statistics: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch statistics: {str(e)}")


@router.get("/violations/analysis/{analysis_id}", response_model=List[ViolationResponse])
async def get_analysis_violations(
    request: AuthenticatedRequest,
    analysis_id: str,
):
    """
    Get pattern violations for an analysis.
    
    Returns all pattern violations detected during a specific analysis run.
    """
    logger.info(f"Fetching violations for analysis: {analysis_id}")
    
    try:
        # Query violations from Neo4j via PR/analysis relationship
        neo4j_repo = PatternNeo4jRepository()
        
        # Get violations linked to this analysis
        violations = neo4j_repo.get_violations_for_pr(pr_id=analysis_id)
        
        if not violations:
            return []
        
        return [ViolationResponse(**v) for v in violations]
    
    except Exception as e:
        logger.error(f"Failed to fetch violations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch violations: {str(e)}")


@router.get("/most-violated", response_model=List[Dict[str, Any]])
async def get_most_violated_patterns(
    request: AuthenticatedRequest,
    limit: int = Query(10, ge=1, le=50, description="Number of patterns to return"),
):
    """
    Get patterns that are most frequently violated.
    
    Useful for identifying common issues across the codebase.
    """
    logger.info(f"Fetching top {limit} most violated patterns")
    
    try:
        neo4j_repo = PatternNeo4jRepository()
        patterns = neo4j_repo.get_most_violated_patterns(limit=limit)
        
        return patterns
    
    except Exception as e:
        logger.error(f"Failed to fetch most violated patterns: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch most violated patterns: {str(e)}")


@router.post("/import-profile", response_model=ImportProfileResponse)
async def import_github_profile(
    request: AuthenticatedRequest,
    body: ImportProfileRequest,
    background_tasks: BackgroundTasks,
):
    """
    Import all repositories from a GitHub profile.
    
    This endpoint clones repositories and extracts patterns from each one.
    The operation runs in the background.
    """
    logger.info(f"Starting GitHub profile import for user: {body.username}")
    
    try:
        # Import in background (can take a long time)
        from scripts.github_profile_importer import GitHubProfileImporter
        
        def run_import():
            with GitHubProfileImporter() as importer:
                stats = importer.import_profile(
                    username=body.username,
                    include_forks=body.include_forks,
                    include_archived=body.include_archived,
                    filter_languages=body.filter_languages,
                    max_repos=body.max_repos,
                )
                
                logger.info(f"GitHub import completed for {body.username}: {stats}")
        
        background_tasks.add_task(run_import)
        
        return ImportProfileResponse(
            username=body.username,
            total_repos=0,  # Will be updated in background
            cloned=0,
            patterns_extracted=0,
            total_patterns=0,
            failed=0,
            skipped=0,
            status="processing_in_background",
        )
    
    except Exception as e:
        logger.error(f"Failed to start import: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

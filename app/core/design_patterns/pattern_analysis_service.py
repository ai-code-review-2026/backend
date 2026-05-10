"""
Pattern Analysis Service - Integrates design pattern analysis into GraphRAG pipeline.

This service runs pattern analysis as part of the main analysis pipeline,
detecting pattern violations and generating findings.
"""

import logging
import hashlib
import uuid
from typing import Dict, List, Any, Optional
from pathlib import Path

from app.core.design_patterns import (
    PatternExtractor,
    PatternComparator,
    PatternCommentGenerator,
    PatternNeo4jRepository,
    DesignPattern,
    PatternViolation,
)
from app.data.repos.analyses_repo import AnalysesRepo, CreateFindingInput
from app.settings import settings

logger = logging.getLogger(__name__)


class PatternAnalysisService:
    """Service for analyzing design patterns in PRs."""
    
    def __init__(self):
        self.pattern_extractor = PatternExtractor()
        self.pattern_comparator = PatternComparator()
        self.comment_generator = PatternCommentGenerator()
        self.neo4j_repo = PatternNeo4jRepository()
        self.analyses_repo = AnalysesRepo()
    
    async def run_pattern_analysis(
        self,
        analysis_id: str,
        repository_path: str,
        repository_name: str,
        diff_content: str,
        pr_files: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Run pattern analysis on a PR.
        
        Args:
            analysis_id: Analysis UUID
            repository_path: Path to repository on disk
            repository_name: Repository name
            diff_content: Git diff content
            pr_files: Optional dictionary of file_path -> content
        
        Returns:
            Analysis results with violations and findings
        """
        logger.info(f"Starting pattern analysis for analysis {analysis_id}")
        
        try:
            # 1. Load or extract patterns for this repository
            patterns = await self._get_or_extract_patterns(
                repository_path=repository_path,
                repository_name=repository_name,
            )
            
            if not patterns:
                logger.warning(f"No patterns found for repository {repository_name}")
                return {
                    "status": "no_patterns",
                    "violations": 0,
                    "findings": 0,
                }
            
            logger.info(f"Loaded {len(patterns)} patterns for {repository_name}")
            
            # 2. Extract PR files if not provided
            if pr_files is None:
                pr_files = self._extract_files_from_diff(diff_content, repository_path)
            
            # 3. Compare PR against patterns
            violations = self.pattern_comparator.compare_pr_with_patterns(
                pr_diff=diff_content,
                pr_files=pr_files,
                legacy_patterns=patterns,
                repository_path=repository_path,
            )
            
            logger.info(f"Found {len(violations)} pattern violations")
            
            # 4. Store violations in Neo4j
            for violation in violations:
                self.neo4j_repo.store_pattern_violation(
                    violation=violation,
                    pr_id=None,  # Could be extracted from metadata
                    analysis_id=analysis_id,
                )
            
            # 5. Create findings in PostgreSQL
            findings_created = 0
            for violation in violations:
                success = self._create_finding_from_violation(
                    analysis_id=analysis_id,
                    violation=violation,
                )
                if success:
                    findings_created += 1
            
            # 6. Generate statistics
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
            
            return {
                "status": "completed",
                "total_violations": len(violations),
                "findings_created": findings_created,
                "violations_by_severity": violations_by_severity,
                "violations_by_pattern": violations_by_pattern,
                "patterns_checked": len(patterns),
            }
        
        except Exception as e:
            logger.error(f"Pattern analysis failed for analysis {analysis_id}: {e}", exc_info=True)
            return {
                "status": "failed",
                "error": str(e),
                "violations": 0,
                "findings": 0,
            }
    
    async def _get_or_extract_patterns(
        self,
        repository_path: str,
        repository_name: str,
    ) -> List[DesignPattern]:
        """
        Get patterns from Neo4j or extract if not exists.
        
        Args:
            repository_path: Path to repository
            repository_name: Repository name
        
        Returns:
            List of patterns
        """
        # Try to get from Neo4j first
        patterns_data = self.neo4j_repo.get_patterns_for_repository(repository_name)
        
        if patterns_data:
            logger.info(f"Loaded {len(patterns_data)} patterns from Neo4j for {repository_name}")
            
            # Convert to DesignPattern objects
            patterns = []
            for data in patterns_data:
                pattern = DesignPattern(
                    pattern_id=data["pattern_id"],
                    name=data["name"],
                    type=data["type"],
                    confidence=data["confidence"],
                    occurrences=data["occurrences"],
                    description=data["description"],
                    recommendation=data["recommendation"],
                    evidence=data["evidence"],
                )
                patterns.append(pattern)
            
            return patterns
        
        # Extract patterns if not in Neo4j
        logger.info(f"Extracting patterns from {repository_name} (not in cache)")
        
        patterns = self.pattern_extractor.extract_patterns_from_repository(
            repo_path=repository_path,
            repo_name=repository_name,
        )
        
        # Store in Neo4j for next time
        for pattern in patterns:
            self.neo4j_repo.store_pattern(
                pattern=pattern,
                repository_name=repository_name,
            )
        
        logger.info(f"Extracted and stored {len(patterns)} patterns for {repository_name}")
        
        return patterns
    
    def _extract_files_from_diff(
        self,
        diff_content: str,
        repository_path: str,
    ) -> Dict[str, str]:
        """
        Extract file contents from diff.
        
        Args:
            diff_content: Git diff
            repository_path: Path to repository
        
        Returns:
            Dictionary of file_path -> content
        """
        files = {}
        
        # Parse diff to get file paths
        lines = diff_content.split('\n')
        current_file = None
        
        for line in lines:
            if line.startswith('diff --git'):
                # Extract file path: diff --git a/path/to/file.js b/path/to/file.js
                parts = line.split(' ')
                if len(parts) >= 4:
                    file_path = parts[3].lstrip('b/')
                    current_file = file_path
            
            elif line.startswith('+++') and current_file:
                # File is modified, try to read content
                full_path = Path(repository_path) / current_file
                
                if full_path.exists():
                    try:
                        content = full_path.read_text(encoding='utf-8', errors='ignore')
                        files[current_file] = content
                    except Exception as e:
                        logger.warning(f"Failed to read {current_file}: {e}")
        
        logger.info(f"Extracted {len(files)} files from diff")
        return files
    
    def _create_finding_from_violation(
        self,
        analysis_id: str,
        violation: PatternViolation,
    ) -> bool:
        """
        Create a finding in PostgreSQL from a pattern violation.
        
        Args:
            analysis_id: Analysis UUID
            violation: Pattern violation
        
        Returns:
            True if created successfully
        """
        try:
            # Map severity
            severity_map = {
                "critical": "CRITICAL",
                "high": "HIGH",
                "medium": "MEDIUM",
                "low": "LOW",
            }
            
            severity = severity_map.get(violation.severity, "MEDIUM")
            
            # Create fingerprint
            fingerprint = hashlib.sha256(
                f"{analysis_id}:pattern:{violation.pattern.pattern_id}:{violation.file_path}:{violation.line_number}".encode('utf-8')
            ).hexdigest()
            
            # Create finding
            finding_input = CreateFindingInput(
                finding_id=uuid.uuid4().hex,
                analysis_id=analysis_id,
                source="pattern_analysis",
                file_path=violation.file_path,
                line_start=violation.line_number,
                line_end=violation.line_number,
                severity=severity,
                category="pattern_violation",
                message=violation.title,
                suggestion=violation.recommendation,
                confidence=1.0 - violation.score_impact,  # Higher impact = lower confidence in current code
                fingerprint=fingerprint,
                issue_type="pattern_violation",
                rule_id=violation.pattern.pattern_id,
                evidence={
                    "pattern": {
                        "id": violation.pattern.pattern_id,
                        "name": violation.pattern.name,
                        "type": violation.pattern.type,
                        "confidence": violation.pattern.confidence,
                        "occurrences": violation.pattern.occurrences,
                    },
                    "violation": {
                        "id": violation.violation_id,
                        "description": violation.description,
                        "expected_behavior": violation.expected_behavior,
                        "actual_behavior": violation.actual_behavior,
                        "score_impact": violation.score_impact,
                    },
                    "evidence_from_codebase": violation.evidence[:3],  # Top 3 examples
                },
            )
            
            self.analyses_repo.create_finding(finding_input)
            
            logger.info(
                f"Created pattern finding for analysis {analysis_id}: "
                f"{violation.pattern.name} in {violation.file_path}:{violation.line_number}"
            )
            
            return True
        
        except Exception as e:
            logger.error(f"Failed to create finding from violation: {e}", exc_info=True)
            return False
    
    def generate_pr_comment(
        self,
        violations: List[PatternViolation],
    ) -> str:
        """
        Generate a summary comment for the PR.
        
        Args:
            violations: List of violations
        
        Returns:
            Markdown comment
        """
        pattern_names = list(set(v.pattern.name for v in violations))
        
        return self.comment_generator.generate_summary_comment(
            violations=violations,
            patterns_analyzed=pattern_names,
        )


# Global instance for use in pipeline
_pattern_analysis_service = None


def get_pattern_analysis_service() -> PatternAnalysisService:
    """Get singleton instance of pattern analysis service."""
    global _pattern_analysis_service
    
    if _pattern_analysis_service is None:
        _pattern_analysis_service = PatternAnalysisService()
    
    return _pattern_analysis_service

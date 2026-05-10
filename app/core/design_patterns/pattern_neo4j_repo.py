"""
Neo4j Pattern Storage - Stores and queries design patterns in Neo4j graph.

Graph Schema:
- Repository → EXHIBITS_PATTERN → DesignPattern
- DesignPattern → SUPPORTED_BY → Evidence
- PullRequest → VIOLATES_PATTERN → DesignPattern
- Finding → ABOUT_PATTERN → DesignPattern
- File → FOLLOWS_PATTERN → DesignPattern
"""

import logging
from typing import List, Dict, Optional
from datetime import datetime

from neo4j import GraphDatabase
from neo4j.exceptions import Neo4jError

from app.core.design_patterns.pattern_extractor import DesignPattern, CodeElement
from app.core.design_patterns.pattern_comparator import PatternViolation
from app.settings import settings

logger = logging.getLogger(__name__)


class PatternNeo4jRepository:
    """Repository for storing and querying patterns in Neo4j."""
    
    def __init__(self):
        if not settings.NEO4J_ENABLED:
            logger.warning("Neo4j is not enabled")
            self.driver = None
            return
        
        self.driver = GraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )
    
    def close(self):
        """Close Neo4j connection."""
        if self.driver:
            self.driver.close()
    
    def create_pattern_schema(self):
        """Create Neo4j schema for patterns."""
        if not self.driver:
            return
        
        with self.driver.session() as session:
            # Create constraints
            constraints = [
                "CREATE CONSTRAINT pattern_id_unique IF NOT EXISTS FOR (p:DesignPattern) REQUIRE p.pattern_id IS UNIQUE",
                "CREATE CONSTRAINT violation_id_unique IF NOT EXISTS FOR (v:PatternViolation) REQUIRE v.violation_id IS UNIQUE",
            ]
            
            for constraint in constraints:
                try:
                    session.run(constraint)
                except Neo4jError as e:
                    logger.warning(f"Constraint creation failed: {e}")
            
            # Create indexes
            indexes = [
                "CREATE INDEX pattern_name_idx IF NOT EXISTS FOR (p:DesignPattern) ON (p.name)",
                "CREATE INDEX pattern_type_idx IF NOT EXISTS FOR (p:DesignPattern) ON (p.type)",
                "CREATE INDEX violation_severity_idx IF NOT EXISTS FOR (v:PatternViolation) ON (v.severity)",
            ]
            
            for index in indexes:
                try:
                    session.run(index)
                except Neo4jError as e:
                    logger.warning(f"Index creation failed: {e}")
    
    def store_pattern(
        self,
        pattern: DesignPattern,
        repository_name: str,
    ) -> bool:
        """
        Store a design pattern in Neo4j.
        
        Args:
            pattern: Design pattern to store
            repository_name: Repository where pattern was found
        
        Returns:
            True if successful
        """
        if not self.driver:
            return False
        
        try:
            with self.driver.session() as session:
                # Create or update pattern node
                session.run(
                    """
                    MERGE (p:DesignPattern {pattern_id: $pattern_id})
                    SET p.name = $name,
                        p.type = $type,
                        p.confidence = $confidence,
                        p.occurrences = $occurrences,
                        p.description = $description,
                        p.recommendation = $recommendation,
                        p.evidence = $evidence,
                        p.updated_at = datetime()
                    """,
                    pattern_id=pattern.pattern_id,
                    name=pattern.name,
                    type=pattern.type,
                    confidence=pattern.confidence,
                    occurrences=pattern.occurrences,
                    description=pattern.description,
                    recommendation=pattern.recommendation,
                    evidence=pattern.evidence,
                )
                
                # Link to repository
                session.run(
                    """
                    MATCH (r:Repository {name: $repo_name})
                    MATCH (p:DesignPattern {pattern_id: $pattern_id})
                    MERGE (r)-[rel:EXHIBITS_PATTERN]->(p)
                    SET rel.detected_at = datetime()
                    """,
                    repo_name=repository_name,
                    pattern_id=pattern.pattern_id,
                )
                
                logger.info(f"Stored pattern {pattern.pattern_id} for repository {repository_name}")
                return True
        
        except Neo4jError as e:
            logger.error(f"Failed to store pattern: {e}")
            return False
    
    def store_pattern_violation(
        self,
        violation: PatternViolation,
        pr_id: str,
        analysis_id: str,
    ) -> bool:
        """
        Store a pattern violation in Neo4j.
        
        Args:
            violation: Pattern violation
            pr_id: Pull request ID
            analysis_id: Analysis run ID
        
        Returns:
            True if successful
        """
        if not self.driver:
            return False
        
        try:
            with self.driver.session() as session:
                # Create violation node
                session.run(
                    """
                    MERGE (v:PatternViolation {violation_id: $violation_id})
                    SET v.severity = $severity,
                        v.title = $title,
                        v.description = $description,
                        v.file_path = $file_path,
                        v.line_number = $line_number,
                        v.expected_behavior = $expected_behavior,
                        v.actual_behavior = $actual_behavior,
                        v.recommendation = $recommendation,
                        v.score_impact = $score_impact,
                        v.created_at = datetime()
                    """,
                    violation_id=violation.violation_id,
                    severity=violation.severity,
                    title=violation.title,
                    description=violation.description,
                    file_path=violation.file_path,
                    line_number=violation.line_number,
                    expected_behavior=violation.expected_behavior,
                    actual_behavior=violation.actual_behavior,
                    recommendation=violation.recommendation,
                    score_impact=violation.score_impact,
                )
                
                # Link to pattern
                session.run(
                    """
                    MATCH (v:PatternViolation {violation_id: $violation_id})
                    MATCH (p:DesignPattern {pattern_id: $pattern_id})
                    MERGE (v)-[:VIOLATES]->(p)
                    """,
                    violation_id=violation.violation_id,
                    pattern_id=violation.pattern.pattern_id,
                )
                
                # Link to PR if exists
                if pr_id:
                    session.run(
                        """
                        MATCH (pr:PullRequest {pr_id: $pr_id})
                        MATCH (v:PatternViolation {violation_id: $violation_id})
                        MERGE (pr)-[:HAS_VIOLATION]->(v)
                        """,
                        pr_id=pr_id,
                        violation_id=violation.violation_id,
                    )
                
                # Link to analysis
                if analysis_id:
                    session.run(
                        """
                        MATCH (a:AnalysisRun {id: $analysis_id})
                        MATCH (v:PatternViolation {violation_id: $violation_id})
                        MERGE (a)-[:DETECTED_VIOLATION]->(v)
                        """,
                        analysis_id=analysis_id,
                        violation_id=violation.violation_id,
                    )
                
                logger.info(f"Stored violation {violation.violation_id}")
                return True
        
        except Neo4jError as e:
            logger.error(f"Failed to store violation: {e}")
            return False
    
    def get_patterns_for_repository(
        self,
        repository_name: str,
    ) -> List[Dict]:
        """
        Get all patterns for a repository.
        
        Args:
            repository_name: Repository name
        
        Returns:
            List of pattern data
        """
        if not self.driver:
            return []
        
        try:
            with self.driver.session() as session:
                result = session.run(
                    """
                    MATCH (r:Repository {name: $repo_name})-[:EXHIBITS_PATTERN]->(p:DesignPattern)
                    RETURN p.pattern_id AS pattern_id,
                           p.name AS name,
                           p.type AS type,
                           p.confidence AS confidence,
                           p.occurrences AS occurrences,
                           p.description AS description,
                           p.recommendation AS recommendation,
                           p.evidence AS evidence
                    ORDER BY p.confidence DESC
                    """,
                    repo_name=repository_name,
                )
                
                patterns = []
                for record in result:
                    patterns.append({
                        "pattern_id": record["pattern_id"],
                        "name": record["name"],
                        "type": record["type"],
                        "confidence": record["confidence"],
                        "occurrences": record["occurrences"],
                        "description": record["description"],
                        "recommendation": record["recommendation"],
                        "evidence": record["evidence"],
                    })
                
                return patterns
        
        except Neo4jError as e:
            logger.error(f"Failed to get patterns: {e}")
            return []
    
    def get_violations_for_pr(
        self,
        pr_id: str,
    ) -> List[Dict]:
        """
        Get all pattern violations for a PR.
        
        Args:
            pr_id: Pull request ID
        
        Returns:
            List of violations
        """
        if not self.driver:
            return []
        
        try:
            with self.driver.session() as session:
                result = session.run(
                    """
                    MATCH (pr:PullRequest {pr_id: $pr_id})-[:HAS_VIOLATION]->(v:PatternViolation)
                    MATCH (v)-[:VIOLATES]->(p:DesignPattern)
                    RETURN v.violation_id AS violation_id,
                           v.severity AS severity,
                           v.title AS title,
                           v.description AS description,
                           v.file_path AS file_path,
                           v.line_number AS line_number,
                           v.recommendation AS recommendation,
                           p.name AS pattern_name,
                           p.pattern_id AS pattern_id
                    ORDER BY 
                        CASE v.severity 
                            WHEN 'critical' THEN 1
                            WHEN 'high' THEN 2
                            WHEN 'medium' THEN 3
                            WHEN 'low' THEN 4
                        END
                    """,
                    pr_id=pr_id,
                )
                
                violations = []
                for record in result:
                    violations.append(dict(record))
                
                return violations
        
        except Neo4jError as e:
            logger.error(f"Failed to get violations: {e}")
            return []
    
    def get_pattern_statistics(
        self,
        repository_name: Optional[str] = None,
    ) -> Dict:
        """
        Get pattern statistics.
        
        Args:
            repository_name: Optional repository filter
        
        Returns:
            Statistics dictionary
        """
        if not self.driver:
            return {}
        
        try:
            with self.driver.session() as session:
                # Total patterns
                if repository_name:
                    result = session.run(
                        """
                        MATCH (r:Repository {name: $repo_name})-[:EXHIBITS_PATTERN]->(p:DesignPattern)
                        RETURN count(p) AS total_patterns,
                               avg(p.confidence) AS avg_confidence,
                               sum(p.occurrences) AS total_occurrences
                        """,
                        repo_name=repository_name,
                    )
                else:
                    result = session.run(
                        """
                        MATCH (p:DesignPattern)
                        RETURN count(p) AS total_patterns,
                               avg(p.confidence) AS avg_confidence,
                               sum(p.occurrences) AS total_occurrences
                        """
                    )
                
                record = result.single()
                
                # Patterns by type
                if repository_name:
                    type_result = session.run(
                        """
                        MATCH (r:Repository {name: $repo_name})-[:EXHIBITS_PATTERN]->(p:DesignPattern)
                        RETURN p.type AS type, count(p) AS count
                        ORDER BY count DESC
                        """,
                        repo_name=repository_name,
                    )
                else:
                    type_result = session.run(
                        """
                        MATCH (p:DesignPattern)
                        RETURN p.type AS type, count(p) AS count
                        ORDER BY count DESC
                        """
                    )
                
                patterns_by_type = {r["type"]: r["count"] for r in type_result}
                
                # Total violations
                violation_result = session.run(
                    """
                    MATCH (v:PatternViolation)
                    RETURN count(v) AS total_violations,
                           count(CASE WHEN v.severity = 'critical' THEN 1 END) AS critical,
                           count(CASE WHEN v.severity = 'high' THEN 1 END) AS high,
                           count(CASE WHEN v.severity = 'medium' THEN 1 END) AS medium,
                           count(CASE WHEN v.severity = 'low' THEN 1 END) AS low
                    """
                )
                
                violation_record = violation_result.single()
                
                return {
                    "total_patterns": record["total_patterns"] if record else 0,
                    "avg_confidence": record["avg_confidence"] if record else 0.0,
                    "total_occurrences": record["total_occurrences"] if record else 0,
                    "patterns_by_type": patterns_by_type,
                    "total_violations": violation_record["total_violations"] if violation_record else 0,
                    "violations_by_severity": {
                        "critical": violation_record["critical"] if violation_record else 0,
                        "high": violation_record["high"] if violation_record else 0,
                        "medium": violation_record["medium"] if violation_record else 0,
                        "low": violation_record["low"] if violation_record else 0,
                    },
                }
        
        except Neo4jError as e:
            logger.error(f"Failed to get statistics: {e}")
            return {}
    
    def get_most_violated_patterns(
        self,
        limit: int = 10,
    ) -> List[Dict]:
        """
        Get patterns that are most frequently violated.
        
        Args:
            limit: Maximum number of results
        
        Returns:
            List of patterns with violation counts
        """
        if not self.driver:
            return []
        
        try:
            with self.driver.session() as session:
                result = session.run(
                    """
                    MATCH (v:PatternViolation)-[:VIOLATES]->(p:DesignPattern)
                    RETURN p.pattern_id AS pattern_id,
                           p.name AS name,
                           p.description AS description,
                           count(v) AS violation_count,
                           collect(DISTINCT v.severity) AS severities
                    ORDER BY violation_count DESC
                    LIMIT $limit
                    """,
                    limit=limit,
                )
                
                patterns = []
                for record in result:
                    patterns.append(dict(record))
                
                return patterns
        
        except Neo4jError as e:
            logger.error(f"Failed to get most violated patterns: {e}")
            return []

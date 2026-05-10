"""
Analysis History Management

Tracks analysis runs over time per repository with temporal querying.

Features:
- Store analysis runs with timestamps and results
- Track changes in findings over time (new, fixed, persistent)
- Trend analysis (code quality improving/degrading)
- Regression detection (issues that reappear)
- Performance metrics tracking
- Comparison between runs

Graph structure:
- (Repository)-[:HAS_ANALYSIS]->(AnalysisRun)
- (AnalysisRun)-[:FOUND]->(Finding)
- (AnalysisRun)-[:PREVIOUS]->(AnalysisRun) # Linked list of runs
- (Finding)-[:SAME_AS]->(Finding) # Track same finding across runs
- (Finding)-[:FIXED_BY]->(AnalysisRun) # When finding was resolved
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class AnalysisStatus(str, Enum):
    """Status of an analysis run."""
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FindingStatus(str, Enum):
    """Status of a finding across runs."""
    NEW = "new"  # First time seen
    PERSISTENT = "persistent"  # Still present from previous run
    FIXED = "fixed"  # Was present before, now resolved
    REGRESSED = "regressed"  # Was fixed, now reappeared


class AnalysisMetrics(BaseModel):
    """Metrics for an analysis run."""
    total_findings: int = 0
    critical_findings: int = 0
    high_findings: int = 0
    medium_findings: int = 0
    low_findings: int = 0
    info_findings: int = 0
    
    new_findings: int = 0
    fixed_findings: int = 0
    persistent_findings: int = 0
    regressed_findings: int = 0
    
    files_analyzed: int = 0
    lines_of_code: int = 0
    
    execution_time_seconds: float = 0.0
    

class AnalysisRun(BaseModel):
    """Analysis run record."""
    id: UUID
    repository_id: UUID
    project_id: UUID
    organization_id: UUID
    
    status: AnalysisStatus
    metrics: AnalysisMetrics = Field(default_factory=AnalysisMetrics)
    
    git_commit_sha: Optional[str] = None
    git_branch: Optional[str] = None
    git_author: Optional[str] = None
    git_message: Optional[str] = None
    
    started_at: datetime
    completed_at: Optional[datetime] = None
    
    error_message: Optional[str] = None
    
    # Link to previous run
    previous_run_id: Optional[UUID] = None


class FindingComparison(BaseModel):
    """Comparison of findings between two analysis runs."""
    new_findings: list[dict[str, Any]] = Field(default_factory=list)
    fixed_findings: list[dict[str, Any]] = Field(default_factory=list)
    persistent_findings: list[dict[str, Any]] = Field(default_factory=list)
    regressed_findings: list[dict[str, Any]] = Field(default_factory=list)
    
    total_new: int = 0
    total_fixed: int = 0
    total_persistent: int = 0
    total_regressed: int = 0


class TrendData(BaseModel):
    """Trend data over multiple analysis runs."""
    dates: list[datetime] = Field(default_factory=list)
    total_findings: list[int] = Field(default_factory=list)
    critical_findings: list[int] = Field(default_factory=list)
    high_findings: list[int] = Field(default_factory=list)
    medium_findings: list[int] = Field(default_factory=list)
    low_findings: list[int] = Field(default_factory=list)
    
    # Quality score (0-100, higher is better)
    quality_scores: list[float] = Field(default_factory=list)


class AnalysisHistoryService:
    """
    Service for managing analysis history and temporal queries.
    
    Features:
    - Record analysis runs with full metadata
    - Compare runs to detect new/fixed/persistent findings
    - Track finding lifecycle (new → persistent → fixed)
    - Detect regressions (fixed → reappeared)
    - Generate trend reports
    - Calculate quality scores over time
    
    Usage:
        service = AnalysisHistoryService(graph_manager)
        
        # Start a new analysis run
        run_id = await service.start_analysis_run(repo_id, commit_sha)
        
        # Complete the run
        await service.complete_analysis_run(run_id, metrics)
        
        # Compare with previous run
        comparison = await service.compare_with_previous(run_id)
        
        # Get trends
        trends = await service.get_trends(repo_id, days=30)
    """
    
    def __init__(self, graph_manager: Any):
        self.graph_manager = graph_manager
    
    async def start_analysis_run(
        self,
        repository_id: UUID,
        project_id: UUID,
        organization_id: UUID,
        git_commit_sha: Optional[str] = None,
        git_branch: Optional[str] = None,
        git_author: Optional[str] = None,
        git_message: Optional[str] = None,
    ) -> UUID:
        """
        Start a new analysis run.
        
        Args:
            repository_id: Repository UUID
            project_id: Project UUID
            organization_id: Organization UUID
            git_commit_sha: Git commit SHA
            git_branch: Git branch name
            git_author: Git commit author
            git_message: Git commit message
            
        Returns:
            Analysis run UUID
        """
        from uuid import uuid4
        
        run_id = uuid4()
        now = datetime.now(timezone.utc)
        
        logger.info(f"Starting analysis run {run_id} for repository {repository_id}")
        
        # Get previous run ID
        previous_run = await self._get_latest_run(repository_id)
        previous_run_id = UUID(previous_run["id"]) if previous_run else None
        
        # Create analysis run node
        run_node = {
            "id": str(run_id),
            "repository_id": str(repository_id),
            "project_id": str(project_id),
            "organization_id": str(organization_id),
            "status": AnalysisStatus.RUNNING,
            "git_commit_sha": git_commit_sha,
            "git_branch": git_branch,
            "git_author": git_author,
            "git_message": git_message,
            "started_at": now.isoformat(),
            "previous_run_id": str(previous_run_id) if previous_run_id else None,
        }
        
        await self.graph_manager.upsert_node_async("AnalysisRun", run_node)
        
        # Link to repository
        await self.graph_manager.upsert_relationship_async(
            from_label="Repository",
            from_id=str(repository_id),
            to_label="AnalysisRun",
            to_id=str(run_id),
            rel_type="HAS_ANALYSIS",
            properties={"started_at": now.isoformat()},
        )
        
        # Link to previous run
        if previous_run_id:
            await self.graph_manager.upsert_relationship_async(
                from_label="AnalysisRun",
                from_id=str(run_id),
                to_label="AnalysisRun",
                to_id=str(previous_run_id),
                rel_type="PREVIOUS",
                properties={},
            )
        
        return run_id
    
    async def complete_analysis_run(
        self,
        run_id: UUID,
        metrics: AnalysisMetrics,
        status: AnalysisStatus = AnalysisStatus.COMPLETED,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Complete an analysis run with metrics.
        
        Args:
            run_id: Analysis run UUID
            metrics: Analysis metrics
            status: Final status
            error_message: Optional error message if failed
        """
        logger.info(f"Completing analysis run {run_id} with status {status}")
        
        now = datetime.now(timezone.utc)
        
        # Get run start time to calculate duration
        run_data = await self.graph_manager.get_node_async("AnalysisRun", str(run_id))
        if run_data:
            started_at = datetime.fromisoformat(run_data["started_at"])
            execution_time = (now - started_at).total_seconds()
            metrics.execution_time_seconds = execution_time
        
        # Update run node
        update_props = {
            "status": status,
            "completed_at": now.isoformat(),
            "error_message": error_message,
            # Metrics
            "total_findings": metrics.total_findings,
            "critical_findings": metrics.critical_findings,
            "high_findings": metrics.high_findings,
            "medium_findings": metrics.medium_findings,
            "low_findings": metrics.low_findings,
            "info_findings": metrics.info_findings,
            "new_findings": metrics.new_findings,
            "fixed_findings": metrics.fixed_findings,
            "persistent_findings": metrics.persistent_findings,
            "regressed_findings": metrics.regressed_findings,
            "files_analyzed": metrics.files_analyzed,
            "lines_of_code": metrics.lines_of_code,
            "execution_time_seconds": metrics.execution_time_seconds,
        }
        
        await self.graph_manager.update_node_async("AnalysisRun", str(run_id), update_props)
        
        logger.info(f"Analysis run {run_id} completed: {metrics.total_findings} findings")
    
    async def record_finding(
        self,
        run_id: UUID,
        finding_data: dict[str, Any],
    ) -> UUID:
        """
        Record a finding for an analysis run.
        
        Args:
            run_id: Analysis run UUID
            finding_data: Finding data (dict with all fields)
            
        Returns:
            Finding UUID
        """
        from uuid import uuid4
        
        finding_id = uuid4()
        
        # Create finding node
        finding_node = {
            "id": str(finding_id),
            "run_id": str(run_id),
            **finding_data,
            "detected_at": datetime.now(timezone.utc).isoformat(),
        }
        
        await self.graph_manager.upsert_node_async("Finding", finding_node)
        
        # Link to analysis run
        await self.graph_manager.upsert_relationship_async(
            from_label="AnalysisRun",
            from_id=str(run_id),
            to_label="Finding",
            to_id=str(finding_id),
            rel_type="FOUND",
            properties={},
        )
        
        return finding_id
    
    async def compare_with_previous(
        self,
        run_id: UUID,
    ) -> FindingComparison:
        """
        Compare current run with previous run to detect changes.
        
        Args:
            run_id: Current analysis run UUID
            
        Returns:
            FindingComparison with new/fixed/persistent findings
        """
        logger.info(f"Comparing run {run_id} with previous")
        
        # Get previous run
        query = """
        MATCH (current:AnalysisRun {id: $run_id})-[:PREVIOUS]->(previous:AnalysisRun)
        RETURN previous.id as previous_id
        """
        result = await self.graph_manager.query_async(query, {"run_id": str(run_id)})
        
        if not result:
            logger.info("No previous run found, all findings are new")
            # All findings are new
            current_findings = await self._get_run_findings(run_id)
            return FindingComparison(
                new_findings=current_findings,
                total_new=len(current_findings),
            )
        
        previous_run_id = UUID(result[0]["previous_id"])
        
        # Get findings from both runs
        current_findings = await self._get_run_findings(run_id)
        previous_findings = await self._get_run_findings(previous_run_id)
        
        # Create fingerprint maps for comparison
        current_map = {self._finding_fingerprint(f): f for f in current_findings}
        previous_map = {self._finding_fingerprint(f): f for f in previous_findings}
        
        # Categorize findings
        new_findings = []
        fixed_findings = []
        persistent_findings = []
        
        for fingerprint, finding in current_map.items():
            if fingerprint not in previous_map:
                new_findings.append(finding)
            else:
                persistent_findings.append(finding)
                
                # Create SAME_AS relationship
                prev_finding = previous_map[fingerprint]
                await self.graph_manager.upsert_relationship_async(
                    from_label="Finding",
                    from_id=finding["id"],
                    to_label="Finding",
                    to_id=prev_finding["id"],
                    rel_type="SAME_AS",
                    properties={},
                )
        
        for fingerprint, finding in previous_map.items():
            if fingerprint not in current_map:
                fixed_findings.append(finding)
                
                # Mark as fixed
                await self.graph_manager.upsert_relationship_async(
                    from_label="Finding",
                    from_id=finding["id"],
                    to_label="AnalysisRun",
                    to_id=str(run_id),
                    rel_type="FIXED_BY",
                    properties={"fixed_at": datetime.now(timezone.utc).isoformat()},
                )
        
        # TODO: Detect regressions (findings that were fixed and now reappeared)
        
        comparison = FindingComparison(
            new_findings=new_findings,
            fixed_findings=fixed_findings,
            persistent_findings=persistent_findings,
            total_new=len(new_findings),
            total_fixed=len(fixed_findings),
            total_persistent=len(persistent_findings),
        )
        
        logger.info(
            f"Comparison: {comparison.total_new} new, "
            f"{comparison.total_fixed} fixed, "
            f"{comparison.total_persistent} persistent"
        )
        
        return comparison
    
    def _finding_fingerprint(self, finding: dict[str, Any]) -> str:
        """
        Generate a fingerprint for a finding to match across runs.
        
        Fingerprint includes:
        - File path
        - Line number (or range)
        - Finding type/rule
        - Code snippet hash
        """
        import hashlib
        
        file_path = finding.get("file_path", "")
        line_start = finding.get("line_start", 0)
        line_end = finding.get("line_end", 0)
        finding_type = finding.get("type", "")
        rule_id = finding.get("rule_id", "")
        
        # Create a stable fingerprint
        fingerprint_str = f"{file_path}:{line_start}-{line_end}:{finding_type}:{rule_id}"
        
        return hashlib.sha256(fingerprint_str.encode()).hexdigest()
    
    async def _get_run_findings(self, run_id: UUID) -> list[dict[str, Any]]:
        """Get all findings for an analysis run."""
        query = """
        MATCH (run:AnalysisRun {id: $run_id})-[:FOUND]->(f:Finding)
        RETURN f
        """
        
        results = await self.graph_manager.query_async(query, {"run_id": str(run_id)})
        return [row["f"] for row in results]
    
    async def _get_latest_run(self, repository_id: UUID) -> Optional[dict[str, Any]]:
        """Get the latest analysis run for a repository."""
        query = """
        MATCH (repo:Repository {id: $repo_id})-[:HAS_ANALYSIS]->(run:AnalysisRun)
        RETURN run
        ORDER BY run.started_at DESC
        LIMIT 1
        """
        
        results = await self.graph_manager.query_async(
            query,
            {"repo_id": str(repository_id)}
        )
        
        return results[0]["run"] if results else None
    
    async def get_trends(
        self,
        repository_id: UUID,
        days: int = 30,
    ) -> TrendData:
        """
        Get trend data for a repository over time.
        
        Args:
            repository_id: Repository UUID
            days: Number of days to look back
            
        Returns:
            TrendData with time series
        """
        logger.info(f"Generating trend data for repository {repository_id}, last {days} days")
        
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        
        query = """
        MATCH (repo:Repository {id: $repo_id})-[:HAS_ANALYSIS]->(run:AnalysisRun)
        WHERE run.completed_at >= $cutoff AND run.status = 'completed'
        RETURN run
        ORDER BY run.started_at ASC
        """
        
        results = await self.graph_manager.query_async(
            query,
            {
                "repo_id": str(repository_id),
                "cutoff": cutoff.isoformat(),
            }
        )
        
        trend = TrendData()
        
        for row in results:
            run = row["run"]
            
            trend.dates.append(datetime.fromisoformat(run["started_at"]))
            trend.total_findings.append(run.get("total_findings", 0))
            trend.critical_findings.append(run.get("critical_findings", 0))
            trend.high_findings.append(run.get("high_findings", 0))
            trend.medium_findings.append(run.get("medium_findings", 0))
            trend.low_findings.append(run.get("low_findings", 0))
            
            # Calculate quality score (0-100, higher is better)
            # Formula: 100 - (critical * 10 + high * 5 + medium * 2 + low * 1)
            # Normalized to 0-100 range
            score = max(0, 100 - (
                run.get("critical_findings", 0) * 10 +
                run.get("high_findings", 0) * 5 +
                run.get("medium_findings", 0) * 2 +
                run.get("low_findings", 0) * 1
            ))
            trend.quality_scores.append(min(100, score))
        
        logger.info(f"Generated trend data with {len(trend.dates)} data points")
        return trend
    
    async def get_run_by_id(self, run_id: UUID) -> Optional[AnalysisRun]:
        """Get an analysis run by ID."""
        run_data = await self.graph_manager.get_node_async("AnalysisRun", str(run_id))
        
        if not run_data:
            return None
        
        metrics = AnalysisMetrics(
            total_findings=run_data.get("total_findings", 0),
            critical_findings=run_data.get("critical_findings", 0),
            high_findings=run_data.get("high_findings", 0),
            medium_findings=run_data.get("medium_findings", 0),
            low_findings=run_data.get("low_findings", 0),
            info_findings=run_data.get("info_findings", 0),
            new_findings=run_data.get("new_findings", 0),
            fixed_findings=run_data.get("fixed_findings", 0),
            persistent_findings=run_data.get("persistent_findings", 0),
            regressed_findings=run_data.get("regressed_findings", 0),
            files_analyzed=run_data.get("files_analyzed", 0),
            lines_of_code=run_data.get("lines_of_code", 0),
            execution_time_seconds=run_data.get("execution_time_seconds", 0.0),
        )
        
        return AnalysisRun(
            id=UUID(run_data["id"]),
            repository_id=UUID(run_data["repository_id"]),
            project_id=UUID(run_data["project_id"]),
            organization_id=UUID(run_data["organization_id"]),
            status=AnalysisStatus(run_data["status"]),
            metrics=metrics,
            git_commit_sha=run_data.get("git_commit_sha"),
            git_branch=run_data.get("git_branch"),
            git_author=run_data.get("git_author"),
            git_message=run_data.get("git_message"),
            started_at=datetime.fromisoformat(run_data["started_at"]),
            completed_at=datetime.fromisoformat(run_data["completed_at"]) if run_data.get("completed_at") else None,
            error_message=run_data.get("error_message"),
            previous_run_id=UUID(run_data["previous_run_id"]) if run_data.get("previous_run_id") else None,
        )

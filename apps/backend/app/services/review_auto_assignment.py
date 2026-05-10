from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, NamedTuple

from app.data.database import get_engine
from app.data.repos.review_assignments_repo import ReviewAssignmentsRepo, CreateReviewAssignmentInput


class ReviewerScore(NamedTuple):
    """Reviewer with calculated assignment score"""
    user_id: str
    score: float
    capacity_used: int
    capacity_total: int
    specialties: list[str]
    reviewer_level: str


class ReviewAutoAssignmentService:
    """
    Service for intelligently assigning reviews to reviewers.

    Scoring Algorithm:
    - Specialty Match: 40% (highest priority)
    - Workload Balance: 30% (current capacity usage)
    - Response History: 20% (past performance with author/repo)
    - Random Factor: 10% (tie-breaker, prevents always same reviewer)
    """

    def __init__(self):
        self._engine = get_engine()

    async def assign_review(
        self,
        analysis_id: str,
        analysis_data: dict[str, Any],
        priority: str = "medium",
        due_in_hours: int = 24,
    ) -> str | None:
        """
        Auto-assign a review to the best available reviewer.

        Args:
            analysis_id: The analysis to assign
            analysis_data: Analysis metadata (repo, author, complexity, etc.)
            priority: Review priority (low, medium, high, critical)
            due_in_hours: Hours until due date

        Returns:
            Assignment ID if successful, None if no reviewer available
        """
        # 1. Determine required reviewer level
        required_level = self._determine_required_level(analysis_data, priority)

        # 2. Get eligible reviewers
        eligible_reviewers = await self._get_eligible_reviewers(required_level)

        if not eligible_reviewers:
            return None

        # 3. Score reviewers and select best match
        scored_reviewers = await self._score_reviewers(eligible_reviewers, analysis_data)

        if not scored_reviewers:
            return None

        best_reviewer = scored_reviewers[0]

        # 4. Create assignment
        assignment_repo = ReviewAssignmentsRepo()
        due_at = datetime.now(timezone.utc) + timedelta(hours=due_in_hours)

        assignment_input = CreateReviewAssignmentInput(
            analysis_id=analysis_id,
            reviewer_id=best_reviewer.user_id,
            assigner_id=None,  # System assignment
            assignment_type="auto",
            priority=priority,
            due_at=due_at.isoformat(),
        )

        assignment_id = assignment_repo.create_assignment(assignment_input)

        # 5. TODO: Send notification to reviewer
        await self._notify_assignment(best_reviewer.user_id, analysis_id, assignment_id)

        return assignment_id

    def _determine_required_level(self, analysis_data: dict[str, Any], priority: str) -> str:
        """Determine minimum reviewer level based on analysis and priority"""
        # Critical priority or high complexity requires senior+
        if priority == "critical":
            return "lead"

        # High priority or security findings require senior+
        if priority == "high":
            return "senior"

        # Check for security/critical findings
        findings_summary = analysis_data.get("findings_summary", {})
        blocker_count = findings_summary.get("blocker", 0)
        security_findings = analysis_data.get("security_findings", 0)

        if blocker_count > 3 or security_findings > 0:
            return "senior"

        # Check complexity
        complexity = analysis_data.get("complexity_score", 1.0)
        if complexity >= 4.0:
            return "senior"

        # Default to junior (can be assigned to any level)
        return "junior"

    async def _get_eligible_reviewers(self, required_level: str) -> list[dict[str, Any]]:
        """Get reviewers eligible for assignment based on level and availability"""
        # Level hierarchy: junior < senior < lead
        level_hierarchy = {"junior": 1, "senior": 2, "lead": 3}
        min_level_num = level_hierarchy.get(required_level, 1)

        # SQL query to get eligible reviewers
        query = """
            SELECT
                u.id as user_id,
                u.display_name,
                u.reviewer_level,
                u.reviewer_capacity,
                u.reviewer_specialties,
                u.auto_assign_enabled,
                COALESCE(active_assignments.count, 0) as current_assignments
            FROM users u
            LEFT JOIN (
                SELECT
                    reviewer_id,
                    COUNT(*) as count
                FROM review_assignments
                WHERE status IN ('pending', 'in_progress')
                GROUP BY reviewer_id
            ) active_assignments ON u.id = active_assignments.reviewer_id
            WHERE u.reviewer_level IS NOT NULL
            AND u.auto_assign_enabled = true
            AND u.is_active = true
            AND CASE
                WHEN u.reviewer_level = 'junior' THEN 1
                WHEN u.reviewer_level = 'senior' THEN 2
                WHEN u.reviewer_level = 'lead' THEN 3
                ELSE 0
            END >= :min_level_num
            AND COALESCE(active_assignments.count, 0) < u.reviewer_capacity
        """

        with self._engine.connect() as conn:
            result = conn.execute(
                query,
                {"min_level_num": min_level_num}
            )
            return [dict(row) for row in result.mappings()]

    async def _score_reviewers(
        self,
        reviewers: list[dict[str, Any]],
        analysis_data: dict[str, Any],
    ) -> list[ReviewerScore]:
        """Score reviewers based on multiple factors"""
        scored_reviewers = []

        # Determine required specialties
        required_specialties = self._detect_required_specialties(analysis_data)

        for reviewer in reviewers:
            score = 0.0

            # 1. Specialty Match (40% weight)
            specialty_score = self._calculate_specialty_match(
                reviewer.get("reviewer_specialties", []),
                required_specialties
            )
            score += specialty_score * 0.4

            # 2. Workload Balance (30% weight)
            workload_score = self._calculate_workload_score(
                reviewer.get("current_assignments", 0),
                reviewer.get("reviewer_capacity", 5)
            )
            score += workload_score * 0.3

            # 3. Historical Performance (20% weight)
            # TODO: Implement based on past assignments with this author/repo
            history_score = 0.5  # Neutral score for now
            score += history_score * 0.2

            # 4. Random factor (10% weight) - prevents always same reviewer
            import random
            random_score = random.random()
            score += random_score * 0.1

            scored_reviewers.append(ReviewerScore(
                user_id=reviewer["user_id"],
                score=score,
                capacity_used=reviewer.get("current_assignments", 0),
                capacity_total=reviewer.get("reviewer_capacity", 5),
                specialties=reviewer.get("reviewer_specialties", []),
                reviewer_level=reviewer.get("reviewer_level", "junior"),
            ))

        # Sort by score (highest first)
        scored_reviewers.sort(key=lambda x: x.score, reverse=True)
        return scored_reviewers

    def _detect_required_specialties(self, analysis_data: dict[str, Any]) -> list[str]:
        """Detect required specialties based on analysis data"""
        specialties = []

        repo = analysis_data.get("repo", "").lower()
        changed_files = analysis_data.get("changed_files", [])

        # Backend/API specialties
        if any(keyword in repo for keyword in ["api", "backend", "server", "service"]):
            specialties.append("backend")

        # Frontend specialties
        if any(keyword in repo for keyword in ["frontend", "web", "ui", "app"]):
            specialties.append("frontend")

        # Mobile specialties
        if any(keyword in repo for keyword in ["mobile", "ios", "android", "react-native"]):
            specialties.append("mobile")

        # File-based detection
        if changed_files:
            file_extensions = set()
            for file_path in changed_files:
                if "." in file_path:
                    ext = file_path.split(".")[-1].lower()
                    file_extensions.add(ext)

            # Frontend files
            if file_extensions & {"js", "jsx", "ts", "tsx", "vue", "html", "css", "scss"}:
                specialties.append("frontend")

            # Backend files
            if file_extensions & {"py", "java", "go", "rb", "php", "cs", "cpp", "rs"}:
                specialties.append("backend")

            # Database files
            if file_extensions & {"sql", "migration"}:
                specialties.append("database")

        # Security specialty for security-related changes
        findings_summary = analysis_data.get("findings_summary", {})
        if findings_summary.get("security", 0) > 0:
            specialties.append("security")

        # Performance specialty for performance issues
        if findings_summary.get("performance", 0) > 0:
            specialties.append("performance")

        return list(set(specialties))  # Remove duplicates

    def _calculate_specialty_match(
        self,
        reviewer_specialties: list[str],
        required_specialties: list[str],
    ) -> float:
        """Calculate specialty match score (0.0 to 1.0)"""
        if not required_specialties:
            return 0.5  # Neutral if no specific requirements

        if not reviewer_specialties:
            return 0.2  # Low score if reviewer has no specialties

        # Calculate intersection
        matches = set(reviewer_specialties) & set(required_specialties)
        match_ratio = len(matches) / len(required_specialties)

        # Bonus for having multiple matches
        if len(matches) > 1:
            match_ratio *= 1.2

        return min(match_ratio, 1.0)

    def _calculate_workload_score(self, current_assignments: int, capacity: int) -> float:
        """Calculate workload balance score (higher = less loaded)"""
        if capacity <= 0:
            return 0.0

        utilization = current_assignments / capacity

        if utilization >= 1.0:
            return 0.0  # Over capacity
        elif utilization >= 0.8:
            return 0.2  # Nearly at capacity
        elif utilization >= 0.6:
            return 0.5  # Moderately loaded
        elif utilization >= 0.3:
            return 0.8  # Lightly loaded
        else:
            return 1.0  # Available

    async def _notify_assignment(self, reviewer_id: str, analysis_id: str, assignment_id: str):
        """Send notification to reviewer about new assignment"""
        from app.services.notifications import NotificationService, NotificationChannel
        from sqlalchemy import text
        
        try:
            # Get analysis details for notification
            query = text("""
                SELECT repo, branch, commit_sha, title
                FROM analyses
                WHERE id = :analysis_id
            """)
            with self._engine.connect() as conn:
                result = conn.execute(query, {"analysis_id": analysis_id})
                analysis = result.mappings().first()
            
            if not analysis:
                print(f"[NOTIFICATION] Analysis {analysis_id} not found, skipping notification")
                return
            
            # Prepare assignment data for notification
            assignment_data = {
                "id": assignment_id,
                "analysis_id": analysis_id,
                "reviewer_id": reviewer_id,
                "analysis": {
                    "repo": analysis.get("repo", "Unknown"),
                    "branch": analysis.get("branch", "main"),
                    "commit_sha": analysis.get("commit_sha", ""),
                    "title": analysis.get("title", "Code Review"),
                },
                "priority": "medium",
                "due_at": None,
            }
            
            # Send notification
            notification_service = NotificationService()
            await notification_service.send_assignment_notification(
                assignment_data=assignment_data,
                channels=[
                    NotificationChannel.IN_APP,
                    NotificationChannel.EMAIL,
                    NotificationChannel.SLACK,
                ],
            )
            print(f"[NOTIFICATION] Sent assignment notification for review {analysis_id} to {reviewer_id}")
            
        except Exception as e:
            # Don't fail the assignment if notification fails
            print(f"[NOTIFICATION ERROR] Failed to notify {reviewer_id} about assignment: {e}")

    async def bulk_auto_assign(self, analysis_ids: list[str]) -> dict[str, Any]:
        """Auto-assign multiple analyses in batch"""
        results = {
            "successful": [],
            "failed": [],
            "stats": {
                "total": len(analysis_ids),
                "assigned": 0,
                "no_reviewer_available": 0,
                "errors": 0,
            }
        }

        for analysis_id in analysis_ids:
            try:
                # TODO: Get analysis data from database
                analysis_data = {"repo": f"repo_{analysis_id}", "complexity_score": 2.0}

                assignment_id = await self.assign_review(analysis_id, analysis_data)

                if assignment_id:
                    results["successful"].append({
                        "analysis_id": analysis_id,
                        "assignment_id": assignment_id,
                    })
                    results["stats"]["assigned"] += 1
                else:
                    results["failed"].append({
                        "analysis_id": analysis_id,
                        "reason": "No reviewer available",
                    })
                    results["stats"]["no_reviewer_available"] += 1

            except Exception as e:
                results["failed"].append({
                    "analysis_id": analysis_id,
                    "reason": str(e),
                })
                results["stats"]["errors"] += 1

        return results
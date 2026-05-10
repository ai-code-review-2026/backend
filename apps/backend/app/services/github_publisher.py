"""GitHub publisher service for automated comment posting.

Orchestrates the publication of code review results to GitHub Pull Requests
as formatted comments.
"""
from __future__ import annotations

import logging
from typing import Any

from app.data.models.analysis import Analysis
from app.data.models.finding import Finding
from app.data.models.review_output import AnalysisReviewOutput
from app.data.repos.analyses_repo import AnalysesRepo
from app.data.repos.review_outputs_repo import ReviewOutputsRepo
from app.integrations.git_provider.github_client import GithubClient
from app.services.github_comment_formatter import GitHubCommentFormatter
from app.settings import settings

logger = logging.getLogger(__name__)


class GitHubPublisher:
    """Service for publishing analysis results to GitHub."""

    def __init__(
        self,
        github_client: GithubClient | None = None,
        analyses_repo: AnalysesRepo | None = None,
        review_outputs_repo: ReviewOutputsRepo | None = None,
    ):
        self.github_client = github_client or GithubClient()
        self.analyses_repo = analyses_repo or AnalysesRepo()
        self.review_outputs_repo = review_outputs_repo or ReviewOutputsRepo()
        self.formatter = GitHubCommentFormatter()

    async def publish_analysis_to_github(
        self,
        analysis_id: str,
        *,
        force: bool = False,
    ) -> dict[str, Any]:
        """
        Publish analysis results as a GitHub PR comment.

        Args:
            analysis_id: ID of the analysis to publish
            force: If True, publish even if already published

        Returns:
            dict with status, message, and optional github_comment_url

        Raises:
            ValueError: If analysis not found or PR info missing
            RuntimeError: If GitHub API call fails
        """
        # Fetch analysis
        analysis = self.analyses_repo.get_by_id(analysis_id)
        if not analysis:
            raise ValueError(f"Analysis {analysis_id} not found")

        # Validate analysis is complete
        if analysis.status != "COMPLETED":
            return {
                "status": "skipped",
                "reason": "analysis_not_completed",
                "message": f"Analysis status is {analysis.status}, not COMPLETED",
            }

        # Check if already published
        metadata = analysis.metadata or {}
        github_pub = metadata.get("github_publication", {})
        if github_pub.get("published") and not force:
            return {
                "status": "already_published",
                "published_at": github_pub.get("published_at"),
                "comment_id": github_pub.get("comment_id"),
                "message": "Analysis already published to GitHub",
            }

        # Validate PR number exists
        if not analysis.pr_number:
            return {
                "status": "skipped",
                "reason": "no_pr_number",
                "message": "Analysis does not have a PR number",
            }

        # Check if publication is enabled
        if not settings.GITHUB_PUBLISH_ENABLED:
            logger.info(
                "GitHub publication disabled (GITHUB_PUBLISH_ENABLED=false) for analysis %s",
                analysis_id,
            )
            return {
                "status": "disabled",
                "reason": "github_publish_disabled",
                "message": "GitHub publication is disabled in settings",
            }

        try:
            # Fetch findings
            findings = self.analyses_repo.list_findings_by_analysis(analysis_id)

            # Fetch review output (if available)
            review_output = None
            try:
                review_output = self.review_outputs_repo.get_by_analysis_id(analysis_id)
            except Exception as exc:
                logger.warning(
                    "Could not fetch review output for analysis %s: %s",
                    analysis_id,
                    exc,
                )

            # Format comment
            comment_body = self.formatter.format_review_comment(
                analysis=analysis,
                findings=findings,
                review_output=review_output,
            )

            # Post to GitHub
            await self.github_client.create_comment(
                repo=analysis.repo,
                pr=analysis.pr_number,
                body=comment_body,
            )

            # Update analysis metadata to mark as published
            from datetime import datetime, timezone

            published_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            
            updated_metadata = {**metadata}
            updated_metadata["github_publication"] = {
                "published": True,
                "published_at": published_at,
                "repo": analysis.repo,
                "pr_number": analysis.pr_number,
                "findings_count": len(findings),
            }

            self.analyses_repo.update_metadata(
                analysis_id=analysis_id,
                metadata=updated_metadata,
            )

            logger.info(
                "Successfully published analysis %s to GitHub PR %s/%s",
                analysis_id,
                analysis.repo,
                analysis.pr_number,
            )

            return {
                "status": "published",
                "published_at": published_at,
                "repo": analysis.repo,
                "pr_number": analysis.pr_number,
                "findings_count": len(findings),
                "message": f"Published to GitHub PR #{analysis.pr_number}",
            }

        except Exception as exc:
            logger.error(
                "Failed to publish analysis %s to GitHub: %s",
                analysis_id,
                exc,
                exc_info=True,
            )
            raise RuntimeError(f"Failed to publish to GitHub: {exc}") from exc

    async def publish_quick_summary(
        self,
        analysis_id: str,
        findings_count: int,
        blocker_count: int,
        warn_count: int,
    ) -> dict[str, Any]:
        """
        Post a quick summary comment while analysis is in progress.
        
        Useful for early feedback before full analysis completes.
        
        Args:
            analysis_id: ID of the analysis
            findings_count: Total findings count
            blocker_count: Critical/blocker findings count
            warn_count: Warning findings count
            
        Returns:
            dict with status and message
        """
        analysis = self.analyses_repo.get_by_id(analysis_id)
        if not analysis or not analysis.pr_number:
            return {
                "status": "skipped",
                "reason": "no_pr_number",
            }

        if not settings.GITHUB_PUBLISH_ENABLED:
            return {
                "status": "disabled",
                "reason": "github_publish_disabled",
            }

        try:
            comment_body = self.formatter.format_quick_summary_comment(
                analysis=analysis,
                findings_count=findings_count,
                blocker_count=blocker_count,
                warn_count=warn_count,
            )

            await self.github_client.create_comment(
                repo=analysis.repo,
                pr=analysis.pr_number,
                body=comment_body,
            )

            logger.info(
                "Posted quick summary for analysis %s to PR %s/%s",
                analysis_id,
                analysis.repo,
                analysis.pr_number,
            )

            return {
                "status": "published",
                "type": "quick_summary",
            }

        except Exception as exc:
            logger.warning(
                "Failed to post quick summary for analysis %s: %s",
                analysis_id,
                exc,
            )
            return {
                "status": "failed",
                "error": str(exc),
            }

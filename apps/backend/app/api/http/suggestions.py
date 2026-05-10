from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.errors import ApiError
from app.api.middleware.auth import AuthenticatedPrincipal, require_permission
from app.data.repos.analyses_repo import AnalysesRepo

router = APIRouter(tags=["suggestions"])


class ApplySuggestionRequest(BaseModel):
    """Request to apply a suggestion from a finding."""

    branch_name: str = Field(description="Name of the branch to create with the applied suggestion")
    create_pr: bool = Field(default=False, description="Whether to create a pull request")
    pr_title: str | None = Field(default=None, description="PR title (required if create_pr=true)")
    pr_body: str | None = Field(default=None, description="PR description")


class ApplySuggestionResponse(BaseModel):
    """Response from applying a suggestion."""

    finding_id: str
    file_path: str
    suggestion: str
    repo: str
    base_branch: str | None = None
    pr_number: int | None = None
    line_start: int | None = None
    line_end: int | None = None


@router.post("/findings/{finding_id}/apply-suggestion", response_model=ApplySuggestionResponse)
async def get_suggestion_apply_details(
    finding_id: str,
    payload: ApplySuggestionRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
) -> ApplySuggestionResponse:
    """
    Get details needed to apply a finding's suggestion.
    
    This endpoint returns the information needed by the frontend to:
    1. Fetch the current file content
    2. Apply the suggested changes
    3. Create a new branch with the changes
    4. (Optionally) create a PR
    
    The actual GitHub operations (file fetch, commit, PR creation) are performed
    by the frontend using the GitHub API directly, as the frontend has the user's
    GitHub token.
    
    Returns:
    - Finding details including file path and suggestion
    - Repository information
    - Branch information for creating the PR
    """
    repo = AnalysesRepo()

    # Fetch the finding
    finding = repo.get_finding_by_id(finding_id)
    if not finding:
        raise ApiError(status_code=404, code="FINDING_NOT_FOUND", message=f"Finding {finding_id} not found")

    # Verify finding has a suggestion
    if not finding.suggestion:
        raise ApiError(
            status_code=400,
            code="NO_SUGGESTION",
            message="This finding does not have a suggestion to apply",
        )

    # Verify finding has a file path
    if not finding.file_path:
        raise ApiError(
            status_code=400,
            code="NO_FILE_PATH",
            message="This finding does not have a file path",
        )

    # Get analysis to retrieve repo info
    analysis = repo.get_by_id(finding.analysis_id)
    if not analysis:
        raise ApiError(
            status_code=404,
            code="ANALYSIS_NOT_FOUND",
            message=f"Analysis {finding.analysis_id} not found",
        )

    # Extract base branch from metadata if available
    metadata = analysis.metadata or {}
    base_branch = metadata.get("base_branch") or metadata.get("pr", {}).get("base_branch") or "main"

    return ApplySuggestionResponse(
        finding_id=finding_id,
        file_path=finding.file_path,
        suggestion=finding.suggestion,
        repo=analysis.repo,
        base_branch=base_branch,
        pr_number=analysis.pr_number,
        line_start=finding.line_start,
        line_end=finding.line_end,
    )

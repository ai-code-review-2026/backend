from __future__ import annotations

import asyncio
import base64
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, validator

from app.api.middleware.auth import AuthenticatedPrincipal, require_permission
from app.core.security.secret_store import get_secret_store
from app.data.repos.analyses_repo import AnalysesRepo
from app.data.repos.findings_repo import FindingsRepo
import httpx

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/jira", tags=["jira"])


class JiraConfig(BaseModel):
    base_url: str = Field(..., description="Jira instance URL (e.g., https://company.atlassian.net)")
    username: str = Field(..., description="Jira username or email")
    api_token: str = Field(..., description="Jira API token")
    project_key: str = Field(..., description="Default project key (e.g., PROJ)")


class JiraIssue(BaseModel):
    key: str
    summary: str
    description: str
    status: str
    assignee: str | None
    priority: str
    issue_type: str
    url: str
    created: str
    updated: str


class JiraProject(BaseModel):
    key: str
    name: str
    project_type: str
    lead: str | None


class CreateJiraIssueRequest(BaseModel):
    finding_id: str = Field(..., description="ID of the finding to create issue for")
    project_key: str = Field(..., description="Jira project key")
    issue_type: str = Field(default="Bug", description="Issue type (Bug, Task, Story, etc.)")
    priority: str = Field(default="Medium", description="Issue priority")
    assignee: str | None = Field(None, description="Assignee username (optional)")
    additional_description: str | None = Field(None, description="Additional description to append")


class LinkJiraIssueRequest(BaseModel):
    finding_id: str = Field(..., description="ID of the finding to link")
    issue_key: str = Field(..., description="Jira issue key (e.g., PROJ-123)")


class JiraIntegrationResponse(BaseModel):
    success: bool
    issue: JiraIssue | None = None
    error: str | None = None


class JiraClient:
    def __init__(self, config: JiraConfig):
        self.config = config
        self.base_url = config.base_url.rstrip("/")
        
        # Basic auth header
        auth_string = f"{config.username}:{config.api_token}"
        self.auth_header = base64.b64encode(auth_string.encode()).decode()

    async def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        data: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """Make HTTP request to Jira API"""
        url = f"{self.base_url}/rest/api/3/{endpoint.lstrip('/')}"
        headers = {
            "Authorization": f"Basic {self.auth_header}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                json=data if method in ("POST", "PUT") else None,
            )
            
            if not response.is_success:
                error_text = response.text
                logger.error(f"Jira API error: {response.status_code} {error_text}")
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Jira API error: {error_text}"
                )
            
            return response.json()

    async def get_projects(self) -> list[JiraProject]:
        """Get all projects accessible to the user"""
        data = await self._make_request("GET", "project")
        
        projects = []
        for project_data in data:
            projects.append(JiraProject(
                key=project_data["key"],
                name=project_data["name"],
                project_type=project_data.get("projectTypeKey", "unknown"),
                lead=project_data.get("lead", {}).get("displayName"),
            ))
        
        return projects

    async def get_issue_types(self, project_key: str) -> list[dict[str, Any]]:
        """Get available issue types for a project"""
        data = await self._make_request("GET", f"project/{project_key}")
        return data.get("issueTypes", [])

    async def create_issue(
        self,
        project_key: str,
        summary: str,
        description: str,
        issue_type: str = "Bug",
        priority: str = "Medium",
        assignee: str | None = None,
    ) -> JiraIssue:
        """Create a new Jira issue"""
        issue_data = {
            "fields": {
                "project": {"key": project_key},
                "summary": summary,
                "description": {
                    "type": "doc",
                    "version": 1,
                    "content": [
                        {
                            "type": "paragraph",
                            "content": [
                                {"type": "text", "text": description}
                            ]
                        }
                    ]
                },
                "issuetype": {"name": issue_type},
                "priority": {"name": priority},
            }
        }

        if assignee:
            issue_data["fields"]["assignee"] = {"accountId": assignee}

        response_data = await self._make_request("POST", "issue", issue_data)
        
        # Get the created issue details
        issue_key = response_data["key"]
        issue_details = await self.get_issue(issue_key)
        
        return issue_details

    async def get_issue(self, issue_key: str) -> JiraIssue:
        """Get issue details by key"""
        data = await self._make_request("GET", f"issue/{issue_key}")
        
        fields = data["fields"]
        return JiraIssue(
            key=data["key"],
            summary=fields["summary"],
            description=self._extract_description(fields.get("description")),
            status=fields["status"]["name"],
            assignee=fields.get("assignee", {}).get("displayName"),
            priority=fields["priority"]["name"],
            issue_type=fields["issuetype"]["name"],
            url=f"{self.base_url}/browse/{data['key']}",
            created=fields["created"],
            updated=fields["updated"],
        )

    def _extract_description(self, description: dict[str, Any] | None) -> str:
        """Extract plain text from Jira ADF (Atlassian Document Format)"""
        if not description:
            return ""
        
        def extract_text(content: list[dict[str, Any]]) -> str:
            text = ""
            for item in content:
                if item.get("type") == "text":
                    text += item.get("text", "")
                elif "content" in item:
                    text += extract_text(item["content"])
            return text
        
        return extract_text(description.get("content", []))


def get_jira_config() -> JiraConfig | None:
    """Get Jira configuration from secrets"""
    secret_store = get_secret_store()
    
    try:
        jira_config = secret_store.get_secret("jira_config")
        if jira_config:
            return JiraConfig(**json.loads(jira_config))
    except Exception as e:
        logger.warning(f"Failed to load Jira config: {e}")
    
    return None


@router.get("/config")
async def get_jira_configuration(
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("integrations.read")),
) -> dict[str, Any]:
    """Get Jira configuration status"""
    config = get_jira_config()
    return {
        "configured": config is not None,
        "base_url": config.base_url if config else None,
        "username": config.username if config else None,
    }


@router.post("/config")
async def update_jira_configuration(
    config: JiraConfig,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("admin.write")),
) -> dict[str, str]:
    """Update Jira configuration"""
    secret_store = get_secret_store()
    
    # Test the configuration
    try:
        client = JiraClient(config)
        await client.get_projects()  # Test API connectivity
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Jira configuration: {e}")
    
    # Store the configuration
    secret_store.set_secret("jira_config", config.json())
    
    return {"message": "Jira configuration updated successfully"}


@router.get("/projects", response_model=list[JiraProject])
async def list_jira_projects(
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("integrations.read")),
) -> list[JiraProject]:
    """Get available Jira projects"""
    config = get_jira_config()
    if not config:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    client = JiraClient(config)
    return await client.get_projects()


@router.get("/projects/{project_key}/issue-types")
async def get_project_issue_types(
    project_key: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("integrations.read")),
) -> list[dict[str, Any]]:
    """Get available issue types for a project"""
    config = get_jira_config()
    if not config:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    client = JiraClient(config)
    return await client.get_issue_types(project_key)


@router.post("/issues", response_model=JiraIntegrationResponse)
async def create_jira_issue_from_finding(
    request: CreateJiraIssueRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("integrations.write")),
) -> JiraIntegrationResponse:
    """Create a Jira issue from a code review finding"""
    config = get_jira_config()
    if not config:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    # Get the finding details
    findings_repo = FindingsRepo()
    finding = findings_repo.get_finding_by_id(request.finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    # Build issue summary and description
    summary = f"[Code Review] {finding.rule_name or 'Code Quality Issue'}"
    
    description_parts = [
        f"**Finding Details:**",
        f"- Rule: {finding.rule_name or 'Unknown'}",
        f"- Severity: {finding.severity}",
        f"- File: {finding.file_path}",
        f"- Line: {finding.line_number or 'N/A'}",
        "",
        f"**Description:**",
        finding.message or "No description available",
        "",
    ]
    
    if finding.code_snippet:
        description_parts.extend([
            "**Code Snippet:**",
            f"```{finding.language or ''}",
            finding.code_snippet,
            "```",
            "",
        ])
    
    if request.additional_description:
        description_parts.extend([
            "**Additional Information:**",
            request.additional_description,
            "",
        ])
    
    description_parts.append(f"**Analysis ID:** {finding.analysis_id}")
    
    description = "\n".join(description_parts)
    
    try:
        client = JiraClient(config)
        issue = await client.create_issue(
            project_key=request.project_key,
            summary=summary,
            description=description,
            issue_type=request.issue_type,
            priority=request.priority,
            assignee=request.assignee,
        )
        
        # Store the Jira issue link in the finding
        findings_repo.update_finding_jira_issue(finding.id, issue.key)
        
        return JiraIntegrationResponse(success=True, issue=issue)
        
    except Exception as e:
        logger.error(f"Failed to create Jira issue: {e}")
        return JiraIntegrationResponse(
            success=False,
            error=f"Failed to create Jira issue: {str(e)}"
        )


@router.post("/issues/link", response_model=JiraIntegrationResponse)
async def link_jira_issue_to_finding(
    request: LinkJiraIssueRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("integrations.write")),
) -> JiraIntegrationResponse:
    """Link an existing Jira issue to a finding"""
    config = get_jira_config()
    if not config:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    # Verify finding exists
    findings_repo = FindingsRepo()
    finding = findings_repo.get_finding_by_id(request.finding_id)
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    try:
        client = JiraClient(config)
        issue = await client.get_issue(request.issue_key)
        
        # Store the Jira issue link
        findings_repo.update_finding_jira_issue(finding.id, issue.key)
        
        return JiraIntegrationResponse(success=True, issue=issue)
        
    except Exception as e:
        logger.error(f"Failed to link Jira issue: {e}")
        return JiraIntegrationResponse(
            success=False,
            error=f"Failed to link Jira issue: {str(e)}"
        )


@router.get("/issues/{issue_key}", response_model=JiraIssue)
async def get_jira_issue(
    issue_key: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("integrations.read")),
) -> JiraIssue:
    """Get Jira issue details"""
    config = get_jira_config()
    if not config:
        raise HTTPException(status_code=400, detail="Jira not configured")
    
    client = JiraClient(config)
    return await client.get_issue(issue_key)


@router.get("/findings/{finding_id}/issue")
async def get_finding_jira_issue(
    finding_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
) -> JiraIssue | None:
    """Get linked Jira issue for a finding"""
    config = get_jira_config()
    if not config:
        return None
    
    findings_repo = FindingsRepo()
    finding = findings_repo.get_finding_by_id(finding_id)
    if not finding or not finding.jira_issue_key:
        return None
    
    try:
        client = JiraClient(config)
        return await client.get_issue(finding.jira_issue_key)
    except Exception as e:
        logger.error(f"Failed to get Jira issue for finding {finding_id}: {e}")
        return None
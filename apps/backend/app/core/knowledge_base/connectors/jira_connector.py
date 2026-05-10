"""Atlassian Jira connector.

Fetches issues from a Jira project and produces ``ConnectorDocument`` objects
where each issue becomes a single chunk (title + description + acceptance
criteria).
"""
from __future__ import annotations

import logging
from typing import Any

from app.core.knowledge_base.connectors.base_connector import BaseConnector, ConnectorDocument

logger = logging.getLogger(__name__)


class JiraConnector(BaseConnector):
    """Ingest issues from a Jira project."""

    source_name = "jira"

    def __init__(
        self,
        *,
        base_url: str,
        username: str,
        api_token: str,
        project_key: str,
        jql_filter: str | None = None,
        max_issues: int = 500,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._username = username
        self._api_token = api_token
        self._project_key = project_key
        self._jql = jql_filter or f"project = {project_key} ORDER BY updated DESC"
        self._max_issues = max_issues

    def test_connection(self) -> bool:
        try:
            import requests

            resp = requests.get(
                f"{self._base_url}/rest/api/2/project/{self._project_key}",
                auth=(self._username, self._api_token),
                timeout=10,
            )
            return resp.status_code == 200
        except Exception:
            return False

    def fetch_documents(self, **kwargs: Any) -> list[ConnectorDocument]:
        import requests

        documents: list[ConnectorDocument] = []
        start_at = 0
        max_results = 50

        while len(documents) < self._max_issues:
            resp = requests.get(
                f"{self._base_url}/rest/api/2/search",
                params={
                    "jql": self._jql,
                    "startAt": start_at,
                    "maxResults": max_results,
                    "fields": "summary,description,issuetype,labels,status,priority,acceptance_criteria",
                },
                auth=(self._username, self._api_token),
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            issues = data.get("issues", [])
            if not issues:
                break

            for issue in issues:
                fields = issue.get("fields", {})
                key = issue.get("key", "")
                summary = fields.get("summary", "")
                description = fields.get("description") or ""
                issue_type = fields.get("issuetype", {}).get("name", "")
                labels = fields.get("labels", [])

                content_parts = [f"[{key}] {summary}"]
                if description:
                    content_parts.append(f"Description:\n{description}")
                acceptance = fields.get("acceptance_criteria") or fields.get("customfield_10001") or ""
                if acceptance:
                    content_parts.append(f"Acceptance Criteria:\n{acceptance}")

                content = "\n\n".join(content_parts)
                if not content.strip():
                    continue

                documents.append(ConnectorDocument(
                    title=f"{key}: {summary}",
                    content=content,
                    source_type="jira",
                    source_uri=f"{self._base_url}/browse/{key}",
                    tags=["jira", self._project_key, issue_type.lower()] + labels,
                    metadata={
                        "issue_key": key,
                        "project": self._project_key,
                        "issue_type": issue_type,
                        "status": fields.get("status", {}).get("name"),
                        "priority": fields.get("priority", {}).get("name"),
                        "labels": labels,
                    },
                ))

            start_at += len(issues)
            if len(issues) < max_results:
                break

        logger.info("Fetched %d issues from Jira project %s", len(documents), self._project_key)
        return documents

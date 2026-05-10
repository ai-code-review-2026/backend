"""Atlassian Confluence connector.

Fetches pages from a Confluence space via REST API and produces
``ConnectorDocument`` objects for downstream chunking.
"""
from __future__ import annotations

import logging
from typing import Any

from app.core.knowledge_base.connectors.base_connector import BaseConnector, ConnectorDocument

logger = logging.getLogger(__name__)


class ConfluenceConnector(BaseConnector):
    """Ingest pages from an Atlassian Confluence space."""

    source_name = "confluence"

    def __init__(
        self,
        *,
        base_url: str,
        username: str,
        api_token: str,
        space_key: str,
        max_pages: int = 200,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._username = username
        self._api_token = api_token
        self._space_key = space_key
        self._max_pages = max_pages

    def test_connection(self) -> bool:
        try:
            import requests

            resp = requests.get(
                f"{self._base_url}/rest/api/space/{self._space_key}",
                auth=(self._username, self._api_token),
                timeout=10,
            )
            return resp.status_code == 200
        except Exception:
            return False

    def fetch_documents(self, **kwargs: Any) -> list[ConnectorDocument]:
        import requests

        documents: list[ConnectorDocument] = []
        start = 0
        limit = 25

        while len(documents) < self._max_pages:
            resp = requests.get(
                f"{self._base_url}/rest/api/content",
                params={
                    "spaceKey": self._space_key,
                    "type": "page",
                    "status": "current",
                    "expand": "body.storage,metadata.labels,version",
                    "start": start,
                    "limit": limit,
                },
                auth=(self._username, self._api_token),
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            if not results:
                break

            for page in results:
                title = page.get("title", "")
                body_html = page.get("body", {}).get("storage", {}).get("value", "")
                content = self._html_to_text(body_html)
                if not content.strip():
                    continue

                labels = [
                    label["name"]
                    for label in page.get("metadata", {}).get("labels", {}).get("results", [])
                ]
                page_id = page.get("id", "")
                page_url = f"{self._base_url}/pages/viewpage.action?pageId={page_id}"

                documents.append(ConnectorDocument(
                    title=title,
                    content=content,
                    source_type="confluence",
                    source_uri=page_url,
                    tags=["confluence", self._space_key] + labels,
                    metadata={
                        "space_key": self._space_key,
                        "page_id": page_id,
                        "version": page.get("version", {}).get("number"),
                        "last_updated": page.get("version", {}).get("when"),
                    },
                ))

            size = data.get("size", len(results))
            start += size
            if size < limit:
                break

        logger.info("Fetched %d pages from Confluence space %s", len(documents), self._space_key)
        return documents

    @staticmethod
    def _html_to_text(html: str) -> str:
        """Crude HTML → plain-text conversion.  Uses BeautifulSoup when available."""
        try:
            from bs4 import BeautifulSoup

            soup = BeautifulSoup(html, "html.parser")
            return soup.get_text(separator="\n", strip=True)
        except ImportError:
            import re

            text = re.sub(r"<[^>]+>", " ", html)
            return re.sub(r"\s+", " ", text).strip()

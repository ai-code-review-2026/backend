"""Notion connector.

Fetches pages from a Notion database and converts block content to plain
text for downstream chunking.
"""
from __future__ import annotations

import logging
from typing import Any

from app.core.knowledge_base.connectors.base_connector import BaseConnector, ConnectorDocument

logger = logging.getLogger(__name__)


class NotionConnector(BaseConnector):
    """Ingest pages from a Notion database."""

    source_name = "notion"

    def __init__(
        self,
        *,
        api_token: str,
        database_id: str,
        max_pages: int = 200,
    ) -> None:
        self._api_token = api_token
        self._database_id = database_id
        self._max_pages = max_pages
        self._base_url = "https://api.notion.com/v1"
        self._headers = {
            "Authorization": f"Bearer {api_token}",
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
        }

    def test_connection(self) -> bool:
        try:
            import requests

            resp = requests.get(
                f"{self._base_url}/databases/{self._database_id}",
                headers=self._headers,
                timeout=10,
            )
            return resp.status_code == 200
        except Exception:
            return False

    def fetch_documents(self, **kwargs: Any) -> list[ConnectorDocument]:
        import requests

        documents: list[ConnectorDocument] = []
        has_more = True
        start_cursor: str | None = None

        while has_more and len(documents) < self._max_pages:
            body: dict[str, Any] = {"page_size": 100}
            if start_cursor:
                body["start_cursor"] = start_cursor

            resp = requests.post(
                f"{self._base_url}/databases/{self._database_id}/query",
                headers=self._headers,
                json=body,
                timeout=30,
            )
            resp.raise_for_status()
            data = resp.json()

            for page in data.get("results", []):
                page_id = page["id"]
                title = self._extract_title(page)
                content = self._fetch_page_content(page_id)
                if not content.strip():
                    continue

                documents.append(ConnectorDocument(
                    title=title,
                    content=content,
                    source_type="notion",
                    source_uri=page.get("url", f"https://notion.so/{page_id.replace('-', '')}"),
                    tags=["notion"],
                    metadata={
                        "page_id": page_id,
                        "workspace_id": self._database_id,
                        "last_edited": page.get("last_edited_time"),
                    },
                ))

            has_more = data.get("has_more", False)
            start_cursor = data.get("next_cursor")

        logger.info("Fetched %d pages from Notion database %s", len(documents), self._database_id)
        return documents

    def _fetch_page_content(self, page_id: str) -> str:
        import requests

        blocks: list[str] = []
        has_more = True
        start_cursor: str | None = None

        while has_more:
            params: dict[str, Any] = {"page_size": 100}
            if start_cursor:
                params["start_cursor"] = start_cursor

            resp = requests.get(
                f"{self._base_url}/blocks/{page_id}/children",
                headers=self._headers,
                params=params,
                timeout=30,
            )
            if resp.status_code != 200:
                break
            data = resp.json()

            for block in data.get("results", []):
                text = self._block_to_text(block)
                if text:
                    blocks.append(text)

            has_more = data.get("has_more", False)
            start_cursor = data.get("next_cursor")

        return "\n\n".join(blocks)

    @staticmethod
    def _extract_title(page: dict[str, Any]) -> str:
        props = page.get("properties", {})
        for prop in props.values():
            if prop.get("type") == "title":
                title_parts = prop.get("title", [])
                return "".join(part.get("plain_text", "") for part in title_parts)
        return "Untitled"

    @staticmethod
    def _block_to_text(block: dict[str, Any]) -> str:
        block_type = block.get("type", "")
        content = block.get(block_type, {})
        rich_text = content.get("rich_text", [])
        text = "".join(item.get("plain_text", "") for item in rich_text)

        if block_type in {"heading_1", "heading_2", "heading_3"}:
            level = block_type[-1]
            return f"{'#' * int(level)} {text}"
        if block_type == "code":
            language = content.get("language", "")
            return f"```{language}\n{text}\n```"
        if block_type == "bulleted_list_item":
            return f"- {text}"
        if block_type == "numbered_list_item":
            return f"1. {text}"
        if block_type == "to_do":
            checked = "x" if content.get("checked") else " "
            return f"- [{checked}] {text}"
        return text

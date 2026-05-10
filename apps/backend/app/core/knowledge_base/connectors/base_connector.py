"""Abstract base class for KB source connectors."""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ConnectorDocument:
    """A document fetched from an external source, ready for chunking."""
    title: str
    content: str
    source_type: str
    source_uri: str
    tags: list[str]
    metadata: dict[str, Any]


class BaseConnector(ABC):
    """Interface every KB connector must implement."""

    @abstractmethod
    def fetch_documents(self, **kwargs: Any) -> list[ConnectorDocument]:
        """Fetch documents from the external source.

        Implementations should handle pagination, rate limiting, and
        authentication internally.
        """
        ...

    @abstractmethod
    def test_connection(self) -> bool:
        """Return *True* when the external source is reachable."""
        ...

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Human-readable name of the source (e.g. ``"confluence"``)."""
        ...

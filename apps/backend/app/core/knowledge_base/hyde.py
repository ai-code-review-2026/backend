"""HyDE (Hypothetical Document Embeddings) expander for GraphRAG.

The expander generates a hypothetical answer with the local Ollama client and
then hashes that text into the repository vector space.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any

from app.core.knowledge_base.embeddings import hash_embed_text
from app.integrations.llm_providers.ollama_client import OllamaClient
from app.settings import settings

logger = logging.getLogger(__name__)

_HYDE_PROMPT_CODE = (
    "You are a senior software engineer.  Given the following query about a codebase, "
    "write a SHORT, realistic code snippet (10-30 lines) that would directly answer the query.  "
    "Output ONLY the code — no explanation, no markdown fences.\n\n"
    "Query: {query}"
)

_HYDE_PROMPT_POLICY = (
    "You are a technical writer maintaining internal engineering policies.  Given the following query, "
    "write a SHORT policy document section (3-6 sentences) that would answer it.  "
    "Output ONLY the text — no headings, no markdown.\n\n"
    "Query: {query}"
)

_HYDE_PROMPT_DOCUMENT = (
    "You are a technical documentation author.  Given the following query, "
    "write a SHORT documentation section (3-8 sentences) that would answer it.  "
    "Output ONLY the text — no headings, no markdown.\n\n"
    "Query: {query}"
)


class HyDEExpander:
    """Generates hypothetical documents and returns their embeddings."""

    def __init__(
        self,
        *,
        llm_client: Any | None = None,
    ) -> None:
        self._llm_client = llm_client

    @property
    def available(self) -> bool:
        return (
            settings.HYDE_ENABLED
            and self._llm_client is not None
        )

    def expand_query(self, query: str, *, query_type: str = "code") -> list[float] | None:
        """Generate a hypothetical document for *query* and return its embedding.

        Returns *None* when HyDE is disabled or generation fails.
        """
        if not self.available:
            return None

        prompt = self._build_prompt(query, query_type)
        try:
            response = self._llm_client.generate(prompt)
            hypothetical_doc = response.text.strip()
            if not hypothetical_doc:
                return None
            return hash_embed_text(hypothetical_doc, vector_size=settings.REPO_CONTEXT_VECTOR_SIZE)
        except Exception:
            logger.debug("HyDE expansion failed for query_type=%s", query_type, exc_info=True)
            return None

    def expand_query_cached(
        self,
        query: str,
        *,
        query_type: str = "code",
        cache: Any | None = None,
    ) -> list[float] | None:
        """Like :meth:`expand_query` but checks the RAG cache first."""
        if cache is not None:
            cache_key = f"hyde:{query_type}:{hashlib.sha256(query.encode()).hexdigest()[:16]}"
            cached = cache.get_embedding(cache_key)
            if cached is not None:
                return cached

        vector = self.expand_query(query, query_type=query_type)
        if vector is not None and cache is not None:
            cache.set_embedding(cache_key, vector)  # type: ignore[possibly-undefined]
        return vector

    def should_apply(self, route_value: str) -> bool:
        """Return *True* when HyDE should be used for the given route."""
        return settings.HYDE_ENABLED and route_value.lower() in settings.hyde_routes

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_prompt(query: str, query_type: str) -> str:
        if query_type == "policy":
            template = _HYDE_PROMPT_POLICY
        elif query_type == "document":
            template = _HYDE_PROMPT_DOCUMENT
        else:
            template = _HYDE_PROMPT_CODE
        return template.format(query=query)


def build_hyde_expander() -> HyDEExpander:
    """Factory that wires the HyDE expander to the configured LLM."""
    if not settings.HYDE_ENABLED:
        return HyDEExpander()

    try:
        llm_client = OllamaClient()
    except Exception:
        llm_client = None

    return HyDEExpander(llm_client=llm_client)

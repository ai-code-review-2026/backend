from __future__ import annotations

from typing import Any

from app.core.ai_orchestration.grounded_review_service import GroundedFindingOutput, GroundedReviewService
from app.integrations.llm_providers.ollama_client import OllamaClient
from app.settings import settings

_DEFAULT_SERVICE = None


def _get_service() -> GroundedReviewService:
    global _DEFAULT_SERVICE
    if _DEFAULT_SERVICE is None:
        _DEFAULT_SERVICE = GroundedReviewService(
            llm_client=OllamaClient(
                base_url=settings.OLLAMA_BASE_URL,
                model=settings.OLLAMA_MODEL,
                timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
            )
        )
    return _DEFAULT_SERVICE


def run_llm_review(
    *,
    repo: str,
    pr_number: int | None,
    diff_redacted: str,
    files_changed: list[str],
    knowledge_base_context: str,
    max_findings: int = 8,
    llm_client: Any | None = None,
) -> GroundedFindingOutput:
    """
    Pipeline step: runs the LLM-grounded review on the provided diff.

    Uses the knowledge base context (retrieved via RAG) to generate
    findings that are grounded in internal documentation and policies.
    """
    service = GroundedReviewService(llm_client=llm_client) if llm_client else _get_service()
    return service.generate_findings(
        repo=repo,
        pr_number=pr_number,
        diff_redacted=diff_redacted,
        files_changed=files_changed,
        knowledge_base_context=knowledge_base_context,
        max_findings=max_findings,
    )

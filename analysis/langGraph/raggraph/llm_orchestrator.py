from __future__ import annotations

from analysis.langGraph.models import DiffCodeFragment, LLMOutput, RetrievalResult
from analysis.langGraph.raggraph.llm_service import RagGraphLLMService
from analysis.langGraph.raggraph.post_processor import LLMPostProcessor


class LLMOrchestrator:
    """Prompt/build/generate/post-process orchestration."""

    def __init__(
        self,
        *,
        llm_service: RagGraphLLMService | None = None,
        post_processor: LLMPostProcessor | None = None,
        user_id: str | None = None,
        project_id: str | None = None,
        analysis_id: str | None = None,
    ) -> None:
        self._llm_service = llm_service or RagGraphLLMService(
            user_id=user_id,
            project_id=project_id,
            analysis_id=analysis_id,
            use_gateway=True,  # Enable gateway by default for observability
        )
        self._post_processor = post_processor or LLMPostProcessor()

    async def generate_findings(
        self,
        *,
        repo_id: str,
        pr_number: int | None,
        diff_text: str,
        fragments: list[DiffCodeFragment],
        retrieval: RetrievalResult,
        changed_files: list[str],
        max_findings: int,
    ) -> LLMOutput:
        output = await self._llm_service.generate(
            repo_id=repo_id,
            pr_number=pr_number,
            diff_text=diff_text,
            fragments=fragments,
            retrieval=retrieval,
            changed_files=changed_files,
            max_findings=max_findings,
        )
        return self._post_processor.process(
            llm_output=output,
            retrieval=retrieval,
            changed_files=changed_files,
        )


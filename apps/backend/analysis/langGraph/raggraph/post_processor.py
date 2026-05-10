from __future__ import annotations

from analysis.langGraph.models import LLMGeneratedFinding, LLMOutput, RetrievalResult
from app.settings import settings


class LLMPostProcessor:
    """Validate findings against diff scope and retrieval sources."""

    def process(
        self,
        *,
        llm_output: LLMOutput,
        retrieval: RetrievalResult,
        changed_files: list[str],
    ) -> LLMOutput:
        if llm_output.status != "completed":
            return llm_output

        changed_paths = {item.strip() for item in changed_files if item.strip()}
        known_sources = {
            ref.path
            for ref in retrieval.references
            if isinstance(ref.path, str) and ref.path.strip()
        }

        filtered: list[LLMGeneratedFinding] = []
        for finding in llm_output.findings:
            if finding.file_path and changed_paths and finding.file_path not in changed_paths:
                continue

            if settings.LANGGRAPH_REQUIRE_SOURCE_REFERENCES:
                has_reference = any(ref for ref in finding.references if ref.strip())
                if not has_reference and known_sources:
                    continue

            if finding.file_path and known_sources and finding.file_path not in known_sources and not finding.references:
                continue

            filtered.append(finding)

        return LLMOutput(
            status=llm_output.status,
            summary=llm_output.summary,
            findings=filtered,
            fallback_reason=llm_output.fallback_reason,
            prompt=llm_output.prompt,
            raw_response=llm_output.raw_response,
        )


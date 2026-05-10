from __future__ import annotations

from typing import Any

from app.core.review_intelligence.base import ReviewLLMClient, StructuredLLMHelper
from app.core.review_intelligence.schemas import PRSummaryOutput


class PRSummaryService(StructuredLLMHelper):
    def __init__(self, llm_client: ReviewLLMClient | None = None) -> None:
        super().__init__(llm_client=llm_client)

    def generate(
        self,
        *,
        repo: str,
        pr_number: int | None,
        change_type: str | None,
        diff_redacted: str,
        files_changed: list[str],
        impacted_components: list[str],
        risk_level: str,
        metadata: dict[str, Any],
        knowledge_base_context: str,
        fallback_summary: str,
    ) -> PRSummaryOutput:
        try:
            return self._generate_with_llm(
                repo=repo,
                pr_number=pr_number,
                change_type=change_type,
                diff_redacted=diff_redacted,
                files_changed=files_changed,
                impacted_components=impacted_components,
                risk_level=risk_level,
                metadata=metadata,
                knowledge_base_context=knowledge_base_context,
            )
        except Exception:
            return self._fallback(
                repo=repo,
                change_type=change_type,
                files_changed=files_changed,
                impacted_components=impacted_components,
                risk_level=risk_level,
                metadata=metadata,
                fallback_summary=fallback_summary,
            )

    def _generate_with_llm(
        self,
        *,
        repo: str,
        pr_number: int | None,
        change_type: str | None,
        diff_redacted: str,
        files_changed: list[str],
        impacted_components: list[str],
        risk_level: str,
        metadata: dict[str, Any],
        knowledge_base_context: str,
    ) -> PRSummaryOutput:
        pr_value = pr_number if pr_number is not None else "N/A"
        files_txt = "\n".join(f"- {item}" for item in files_changed[:20]) if files_changed else "- none"
        components_txt = ", ".join(impacted_components[:12]) if impacted_components else "unknown"
        metadata_hint = str(metadata.get("title") or metadata.get("description") or metadata.get("labels") or "")[:800]
        prompt = f"""
You are a senior reviewer preparing a structured pull request summary.
Rules:
- Use ONLY the diff and knowledge base context.
- Do not invent requirements or components not grounded in the input.
- Keep the short summary concise and human readable.
- Breaking changes must be an empty list when unsupported by evidence.
- Output ONLY valid JSON, no markdown and no extra text.

Schema:
{{
  "short_summary": "string",
  "detailed_summary": "string",
  "business_goal": "string",
  "files_impacted": ["string"],
  "impacted_components": ["string"],
  "change_type": "string",
  "risk_level": "low|medium|high|critical",
  "breaking_changes": ["string"]
}}

Context:
repo: {repo}
pr_number: {pr_value}
change_type: {change_type or "unknown"}
risk_level_hint: {risk_level}
metadata_hint: {metadata_hint}
impacted_components_hint: {components_txt}
files_changed:
{files_txt}

diff_excerpt:
{diff_redacted[:6500]}

knowledge_base_context:
{knowledge_base_context[:5000]}

Return JSON now:
""".strip()
        return self.generate_structured_output(
            prompt=prompt,
            model_type=PRSummaryOutput,
            schema_hint=(
                '{"short_summary":"string","detailed_summary":"string","business_goal":"string",'
                '"files_impacted":["string"],"impacted_components":["string"],'
                '"change_type":"string","risk_level":"medium","breaking_changes":["string"]}'
            ),
        )

    @staticmethod
    def _fallback(
        *,
        repo: str,
        change_type: str | None,
        files_changed: list[str],
        impacted_components: list[str],
        risk_level: str,
        metadata: dict[str, Any],
        fallback_summary: str,
    ) -> PRSummaryOutput:
        change_kind = change_type or "mixed"
        business_goal = str(metadata.get("title") or metadata.get("description") or f"Update {repo} behavior").strip()
        if not business_goal:
            business_goal = f"Update {repo} behavior"
        detailed_summary = (
            f"{fallback_summary} The change mainly affects {', '.join(impacted_components[:5]) or 'the repository'} "
            f"and should be reviewed as a {change_kind} change."
        )
        return PRSummaryOutput(
            short_summary=fallback_summary[:400],
            detailed_summary=detailed_summary[:2000],
            business_goal=business_goal[:400],
            files_impacted=files_changed[:20],
            impacted_components=impacted_components[:12],
            change_type=change_kind,
            risk_level=risk_level if risk_level in {"low", "medium", "high", "critical"} else "medium",
            breaking_changes=[],
        )

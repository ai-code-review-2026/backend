from __future__ import annotations

from typing import Any

from app.core.review_engine.diff_engine import ParsedDiff
from app.core.review_intelligence.base import ReviewLLMClient, StructuredLLMHelper
from app.core.review_intelligence.schemas import ChangeExplanationOutput, FileExplanation


class ChangeExplainer(StructuredLLMHelper):
    def __init__(self, llm_client: ReviewLLMClient | None = None) -> None:
        super().__init__(llm_client=llm_client)

    def generate(
        self,
        *,
        repo: str,
        parsed_diff: ParsedDiff,
        summary_text: str,
        metadata: dict[str, Any],
        knowledge_base_context: str,
    ) -> ChangeExplanationOutput:
        try:
            return self._generate_with_llm(
                repo=repo,
                parsed_diff=parsed_diff,
                summary_text=summary_text,
                metadata=metadata,
                knowledge_base_context=knowledge_base_context,
            )
        except Exception:
            return self._fallback(
                parsed_diff=parsed_diff,
                summary_text=summary_text,
                metadata=metadata,
            )

    def _generate_with_llm(
        self,
        *,
        repo: str,
        parsed_diff: ParsedDiff,
        summary_text: str,
        metadata: dict[str, Any],
        knowledge_base_context: str,
    ) -> ChangeExplanationOutput:
        files_txt = "\n".join(
            f"- {item.path_new} ({item.change_type}, +{item.additions_count}/-{item.deletions_count})"
            for item in parsed_diff.files[:12]
        )
        prompt = f"""
You are a senior software engineer explaining a pull request.
Rules:
- Explain what changed, why it likely changed, technical impact, functional impact, and watch areas.
- Use the repository knowledge base context only to interpret architecture and conventions.
- Do not claim a reason unless it is supported by metadata, diff, or repository context.
- Output ONLY valid JSON.

Schema:
{{
  "what_changed":"string",
  "why_changed":"string",
  "technical_impact":"string",
  "functional_impact":"string",
  "watch_areas":["string"],
  "file_explanations":[
    {{
      "file_path":"string",
      "change_type":"string",
      "explanation":"string",
      "technical_impact":"string",
      "watch_areas":["string"]
    }}
  ]
}}

Context:
repo: {repo}
summary_hint: {summary_text[:600]}
metadata_hint: {str(metadata)[:900]}
files:
{files_txt or "- none"}

diff_excerpt:
{_render_diff_excerpt(parsed_diff)[:6500]}

knowledge_base_context:
{knowledge_base_context[:5000]}

Return JSON now:
""".strip()
        output = self.generate_structured_output(
            prompt=prompt,
            model_type=ChangeExplanationOutput,
            schema_hint=(
                '{"what_changed":"string","why_changed":"string","technical_impact":"string",'
                '"functional_impact":"string","watch_areas":["string"],"file_explanations":[{"file_path":"string",'
                '"change_type":"string","explanation":"string","technical_impact":"string","watch_areas":["string"]}]}'
            ),
        )
        return _cap_file_explanations(output=output, limit=6)

    @staticmethod
    def _fallback(
        *,
        parsed_diff: ParsedDiff,
        summary_text: str,
        metadata: dict[str, Any],
    ) -> ChangeExplanationOutput:
        file_explanations: list[FileExplanation] = []
        watch_areas: list[str] = []
        for item in parsed_diff.files[:6]:
            item_watch_areas = []
            if item.path_new.endswith((".py", ".ts", ".tsx", ".js", ".jsx")):
                item_watch_areas.append("Validate behavior around updated execution paths.")
            if "api" in item.path_new.lower():
                item_watch_areas.append("Check request and response compatibility.")
            if "test" in item.path_new.lower():
                item_watch_areas.append("Confirm the new assertions match intended behavior.")
            explanation = (
                f"{item.path_new} was {item.change_type} with +{item.additions_count}/-{item.deletions_count} lines, "
                "which indicates targeted code changes in this area."
            )
            file_explanations.append(
                FileExplanation(
                    file_path=item.path_new,
                    change_type=item.change_type,
                    explanation=explanation,
                    technical_impact="This file may alter behavior in the affected module and should be validated with nearby callers.",
                    watch_areas=item_watch_areas[:5],
                )
            )
            watch_areas.extend(item_watch_areas)

        why_changed = str(metadata.get("title") or metadata.get("description") or "The change appears to address the modified code paths.")
        return ChangeExplanationOutput(
            what_changed=summary_text[:2000],
            why_changed=why_changed[:1200],
            technical_impact="The update modifies implementation details and should be reviewed for downstream integrations and adjacent modules.",
            functional_impact="User-visible behavior may change in the touched flows, depending on how these files are used at runtime.",
            watch_areas=_dedupe_strings(watch_areas, limit=8)
            or ["Validate touched modules against existing behavior and integration points."],
            file_explanations=file_explanations,
        )


def _render_diff_excerpt(parsed_diff: ParsedDiff) -> str:
    lines: list[str] = []
    for file_item in parsed_diff.files[:8]:
        lines.append(f"FILE {file_item.path_new} ({file_item.change_type})")
        for hunk in file_item.hunks[:2]:
            if hunk.header:
                lines.append(hunk.header)
            for line in hunk.lines[:10]:
                prefix = {"add": "+", "remove": "-", "context": " "}.get(line.line_type, " ")
                lines.append(f"{prefix}{line.content}")
    return "\n".join(lines)


def _cap_file_explanations(*, output: ChangeExplanationOutput, limit: int) -> ChangeExplanationOutput:
    return ChangeExplanationOutput(
        what_changed=output.what_changed,
        why_changed=output.why_changed,
        technical_impact=output.technical_impact,
        functional_impact=output.functional_impact,
        watch_areas=output.watch_areas[:8],
        file_explanations=output.file_explanations[:limit],
    )


def _dedupe_strings(items: list[str], *, limit: int) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        normalized = " ".join(item.split()).strip()
        if not normalized:
            continue
        lowered = normalized.lower()
        if lowered in seen:
            continue
        seen.add(lowered)
        output.append(normalized)
        if len(output) >= limit:
            break
    return output

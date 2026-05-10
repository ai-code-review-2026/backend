from __future__ import annotations

import json
import re
from typing import Any, Protocol, TypeVar

from pydantic import BaseModel, Field, ValidationError, constr

from app.core.langchain_runtime.output_parser import extract_json_payload, parse_pydantic_with_repair
from app.integrations.llm_providers.ollama_client import OllamaClient, OllamaResponse


class SummaryLLMClient(Protocol):
    def generate(self, prompt: str) -> OllamaResponse: ...


class SummaryOutput(BaseModel):
    summary: constr(min_length=10, max_length=1500) = Field(...)


class RepoOverviewOutput(BaseModel):
    summary: constr(min_length=20, max_length=2500) = Field(...)
    highlights: list[constr(min_length=4, max_length=220)] = Field(default_factory=list, max_length=8)


_ModelT = TypeVar("_ModelT", bound=BaseModel)


class SummaryService:
    def __init__(self, llm_client: SummaryLLMClient | None = None) -> None:
        self.llm: SummaryLLMClient = llm_client or OllamaClient()

    def _build_prompt(
        self,
        *,
        repo: str,
        pr_number: int | None,
        change_type: str | None,
        diff_redacted: str,
        files_changed: list[str],
        retrieved_context: str | None = None,
    ) -> str:
        max_chars = 6000
        diff_excerpt = diff_redacted[:max_chars]
        files_txt = "\n".join(f"- {path}" for path in files_changed[:30]) if files_changed else "- none"
        change_type_value = change_type or "unknown"
        pr_number_value = pr_number if pr_number is not None else "N/A"
        kb_context_section = ""
        if isinstance(retrieved_context, str) and retrieved_context.strip():
            kb_context_section = f"""

knowledge_base_context:
{retrieved_context[:4500]}
""".rstrip()

        return f"""
You are a senior software engineer. Your task: summarize a pull request.
Rules:
- Do NOT invent changes not present in the diff.
- Be concise and clear.
- Use the knowledge base context only as supporting reference for architecture, policies, naming, or domain conventions.
- Do NOT claim that a KB snippet changed unless the diff shows it.
- Output ONLY valid JSON (no markdown, no extra text).
Schema:
{{"summary":"string"}}

Context:
repo: {repo}
pr_number: {pr_number_value}
change_type: {change_type_value}
files_changed:
{files_txt}

diff_excerpt:
{diff_excerpt}
{kb_context_section}

Return JSON now:
""".strip()

    def _build_repo_overview_prompt(
        self,
        *,
        repo_id: str,
        repo_profile: dict[str, Any],
        context_excerpt: str,
    ) -> str:
        serialized_profile = json.dumps(repo_profile or {}, ensure_ascii=False, indent=2)[:3500]
        clipped_context = context_excerpt[:9000]

        return f"""
You are a senior software architect. Your task: provide a first-time overview of a repository.
Rules:
- Be factual and grounded only in the provided context.
- Do NOT invent frameworks or modules that are not present.
- Keep the overview concise and actionable for onboarding.
- Output ONLY valid JSON (no markdown, no extra text).
Schema:
{{"summary":"string","highlights":["string"]}}

Context:
repo_id: {repo_id}
repo_profile_json:
{serialized_profile}

retrieved_repo_context:
{clipped_context}

Return JSON now:
""".strip()

    def _extract_json(self, text: str) -> str:
        return extract_json_payload(text)

    def _generate_structured_output(
        self,
        *,
        prompt: str,
        model_type: type[_ModelT],
        schema_hint: str,
    ) -> _ModelT:
        response = self.llm.generate(prompt)
        raw = response.text.strip()
        return parse_pydantic_with_repair(
            raw_text=raw,
            model_type=model_type,
            schema_hint=schema_hint,
            llm_client=self.llm,
        )

    def generate_summary(
        self,
        *,
        repo: str,
        pr_number: int | None,
        change_type: str | None,
        diff_redacted: str,
        files_changed: list[str],
        retrieved_context: str | None = None,
    ) -> SummaryOutput:
        prompt = self._build_prompt(
            repo=repo,
            pr_number=pr_number,
            change_type=change_type,
            diff_redacted=diff_redacted,
            files_changed=files_changed,
            retrieved_context=retrieved_context,
        )
        return self._generate_structured_output(
            prompt=prompt,
            model_type=SummaryOutput,
            schema_hint='{"summary":"string"}',
        )

    def generate_repo_overview(
        self,
        *,
        repo_id: str,
        repo_profile: dict[str, Any],
        context_excerpt: str,
    ) -> RepoOverviewOutput:
        prompt = self._build_repo_overview_prompt(
            repo_id=repo_id,
            repo_profile=repo_profile,
            context_excerpt=context_excerpt,
        )
        return self._generate_structured_output(
            prompt=prompt,
            model_type=RepoOverviewOutput,
            schema_hint='{"summary":"string","highlights":["string"]}',
        )

    @staticmethod
    def fallback_summary(
        *,
        files_count: int,
        additions_total: int,
        deletions_total: int,
        change_type: str | None,
        files_changed: list[str],
    ) -> str:
        change_type_value = change_type or "mixed"
        preview_files = files_changed[:3]
        lead = (
            f"This PR updates {files_count} files (+{additions_total}/-{deletions_total}) "
            f"and is categorized as {change_type_value}."
        )
        if not preview_files:
            return lead
        return f"{lead} Main touched files: {', '.join(preview_files)}."

    @staticmethod
    def validate_summary_text(text: str) -> str | None:
        normalized = re.sub(r"\s+", " ", text).strip()
        if not normalized:
            return None
        try:
            parsed = SummaryOutput(summary=normalized)
        except ValidationError:
            return None
        return parsed.summary

    @staticmethod
    def fallback_repo_overview(*, repo_id: str, repo_profile: dict[str, Any]) -> RepoOverviewOutput:
        top_directories = repo_profile.get("top_directories")
        key_files = repo_profile.get("key_files")
        languages = repo_profile.get("languages")

        dirs_txt = ", ".join(top_directories[:5]) if isinstance(top_directories, list) and top_directories else "n/a"
        files_txt = ", ".join(key_files[:5]) if isinstance(key_files, list) and key_files else "n/a"
        if isinstance(languages, dict) and languages:
            language_pairs = sorted(
                ((str(name), int(count)) for name, count in languages.items()),
                key=lambda item: item[1],
                reverse=True,
            )
            language_txt = ", ".join(f"{name}:{count}" for name, count in language_pairs[:5])
        else:
            language_txt = "n/a"

        summary = (
            f"Repository {repo_id} indexed successfully. "
            f"Main directories: {dirs_txt}. "
            f"Key files: {files_txt}. "
            f"Language distribution: {language_txt}."
        )
        highlights = [
            f"Top directories: {dirs_txt}",
            f"Key files: {files_txt}",
            f"Languages: {language_txt}",
        ]
        return RepoOverviewOutput(summary=summary, highlights=highlights)

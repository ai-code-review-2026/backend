"""
Provider-Agnostic LLM Layer

Supports: Ollama (local dev) | Anthropic Claude (prod) | OpenAI

Selection via settings.LLM_PROVIDER: "ollama" | "anthropic" | "openai"

All providers implement the same generate() contract:
    generate(prompt: str) -> LLMResponse

RagGraphLLMService uses this internally — callers don't need to know
which provider is active.
"""
from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field, ValidationError, constr

from analysis.langGraph.models import DiffCodeFragment, LLMGeneratedFinding, LLMOutput, RetrievalResult
from app.core.langchain_runtime.output_parser import parse_pydantic_with_repair
from app.settings import settings

logger = logging.getLogger(__name__)


# ── LLM Response contract ─────────────────────────────────────────────────────

@dataclass(frozen=True)
class LLMResponse:
    text: str
    provider: str
    model: str
    input_tokens: int | None = None
    output_tokens: int | None = None


# ── Base provider interface ───────────────────────────────────────────────────

class BaseLLMProvider:
    def generate(self, prompt: str) -> LLMResponse:
        raise NotImplementedError


# ── Ollama provider ───────────────────────────────────────────────────────────

class OllamaProvider(BaseLLMProvider):
    def __init__(self) -> None:
        from app.integrations.llm_providers.ollama_client import OllamaClient
        self._client = OllamaClient(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
        )

    def generate(self, prompt: str) -> LLMResponse:
        resp = self._client.generate(prompt)
        return LLMResponse(
            text=resp.text,
            provider="ollama",
            model=settings.OLLAMA_MODEL,
        )


# ── Anthropic Claude provider ─────────────────────────────────────────────────

class AnthropicProvider(BaseLLMProvider):
    def __init__(self) -> None:
        import anthropic
        self._client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    def generate(self, prompt: str) -> LLMResponse:
        import anthropic
        message = self._client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=settings.ANTHROPIC_MAX_TOKENS,
            temperature=settings.ANTHROPIC_TEMPERATURE,
            messages=[{"role": "user", "content": prompt}],
        )
        text = ""
        for block in message.content:
            if hasattr(block, "text"):
                text += block.text
        return LLMResponse(
            text=text,
            provider="anthropic",
            model=settings.ANTHROPIC_MODEL,
            input_tokens=message.usage.input_tokens if message.usage else None,
            output_tokens=message.usage.output_tokens if message.usage else None,
        )


# ── OpenAI provider ───────────────────────────────────────────────────────────

class OpenAIProvider(BaseLLMProvider):
    def __init__(self) -> None:
        import openai
        self._client = openai.OpenAI(api_key=settings.OPENAI_API_KEY)

    def generate(self, prompt: str) -> LLMResponse:
        response = self._client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            max_tokens=settings.OPENAI_MAX_TOKENS,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.choices[0].message.content or ""
        usage = response.usage
        return LLMResponse(
            text=text,
            provider="openai",
            model=settings.OPENAI_MODEL,
            input_tokens=usage.prompt_tokens if usage else None,
            output_tokens=usage.completion_tokens if usage else None,
        )


# ── Provider factory ──────────────────────────────────────────────────────────

_PROVIDER_CACHE: BaseLLMProvider | None = None


def get_llm_provider(
    *,
    user_id: str | None = None,
    project_id: str | None = None,
    analysis_id: str | None = None,
    use_gateway: bool = True,
) -> BaseLLMProvider:
    """
    Get LLM provider with optional gateway routing.
    
    Args:
        user_id: User ID for gateway observability + rate limiting
        project_id: Project ID for gateway cost tracking
        analysis_id: Analysis ID for gateway trace correlation
        use_gateway: If True, use new LLM Gateway with full observability.
                     If False, use legacy direct providers (Ollama/Anthropic/OpenAI).
                     
    Returns:
        BaseLLMProvider instance (either GatewayLLMProvider or legacy provider)
        
    Gateway benefits:
        - Intelligent routing (sensitivity, cost, performance, context)
        - Automatic fallback chains (provider fails -> fallback -> success)
        - Full observability (PostgreSQL traces, Prometheus, Langfuse, OTEL)
        - Rate limiting (per-provider + per-user)
        - Prompt caching (Redis LRU, ~30% hit rate)
        - WebSocket live progress
    """
    global _PROVIDER_CACHE  # noqa: PLW0603
    
    # If gateway is enabled AND we have context IDs, use gateway provider
    if use_gateway and (user_id or project_id or analysis_id):
        try:
            from analysis.langGraph.raggraph.gateway_llm_provider import create_gateway_provider
            from app.gateway.request_context import SensitivityLevel, CostTarget, Priority
            
            logger.info(
                "Using LLM Gateway provider with observability (user=%s, project=%s, analysis=%s)",
                user_id, project_id, analysis_id
            )
            return create_gateway_provider(
                user_id=user_id,
                project_id=project_id,
                analysis_id=analysis_id,
                sensitivity=SensitivityLevel.INTERNAL,  # Default: prefer Ollama but allow cloud
                cost_target=CostTarget.BALANCED,  # Default: balance cost/quality
                priority=Priority.NORMAL,  # Default: <10s latency
            )
        except Exception as exc:
            logger.warning(
                "Failed to init LLM Gateway provider: %s — falling back to legacy provider",
                exc,
                exc_info=True,
            )
    
    # Legacy provider (cache singleton for performance)
    if _PROVIDER_CACHE is not None:
        return _PROVIDER_CACHE

    provider_name = settings.LLM_PROVIDER.lower()
    try:
        if provider_name == "anthropic":
            _PROVIDER_CACHE = AnthropicProvider()
        elif provider_name == "openai":
            _PROVIDER_CACHE = OpenAIProvider()
        else:
            _PROVIDER_CACHE = OllamaProvider()
        logger.info("Legacy LLM provider initialized: %s", provider_name)
    except Exception as exc:
        logger.warning("Failed to init LLM provider '%s': %s — falling back to Ollama", provider_name, exc)
        _PROVIDER_CACHE = OllamaProvider()

    return _PROVIDER_CACHE


# ── Output schemas ────────────────────────────────────────────────────────────

class _LLMFindingPayload(BaseModel):
    severity: Literal["INFO", "WARN", "BLOCKER"] = "WARN"
    category: constr(min_length=2, max_length=64) = "quality"
    message: constr(min_length=12, max_length=500)
    suggestion: constr(min_length=8, max_length=600) | None = None
    confidence: float = Field(default=0.7, ge=0.0, le=1.0)
    file_path: str | None = Field(default=None, max_length=500)
    line_start: int | None = Field(default=None, ge=1)
    line_end: int | None = Field(default=None, ge=1)
    references: list[constr(min_length=2, max_length=300)] = Field(default_factory=list, max_length=8)
    auto_fix: str | None = Field(default=None, max_length=1000)
    rule_ref: str | None = Field(default=None, max_length=200)


class _LLMStrictOutput(BaseModel):
    summary: constr(min_length=8, max_length=1000) | None = None
    findings: list[_LLMFindingPayload] = Field(default_factory=list, max_length=12)


# ── Main LLM Service ──────────────────────────────────────────────────────────

class RagGraphLLMService:
    """
    LLM generation with strict JSON contract.
    Provider is selected from settings.LLM_PROVIDER or uses new LLM Gateway.
    KB rules referenced in retrieval are injected as priority context.
    
    Gateway mode (when user_id/project_id/analysis_id provided):
        - Intelligent routing (sensitivity, cost, performance, context)
        - Automatic fallback chains (Anthropic → OpenAI → Ollama)
        - Full observability (PostgreSQL traces, Prometheus, Langfuse, OTEL)
        - Rate limiting (per-provider + per-user)
        - Prompt caching (Redis LRU, ~30% hit rate)
        - WebSocket live progress
    """

    def __init__(
        self,
        llm_provider: BaseLLMProvider | None = None,
        *,
        user_id: str | None = None,
        project_id: str | None = None,
        analysis_id: str | None = None,
        use_gateway: bool = True,
    ) -> None:
        """
        Initialize LLM service with optional gateway observability.
        
        Args:
            llm_provider: Optional pre-initialized provider (for testing/DI)
            user_id: User ID for gateway observability + rate limiting
            project_id: Project ID for gateway cost tracking
            analysis_id: Analysis ID for gateway trace correlation
            use_gateway: If True and IDs provided, use gateway with full observability
        """
        self._user_id = user_id
        self._project_id = project_id
        self._analysis_id = analysis_id
        self._provider = llm_provider or get_llm_provider(
            user_id=user_id,
            project_id=project_id,
            analysis_id=analysis_id,
            use_gateway=use_gateway,
        )

    async def generate(
        self,
        *,
        repo_id: str,
        pr_number: int | None,
        diff_text: str,
        fragments: list[DiffCodeFragment],
        retrieval: RetrievalResult,
        changed_files: list[str],
        max_findings: int = 6,
    ) -> LLMOutput:
        if not settings.LLM_REVIEW_FINDINGS_ENABLED:
            return LLMOutput(status="skipped", summary=None, findings=[], fallback_reason="llm_disabled")
        if not retrieval.context_text:
            return LLMOutput(status="fallback", summary=None, findings=[], fallback_reason="missing_retrieval_context")

        prompt = self._build_prompt(
            repo_id=repo_id,
            pr_number=pr_number,
            diff_text=diff_text,
            fragments=fragments,
            retrieval=retrieval,
            changed_files=changed_files,
            max_findings=max_findings,
        )

        try:
            response = await asyncio.to_thread(self._provider.generate, prompt)
        except Exception as exc:
            return LLMOutput(status="unavailable", summary=None, findings=[], fallback_reason=str(exc), prompt=prompt)

        try:
            parsed = parse_pydantic_with_repair(
                raw_text=response.text.strip(),
                model_type=_LLMStrictOutput,
                schema_hint=(
                    '{"summary":"string|null","findings":[{"severity":"WARN","category":"quality",'
                    '"message":"string","suggestion":"string|null","confidence":0.75,'
                    '"file_path":"src/file.py","line_start":1,"line_end":1,'
                    '"references":["path:line"],"auto_fix":"string|null","rule_ref":"string|null"}]}'
                ),
                llm_client=None,
            )
        except ValidationError as exc:
            return LLMOutput(status="failed", summary=None, findings=[], fallback_reason=str(exc), prompt=prompt, raw_response=response.text)
        except Exception as exc:
            return LLMOutput(status="failed", summary=None, findings=[], fallback_reason=str(exc), prompt=prompt, raw_response=response.text)

        return LLMOutput(
            status="completed",
            summary=parsed.summary,
            findings=self._normalize_findings(parsed.findings, changed_files=changed_files, max_findings=max_findings),
            prompt=prompt,
            raw_response=response.text,
        )

    @staticmethod
    def _normalize_findings(
        findings: list[_LLMFindingPayload],
        *,
        changed_files: list[str],
        max_findings: int,
    ) -> list[LLMGeneratedFinding]:
        changed_paths = {f.strip() for f in changed_files if f.strip()}
        output: list[LLMGeneratedFinding] = []
        seen: set[tuple[str | None, int | None, str]] = set()

        for finding in findings:
            if finding.confidence < settings.LANGGRAPH_MIN_FINDING_CONFIDENCE:
                continue

            file_path = finding.file_path.strip() if isinstance(finding.file_path, str) and finding.file_path.strip() else None
            if file_path and changed_paths and file_path not in changed_paths:
                file_path = None

            line_start = finding.line_start
            line_end = finding.line_end
            if line_start and line_end and line_end < line_start:
                line_end = line_start

            msg = " ".join(finding.message.split()).strip()
            key = (file_path, line_start, msg.lower())
            if key in seen:
                continue
            seen.add(key)

            suggestion = finding.suggestion.strip() if isinstance(finding.suggestion, str) and finding.suggestion.strip() else None
            auto_fix = finding.auto_fix.strip() if isinstance(finding.auto_fix, str) and finding.auto_fix.strip() else None
            output.append(LLMGeneratedFinding(
                severity=finding.severity,
                category=finding.category.strip().lower(),
                message=msg,
                suggestion=suggestion,
                confidence=float(finding.confidence),
                file_path=file_path,
                line_start=line_start,
                line_end=line_end,
                references=tuple(r.strip() for r in finding.references if r.strip()),
                auto_fix=auto_fix,
            ))
            if len(output) >= max_findings:
                break
        return output

    @staticmethod
    def _build_prompt(
        *,
        repo_id: str,
        pr_number: int | None,
        diff_text: str,
        fragments: list[DiffCodeFragment],
        retrieval: RetrievalResult,
        changed_files: list[str],
        max_findings: int,
    ) -> str:
        changed_files_block = "\n".join(f"- {f}" for f in changed_files[:60]) or "- none"
        fragments_block = "\n".join(
            f"- {f.file_path} | lang={f.language} | module={f.module} | class={f.class_name} | function={f.function_name}"
            for f in fragments[:30]
        ) or "- none"

        # Separate KB content (rules/docs) from code context for ordering
        kb_refs = [r for r in retrieval.references[:16] if r.source_type == "knowledge_base"]
        code_refs = [r for r in retrieval.references[:16] if r.source_type != "knowledge_base"]

        kb_block = "\n\n".join(
            f"[RULE/DOC: {r.symbol_name or r.path}]\n{r.content[:800]}"
            for r in kb_refs[:6]
        ) or "None"

        code_block = "\n\n".join(
            f"[{r.path}:{r.line_start or '?'}] score={r.score:.2f}\n{r.content[:1000]}"
            for r in code_refs[:8]
        ) or "None"

        return f"""[SYSTEM]
You are a strict code review engine grounded ONLY in the provided context.
Rules:
- NO hallucination. NO invented file paths.
- KB rules take priority over code context.
- Output ONLY valid JSON — no text outside JSON.
- Every finding must be traceable to a file+line or a KB rule reference.

[USER]
Repository: {repo_id}
PR: {pr_number if pr_number is not None else "N/A"}
Changed files:
{changed_files_block}

Diff fragments:
{fragments_block}

Diff (excerpt):
{diff_text[:6000]}

Knowledge Base Rules / Docs (HIGH PRIORITY):
{kb_block[:4000]}

Repository Code Context:
{code_block[:6000]}

Return ONLY valid JSON:
{{
  "summary": "string|null",
  "findings": [
    {{
      "severity": "INFO|WARN|BLOCKER",
      "category": "security|perf|quality|style|maintainability|other",
      "message": "string",
      "suggestion": "string|null",
      "confidence": 0.0,
      "file_path": "string|null",
      "line_start": 1,
      "line_end": 1,
      "references": ["string"],
      "auto_fix": "string|null",
      "rule_ref": "string|null"
    }}
  ]
}}

Constraints:
- Maximum {max_findings} findings.
- If no solid issues: {{"summary": null, "findings": []}}.
- Each finding must cite the diff, code context, or a KB rule.
""".strip()


# ── Backward-compat alias ─────────────────────────────────────────────────────

class LLMService(RagGraphLLMService):
    """Backward-compatible alias with old generate() signature."""

    async def generate(  # type: ignore[override]
        self,
        *,
        repo: str,
        pr_number: int | None,
        diff_redacted: str,
        files_changed: list[str],
        knowledge_base_context: str,
        max_findings: int = 6,
    ) -> list[dict[str, object]]:
        retrieval = RetrievalResult(
            context_text=knowledge_base_context,
            references=[],
            vector_hits=0,
            graph_hits=0,
            hyde_hits=0,
            reranked_count=0,
            retrieval_mode="legacy",
            retrieval_trace={},
        )
        output = await RagGraphLLMService.generate(
            self,
            repo_id=repo,
            pr_number=pr_number,
            diff_text=diff_redacted,
            fragments=[],
            retrieval=retrieval,
            changed_files=files_changed,
            max_findings=max_findings,
        )
        return [item.to_dict() for item in output.findings]

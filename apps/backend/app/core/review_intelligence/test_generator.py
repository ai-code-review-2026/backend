from __future__ import annotations

from pydantic import BaseModel, Field

from app.core.review_engine.diff_engine import ParsedDiff
from app.core.review_intelligence.base import ReviewLLMClient, StructuredLLMHelper
from app.core.review_intelligence.schemas import GeneratedTestOutput, RiskFindingOutput


class GeneratedTestsEnvelope(BaseModel):
    generated_tests: list[GeneratedTestOutput] = Field(default_factory=list, max_length=8)


class TestGenerator(StructuredLLMHelper):
    __test__ = False

    def __init__(self, llm_client: ReviewLLMClient | None = None) -> None:
        super().__init__(llm_client=llm_client)

    def generate(
        self,
        *,
        repo: str,
        parsed_diff: ParsedDiff,
        risk_findings: list[RiskFindingOutput],
        knowledge_base_context: str,
    ) -> list[GeneratedTestOutput]:
        try:
            envelope = self._generate_with_llm(
                repo=repo,
                parsed_diff=parsed_diff,
                risk_findings=risk_findings,
                knowledge_base_context=knowledge_base_context,
            )
            return envelope.generated_tests[:6]
        except Exception:
            return self._fallback(parsed_diff=parsed_diff, risk_findings=risk_findings)

    def _generate_with_llm(
        self,
        *,
        repo: str,
        parsed_diff: ParsedDiff,
        risk_findings: list[RiskFindingOutput],
        knowledge_base_context: str,
    ) -> GeneratedTestsEnvelope:
        files_txt = "\n".join(
            f"- {item.path_new} ({item.change_type}, +{item.additions_count}/-{item.deletions_count})"
            for item in parsed_diff.files[:10]
        )
        risks_txt = "\n".join(
            f"- [{item.severity}] {item.file_path or 'n/a'}: {item.explanation}"
            for item in risk_findings[:8]
        ) or "- none"
        prompt = f"""
You are a senior test engineer. Generate targeted tests for the pull request.
Rules:
- Reuse the existing project test strategy when possible.
- Prioritize nominal, edge, error, and regression cases.
- Keep generated tests focused on changed behavior.
- code_snippet may be null when the language/framework is unclear.
- Output ONLY valid JSON.

Schema:
{{
  "generated_tests": [
    {{
      "test_type": "unit|integration|contract|regression",
      "priority": "high|medium|low",
      "target_file": "string|null",
      "test_name": "string",
      "rationale": "string",
      "scenarios": ["string"],
      "code_snippet": "string|null"
    }}
  ]
}}

Context:
repo: {repo}
files_changed:
{files_txt or "- none"}

risk_findings:
{risks_txt}

knowledge_base_context:
{knowledge_base_context[:4500]}

Return JSON now:
""".strip()
        return self.generate_structured_output(
            prompt=prompt,
            model_type=GeneratedTestsEnvelope,
            schema_hint=(
                '{"generated_tests":[{"test_type":"unit","priority":"high","target_file":"string|null",'
                '"test_name":"string","rationale":"string","scenarios":["string"],"code_snippet":"string|null"}]}'
            ),
        )

    @staticmethod
    def _fallback(
        *,
        parsed_diff: ParsedDiff,
        risk_findings: list[RiskFindingOutput],
    ) -> list[GeneratedTestOutput]:
        results: list[GeneratedTestOutput] = []
        risks_by_file = {item.file_path: item for item in risk_findings if item.file_path}
        for file_item in parsed_diff.files[:6]:
            lowered = file_item.path_new.lower()
            test_type = "integration" if any(token in lowered for token in ("api", "route", "controller", "endpoint")) else "unit"
            if "schema" in lowered or "contract" in lowered:
                test_type = "contract"
            related_risk = risks_by_file.get(file_item.path_new)
            priority = "high" if related_risk and related_risk.severity in {"critical", "high"} else "medium"
            scenarios = [
                "Verify the expected behavior on the main success path.",
                "Cover the most likely invalid or edge input for this change.",
            ]
            if related_risk:
                scenarios.append(f"Add a regression case for: {related_risk.title}")
            results.append(
                GeneratedTestOutput(
                    test_type=test_type,
                    priority=priority,
                    target_file=file_item.path_new,
                    test_name=_build_test_name(file_item.path_new, test_type),
                    rationale=(
                        f"This test targets {file_item.path_new} because the file changed by "
                        f"+{file_item.additions_count}/-{file_item.deletions_count} lines."
                    ),
                    scenarios=scenarios[:4],
                    code_snippet=None,
                )
            )
        return results[:6]


def _build_test_name(path: str, test_type: str) -> str:
    base = path.replace("\\", "/").split("/")[-1].split(".")[0]
    return f"{test_type}_{base}_changed_behavior"

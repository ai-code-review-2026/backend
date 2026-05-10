from __future__ import annotations

from app.core.review_engine.diff_engine import FileDiff, ParsedDiff
from app.core.review_intelligence.schemas import RiskFindingOutput
from app.core.review_intelligence.test_generator import TestGenerator


class _RejectingLLM:
    def generate(self, prompt: str):  # noqa: ARG002
        raise RuntimeError("llm unavailable")


def test_test_generator_fallback_builds_targeted_tests() -> None:
    generator = TestGenerator(llm_client=_RejectingLLM())
    tests = generator.generate(
        repo="owner/repo",
        parsed_diff=ParsedDiff(
            files=[
                FileDiff(path_new="apps/backend/app/api/http/knowledge_base.py", change_type="modified", additions_count=20, deletions_count=5),
                FileDiff(path_new="apps/backend/app/data/repos/kb_repo.py", change_type="modified", additions_count=10, deletions_count=2),
            ]
        ),
        risk_findings=[
            RiskFindingOutput(
                title="API contract may have shifted",
                severity="high",
                file_path="apps/backend/app/api/http/knowledge_base.py",
                line_start=None,
                line_end=None,
                explanation="API-facing behavior changed.",
                risk="Clients can regress.",
                suggestion="Cover request and response behavior.",
                confidence=0.7,
            )
        ],
        knowledge_base_context="KB context",
    )

    assert tests
    assert tests[0].test_type == "integration"
    assert tests[0].priority == "high"
    assert tests[0].target_file == "apps/backend/app/api/http/knowledge_base.py"

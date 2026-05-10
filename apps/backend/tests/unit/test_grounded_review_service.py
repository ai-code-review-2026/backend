from __future__ import annotations

from app.core.ai_orchestration import GroundedReviewService


class _FakeLLM:
    def __init__(self, responses: list[str]) -> None:
        self._responses = responses
        self._index = 0
        self.prompts: list[str] = []

    def generate(self, prompt: str):  # noqa: ANN001
        self.prompts.append(prompt)
        response = self._responses[min(self._index, len(self._responses) - 1)]
        self._index += 1

        class _Resp:
            def __init__(self, text: str) -> None:
                self.text = text

        return _Resp(response)


def test_grounded_review_prompt_includes_kb_context() -> None:
    llm = _FakeLLM(
        [
            (
                '{"findings":[{"file_path":"app/auth.py","line_start":12,"line_end":12,'
                '"severity":"WARN","category":"security","message":"Authentication change bypasses the KB guardrail.",'
                '"suggestion":"Require the documented MFA guardrail before admin actions.","confidence":0.82,'
                '"kb_refs":["security/policy.md"]}]}'
            )
        ]
    )
    service = GroundedReviewService(llm_client=llm)

    output = service.generate_findings(
        repo="acme/repo",
        pr_number=4,
        diff_redacted="diff --git a/app/auth.py b/app/auth.py\n+skip_mfa_for_admin = True",
        files_changed=["app/auth.py"],
        knowledge_base_context="[FILE: security/policy.md]\nAdmins must pass MFA before elevated actions.",
        max_findings=3,
    )

    assert len(output.findings) == 1
    assert "knowledge_base_context:" in llm.prompts[0]
    assert "Admins must pass MFA" in llm.prompts[0]


def test_grounded_review_normalizes_unknown_file_paths() -> None:
    llm = _FakeLLM(
        [
            (
                '{"findings":[{"file_path":"docs/other.md","line_start":3,"line_end":1,'
                '"severity":"INFO","category":"quality","message":"The change does not follow the repository naming convention.",'
                '"suggestion":"Align the change with the documented naming pattern.","confidence":0.61,'
                '"kb_refs":["architecture.pdf","architecture.pdf"]}]}'
            )
        ]
    )
    service = GroundedReviewService(llm_client=llm)

    output = service.generate_findings(
        repo="acme/repo",
        pr_number=None,
        diff_redacted="diff --git a/app/main.py b/app/main.py\n+def login_user(): pass",
        files_changed=["app/main.py"],
        knowledge_base_context="[FILE: architecture.pdf]\nUse snake_case for service functions.",
        max_findings=3,
    )

    assert len(output.findings) == 1
    assert output.findings[0].file_path is None
    assert output.findings[0].line_end == 3
    assert output.findings[0].kb_refs == ["architecture.pdf", "architecture.pdf"]


def test_grounded_review_repairs_invalid_json() -> None:
    llm = _FakeLLM(
        [
            "not-json",
            (
                '{"findings":[{"file_path":"app/main.py","line_start":7,"line_end":7,'
                '"severity":"WARN","category":"maintainability","message":"This change conflicts with the documented service boundary.",'
                '"suggestion":"Keep the adapter logic inside the boundary module.","confidence":0.73,'
                '"kb_refs":["service-boundary.md"]}]}'
            ),
        ]
    )
    service = GroundedReviewService(llm_client=llm)

    output = service.generate_findings(
        repo="acme/repo",
        pr_number=9,
        diff_redacted="diff --git a/app/main.py b/app/main.py\n+adapter = direct_db_call()",
        files_changed=["app/main.py"],
        knowledge_base_context="[FILE: service-boundary.md]\nDatabase access must stay inside the boundary module.",
        max_findings=2,
    )

    assert len(output.findings) == 1
    assert output.findings[0].category == "maintainability"

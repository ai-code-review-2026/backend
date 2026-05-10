from __future__ import annotations

from pydantic import BaseModel

from app.core.langchain_runtime.output_parser import (
    LenientPydanticOutputParser,
    parse_pydantic_with_repair,
    strip_reasoning_tokens,
)


class _Payload(BaseModel):
    value: str


class _RepairingClient:
    def generate(self, prompt: str):  # noqa: ARG002
        class _Response:
            text = '{"value":"fixed"}'

        return _Response()


def test_strip_reasoning_tokens_removes_think_blocks() -> None:
    raw = "<think>private reasoning</think>\n{\"value\":\"ok\"}"

    assert strip_reasoning_tokens(raw) == '{"value":"ok"}'


def test_lenient_pydantic_output_parser_accepts_reasoning_wrapped_json() -> None:
    parser = LenientPydanticOutputParser(_Payload)

    parsed = parser.parse("<think>reason</think>\n{\"value\":\"ok\"}")

    assert parsed.value == "ok"


def test_parse_pydantic_with_repair_uses_second_pass_when_initial_output_is_invalid() -> None:
    parsed = parse_pydantic_with_repair(
        raw_text="not json at all",
        model_type=_Payload,
        schema_hint='{"value":"string"}',
        llm_client=_RepairingClient(),
    )

    assert parsed.value == "fixed"

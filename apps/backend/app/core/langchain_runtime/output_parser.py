from __future__ import annotations

import json
import re
from typing import Generic, TypeVar

from pydantic import BaseModel

try:
    from langchain_core.output_parsers import BaseOutputParser
except Exception:  # pragma: no cover - handled at runtime when LangChain is unavailable
    class BaseOutputParser(Generic[TypeVar("_DummyT")]):  # type: ignore[no-redef]
        def parse(self, text: str):  # noqa: ANN201
            raise NotImplementedError


_ModelT = TypeVar("_ModelT", bound=BaseModel)
_THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", re.IGNORECASE | re.DOTALL)


def strip_reasoning_tokens(text: str) -> str:
    cleaned = _THINK_BLOCK_RE.sub("", text or "")
    return cleaned.strip()


def extract_json_payload(text: str) -> str:
    cleaned = strip_reasoning_tokens(text)
    start_index = None
    start_char = ""
    for index, char in enumerate(cleaned):
        if char in "{[":
            start_index = index
            start_char = char
            break
    if start_index is None:
        raise ValueError("No JSON payload found in model output")

    end_char = "}" if start_char == "{" else "]"
    depth = 0
    in_string = False
    escaped = False
    for index in range(start_index, len(cleaned)):
        char = cleaned[index]
        if in_string:
            if escaped:
                escaped = False
                continue
            if char == "\\":
                escaped = True
                continue
            if char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
            continue
        if char == start_char:
            depth += 1
            continue
        if char == end_char:
            depth -= 1
            if depth == 0:
                return cleaned[start_index : index + 1]

    raise ValueError("Unterminated JSON payload in model output")


class LenientPydanticOutputParser(BaseOutputParser[_ModelT]):
    def __init__(self, pydantic_object: type[_ModelT]) -> None:
        self._pydantic_object = pydantic_object

    def parse(self, text: str) -> _ModelT:
        payload = json.loads(extract_json_payload(text))
        return self._pydantic_object.model_validate(payload)

    @property
    def _type(self) -> str:
        return "lenient_pydantic"


def parse_pydantic_with_repair(
    *,
    raw_text: str,
    model_type: type[_ModelT],
    schema_hint: str,
    llm_client: object,
) -> _ModelT:
    parser = LenientPydanticOutputParser(model_type)
    try:
        return parser.parse(raw_text)
    except Exception:
        repair_prompt = f"""
Fix the following output to be valid JSON EXACTLY matching:
{schema_hint}
Return ONLY JSON, no extra text.

Bad output:
{strip_reasoning_tokens(raw_text)}
""".strip()
        repaired = llm_client.generate(repair_prompt)
        return parser.parse(repaired.text.strip())

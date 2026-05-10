from __future__ import annotations

from typing import Protocol, TypeVar

from pydantic import BaseModel

from app.core.langchain_runtime.output_parser import extract_json_payload, parse_pydantic_with_repair
from app.integrations.llm_providers.ollama_client import OllamaClient, OllamaResponse


class ReviewLLMClient(Protocol):
    def generate(self, prompt: str) -> OllamaResponse: ...


_ModelT = TypeVar("_ModelT", bound=BaseModel)


class StructuredLLMHelper:
    def __init__(self, llm_client: ReviewLLMClient | None = None) -> None:
        self.llm: ReviewLLMClient = llm_client or OllamaClient()

    @staticmethod
    def extract_json(text: str) -> str:
        return extract_json_payload(text)

    def generate_structured_output(
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

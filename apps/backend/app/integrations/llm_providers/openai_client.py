from __future__ import annotations

from dataclasses import dataclass

from app.integrations.llm_providers.ollama_client import OllamaClient, OllamaClientError
from app.settings import settings


@dataclass(frozen=True)
class OpenAIResponse:
    text: str


class OpenAIClient:
    """
    Compatibility adapter.

    The project currently runs local LLM inference with Ollama.
    This class keeps the historical `OpenAIClient` dependency stable while routing
    calls to Ollama (`settings.OLLAMA_MODEL`, default `deepseek-r1:8b`).
    """

    def __init__(self) -> None:
        self._ollama = OllamaClient(
            base_url=settings.OLLAMA_BASE_URL,
            model=settings.OLLAMA_MODEL,
            timeout_s=settings.OLLAMA_TIMEOUT_SECONDS,
        )

    async def summarize_diff(self, diff_text: str, max_chars: int = 500) -> str:
        excerpt = diff_text[: max(200, max_chars)]
        prompt = (
            "Summarize the following diff in one concise paragraph. "
            "Only describe concrete changes.\n\n"
            f"{excerpt}"
        )
        try:
            response = self._ollama.generate(prompt)
            text = response.text.strip()
            return text if text else "No summary generated."
        except OllamaClientError:
            return "Summary unavailable."

    async def generate_text(self, prompt: str) -> OpenAIResponse:
        try:
            response = self._ollama.generate(prompt)
            return OpenAIResponse(text=response.text.strip())
        except OllamaClientError:
            return OpenAIResponse(text="")

"""
RAGAS Evaluation Service

Computes quality metrics for Retrieval-Augmented Generation (RAG) systems:
- Context Precision: Relevance of retrieved context to query
- Context Recall: Completeness of retrieved context (ground truth coverage)
- Faithfulness: Answer fidelity to context (no hallucinations)
- Answer Relevancy: Answer relevance to user query

These metrics are computed post-hoc for every LLM trace and stored in the
llm_traces table (hallucination_score, relevance_score, faithfulness_score).

Note: RAGAS requires an LLM to compute metrics, so we use the gateway
with CONFIDENTIAL sensitivity (Ollama local) to avoid extra cloud costs.
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.gateway.api_gateway import LLMGateway

from app.gateway.request_context import (
    CostTarget,
    LLMRequestContext,
    Priority,
    SensitivityLevel,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RAGASMetrics:
    """RAGAS evaluation metrics for a single RAG interaction."""

    context_precision: float  # 0.0-1.0: Relevance of retrieved context
    context_recall: float  # 0.0-1.0: Completeness of retrieved context
    faithfulness: float  # 0.0-1.0: Answer fidelity to context (1.0 = no hallucinations)
    answer_relevancy: float  # 0.0-1.0: Answer relevance to query

    def to_dict(self) -> dict[str, float]:
        return {
            "context_precision": round(self.context_precision, 3),
            "context_recall": round(self.context_recall, 3),
            "faithfulness": round(self.faithfulness, 3),
            "answer_relevancy": round(self.answer_relevancy, 3),
        }


class RAGASEvaluator:
    """
    RAGAS evaluator using LLM-as-judge pattern.

    Uses the LLM Gateway with Ollama local (CONFIDENTIAL sensitivity)
    to compute metrics without extra cloud costs.
    """

    def __init__(self, gateway: LLMGateway | None = None) -> None:
        """
        Initialize RAGAS evaluator.

        Args:
            gateway: Optional gateway instance (for testing/DI)
        """
        from app.gateway.dependency_container import get_gateway

        self._gateway = gateway or get_gateway()

    async def evaluate(
        self,
        *,
        query: str,
        retrieved_context: list[str],
        answer: str,
        ground_truth: str | None = None,
    ) -> RAGASMetrics:
        """
        Compute RAGAS metrics for a RAG interaction.

        Args:
            query: User query/prompt
            retrieved_context: List of retrieved context chunks
            answer: Generated answer from LLM
            ground_truth: Optional ground truth answer (for recall)

        Returns:
            RAGASMetrics with 4 scores (0.0-1.0)
        """
        # Compute metrics in parallel for performance
        import asyncio

        context_text = "\n\n".join(retrieved_context)

        results = await asyncio.gather(
            self._compute_context_precision(query, retrieved_context),
            self._compute_context_recall(query, context_text, ground_truth) if ground_truth else asyncio.sleep(0, result=1.0),
            self._compute_faithfulness(context_text, answer),
            self._compute_answer_relevancy(query, answer),
            return_exceptions=True,
        )

        # Handle exceptions gracefully (default to 0.5 if metric computation fails)
        context_precision = results[0] if isinstance(results[0], float) else 0.5
        context_recall = results[1] if isinstance(results[1], float) else 0.5
        faithfulness = results[2] if isinstance(results[2], float) else 0.5
        answer_relevancy = results[3] if isinstance(results[3], float) else 0.5

        return RAGASMetrics(
            context_precision=context_precision,
            context_recall=context_recall,
            faithfulness=faithfulness,
            answer_relevancy=answer_relevancy,
        )

    async def _compute_context_precision(self, query: str, retrieved_context: list[str]) -> float:
        """
        Context Precision: Are the retrieved chunks relevant to the query?

        Measures precision@k: proportion of retrieved chunks that are relevant.
        """
        if not retrieved_context:
            return 0.0

        prompt = f"""You are an expert evaluator. Given a query and a retrieved context chunk, determine if the chunk is relevant to answering the query.

Query: {query}

For each context chunk below, output ONLY "RELEVANT" or "IRRELEVANT":

"""
        for i, chunk in enumerate(retrieved_context[:10]):  # Limit to top 10 for performance
            prompt += f"\nChunk {i+1}:\n{chunk[:500]}...\n"

        prompt += "\nOutput format: One word per line (RELEVANT or IRRELEVANT)"

        try:
            context = LLMRequestContext(
                user_id="ragas_evaluator",
                system_prompt="You are an expert evaluator",
                user_prompt=prompt,
                sensitivity=SensitivityLevel.CONFIDENTIAL,  # Use Ollama local (free)
                cost_target=CostTarget.MINIMIZE,
                priority=Priority.LOW,
                max_tokens=200,
                temperature=0.0,
                tags=["ragas", "context_precision"],
            )

            response = await self._gateway.generate(context)
            relevance_labels = [
                line.strip().upper() for line in response.content.strip().split("\n") if line.strip()
            ]

            relevant_count = sum(1 for label in relevance_labels if "RELEVANT" in label)
            total_count = len(retrieved_context[:10])

            return relevant_count / total_count if total_count > 0 else 0.0

        except Exception as exc:
            logger.warning(f"Failed to compute context precision: {exc}")
            return 0.5

    async def _compute_context_recall(self, query: str, context_text: str, ground_truth: str) -> float:
        """
        Context Recall: Does the retrieved context contain all information needed to answer?

        Measures completeness: proportion of ground truth sentences supported by context.
        """
        if not context_text or not ground_truth:
            return 1.0  # No ground truth, assume complete

        prompt = f"""You are an expert evaluator. Given a query, retrieved context, and ground truth answer, determine if the context contains enough information to produce the ground truth answer.

Query: {query}

Retrieved Context:
{context_text[:2000]}...

Ground Truth Answer:
{ground_truth}

For each sentence in the ground truth, determine if it's supported by the retrieved context.

Output ONLY a JSON array of booleans (true if supported, false if not):
Example: [true, true, false, true]
"""

        try:
            context = LLMRequestContext(
                user_id="ragas_evaluator",
                system_prompt="You are an expert evaluator",
                user_prompt=prompt,
                sensitivity=SensitivityLevel.CONFIDENTIAL,
                cost_target=CostTarget.MINIMIZE,
                priority=Priority.LOW,
                max_tokens=100,
                temperature=0.0,
                tags=["ragas", "context_recall"],
            )

            response = await self._gateway.generate(context)

            # Parse JSON array of booleans
            import json

            match = re.search(r"\[.*\]", response.content)
            if match:
                supported = json.loads(match.group())
                return sum(supported) / len(supported) if supported else 1.0

            return 0.5

        except Exception as exc:
            logger.warning(f"Failed to compute context recall: {exc}")
            return 0.5

    async def _compute_faithfulness(self, context_text: str, answer: str) -> float:
        """
        Faithfulness: Is the answer faithful to the context (no hallucinations)?

        Measures fidelity: proportion of answer statements supported by context.
        Score of 1.0 means zero hallucinations.
        """
        if not answer or not context_text:
            return 1.0

        prompt = f"""You are an expert evaluator. Given a retrieved context and an answer, determine if the answer contains hallucinations (unsupported claims).

Retrieved Context:
{context_text[:2000]}...

Generated Answer:
{answer}

For each claim/statement in the answer, determine if it's supported by the context.

Output ONLY a JSON object:
{{
  "total_claims": <number>,
  "supported_claims": <number>,
  "hallucinated_claims": <number>
}}
"""

        try:
            context = LLMRequestContext(
                user_id="ragas_evaluator",
                system_prompt="You are an expert evaluator",
                user_prompt=prompt,
                sensitivity=SensitivityLevel.CONFIDENTIAL,
                cost_target=CostTarget.MINIMIZE,
                priority=Priority.LOW,
                max_tokens=150,
                temperature=0.0,
                tags=["ragas", "faithfulness"],
            )

            response = await self._gateway.generate(context)

            # Parse JSON
            import json

            match = re.search(r"\{.*\}", response.content, re.DOTALL)
            if match:
                result = json.loads(match.group())
                total = result.get("total_claims", 1)
                supported = result.get("supported_claims", 0)
                return supported / total if total > 0 else 1.0

            return 0.5

        except Exception as exc:
            logger.warning(f"Failed to compute faithfulness: {exc}")
            return 0.5

    async def _compute_answer_relevancy(self, query: str, answer: str) -> float:
        """
        Answer Relevancy: Does the answer actually address the query?

        Measures relevance: how well the answer addresses the user's question.
        """
        if not answer or not query:
            return 1.0

        prompt = f"""You are an expert evaluator. Given a user query and a generated answer, rate how well the answer addresses the query.

User Query: {query}

Generated Answer: {answer}

Rate the answer relevancy on a scale of 0.0 to 1.0:
- 0.0: Completely irrelevant, doesn't address the query at all
- 0.5: Partially relevant, addresses some aspects but misses key points
- 1.0: Highly relevant, directly and completely addresses the query

Output ONLY a number between 0.0 and 1.0 (e.g., 0.75)
"""

        try:
            context = LLMRequestContext(
                user_id="ragas_evaluator",
                system_prompt="You are an expert evaluator",
                user_prompt=prompt,
                sensitivity=SensitivityLevel.CONFIDENTIAL,
                cost_target=CostTarget.MINIMIZE,
                priority=Priority.LOW,
                max_tokens=50,
                temperature=0.0,
                tags=["ragas", "answer_relevancy"],
            )

            response = await self._gateway.generate(context)

            # Extract number
            match = re.search(r"(\d\.\d+|\d+)", response.content)
            if match:
                score = float(match.group())
                return max(0.0, min(1.0, score))  # Clamp to [0, 1]

            return 0.5

        except Exception as exc:
            logger.warning(f"Failed to compute answer relevancy: {exc}")
            return 0.5


# ── Integration with Trace Service ──────────────────────────────────────────

async def compute_and_store_ragas_metrics(
    *,
    trace_id: str,
    query: str,
    retrieved_context: list[str],
    answer: str,
    ground_truth: str | None = None,
) -> RAGASMetrics:
    """
    Compute RAGAS metrics and store in llm_traces table.

    This function is called after every LLM trace is created to evaluate quality.

    Args:
        trace_id: Trace ID to update
        query: User query/prompt
        retrieved_context: List of retrieved context chunks
        answer: Generated answer from LLM
        ground_truth: Optional ground truth answer

    Returns:
        RAGASMetrics with 4 scores
    """
    evaluator = RAGASEvaluator()
    metrics = await evaluator.evaluate(
        query=query,
        retrieved_context=retrieved_context,
        answer=answer,
        ground_truth=ground_truth,
    )

    # Update trace with metrics
    from app.data.database import get_db_connection

    async with get_db_connection() as conn:
        await conn.execute(
            """
            UPDATE llm_traces
            SET 
                hallucination_score = $1,
                relevance_score = $2,
                faithfulness_score = $3
            WHERE trace_id = $4
            """,
            1.0 - metrics.faithfulness,  # hallucination_score is inverse of faithfulness
            metrics.answer_relevancy,
            metrics.faithfulness,
            trace_id,
        )

    logger.info(
        f"RAGAS metrics computed for trace {trace_id}: "
        f"faithfulness={metrics.faithfulness:.3f}, relevancy={metrics.answer_relevancy:.3f}"
    )

    return metrics


__all__ = ["RAGASEvaluator", "RAGASMetrics", "compute_and_store_ragas_metrics"]

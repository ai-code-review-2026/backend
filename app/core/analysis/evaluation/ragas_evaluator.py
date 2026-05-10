"""
RAGAS Evaluation System for GraphRAG

This module provides comprehensive evaluation of the GraphRAG system using RAGAS metrics.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from datetime import datetime, UTC

from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    answer_correctness,
    answer_similarity,
)

logger = logging.getLogger(__name__)


class GraphRAGEvaluator:
    """
    Evaluator for GraphRAG system using RAGAS metrics.
    
    Evaluates both retrieval quality (context) and generation quality (answers).
    """
    
    def __init__(
        self,
        llm_model: str = "gpt-4o-mini",
        embedding_model: str = "text-embedding-3-small",
    ):
        """
        Initialize the evaluator.
        
        Args:
            llm_model: LLM model for evaluation (can differ from production model)
            embedding_model: Embedding model for semantic similarity
        """
        self.llm_model = llm_model
        self.embedding_model = embedding_model
        
        # Core RAGAS metrics
        self.core_metrics = [
            faithfulness,           # LLM faithfulness to retrieved context
            answer_relevancy,       # Relevance of generated answer
            context_precision,      # Precision of retrieved context
            context_recall,         # Recall of retrieved context
        ]
        
        # Optional metrics (require ground truth)
        self.ground_truth_metrics = [
            answer_correctness,     # Correctness vs ground truth
            answer_similarity,      # Semantic similarity to ground truth
        ]
    
    async def evaluate_single_analysis(
        self,
        analysis_id: str,
        question: str,
        contexts: List[str],
        answer: str,
        ground_truth: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, float]:
        """
        Evaluate a single analysis.
        
        Args:
            analysis_id: Unique identifier for the analysis
            question: The query/diff text
            contexts: Retrieved context from Neo4j (list of strings)
            answer: Generated review/answer
            ground_truth: Expected answer (optional, for correctness metrics)
            metadata: Additional metadata (kb_rules, graph_edges, etc.)
        
        Returns:
            Dictionary of metric scores
        """
        logger.info(f"Evaluating analysis {analysis_id}")
        
        # Prepare dataset
        dataset_dict = {
            "question": [question],
            "contexts": [contexts],
            "answer": [answer],
        }
        
        # Add ground truth if available
        if ground_truth:
            dataset_dict["ground_truth"] = [ground_truth]
        
        dataset = Dataset.from_dict(dataset_dict)
        
        # Select metrics
        metrics = self.core_metrics.copy()
        if ground_truth:
            metrics.extend(self.ground_truth_metrics)
        
        try:
            # Run evaluation
            results = evaluate(
                dataset=dataset,
                metrics=metrics,
                llm=self._get_llm(),
                embeddings=self._get_embeddings(),
            )
            
            # Convert to dict
            scores = {
                "analysis_id": analysis_id,
                "timestamp": datetime.now(UTC).isoformat(),
                **dict(results),
            }
            
            # Add metadata
            if metadata:
                scores["metadata"] = metadata
            
            logger.info(f"Evaluation complete for {analysis_id}: {scores}")
            return scores
            
        except Exception as exc:
            logger.error(f"Evaluation failed for {analysis_id}: {exc}")
            raise
    
    async def evaluate_batch(
        self,
        analyses: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Evaluate multiple analyses in batch.
        
        Args:
            analyses: List of analysis dicts with keys:
                - question: str
                - contexts: List[str]
                - answer: str
                - ground_truth: str (optional)
        
        Returns:
            Dictionary with:
                - individual_scores: List of scores per analysis
                - aggregate_scores: Average scores across all analyses
        """
        logger.info(f"Evaluating batch of {len(analyses)} analyses")
        
        # Prepare dataset
        dataset_dict = {
            "question": [a["question"] for a in analyses],
            "contexts": [a["contexts"] for a in analyses],
            "answer": [a["answer"] for a in analyses],
        }
        
        # Check if ground truth is available for all
        has_ground_truth = all("ground_truth" in a for a in analyses)
        if has_ground_truth:
            dataset_dict["ground_truth"] = [a["ground_truth"] for a in analyses]
        
        dataset = Dataset.from_dict(dataset_dict)
        
        # Select metrics
        metrics = self.core_metrics.copy()
        if has_ground_truth:
            metrics.extend(self.ground_truth_metrics)
        
        try:
            # Run evaluation
            results = evaluate(
                dataset=dataset,
                metrics=metrics,
                llm=self._get_llm(),
                embeddings=self._get_embeddings(),
            )
            
            # Convert to DataFrame for analysis
            results_df = results.to_pandas()
            
            # Calculate aggregate scores
            aggregate_scores = {
                metric.__name__: results_df[metric.__name__].mean()
                for metric in metrics
            }
            
            # Individual scores
            individual_scores = results_df.to_dict(orient="records")
            
            return {
                "aggregate_scores": aggregate_scores,
                "individual_scores": individual_scores,
                "total_analyses": len(analyses),
                "timestamp": datetime.now(UTC).isoformat(),
            }
            
        except Exception as exc:
            logger.error(f"Batch evaluation failed: {exc}")
            raise
    
    def _get_llm(self):
        """Get LLM for evaluation."""
        from langchain_openai import ChatOpenAI
        # Can also use langchain_anthropic.ChatAnthropic
        return ChatOpenAI(model=self.llm_model)
    
    def _get_embeddings(self):
        """Get embeddings model for evaluation."""
        from langchain_openai import OpenAIEmbeddings
        return OpenAIEmbeddings(model=self.embedding_model)
    
    def save_results(
        self,
        results: Dict[str, Any],
        output_path: str,
    ) -> None:
        """
        Save evaluation results to file.
        
        Args:
            results: Evaluation results
            output_path: Path to save CSV file
        """
        import pandas as pd
        
        if "individual_scores" in results:
            # Batch results
            df = pd.DataFrame(results["individual_scores"])
        else:
            # Single result
            df = pd.DataFrame([results])
        
        df.to_csv(output_path, index=False)
        logger.info(f"Results saved to {output_path}")


# Custom metrics for GraphRAG

class GraphCoverageMetric:
    """
    Custom metric to evaluate graph traversal coverage.
    
    Measures if the GraphRAG system detected all expected code relationships
    (IMPORTS, DEPENDS_ON, CALLS edges).
    """
    
    def __init__(self):
        self.name = "graph_coverage"
    
    def __call__(
        self,
        contexts: List[str],
        expected_edges: List[str],
    ) -> float:
        """
        Calculate graph coverage score.
        
        Args:
            contexts: Retrieved context strings
            expected_edges: Expected edges (e.g., ["FileA imports FileB"])
        
        Returns:
            Coverage score (0-1)
        """
        if not expected_edges:
            return 1.0
        
        detected_edges = self._extract_edges_from_contexts(contexts)
        detected_set = set(detected_edges)
        expected_set = set(expected_edges)
        
        # Calculate recall
        correct_edges = detected_set & expected_set
        coverage = len(correct_edges) / len(expected_set)
        
        return coverage
    
    def _extract_edges_from_contexts(self, contexts: List[str]) -> List[str]:
        """Extract mentioned edges from context strings."""
        edges = []
        for ctx in contexts:
            ctx_lower = ctx.lower()
            
            # Pattern: "FileA imports FileB"
            if "imports" in ctx_lower:
                # Simple extraction (can be improved with regex)
                parts = ctx.split("imports")
                if len(parts) == 2:
                    source = parts[0].strip().split()[-1]  # Last word before "imports"
                    target = parts[1].strip().split()[0]   # First word after "imports"
                    edges.append(f"{source} imports {target}")
            
            # Pattern: "FileA depends on FileB"
            if "depends on" in ctx_lower:
                parts = ctx.split("depends on")
                if len(parts) == 2:
                    source = parts[0].strip().split()[-1]
                    target = parts[1].strip().split()[0]
                    edges.append(f"{source} depends on {target}")
            
            # Pattern: "FileA calls FileB"
            if "calls" in ctx_lower:
                parts = ctx.split("calls")
                if len(parts) == 2:
                    source = parts[0].strip().split()[-1]
                    target = parts[1].strip().split()[0]
                    edges.append(f"{source} calls {target}")
        
        return edges


class KBRuleApplicationMetric:
    """
    Custom metric to evaluate Knowledge Base rule application.
    
    Measures if KB rules present in context are actually applied/mentioned
    in the generated answer.
    """
    
    def __init__(self):
        self.name = "kb_rule_application"
    
    def __call__(
        self,
        answer: str,
        kb_rules: List[str],
    ) -> float:
        """
        Calculate KB rule application score.
        
        Args:
            answer: Generated answer/review
            kb_rules: KB rules in retrieved context
        
        Returns:
            Application score (0-1)
        """
        if not kb_rules:
            return 1.0
        
        rules_applied = 0
        for rule in kb_rules:
            if self._is_rule_applied(rule, answer):
                rules_applied += 1
        
        application_rate = rules_applied / len(kb_rules)
        return application_rate
    
    def _is_rule_applied(self, rule: str, answer: str) -> bool:
        """
        Check if a KB rule is referenced or applied in the answer.
        
        Simple keyword-based matching. Can be improved with:
        - LLM-based verification
        - Named entity recognition
        - Semantic similarity
        """
        # Extract key concepts from rule (first N words or specific patterns)
        rule_lower = rule.lower()
        answer_lower = answer.lower()
        
        # Check if rule keywords appear in answer
        rule_keywords = set(rule_lower.split()[:5])  # First 5 words
        answer_words = set(answer_lower.split())
        
        # Calculate overlap
        overlap = len(rule_keywords & answer_words)
        
        # Consider applied if at least 2 keywords match
        return overlap >= 2


# Evaluation result models

class EvaluationScore:
    """Model for storing evaluation scores."""
    
    def __init__(
        self,
        analysis_id: str,
        faithfulness: float,
        answer_relevancy: float,
        context_precision: float,
        context_recall: float,
        answer_correctness: Optional[float] = None,
        graph_coverage: Optional[float] = None,
        kb_rule_application: Optional[float] = None,
        timestamp: Optional[datetime] = None,
    ):
        self.analysis_id = analysis_id
        self.faithfulness = faithfulness
        self.answer_relevancy = answer_relevancy
        self.context_precision = context_precision
        self.context_recall = context_recall
        self.answer_correctness = answer_correctness
        self.graph_coverage = graph_coverage
        self.kb_rule_application = kb_rule_application
        self.timestamp = timestamp or datetime.now(UTC)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary."""
        return {
            "analysis_id": self.analysis_id,
            "faithfulness": self.faithfulness,
            "answer_relevancy": self.answer_relevancy,
            "context_precision": self.context_precision,
            "context_recall": self.context_recall,
            "answer_correctness": self.answer_correctness,
            "graph_coverage": self.graph_coverage,
            "kb_rule_application": self.kb_rule_application,
            "timestamp": self.timestamp.isoformat(),
        }
    
    @property
    def overall_score(self) -> float:
        """Calculate overall weighted score."""
        weights = {
            "faithfulness": 0.25,
            "answer_relevancy": 0.20,
            "context_precision": 0.20,
            "context_recall": 0.15,
            "graph_coverage": 0.10,
            "kb_rule_application": 0.10,
        }
        
        scores = {
            "faithfulness": self.faithfulness,
            "answer_relevancy": self.answer_relevancy,
            "context_precision": self.context_precision,
            "context_recall": self.context_recall,
            "graph_coverage": self.graph_coverage or 0.0,
            "kb_rule_application": self.kb_rule_application or 0.0,
        }
        
        weighted_sum = sum(
            scores[key] * weight
            for key, weight in weights.items()
        )
        
        return weighted_sum

"""
Run RAGAS evaluation on GraphRAG system.

This script loads the evaluation dataset and runs RAGAS metrics
to assess the quality of retrieval and generation.
"""

import asyncio
import logging
from pathlib import Path

from datasets import load_from_disk
import pandas as pd

from app.core.analysis.evaluation.ragas_evaluator import (
    GraphRAGEvaluator,
    GraphCoverageMetric,
    KBRuleApplicationMetric,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def run_evaluation(
    dataset_path: str = "data/ragas_eval_dataset",
    output_path: str = "data/ragas_evaluation_results.csv",
    sample_size: int = None,
):
    """
    Run RAGAS evaluation on dataset.
    
    Args:
        dataset_path: Path to dataset directory
        output_path: Path to save results CSV
        sample_size: Number of examples to evaluate (None = all)
    """
    logger.info("Starting RAGAS evaluation")
    
    # Load dataset
    logger.info(f"Loading dataset from {dataset_path}")
    dataset = load_from_disk(dataset_path)
    
    if sample_size:
        dataset = dataset.select(range(min(sample_size, len(dataset))))
    
    logger.info(f"Evaluating {len(dataset)} examples")
    
    # Initialize evaluator
    evaluator = GraphRAGEvaluator(
        llm_model="gpt-4o-mini",
        embedding_model="text-embedding-3-small",
    )
    
    # Prepare analyses for batch evaluation
    analyses = []
    for i in range(len(dataset)):
        example = dataset[i]
        analyses.append({
            "question": example["question"],
            "contexts": example["contexts"],
            "answer": example["answer"],
            "ground_truth": example.get("ground_truth", ""),
        })
    
    # Run batch evaluation
    logger.info("Running RAGAS evaluation...")
    results = await evaluator.evaluate_batch(analyses)
    
    # Display aggregate scores
    print("\n" + "="*60)
    print("RAGAS Evaluation Results")
    print("="*60)
    print(f"\nTotal analyses evaluated: {results['total_analyses']}")
    print(f"\nAggregate Scores:")
    for metric, score in results["aggregate_scores"].items():
        print(f"  {metric:.<40} {score:.4f}")
    print("="*60)
    print()
    
    # Save results
    df = pd.DataFrame(results["individual_scores"])
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    
    logger.info(f"Results saved to {output_path}")
    
    # Generate summary statistics
    print("\nDetailed Statistics:")
    print(df.describe())
    
    # Identify low-scoring examples
    print("\n⚠️  Low-scoring examples (faithfulness < 0.6):")
    low_faith = df[df["faithfulness"] < 0.6]
    if len(low_faith) > 0:
        for idx, row in low_faith.head(5).iterrows():
            print(f"  - Example {idx}: faithfulness={row['faithfulness']:.3f}")
    else:
        print("  None found ✓")
    
    print("\n⚠️  Low context precision (< 0.5):")
    low_precision = df[df["context_precision"] < 0.5]
    if len(low_precision) > 0:
        for idx, row in low_precision.head(5).iterrows():
            print(f"  - Example {idx}: context_precision={row['context_precision']:.3f}")
    else:
        print("  None found ✓")
    
    return results


async def evaluate_single_example():
    """
    Evaluate a single example (for testing).
    """
    logger.info("Running single example evaluation")
    
    evaluator = GraphRAGEvaluator()
    
    # Test example
    result = await evaluator.evaluate_single_analysis(
        analysis_id="test_001",
        question="def calculate(x): return x / 0",
        contexts=[
            "def calculate(x): return x / 0",
            "Rule: Always check for division by zero",
        ],
        answer="Bug detected: Division by zero on line 1. Add check for zero.",
        ground_truth="Critical: Division by zero error. Add validation.",
    )
    
    print("\nSingle Example Results:")
    for metric, score in result.items():
        if isinstance(score, float):
            print(f"  {metric}: {score:.4f}")
    
    return result


async def compare_configurations():
    """
    Compare different GraphRAG configurations (A/B testing).
    """
    logger.info("Running configuration comparison")
    
    # Load dataset
    dataset = load_from_disk("data/ragas_eval_dataset")
    
    # Define configurations to test
    configs = [
        {"name": "Baseline", "top_k": 20, "depth": 2, "threshold": 0.3},
        {"name": "Higher Threshold", "top_k": 20, "depth": 2, "threshold": 0.5},
        {"name": "Deeper Traversal", "top_k": 20, "depth": 3, "threshold": 0.3},
        {"name": "More Chunks", "top_k": 30, "depth": 2, "threshold": 0.3},
    ]
    
    results_comparison = []
    
    for config in configs:
        print(f"\n🧪 Testing config: {config['name']}")
        print(f"   Parameters: {config}")
        
        # Note: You would need to modify GraphRAG settings and re-run
        # For now, we'll simulate by using the existing dataset
        
        evaluator = GraphRAGEvaluator()
        
        analyses = [
            {
                "question": ex["question"],
                "contexts": ex["contexts"],
                "answer": ex["answer"],
                "ground_truth": ex.get("ground_truth", ""),
            }
            for ex in dataset.select(range(min(10, len(dataset))))
        ]
        
        results = await evaluator.evaluate_batch(analyses)
        
        config_results = {
            "config": config["name"],
            **config,
            **results["aggregate_scores"],
        }
        results_comparison.append(config_results)
        
        print(f"   Faithfulness: {results['aggregate_scores']['faithfulness']:.4f}")
        print(f"   Context Precision: {results['aggregate_scores']['context_precision']:.4f}")
    
    # Compare results
    df_comparison = pd.DataFrame(results_comparison)
    print("\n" + "="*60)
    print("Configuration Comparison")
    print("="*60)
    print(df_comparison.to_string())
    
    # Save comparison
    df_comparison.to_csv("data/ragas_config_comparison.csv", index=False)
    print("\n✅ Comparison saved to data/ragas_config_comparison.csv")
    
    return df_comparison


async def main():
    """Main execution function."""
    import sys
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "single":
            await evaluate_single_example()
        elif command == "compare":
            await compare_configurations()
        elif command == "full":
            await run_evaluation()
        else:
            print(f"Unknown command: {command}")
            print("Usage:")
            print("  python evaluate_graphrag_ragas.py single   # Test single example")
            print("  python evaluate_graphrag_ragas.py full     # Full evaluation")
            print("  python evaluate_graphrag_ragas.py compare  # Compare configurations")
    else:
        # Default: run full evaluation
        await run_evaluation()


if __name__ == "__main__":
    asyncio.run(main())

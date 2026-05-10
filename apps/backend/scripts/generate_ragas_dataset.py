"""
Generate RAGAS evaluation dataset from existing analyses.

This script extracts analyses from the database that have human feedback
and creates a HuggingFace Dataset for RAGAS evaluation.
"""

import asyncio
import logging
from pathlib import Path
from typing import List, Dict, Any

from datasets import Dataset
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.database import get_session, init_db
from app.data.models import Analysis, AnalysisFeedback
from app.settings import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RAGASDatasetGenerator:
    """Generator for RAGAS evaluation datasets."""
    
    def __init__(self, session: Session):
        self.session = session
    
    def generate_from_database(
        self,
        limit: int = 100,
        require_feedback: bool = True,
    ) -> Dataset:
        """
        Generate dataset from database analyses.
        
        Args:
            limit: Maximum number of analyses to include
            require_feedback: Only include analyses with human feedback
        
        Returns:
            HuggingFace Dataset
        """
        logger.info(f"Generating dataset from database (limit={limit})")
        
        # Query analyses with feedback
        query = select(Analysis)
        
        if require_feedback:
            query = query.join(AnalysisFeedback).filter(
                AnalysisFeedback.feedback_text.isnot(None)
            )
        
        query = query.limit(limit)
        
        analyses = self.session.execute(query).scalars().all()
        
        logger.info(f"Found {len(analyses)} analyses")
        
        # Convert to dataset format
        dataset_dict = {
            "question": [],
            "contexts": [],
            "answer": [],
            "ground_truth": [],
            "analysis_id": [],
        }
        
        for analysis in analyses:
            # Extract data
            question = self._extract_question(analysis)
            contexts = self._extract_contexts(analysis)
            answer = self._extract_answer(analysis)
            ground_truth = self._extract_ground_truth(analysis)
            
            if not all([question, contexts, answer]):
                logger.warning(f"Skipping analysis {analysis.id} - missing data")
                continue
            
            dataset_dict["question"].append(question)
            dataset_dict["contexts"].append(contexts)
            dataset_dict["answer"].append(answer)
            dataset_dict["ground_truth"].append(ground_truth or "")
            dataset_dict["analysis_id"].append(str(analysis.id))
        
        # Create dataset
        dataset = Dataset.from_dict(dataset_dict)
        
        logger.info(f"Created dataset with {len(dataset)} examples")
        return dataset
    
    def _extract_question(self, analysis: Analysis) -> str:
        """Extract question/query from analysis."""
        # Use diff text as the question
        if analysis.diff_text:
            # Truncate to reasonable length
            return analysis.diff_text[:1000]
        return ""
    
    def _extract_contexts(self, analysis: Analysis) -> List[str]:
        """Extract retrieved contexts from analysis."""
        contexts = []
        
        # Repository context
        if hasattr(analysis, 'repo_context') and analysis.repo_context:
            contexts.append(analysis.repo_context)
        
        # Knowledge base context
        if hasattr(analysis, 'kb_context') and analysis.kb_context:
            contexts.append(analysis.kb_context)
        
        # Graph context
        if hasattr(analysis, 'graph_context') and analysis.graph_context:
            # Convert dict to string
            graph_str = str(analysis.graph_context)
            contexts.append(graph_str)
        
        # Fallback: use retrieval trace
        if not contexts and hasattr(analysis, 'retrieval_trace'):
            trace = analysis.retrieval_trace
            if trace and isinstance(trace, dict):
                if 'chunks' in trace:
                    contexts = [chunk['content'] for chunk in trace['chunks'][:5]]
        
        return contexts if contexts else ["No context retrieved"]
    
    def _extract_answer(self, analysis: Analysis) -> str:
        """Extract generated answer from analysis."""
        if hasattr(analysis, 'generated_review') and analysis.generated_review:
            return analysis.generated_review
        
        if hasattr(analysis, 'summary') and analysis.summary:
            return analysis.summary
        
        return ""
    
    def _extract_ground_truth(self, analysis: Analysis) -> str:
        """Extract ground truth from human feedback."""
        # Try to get feedback
        if hasattr(analysis, 'feedback') and analysis.feedback:
            for feedback in analysis.feedback:
                if feedback.feedback_text:
                    return feedback.feedback_text
        
        # Fallback: use approved comments as ground truth
        if hasattr(analysis, 'comments') and analysis.comments:
            approved_comments = [
                c.message
                for c in analysis.comments
                if c.status == "approved"
            ]
            if approved_comments:
                return "\n".join(approved_comments)
        
        return ""
    
    def generate_synthetic_examples(
        self,
        count: int = 20,
    ) -> Dataset:
        """
        Generate synthetic test examples.
        
        Useful for testing the evaluation pipeline before having real data.
        """
        logger.info(f"Generating {count} synthetic examples")
        
        dataset_dict = {
            "question": [],
            "contexts": [],
            "answer": [],
            "ground_truth": [],
            "analysis_id": [],
        }
        
        # Example 1: Division by zero bug
        dataset_dict["question"].append(
            "def calculate_average(numbers):\n    return sum(numbers) / len(numbers)"
        )
        dataset_dict["contexts"].append([
            "def calculate_average(numbers): return sum(numbers) / len(numbers)",
            "Rule: Always check for empty lists before division",
            "Related: validator.py uses this function",
        ])
        dataset_dict["answer"].append(
            "Bug detected: Division by zero if numbers list is empty. Add check: if not numbers: return 0"
        )
        dataset_dict["ground_truth"].append(
            "Critical bug: ZeroDivisionError when numbers is empty. Should check len(numbers) > 0 first."
        )
        dataset_dict["analysis_id"].append("synthetic_001")
        
        # Example 2: Missing error handling
        dataset_dict["question"].append(
            "def fetch_user(user_id):\n    user = db.query(User).filter(User.id == user_id).first()\n    return user.name"
        )
        dataset_dict["contexts"].append([
            "def fetch_user(user_id): ...",
            "Rule: Always handle None returns from database queries",
            "Similar pattern in auth_service.py",
        ])
        dataset_dict["answer"].append(
            "Bug: AttributeError if user is None. Add check: if user is None: raise UserNotFoundError"
        )
        dataset_dict["ground_truth"].append(
            "Missing null check. Will crash if user not found. Should handle None case."
        )
        dataset_dict["analysis_id"].append("synthetic_002")
        
        # Add more synthetic examples up to count...
        
        dataset = Dataset.from_dict(dataset_dict)
        logger.info(f"Created synthetic dataset with {len(dataset)} examples")
        return dataset
    
    def save_dataset(self, dataset: Dataset, output_path: str) -> None:
        """Save dataset to disk."""
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        dataset.save_to_disk(output_path)
        logger.info(f"Dataset saved to {output_path}")


async def main():
    """Main function to generate dataset."""
    # Initialize database
    init_db()
    
    # Get session
    session = next(get_session())
    
    # Create generator
    generator = RAGASDatasetGenerator(session)
    
    # Generate from database
    try:
        dataset = generator.generate_from_database(limit=100)
        
        if len(dataset) < 10:
            logger.warning(f"Only {len(dataset)} examples from DB. Adding synthetic examples.")
            synthetic_dataset = generator.generate_synthetic_examples(count=20)
            
            # Combine datasets
            from datasets import concatenate_datasets
            dataset = concatenate_datasets([dataset, synthetic_dataset])
        
        # Save dataset
        output_path = "data/ragas_eval_dataset"
        generator.save_dataset(dataset, output_path)
        
        print(f"\n✅ Dataset created successfully!")
        print(f"   Location: {output_path}")
        print(f"   Examples: {len(dataset)}")
        print(f"\nSample example:")
        print(dataset[0])
        
    except Exception as exc:
        logger.error(f"Failed to generate dataset: {exc}", exc_info=True)
        raise


if __name__ == "__main__":
    asyncio.run(main())

# RAGAS Evaluation Setup Guide

This guide walks through setting up and running RAGAS evaluation for the GraphRAG system.

## Prerequisites

- Python 3.11+
- Poetry installed
- OpenAI API key (for LLM-based metrics)
- Database with existing analyses (or use synthetic data)

## Installation

### 1. Install Dependencies

```bash
cd apps/backend
poetry install
```

This will install:
- `ragas` - RAGAS evaluation framework
- `datasets` - HuggingFace datasets for data management
- `langchain-openai` - OpenAI integration for RAGAS metrics

### 2. Set Environment Variables

Add to your `.env` file:

```bash
# Required for RAGAS evaluation
OPENAI_API_KEY=sk-...

# Optional: Use different model for evaluation
RAGAS_LLM_MODEL=gpt-4o-mini  # default
RAGAS_EMBEDDING_MODEL=text-embedding-3-small  # default
```

## Usage

### Generate Evaluation Dataset

First, create a dataset from existing analyses:

```bash
cd apps/backend
poetry run python scripts/generate_ragas_dataset.py
```

This will:
1. Query analyses from the database
2. Extract questions, contexts, answers, and ground truth
3. Add synthetic examples if needed (< 10 real examples)
4. Save dataset to `data/ragas_eval_dataset/`

**Output:**
```
✅ Dataset created successfully!
   Location: data/ragas_eval_dataset
   Examples: 30
```

### Run Full Evaluation

Evaluate all examples in the dataset:

```bash
poetry run python scripts/evaluate_graphrag_ragas.py full
```

**Output:**
```
============================================================
RAGAS Evaluation Results
============================================================

Total analyses evaluated: 30

Aggregate Scores:
  faithfulness............................ 0.8234
  answer_relevancy........................ 0.7891
  context_precision....................... 0.7456
  context_recall.......................... 0.8012
  answer_correctness...................... 0.7678
  graph_coverage.......................... 0.6543
  kb_rule_application..................... 0.5892
============================================================
```

Results are saved to `data/ragas_evaluation_results.csv`

### Test Single Example

Quick test with one example:

```bash
poetry run python scripts/evaluate_graphrag_ragas.py single
```

### Compare Configurations

A/B test different GraphRAG settings:

```bash
poetry run python scripts/evaluate_graphrag_ragas.py compare
```

This compares configurations like:
- Baseline (top_k=20, depth=2, threshold=0.3)
- Higher Threshold (threshold=0.5)
- Deeper Traversal (depth=3)
- More Chunks (top_k=30)

Results saved to `data/ragas_config_comparison.csv`

## Understanding the Metrics

### Standard RAGAS Metrics

| Metric | Description | Good Score |
|--------|-------------|------------|
| **Faithfulness** | How accurate is the answer based on the retrieved context? | > 0.8 |
| **Answer Relevancy** | How relevant is the answer to the question? | > 0.7 |
| **Context Precision** | How precise are the retrieved contexts? | > 0.7 |
| **Context Recall** | Were all relevant contexts retrieved? | > 0.75 |
| **Answer Correctness** | Semantic similarity to ground truth | > 0.7 |

### Custom GraphRAG Metrics

| Metric | Description | Good Score |
|--------|-------------|------------|
| **Graph Coverage** | % of contexts mentioning dependencies/relationships | > 0.6 |
| **KB Rule Application** | % of contexts from knowledge base rules | > 0.5 |

## Interpreting Results

### Good Performance
```
faithfulness: 0.85          ✅ High accuracy
context_precision: 0.78     ✅ Relevant chunks retrieved
graph_coverage: 0.72        ✅ Good graph utilization
kb_rule_application: 0.68   ✅ Rules being applied
```

### Poor Performance
```
faithfulness: 0.45          ⚠️  Hallucinations detected
context_precision: 0.32     ⚠️  Too many irrelevant chunks
graph_coverage: 0.15        ⚠️  Graph underutilized
kb_rule_application: 0.08   ⚠️  Knowledge base not used
```

## Troubleshooting

### No Analyses Found

**Problem:** Dataset generation finds 0 analyses.

**Solution:**
1. Check database connection: `DATABASE_URL` in `.env`
2. Verify analyses exist: `SELECT COUNT(*) FROM analyses;`
3. Run analysis first: `POST /api/v1/analyze`
4. Use synthetic data: Script auto-generates if < 10 examples

### OpenAI API Errors

**Problem:** `RateLimitError` or `AuthenticationError`

**Solution:**
1. Verify API key: `echo $OPENAI_API_KEY`
2. Check rate limits on OpenAI dashboard
3. Use smaller sample: `--sample-size 10`
4. Switch to cheaper model: `RAGAS_LLM_MODEL=gpt-4o-mini`

### Low Scores Across All Metrics

**Problem:** All scores < 0.5

**Possible Causes:**
1. **Poor retrieval:** GraphRAG not finding relevant chunks
   - Check `top_k` and `similarity_threshold` settings
   - Verify vector embeddings are correct
2. **Bad generation:** LLM not using context well
   - Review prompt templates
   - Check LLM temperature settings
3. **Dataset quality:** Ground truth is poor/missing
   - Add human feedback to analyses
   - Improve feedback quality

### Graph Coverage Always Low

**Problem:** `graph_coverage` score < 0.3

**Solution:**
1. Check Neo4j is running and populated
2. Verify graph traversal is enabled
3. Increase traversal depth: `GRAPH_TRAVERSAL_DEPTH=3`
4. Check relationship types exist in graph

## Dataset Format

The generated dataset follows this structure:

```python
{
    "question": "def calculate_average(numbers):\n    return sum(numbers) / len(numbers)",
    "contexts": [
        "def calculate_average(numbers): return sum(numbers) / len(numbers)",
        "Rule: Always check for empty lists before division",
        "Related: validator.py uses this function"
    ],
    "answer": "Bug detected: Division by zero if numbers list is empty. Add check: if not numbers: return 0",
    "ground_truth": "Critical bug: ZeroDivisionError when numbers is empty. Should check len(numbers) > 0 first.",
    "analysis_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Evaluate GraphRAG

on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly
  workflow_dispatch:

jobs:
  evaluate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: |
          cd apps/backend
          poetry install
      
      - name: Run evaluation
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: |
          cd apps/backend
          poetry run python scripts/evaluate_graphrag_ragas.py full
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: ragas-results
          path: apps/backend/data/ragas_evaluation_results.csv
```

## Next Steps

1. **Baseline Evaluation:** Run full evaluation on current system
2. **Identify Weak Points:** Find low-scoring examples
3. **Iterative Improvement:**
   - Tune retrieval parameters (top_k, threshold)
   - Improve graph traversal logic
   - Enhance prompt templates
   - Add more knowledge base rules
4. **Re-evaluate:** Measure improvements
5. **Continuous Monitoring:** Set up weekly evaluations

## References

- [RAGAS Documentation](https://docs.ragas.io/)
- [RAGAS Evaluation Plan](./RAGAS_EVALUATION_PLAN.md)
- [GraphRAG Implementation](../apps/backend/app/core/rag_agents/)

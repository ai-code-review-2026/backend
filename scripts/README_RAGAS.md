# RAGAS Evaluation Scripts

This directory contains scripts for evaluating the GraphRAG system using RAGAS metrics.

## Scripts

### 1. `generate_ragas_dataset.py`

Generates evaluation datasets from existing analyses.

**Features:**
- Extracts questions, contexts, answers from database
- Includes human feedback as ground truth
- Generates synthetic examples for testing
- Saves to HuggingFace Dataset format

**Usage:**
```bash
poetry run python scripts/generate_ragas_dataset.py
```

**Output:**
- `data/ragas_eval_dataset/` - HuggingFace dataset directory

### 2. `evaluate_graphrag_ragas.py`

Runs RAGAS evaluation on the dataset.

**Features:**
- Evaluates all RAGAS metrics (faithfulness, relevancy, etc.)
- Custom GraphRAG metrics (graph coverage, KB usage)
- Batch processing for efficiency
- Detailed statistics and low-score identification

**Usage:**
```bash
# Full evaluation
poetry run python scripts/evaluate_graphrag_ragas.py full

# Test single example
poetry run python scripts/evaluate_graphrag_ragas.py single

# Compare configurations
poetry run python scripts/evaluate_graphrag_ragas.py compare
```

**Output:**
- `data/ragas_evaluation_results.csv` - Individual scores per example
- Console output with aggregate statistics

## Quick Start

### 1. Install dependencies
```bash
cd apps/backend
poetry install
```

### 2. Set environment variables
```bash
export OPENAI_API_KEY=sk-...
```

### 3. Generate dataset
```bash
poetry run python scripts/generate_ragas_dataset.py
```

### 4. Run evaluation
```bash
poetry run python scripts/evaluate_graphrag_ragas.py full
```

## Metrics Explained

### Standard RAGAS Metrics

- **Faithfulness** (0-1): Measures if the answer is grounded in the retrieved contexts
  - Uses LLM to check for hallucinations
  - Good: > 0.8

- **Answer Relevancy** (0-1): Measures if the answer addresses the question
  - Compares answer embeddings to question embeddings
  - Good: > 0.7

- **Context Precision** (0-1): Measures precision of retrieved contexts
  - Checks if top-ranked contexts are most relevant
  - Good: > 0.7

- **Context Recall** (0-1): Measures if all relevant contexts were retrieved
  - Requires ground truth to compare against
  - Good: > 0.75

- **Answer Correctness** (0-1): Semantic similarity to ground truth
  - Combines factual overlap and semantic similarity
  - Good: > 0.7

### Custom GraphRAG Metrics

- **Graph Coverage** (0-1): Percentage of contexts mentioning code dependencies
  - Measures how well the graph structure is utilized
  - Detects keywords: "depends on", "imports", "calls", "inherits", "implements"
  - Good: > 0.6

- **KB Rule Application** (0-1): Percentage of contexts from knowledge base
  - Measures if KB rules are being retrieved and used
  - Detects rule patterns and KB metadata
  - Good: > 0.5

## Interpreting Results

### Example Output

```
============================================================
RAGAS Evaluation Results
============================================================

Total analyses evaluated: 50

Aggregate Scores:
  faithfulness............................ 0.8234
  answer_relevancy........................ 0.7891
  context_precision....................... 0.7456
  context_recall.......................... 0.8012
  answer_correctness...................... 0.7678
  graph_coverage.......................... 0.6543
  kb_rule_application..................... 0.5892
============================================================

⚠️  Low-scoring examples (faithfulness < 0.6):
  - Example 12: faithfulness=0.542
  - Example 28: faithfulness=0.481

⚠️  Low context precision (< 0.5):
  - Example 15: context_precision=0.423
```

### What to Look For

**Good System:**
- All metrics > 0.7 (except custom metrics > 0.5)
- Few low-scoring examples
- Consistent performance across different code types

**Needs Improvement:**
- Faithfulness < 0.6 → Hallucinations, improve prompt/retrieval
- Context Precision < 0.5 → Too many irrelevant chunks, tune similarity threshold
- Graph Coverage < 0.3 → Graph underutilized, check traversal logic
- KB Rule Application < 0.3 → Rules not retrieved, check vector search

## Configuration Comparison

The `compare` command tests different GraphRAG configurations:

```bash
poetry run python scripts/evaluate_graphrag_ragas.py compare
```

**Tested Configurations:**
1. **Baseline**: top_k=20, depth=2, threshold=0.3
2. **Higher Threshold**: threshold=0.5 (more selective)
3. **Deeper Traversal**: depth=3 (more graph exploration)
4. **More Chunks**: top_k=30 (broader retrieval)

**Output:**
```
============================================================
Configuration Comparison
============================================================
  config              top_k  depth  threshold  faithfulness  context_precision
0 Baseline           20     2      0.3        0.823         0.745
1 Higher Threshold   20     2      0.5        0.847         0.812
2 Deeper Traversal   20     3      0.3        0.831         0.738
3 More Chunks        30     2      0.3        0.819         0.701
```

## Continuous Monitoring

### Weekly Evaluation

Set up a cron job or GitHub Action:

```bash
# Cron example (every Sunday at midnight)
0 0 * * 0 cd /path/to/project && poetry run python scripts/evaluate_graphrag_ragas.py full
```

### Track Over Time

```python
import pandas as pd
import matplotlib.pyplot as plt

# Load multiple evaluation runs
df1 = pd.read_csv("data/ragas_results_2024_01.csv")
df2 = pd.read_csv("data/ragas_results_2024_02.csv")

# Compare aggregate scores
print(df1["faithfulness"].mean())
print(df2["faithfulness"].mean())

# Plot trends
plt.plot([df1["faithfulness"].mean(), df2["faithfulness"].mean()])
plt.title("Faithfulness Over Time")
plt.show()
```

## Troubleshooting

### Dataset Generation Issues

**Problem:** Only synthetic examples generated

**Cause:** No analyses in database or missing feedback

**Solution:**
1. Check database: `SELECT COUNT(*) FROM analyses;`
2. Add analyses via API: `POST /api/v1/analyze`
3. Add human feedback to existing analyses

### Evaluation Hangs

**Problem:** Script appears frozen

**Cause:** LLM API calls can be slow for large batches

**Solution:**
1. Use smaller sample: Edit script to limit dataset size
2. Check API status: Visit OpenAI status page
3. Enable verbose logging: Add `logging.basicConfig(level=logging.DEBUG)`

### All Scores Are 0

**Problem:** All metrics return 0.0

**Cause:** Missing or empty fields in dataset

**Solution:**
1. Verify dataset: `dataset[0]` should have all fields
2. Check contexts: Should be list of non-empty strings
3. Check answer: Should be non-empty string

## Files Structure

```
apps/backend/
├── app/core/analysis/evaluation/
│   └── ragas_evaluator.py          # GraphRAGEvaluator class
├── scripts/
│   ├── generate_ragas_dataset.py   # Dataset generation
│   └── evaluate_graphrag_ragas.py  # Evaluation runner
└── data/
    ├── ragas_eval_dataset/         # Generated dataset
    ├── ragas_evaluation_results.csv # Full results
    └── ragas_config_comparison.csv  # A/B test results
```

## Next Steps

1. **Generate baseline dataset** with real analyses
2. **Run initial evaluation** to establish baseline metrics
3. **Identify improvement areas** from low-scoring examples
4. **Iterate and improve**:
   - Tune retrieval parameters
   - Enhance graph traversal
   - Improve prompts
   - Add more KB rules
5. **Re-evaluate and compare** against baseline
6. **Set up continuous monitoring** with scheduled runs

## References

- [RAGAS Setup Guide](../../docs/RAGAS_SETUP.md)
- [RAGAS Evaluation Plan](../../docs/RAGAS_EVALUATION_PLAN.md)
- [RAGAS Documentation](https://docs.ragas.io/)

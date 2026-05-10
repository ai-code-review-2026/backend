# 📊 Plan d'Évaluation GraphRAG avec RAGAS

## Vue d'ensemble

Ce document décrit comment évaluer votre système GraphRAG avec la bibliothèque **RAGAS** (Retrieval-Augmented Generation Assessment).

## Architecture GraphRAG actuelle

Votre système utilise:
- **Retrieval hybride**: Vector search (Neo4j) + Graph traversal + KB retrieval
- **Embedding**: `all-MiniLM-L6-v2` (384 dimensions)
- **LLM**: Ollama/Anthropic/OpenAI
- **Re-ranking**: Cross-encoder + optional LLM judge
- **Knowledge Base**: Rules et documents avec priorité

---

## Phase 1: Installation et Configuration RAGAS

### 1.1 Installation

```bash
cd apps/backend
poetry add ragas langchain-community langchain-openai datasets
```

### 1.2 Dépendances requises

```python
# pyproject.toml ou requirements.txt
ragas = "^0.2.0"
langchain = "^0.3.0"
langchain-community = "^0.3.0"
langchain-openai = "^0.2.0"  # ou langchain-anthropic
datasets = "^3.0.0"
pandas = "^2.0.0"
```

---

## Phase 2: Métriques RAGAS Adaptées au GraphRAG

### 2.1 Métriques pour le **Retrieval** (Context Quality)

| Métrique | Description | Utilité pour GraphRAG |
|----------|-------------|----------------------|
| **Context Precision** | Précision du contexte récupéré | Mesure si les chunks Neo4j sont pertinents |
| **Context Recall** | Rappel du contexte | Vérifie que tous les chunks nécessaires sont trouvés |
| **Context Relevancy** | Pertinence globale du contexte | Évalue la qualité du graph traversal |
| **Context Entity Recall** | Rappel des entités mentionnées | Vérifie que les dépendances/imports sont détectés |

### 2.2 Métriques pour la **Generation** (Answer Quality)

| Métrique | Description | Utilité pour GraphRAG |
|----------|-------------|----------------------|
| **Faithfulness** | Fidélité aux sources | Vérifie que le LLM s'appuie sur le code récupéré |
| **Answer Relevancy** | Pertinence de la réponse | Évalue si la review est utile |
| **Answer Correctness** | Correction de la réponse | Compare avec ground truth (human reviews) |
| **Answer Similarity** | Similarité sémantique | Mesure la cohérence avec références |

### 2.3 Métriques GraphRAG spécifiques (Custom)

| Métrique Custom | Description | Implémentation |
|-----------------|-------------|----------------|
| **Graph Coverage** | % des dépendances détectées | Compare les edges trouvés vs attendus |
| **KB Rule Application** | % des règles KB appliquées | Vérifie si les KB rules sont utilisées |
| **Multi-hop Accuracy** | Précision du traversal multi-hop | Évalue la qualité du graph traversal (depth 2) |
| **Code Relationship Accuracy** | Précision des relations (IMPORTS, DEPENDS_ON) | Vérifie les edges identifiés |

---

## Phase 3: Création du Dataset de Test

### 3.1 Structure du Dataset

```python
# Format RAGAS
dataset = {
    "question": [...]  # Query (diff description)
    "answer": [...]    # LLM-generated review
    "contexts": [...]  # Retrieved chunks from Neo4j + graph
    "ground_truth": [...] # Expected answer (human review)
}
```

### 3.2 Exemples de Test Cases

#### Exemple 1: Code Review Simple

```python
{
    "question": "Review this Python function for potential bugs",
    "contexts": [
        "def process_data(data):\n    return data / 0",  # Retrieved chunk
        "Rule: Division by zero must be checked",        # KB rule
        "Related file: data_validator.py imports this"   # Graph context
    ],
    "ground_truth": "Critical bug: Division by zero on line 2. Add zero check.",
    "answer": "<LLM generated review>"
}
```

#### Exemple 2: Graph Relationship Detection

```python
{
    "question": "Analyze impact of changing DatabaseConnection class",
    "contexts": [
        "class DatabaseConnection: ...",                 # Modified file
        "UserService imports DatabaseConnection",        # Graph: IMPORTS edge
        "AuthService depends on DatabaseConnection",     # Graph: DEPENDS_ON edge
        "Rule: Breaking changes require version bump"    # KB rule
    ],
    "ground_truth": "Breaking change detected. 2 services affected: UserService, AuthService. Version bump required.",
    "answer": "<LLM generated review>"
}
```

### 3.3 Sources pour créer le Dataset

1. **Historique d'analyses existantes**
   ```python
   # Pull from database
   SELECT analysis_id, diff_text, generated_review, human_feedback
   FROM analyses
   WHERE human_feedback IS NOT NULL
   ```

2. **Pull Requests GitHub avec reviews**
   ```python
   # Via GitHub API
   GET /repos/{owner}/{repo}/pulls/{pr_number}/reviews
   ```

3. **Synthetic Data Generation**
   ```python
   # Créer des scénarios de test avec:
   # - Bugs connus
   # - Violations de règles KB
   # - Changements avec impact sur dependencies
   ```

### 3.4 Script de Génération du Dataset

```python
# apps/backend/scripts/generate_ragas_dataset.py

import asyncio
from app.data.database import get_session
from app.data.repos.analysis_repo import AnalysisRepository
from datasets import Dataset

async def generate_dataset():
    session = next(get_session())
    repo = AnalysisRepository(session)
    
    # Get analyses with feedback
    analyses = repo.get_analyses_with_feedback(limit=100)
    
    dataset_dict = {
        "question": [],
        "contexts": [],
        "answer": [],
        "ground_truth": [],
    }
    
    for analysis in analyses:
        dataset_dict["question"].append(analysis.diff_text[:500])
        dataset_dict["contexts"].append([
            analysis.repo_context,
            analysis.kb_context,
            analysis.graph_context,
        ])
        dataset_dict["answer"].append(analysis.generated_review)
        dataset_dict["ground_truth"].append(analysis.human_feedback)
    
    # Convert to HuggingFace Dataset
    dataset = Dataset.from_dict(dataset_dict)
    dataset.save_to_disk("data/ragas_eval_dataset")
    
    return dataset

if __name__ == "__main__":
    asyncio.run(generate_dataset())
```

---

## Phase 4: Implémentation de l'Évaluation RAGAS

### 4.1 Script d'Évaluation Principal

```python
# apps/backend/scripts/evaluate_graphrag_ragas.py

from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    answer_correctness,
)
from datasets import load_from_disk
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

# Configuration
EVALUATION_MODEL = "gpt-4o-mini"  # Pour évaluer (peut différer du LLM de prod)
EMBEDDING_MODEL = "text-embedding-3-small"

async def evaluate_graphrag():
    # 1. Charger le dataset
    dataset = load_from_disk("data/ragas_eval_dataset")
    
    # 2. Configurer RAGAS
    llm = ChatOpenAI(model=EVALUATION_MODEL)
    embeddings = OpenAIEmbeddings(model=EMBEDDING_MODEL)
    
    # 3. Définir les métriques
    metrics = [
        faithfulness,           # Le LLM est-il fidèle aux sources?
        answer_relevancy,       # La review est-elle pertinente?
        context_precision,      # Les chunks Neo4j sont-ils précis?
        context_recall,         # Tous les chunks nécessaires sont-ils récupérés?
        answer_correctness,     # La review est-elle correcte vs ground truth?
    ]
    
    # 4. Lancer l'évaluation
    results = evaluate(
        dataset=dataset,
        metrics=metrics,
        llm=llm,
        embeddings=embeddings,
    )
    
    # 5. Afficher les résultats
    print(results)
    results_df = results.to_pandas()
    results_df.to_csv("data/ragas_evaluation_results.csv")
    
    return results

if __name__ == "__main__":
    import asyncio
    asyncio.run(evaluate_graphrag())
```

### 4.2 Métriques Custom pour GraphRAG

```python
# apps/backend/app/core/analysis/evaluation/custom_metrics.py

from ragas.metrics import Metric
from ragas.metrics._faithfulness import HasSegmentMethod
from typing import List

class GraphCoverageMetric(Metric):
    """Mesure si le graph traversal détecte toutes les dépendances attendues."""
    
    name = "graph_coverage"
    
    def __call__(
        self,
        contexts: List[str],
        ground_truth_edges: List[str],
    ) -> float:
        """
        Args:
            contexts: Retrieved context including graph relationships
            ground_truth_edges: Expected edges (e.g., ["FileA -> FileB", "FileB -> FileC"])
        
        Returns:
            Coverage score (0-1)
        """
        detected_edges = self._extract_edges_from_context(contexts)
        
        # Calculate recall
        detected_set = set(detected_edges)
        ground_truth_set = set(ground_truth_edges)
        
        if not ground_truth_set:
            return 1.0
        
        correct_edges = detected_set & ground_truth_set
        coverage = len(correct_edges) / len(ground_truth_set)
        
        return coverage
    
    def _extract_edges_from_context(self, contexts: List[str]) -> List[str]:
        """Extract edges mentioned in context."""
        edges = []
        for ctx in contexts:
            if "imports" in ctx.lower():
                # Parse "FileA imports FileB"
                # Add to edges list
                pass
            if "depends on" in ctx.lower():
                # Parse "FileA depends on FileB"
                pass
        return edges


class KBRuleApplicationMetric(Metric):
    """Mesure si les règles KB sont appliquées dans la review."""
    
    name = "kb_rule_application"
    
    def __call__(
        self,
        answer: str,
        kb_rules: List[str],
    ) -> float:
        """
        Args:
            answer: Generated review
            kb_rules: KB rules in context
        
        Returns:
            Application score (0-1)
        """
        if not kb_rules:
            return 1.0
        
        rules_applied = 0
        for rule in kb_rules:
            # Check if rule is mentioned or applied in answer
            if self._is_rule_applied(rule, answer):
                rules_applied += 1
        
        return rules_applied / len(kb_rules)
    
    def _is_rule_applied(self, rule: str, answer: str) -> bool:
        """Check if a KB rule is referenced or applied in the answer."""
        # Simple keyword matching (can be improved with LLM)
        rule_keywords = rule.lower().split()[:3]  # First 3 words
        return any(kw in answer.lower() for kw in rule_keywords)
```

### 4.3 Intégration avec le Système

```python
# apps/backend/app/core/analysis/evaluation/ragas_evaluator.py

from typing import Dict, Any, List
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision
from .custom_metrics import GraphCoverageMetric, KBRuleApplicationMetric
from datasets import Dataset

class GraphRAGEvaluator:
    """Évaluateur RAGAS pour le système GraphRAG."""
    
    def __init__(self):
        self.metrics = [
            faithfulness,
            answer_relevancy,
            context_precision,
            GraphCoverageMetric(),
            KBRuleApplicationMetric(),
        ]
    
    async def evaluate_analysis(
        self,
        analysis_id: str,
        diff_text: str,
        retrieved_contexts: List[str],
        generated_review: str,
        ground_truth: str = None,
        kb_rules: List[str] = None,
        expected_edges: List[str] = None,
    ) -> Dict[str, float]:
        """
        Évalue une seule analyse.
        
        Args:
            analysis_id: ID de l'analyse
            diff_text: Code diff (question)
            retrieved_contexts: Contextes récupérés depuis Neo4j
            generated_review: Review générée par le LLM
            ground_truth: Review attendue (optionnel)
            kb_rules: Règles KB utilisées
            expected_edges: Edges attendus dans le graphe
        
        Returns:
            Dict avec les scores de chaque métrique
        """
        # Prepare dataset
        dataset_dict = {
            "question": [diff_text],
            "contexts": [retrieved_contexts],
            "answer": [generated_review],
        }
        
        if ground_truth:
            dataset_dict["ground_truth"] = [ground_truth]
        
        dataset = Dataset.from_dict(dataset_dict)
        
        # Evaluate
        results = evaluate(dataset=dataset, metrics=self.metrics)
        
        # Add custom metrics
        if kb_rules:
            kb_score = KBRuleApplicationMetric()(
                answer=generated_review,
                kb_rules=kb_rules,
            )
            results["kb_rule_application"] = kb_score
        
        if expected_edges:
            graph_score = GraphCoverageMetric()(
                contexts=retrieved_contexts,
                ground_truth_edges=expected_edges,
            )
            results["graph_coverage"] = graph_score
        
        return dict(results)
    
    async def evaluate_batch(
        self,
        analyses: List[Dict[str, Any]],
    ) -> Dict[str, float]:
        """Évalue un batch d'analyses et retourne les moyennes."""
        # Prepare dataset
        dataset_dict = {
            "question": [a["diff_text"] for a in analyses],
            "contexts": [a["contexts"] for a in analyses],
            "answer": [a["generated_review"] for a in analyses],
            "ground_truth": [a.get("ground_truth", "") for a in analyses],
        }
        
        dataset = Dataset.from_dict(dataset_dict)
        
        # Evaluate
        results = evaluate(dataset=dataset, metrics=self.metrics)
        
        return dict(results)
```

---

## Phase 5: Pipeline d'Évaluation Continue

### 5.1 Évaluation Automatique des Nouvelles Analyses

```python
# apps/backend/app/workers/tasks/evaluate_analysis.py

from celery import Task
from app.core.analysis.evaluation.ragas_evaluator import GraphRAGEvaluator
from app.data.repos.analysis_repo import AnalysisRepository

class EvaluateAnalysisTask(Task):
    """Tâche Celery pour évaluer une analyse avec RAGAS."""
    
    name = "evaluate_analysis"
    
    def run(self, analysis_id: str):
        # Load analysis
        repo = AnalysisRepository(session)
        analysis = repo.get_by_id(analysis_id)
        
        # Evaluate with RAGAS
        evaluator = GraphRAGEvaluator()
        scores = evaluator.evaluate_analysis(
            analysis_id=analysis_id,
            diff_text=analysis.diff_text,
            retrieved_contexts=analysis.contexts,
            generated_review=analysis.generated_review,
            kb_rules=analysis.kb_rules,
        )
        
        # Save scores
        repo.update_evaluation_scores(analysis_id, scores)
        
        return scores
```

### 5.2 Endpoint API pour Évaluation

```python
# apps/backend/app/api/http/evaluation.py

from fastapi import APIRouter, Depends
from app.core.analysis.evaluation.ragas_evaluator import GraphRAGEvaluator

router = APIRouter(prefix="/api/v1/evaluation", tags=["evaluation"])

@router.post("/analyze/{analysis_id}")
async def evaluate_analysis(
    analysis_id: str,
    principal: AuthenticatedPrincipal = Depends(require_auth),
):
    """Évalue une analyse avec RAGAS."""
    evaluator = GraphRAGEvaluator()
    
    # Get analysis
    analysis = analysis_repo.get_by_id(analysis_id)
    
    # Evaluate
    scores = await evaluator.evaluate_analysis(
        analysis_id=analysis_id,
        diff_text=analysis.diff_text,
        retrieved_contexts=analysis.contexts,
        generated_review=analysis.generated_review,
    )
    
    return {"analysis_id": analysis_id, "scores": scores}
```

---

## Phase 6: Rapports et Visualisation

### 6.1 Dashboard d'Évaluation

```python
# apps/backend/scripts/generate_evaluation_report.py

import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path

def generate_report(results_csv: str, output_dir: str):
    """Génère un rapport d'évaluation avec graphiques."""
    
    # Load results
    df = pd.read_csv(results_csv)
    
    # Calculate averages
    avg_scores = df[["faithfulness", "answer_relevancy", "context_precision"]].mean()
    
    print("=== RAGAS Evaluation Results ===")
    print(avg_scores)
    print("=================================")
    
    # Plot metrics
    fig, axes = plt.subplots(2, 2, figsize=(12, 10))
    
    # Faithfulness distribution
    axes[0, 0].hist(df["faithfulness"], bins=20, color="skyblue", edgecolor="black")
    axes[0, 0].set_title("Faithfulness Distribution")
    axes[0, 0].set_xlabel("Score")
    axes[0, 0].set_ylabel("Count")
    
    # Answer Relevancy
    axes[0, 1].hist(df["answer_relevancy"], bins=20, color="lightgreen", edgecolor="black")
    axes[0, 1].set_title("Answer Relevancy Distribution")
    
    # Context Precision
    axes[1, 0].hist(df["context_precision"], bins=20, color="coral", edgecolor="black")
    axes[1, 0].set_title("Context Precision Distribution")
    
    # Scores over time (if timestamp available)
    if "timestamp" in df.columns:
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df.set_index("timestamp").rolling(window=10).mean().plot(ax=axes[1, 1])
        axes[1, 1].set_title("Scores Trend (Rolling Average)")
    
    plt.tight_layout()
    plt.savefig(f"{output_dir}/ragas_evaluation_report.png")
    
    print(f"Report saved to {output_dir}/ragas_evaluation_report.png")

if __name__ == "__main__":
    generate_report(
        results_csv="data/ragas_evaluation_results.csv",
        output_dir="data/reports",
    )
```

### 6.2 Frontend Dashboard (Next.js)

```typescript
// apps/dashboard/app/dashboard/evaluation/page.tsx

export default function EvaluationDashboard() {
  const { data: scores } = useSWR("/api/dashboard/evaluation/scores");
  
  return (
    <div>
      <h1>GraphRAG Evaluation (RAGAS)</h1>
      
      <div className="grid grid-cols-3 gap-4">
        <MetricCard
          title="Faithfulness"
          score={scores?.faithfulness}
          description="LLM fidélité aux sources"
        />
        <MetricCard
          title="Context Precision"
          score={scores?.context_precision}
          description="Qualité du retrieval Neo4j"
        />
        <MetricCard
          title="Graph Coverage"
          score={scores?.graph_coverage}
          description="Dépendances détectées"
        />
      </div>
      
      <Chart data={scores?.history} />
    </div>
  );
}
```

---

## Phase 7: Optimisation Basée sur les Résultats

### 7.1 Analyse des Métriques

| Métrique faible | Cause probable | Action corrective |
|-----------------|----------------|-------------------|
| **Context Precision < 0.7** | Retrieval Neo4j trop large | Augmenter `min_similarity_threshold` |
| **Context Recall < 0.6** | Retrieval manque des chunks | Augmenter `top_k`, améliorer graph traversal depth |
| **Faithfulness < 0.8** | LLM hallucine | Améliorer prompt, ajouter contraintes |
| **Graph Coverage < 0.7** | Graph traversal incomplet | Augmenter `max_depth` (2 → 3) |
| **KB Rule Application < 0.8** | KB rules ignorées | Renforcer priorité KB dans prompt |

### 7.2 A/B Testing de Configurations

```python
# Test différentes configurations
configs = [
    {"top_k": 20, "depth": 2, "threshold": 0.3},  # Baseline
    {"top_k": 30, "depth": 2, "threshold": 0.4},  # Higher threshold
    {"top_k": 20, "depth": 3, "threshold": 0.3},  # Deeper traversal
]

for config in configs:
    results = evaluate_with_config(config)
    print(f"Config {config}: {results}")
```

---

## Phase 8: Checklist de Déploiement

- [ ] Installer RAGAS et dépendances
- [ ] Créer dataset de test (min 50 exemples)
- [ ] Implémenter métriques custom (Graph Coverage, KB Rule Application)
- [ ] Lancer première évaluation baseline
- [ ] Analyser les résultats et identifier faiblesses
- [ ] Optimiser configuration GraphRAG
- [ ] Intégrer évaluation continue (Celery task)
- [ ] Créer dashboard d'évaluation frontend
- [ ] Mettre en place A/B testing
- [ ] Documenter les métriques et seuils

---

## Résumé

Ce plan vous permet d'évaluer votre GraphRAG avec RAGAS de manière:

1. **Systématique**: Métriques standardisées + custom
2. **Continue**: Évaluation automatique de chaque analyse
3. **Actionnable**: Rapports avec recommandations d'amélioration
4. **Évolutive**: A/B testing et optimisation basée sur données

**Prochaine étape**: Créer le dataset de test initial!

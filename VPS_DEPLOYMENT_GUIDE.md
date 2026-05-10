# Déploiement VPS - Guide de Mise à Jour

## Changements Majeurs (21,000+ lignes)

Ce commit ajoute une plateforme LLMOps complète avec:
- **LLM Gateway** multi-providers (Ollama, Anthropic, OpenAI, Azure)
- **Système multi-agents** (6 agents spécialisés)
- **Observabilité complète** (PostgreSQL traces, Prometheus, Langfuse, RAGAS)
- **4 dashboards frontend** (Models Hub, Prompt Observatory, GraphRAG Explorer, AI Review Center)

## Étapes de Déploiement sur VPS

### 1. Connexion au VPS et Pull des Changements

```bash
# Se connecter au VPS
ssh votre_user@votre_vps_ip

# Aller dans le répertoire du projet
cd /path/to/ai-code-review-platform

# Vérifier la branche actuelle
git branch

# Pull les derniers changements
git pull origin main
```

### 2. Configuration des Variables d'Environnement

Ajoutez ces variables dans votre fichier `.env` à la racine du projet:

```bash
# LLM Gateway Configuration
LLM_GATEWAY_ENABLED=true
LLM_PROVIDER=ollama  # ou anthropic, openai, azure

# Ollama (local, gratuit)
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=deepseek-coder:6.7b

# Anthropic Claude (optionnel, PRIMARY pour production)
ANTHROPIC_API_KEY=your_anthropic_key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
ANTHROPIC_MAX_TOKENS=8192
ANTHROPIC_TEMPERATURE=0.1

# OpenAI GPT (optionnel)
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o
OPENAI_MAX_TOKENS=4096

# Azure OpenAI (optionnel, pour entreprise)
AZURE_OPENAI_API_KEY=your_azure_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4
AZURE_OPENAI_API_VERSION=2024-02-01

# Rate Limiting
RATE_LIMIT_ANTHROPIC_PER_MINUTE=50
RATE_LIMIT_OPENAI_PER_MINUTE=60
RATE_LIMIT_OLLAMA_PER_MINUTE=0  # unlimited
RATE_LIMIT_PER_USER_PER_HOUR=100

# Prompt Cache
PROMPT_CACHE_ENABLED=true
PROMPT_CACHE_TTL_SECONDS=3600
PROMPT_CACHE_MAX_SIZE=10000

# Observability - Langfuse (optionnel)
LANGFUSE_ENABLED=false  # mettre true si vous voulez LLMOps dashboard
LANGFUSE_PUBLIC_KEY=your_langfuse_public_key
LANGFUSE_SECRET_KEY=your_langfuse_secret_key
LANGFUSE_HOST=http://localhost:3100

# Observability - OpenTelemetry (optionnel)
OTEL_ENABLED=false  # mettre true pour distributed tracing
OTEL_SERVICE_NAME=devora-backend
OTEL_EXPORTER_TYPE=otlp  # otlp, jaeger, zipkin, console
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# LLM Traces & Metrics
LLM_TRACES_RETENTION_DAYS=90
LLM_METRICS_AGGREGATION_INTERVAL_MINUTES=60

# Multi-Agent System
MULTI_AGENT_ENABLED=true
MULTI_AGENT_PARALLEL_EXECUTION=true
MULTI_AGENT_TIMEOUT_SECONDS=300
MULTI_AGENT_MAX_FINDINGS_PER_AGENT=50
MULTI_AGENT_DEDUPLICATION_ENABLED=true
MULTI_AGENT_SIMILARITY_THRESHOLD=0.85

# RAGAS Evaluation
RAGAS_EVALUATION_ENABLED=true
RAGAS_COMPUTE_ON_TRACE=true  # évaluer automatiquement après chaque trace
RAGAS_USE_OLLAMA=true  # utiliser Ollama local (gratuit, CONFIDENTIAL)
RAGAS_BATCH_SIZE=10

# Backend API URL (pour Next.js)
BACKEND_API_URL=http://localhost:8000

# Dashboard Timeouts
DASHBOARD_BACKEND_FETCH_TIMEOUT_MS=15000
DASHBOARD_BACKEND_WRITE_TIMEOUT_MS=30000
```

### 3. Installation des Nouvelles Dépendances Backend

```bash
cd apps/backend

# Installer les nouvelles dépendances Python
poetry install

# Les nouvelles dépendances incluent:
# - httpx (pour LLM API calls)
# - redis (pour rate limiting + cache)
# - langfuse (optionnel, pour LLMOps)
# - opentelemetry-* (optionnel, pour distributed tracing)
```

### 4. Migrations de Base de Données

Créer et appliquer les migrations pour les nouvelles tables `llm_traces` et `llm_metrics`:

```bash
# Créer une nouvelle migration
cd apps/backend
make migrate-create m=add_llm_observability_tables

# Ou appliquer les migrations existantes
make host-migrate  # si vous travaillez sur le host
# ou
make migrate       # si vous utilisez Docker
```

Le script de migration doit créer ces tables (voir `LLM_GATEWAY_SETUP.md` section "Database Schema"):

- `llm_traces`: stocke chaque requête LLM (trace_id, user_id, project_id, prompt, response, tokens, cost, duration, RAGAS scores)
- `llm_metrics`: agrège les métriques (hourly/daily, par provider/user/project)

### 5. Démarrage d'Ollama (Recommandé pour Démarrer)

Ollama est **gratuit et local**, parfait pour commencer:

```bash
# Installer Ollama si pas déjà fait
curl -fsSL https://ollama.com/install.sh | sh

# Démarrer le service Ollama
ollama serve

# Dans un autre terminal, télécharger le modèle recommandé
ollama pull deepseek-coder:6.7b

# Vérifier que ça fonctionne
curl http://localhost:11434/api/tags
```

### 6. Démarrage avec Docker Compose (Option 1 - Recommandée)

```bash
# Retour à la racine du projet
cd /path/to/ai-code-review-platform

# Option A: Stack de base (sans observabilité avancée)
docker compose -f docker-compose.local.yml up -d

# Option B: Stack complète avec Langfuse + Jaeger (observabilité avancée)
docker compose -f docker-compose.local.yml --profile llm-observability up -d

# Vérifier les logs
docker compose -f docker-compose.local.yml logs -f backend
docker compose -f docker-compose.local.yml logs -f worker
```

### 7. Démarrage Manuel (Option 2)

Si vous préférez lancer sans Docker:

```bash
# Terminal 1: Infrastructure (PostgreSQL, Redis, Neo4j, MinIO)
cd apps/backend
make infra-core-up  # ou make up-minimal

# Terminal 2: Backend API
cd apps/backend
make host-api  # lance uvicorn sur :8000

# Terminal 3: Celery Worker
cd apps/backend
make host-worker  # lance celery worker

# Terminal 4: Dashboard Next.js
cd apps/dashboard
npm install  # si nouvelles dépendances
npm run dev  # lance sur :3001
```

### 8. Vérification du Déploiement

```bash
# Backend API health
curl http://localhost:8000/health

# Vérifier que le gateway est disponible
curl http://localhost:8000/api/v1/llm/providers

# Vérifier les providers configurés
curl http://localhost:8000/api/v1/llm/providers | jq

# Dashboard
curl http://localhost:3001

# Langfuse (si activé avec --profile llm-observability)
curl http://localhost:3100

# Jaeger (si activé)
curl http://localhost:16686

# Prometheus metrics
curl http://localhost:8000/metrics
```

### 9. Test Rapide du LLM Gateway

```python
# Dans un terminal Python sur le VPS
cd apps/backend
poetry run python

# Test du gateway
from app.gateway.api_gateway import LLMGateway
from app.gateway.request_context import RequestContext, SensitivityLevel, CostTarget, Priority

gateway = LLMGateway()

context = RequestContext(
    user_id="test-user",
    project_id="test-project",
    analysis_id="test-analysis",
    sensitivity=SensitivityLevel.INTERNAL,
    cost_target=CostTarget.BALANCED,
    priority=Priority.NORMAL
)

response = gateway.generate(
    prompt="Explique-moi le code suivant: def hello(): return 'world'",
    context=context
)

print(f"Provider: {response.provider}")
print(f"Model: {response.model}")
print(f"Response: {response.content}")
print(f"Tokens: {response.total_tokens}")
print(f"Cost: ${response.cost_cents / 100:.4f}")
print(f"Duration: {response.duration_ms}ms")
```

### 10. Accès aux Dashboards

Une fois déployé, accédez aux nouveaux dashboards:

- **Models Hub**: http://your-vps-ip:3001/models
  - Status des providers
  - Spécifications des modèles
  - Calculateur de coûts
  - Recommandations d'optimisation

- **Prompt Observatory**: http://your-vps-ip:3001/observatory
  - Viewer de traces en temps réel (auto-refresh 10s)
  - Graphiques Recharts (coût par provider, latence)
  - Métriques RAGAS (faithfulness, relevancy)
  - Drill-down dans les prompts/responses

- **GraphRAG Explorer**: http://your-vps-ip:3001/graphrag-explorer
  - Visualisation du graphe Neo4j
  - Filtres par type de nœud (chunk/rule/pattern/kb_document)
  - Recherche et export

- **AI Review Center**: http://your-vps-ip:3001/ai-review
  - 6 cartes d'agents (Security, Performance, CleanCode, Architecture, DevOps, Testing)
  - Liste des findings avec filtres
  - Viewer détaillé avec approve/dismiss/create issue

### 11. Monitoring en Production

```bash
# Logs en temps réel
docker compose -f docker-compose.local.yml logs -f backend worker

# Métriques Prometheus
curl http://localhost:8000/metrics | grep llm_

# Exemples de métriques disponibles:
# - llm_requests_total{provider="ollama",model="deepseek-coder"}
# - llm_cost_cents_total{provider="anthropic"}
# - llm_tokens_total{provider="openai",token_type="input"}
# - llm_latency_seconds_bucket{provider="ollama"}
# - llm_fallbacks_total{from_provider="anthropic",to_provider="openai"}
# - llm_error_rate{provider="openai"}
# - llm_active_requests{provider="ollama"}

# Vérifier les traces PostgreSQL
docker compose -f docker-compose.local.yml exec postgres psql -U devora -d devora -c "SELECT COUNT(*) FROM llm_traces;"

# Vérifier les métriques agrégées
docker compose -f docker-compose.local.yml exec postgres psql -U devora -d devora -c "SELECT provider, COUNT(*), SUM(total_cost_cents) FROM llm_metrics WHERE metric_type = 'daily' GROUP BY provider;"
```

## Optimisation des Coûts

**Configuration recommandée pour production**:

1. **Ollama local pour tout le CONFIDENTIAL data** (0% coût cloud)
   ```bash
   # Dans .env
   OLLAMA_ENABLED=true
   ```

2. **Anthropic Claude pour code review premium** (~$3/M tokens input, $15/M output)
   ```bash
   ANTHROPIC_API_KEY=your_key
   ```

3. **OpenAI GPT-4o-mini pour tasks simples** ($0.15/M input, $0.60/M output - 20x moins cher que GPT-4)
   ```bash
   OPENAI_MODEL=gpt-4o-mini
   ```

4. **Activer le prompt cache** (~30% de savings)
   ```bash
   PROMPT_CACHE_ENABLED=true
   PROMPT_CACHE_TTL_SECONDS=3600
   ```

**Exemple de savings**:
- 1000 requêtes/jour × 500 tokens × 30 jours
- Ollama: **$0** (gratuit)
- GPT-4o-mini: **$22.50**
- Claude Haiku: **$60**
- Claude Sonnet: **$270**

## Rollback en Cas de Problème

Si quelque chose ne fonctionne pas:

```bash
# Revenir à la version précédente
git log --oneline -5  # voir les derniers commits
git revert 3993b5a    # revert ce commit (remplacer par l'ID du commit)
git push origin main

# Ou hard reset (ATTENTION: perd les changements)
git reset --hard 2ec11fa  # commit avant le gateway
git push origin main --force

# Redémarrer les services
docker compose -f docker-compose.local.yml restart
```

## Support

Pour plus de détails, consultez:
- `LLM_GATEWAY_SETUP.md`: Guide complet du gateway (2800+ lignes)
- `MULTI_AGENT_SYSTEM_COMPLETE.md`: Documentation des agents
- `OBSERVABILITY_IMPLEMENTATION.md`: Setup Langfuse/OTEL/Prometheus
- `apps/backend/app/observability/INTEGRATION_GUIDE.md`: Intégration de l'observabilité

## Notes Importantes

1. **PostgreSQL requis**: Les nouvelles tables `llm_traces` et `llm_metrics` doivent être créées via migration
2. **Redis requis**: Pour rate limiting + prompt cache (peut être désactivé si pas disponible)
3. **Ollama recommandé**: Gratuit, local, parfait pour CONFIDENTIAL data (0% coût cloud)
4. **Langfuse/Jaeger optionnels**: Pour observabilité avancée, utiliser `--profile llm-observability`
5. **Neo4j unchanged**: L'architecture GraphRAG existante est préservée, le gateway s'intègre de manière transparente

## Checklist de Déploiement

- [ ] Pull des changements (`git pull origin main`)
- [ ] Ajouter les variables d'environnement dans `.env`
- [ ] Installer les dépendances Python (`poetry install`)
- [ ] Créer/appliquer les migrations de base de données
- [ ] Démarrer Ollama (`ollama serve` + `ollama pull deepseek-coder:6.7b`)
- [ ] Démarrer l'infrastructure (Docker Compose ou manuel)
- [ ] Vérifier les endpoints (`/health`, `/api/v1/llm/providers`, `/metrics`)
- [ ] Tester le gateway avec un appel simple
- [ ] Accéder aux nouveaux dashboards
- [ ] Vérifier les logs backend/worker
- [ ] Monitorer les métriques Prometheus

Bonne chance avec le déploiement! 🚀

# Guide de Déploiement VPS - Commandes Exactes

**VPS:** 135.125.100.150  
**User:** root  
**Password:** DevoraPass2026

## Connexion SSH

Ouvrez un terminal (PowerShell, CMD avec OpenSSH, ou PuTTY) et connectez-vous:

```bash
ssh root@135.125.100.150
# Entrez le mot de passe: DevoraPass2026
```

## Commandes de Déploiement

Une fois connecté au VPS, exécutez ces commandes dans l'ordre:

### 1. Installation des Dépendances (5 min)

```bash
# Mise à jour système
apt-get update && apt-get upgrade -y

# Installation de base
apt-get install -y git curl wget

# Installation Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Installation Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose
docker-compose --version
```

### 2. Installation d'Ollama (3 min)

```bash
# Installation
curl -fsSL https://ollama.com/install.sh | sh

# Démarrage automatique
systemctl enable ollama
systemctl start ollama
systemctl status ollama

# Téléchargement du modèle DeepSeek Coder (1.2GB)
ollama pull deepseek-coder:6.7b

# Vérification
ollama list
```

### 3. Clone du Repository (2 min)

```bash
# Créer le répertoire
mkdir -p /opt
cd /opt

# Clone
git clone https://github.com/ai-code-review-2026/backend.git ai-code-review-platform
cd /opt/ai-code-review-platform

# Vérifier
ls -la
git branch
git log --oneline -3
```

### 4. Configuration .env (2 min)

Créez le fichier `.env` dans `/opt/ai-code-review-platform/`:

```bash
cd /opt/ai-code-review-platform
nano .env
```

Copiez-collez ce contenu (appuyez Ctrl+X puis Y pour sauvegarder):

```bash
ENV=production
BASE_URL=http://135.125.100.150:8000

# Database
DATABASE_URL=postgresql+psycopg://devora:devoradb2026@postgres:5432/devora
REDIS_URL=redis://redis:6379/0

# Auth
CLERK_AUTH_ENABLED=false
RBAC_ENFORCEMENT_ENABLED=false

# Celery
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1
CELERY_TASK_ALWAYS_EAGER=false

# Analysis
SECRET_SCAN_ENABLED=true
STATIC_ANALYSIS_ENABLED=true
STATIC_ANALYSIS_RUFF_ENABLED=true
STATIC_ANALYSIS_SEMGREP_ENABLED=true

# LLM Gateway (NEW)
LLM_GATEWAY_ENABLED=true
LLM_ENABLED=true
LLM_PROVIDER=ollama

# Ollama (Local, Free)
OLLAMA_ENABLED=true
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=deepseek-coder:6.7b
OLLAMA_TIMEOUT_SECONDS=120
OLLAMA_TEMPERATURE=0.1

# Rate Limiting
RATE_LIMIT_OLLAMA_PER_MINUTE=0
RATE_LIMIT_PER_USER_PER_HOUR=100

# Prompt Cache
PROMPT_CACHE_ENABLED=true
PROMPT_CACHE_TTL_SECONDS=3600
PROMPT_CACHE_MAX_SIZE=10000

# Observability
LLM_TRACES_RETENTION_DAYS=90
LLM_METRICS_AGGREGATION_INTERVAL_MINUTES=60

# Langfuse
LANGFUSE_ENABLED=true
LANGFUSE_HOST=http://langfuse:3000

# OpenTelemetry
OTEL_ENABLED=true
OTEL_SERVICE_NAME=devora-backend
OTEL_EXPORTER_TYPE=otlp
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4317

# Multi-Agent
MULTI_AGENT_ENABLED=true
MULTI_AGENT_PARALLEL_EXECUTION=true
MULTI_AGENT_TIMEOUT_SECONDS=300
MULTI_AGENT_DEDUPLICATION_ENABLED=true

# RAGAS
RAGAS_EVALUATION_ENABLED=true
RAGAS_COMPUTE_ON_TRACE=true
RAGAS_USE_OLLAMA=true

# Neo4j
NEO4J_ENABLED=true
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=neo4jpassword

# Embeddings
EMBEDDING_PROVIDER=sentence_transformers
EMBEDDING_MODEL=all-MiniLM-L6-v2
EMBEDDING_CACHE_ENABLED=true

# LangChain
LANGCHAIN_ENABLED=true
LANGCHAIN_OLLAMA_CHAT_MODEL_PRIMARY=deepseek-coder

# GraphRAG Features
KB_PRIORITY_ENABLED=true
AUTO_FIX_ENABLED=true
HISTORY_ENABLED=true

# Qdrant (Disabled for Neo4j-only)
QDRANT_ENABLED=false

# MinIO
OBJECT_STORAGE_ENABLED=true
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=admin
MINIO_SECRET_KEY=password123
MINIO_BUCKET=ai-review-artifacts
MINIO_SECURE=false

# Dashboard
BACKEND_API_URL=http://backend:8000
NEXT_PUBLIC_BACKEND_URL=http://135.125.100.150:8000
DASHBOARD_BACKEND_FETCH_TIMEOUT_MS=15000
```

### 5. Démarrage des Services (5 min)

```bash
cd /opt/ai-code-review-platform

# Arrêter les services existants si présents
docker compose -f docker-compose.local.yml down

# Créer les répertoires de données
mkdir -p postgres_data redis_data neo4j_data minio_data qdrant_data langfuse_db_data

# Démarrer avec observabilité complète
docker compose -f docker-compose.local.yml --profile llm-observability up -d

# Vérifier le statut
docker compose -f docker-compose.local.yml ps
```

### 6. Attendre le Démarrage (30 secondes)

```bash
# Attendre que tous les services démarrent
sleep 30

# Vérifier les logs
docker compose -f docker-compose.local.yml logs -f backend
# Appuyez Ctrl+C pour arrêter les logs
```

### 7. Vérification de la Santé (1 min)

```bash
# Backend Health
curl http://localhost:8000/health
# Doit retourner: {"status":"healthy"}

# Backend API Docs
curl -I http://localhost:8000/docs
# Doit retourner: HTTP/1.1 200 OK

# LLM Providers
curl http://localhost:8000/api/v1/llm/providers | jq
# Doit afficher la liste des providers

# Dashboard
curl -I http://localhost:3001
# Doit retourner: HTTP/1.1 200 OK

# Langfuse
curl -I http://localhost:3100
# Doit retourner: HTTP/1.1 200 OK

# Jaeger
curl -I http://localhost:16686
# Doit retourner: HTTP/1.1 200 OK

# Prometheus
curl -I http://localhost:9090
# Doit retourner: HTTP/1.1 200 OK

# MinIO Console
curl -I http://localhost:9001
# Doit retourner: HTTP/1.1 200 OK
```

### 8. Test du LLM Gateway (1 min)

```bash
# Test simple via curl
curl -X POST http://localhost:8000/api/v1/llm/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Explique ce code: def hello(): return \"world\"",
    "user_id": "test-user",
    "project_id": "test-project",
    "analysis_id": "test-analysis",
    "sensitivity": "internal",
    "cost_target": "balanced",
    "priority": "normal"
  }'
```

## URLs d'Accès depuis Votre Navigateur

Une fois déployé, ouvrez ces URLs dans votre navigateur:

- **Backend API**: http://135.125.100.150:8000
- **Backend Docs (Swagger)**: http://135.125.100.150:8000/docs
- **Backend Health**: http://135.125.100.150:8000/health

### Nouveaux Dashboards LLMOps:

- **Dashboard Principal**: http://135.125.100.150:3001
- **Models Hub**: http://135.125.100.150:3001/models
- **Prompt Observatory**: http://135.125.100.150:3001/observatory
- **GraphRAG Explorer**: http://135.125.100.150:3001/graphrag-explorer
- **AI Review Center**: http://135.125.100.150:3001/ai-review

### Outils d'Observabilité:

- **Langfuse (LLMOps)**: http://135.125.100.150:3100
- **Jaeger (Tracing)**: http://135.125.100.150:16686
- **Prometheus (Metrics)**: http://135.125.100.150:9090
- **MinIO Console**: http://135.125.100.150:9001 (admin/password123)

## Commandes Utiles

```bash
# Voir tous les logs en temps réel
docker compose -f docker-compose.local.yml logs -f

# Voir logs backend seulement
docker compose -f docker-compose.local.yml logs -f backend

# Voir logs worker seulement
docker compose -f docker-compose.local.yml logs -f worker

# Voir le statut des services
docker compose -f docker-compose.local.yml ps

# Redémarrer un service
docker compose -f docker-compose.local.yml restart backend

# Redémarrer tous les services
docker compose -f docker-compose.local.yml restart

# Arrêter tous les services
docker compose -f docker-compose.local.yml down

# Supprimer volumes et redémarrer (ATTENTION: perd les données)
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml --profile llm-observability up -d

# Vérifier l'utilisation des ressources
docker stats

# Vérifier les traces LLM en base de données
docker compose -f docker-compose.local.yml exec postgres psql -U devora -d devora -c "SELECT COUNT(*) FROM llm_traces;"

# Vérifier les métriques agrégées
docker compose -f docker-compose.local.yml exec postgres psql -U devora -d devora -c "SELECT provider, COUNT(*), SUM(total_cost_cents)/100.0 as total_cost_usd FROM llm_metrics GROUP BY provider;"
```

## Dépannage

### Backend ne démarre pas

```bash
# Vérifier les logs
docker compose -f docker-compose.local.yml logs backend

# Vérifier les migrations de base de données
docker compose -f docker-compose.local.yml exec backend alembic current
docker compose -f docker-compose.local.yml exec backend alembic upgrade head
```

### Ollama ne fonctionne pas

```bash
# Vérifier le service
systemctl status ollama

# Redémarrer
systemctl restart ollama

# Vérifier que le modèle est téléchargé
ollama list

# Re-télécharger si nécessaire
ollama pull deepseek-coder:6.7b
```

### Dashboard ne charge pas

```bash
# Vérifier les logs
docker compose -f docker-compose.local.yml logs dashboard

# Vérifier que le backend est accessible
curl http://backend:8000/health
```

### Problème de connexion entre containers

```bash
# Vérifier le réseau Docker
docker network ls
docker network inspect ai-code-review-platform_default

# Redémarrer tous les services
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml --profile llm-observability up -d
```

## Performance et Optimisation

### Monitoring des Ressources

```bash
# CPU/RAM usage
docker stats

# Espace disque
df -h

# Logs disk usage
du -sh /opt/ai-code-review-platform/
```

### Nettoyage

```bash
# Nettoyer les images Docker non utilisées
docker system prune -a

# Nettoyer les volumes non utilisés
docker volume prune

# Rotation des logs
docker compose -f docker-compose.local.yml logs --tail=1000 backend > backend.log
docker compose -f docker-compose.local.yml logs --tail=1000 worker > worker.log
```

---

## Résumé des Changements Déployés

✅ **21,117 lignes de code ajoutées** dans 73 fichiers

### Nouvelles Fonctionnalités:

1. **LLM Gateway** - Multi-provider (Ollama, Anthropic, OpenAI, Azure) avec routing intelligent
2. **Observability Stack** - PostgreSQL traces, Prometheus metrics, Langfuse, OpenTelemetry, WebSocket temps réel
3. **Multi-Agent System** - 6 agents spécialisés (Security, Performance, CleanCode, Architecture, DevOps, Testing)
4. **GraphRAG Integration** - Gateway transparent pour tous les appels LLM
5. **HTTP API** - 9 nouveaux endpoints REST
6. **Frontend Dashboards** - 4 pages React complètes (Models Hub, Observatory, GraphRAG Explorer, AI Review Center)

### Technologies Ajoutées:

- **Backend**: httpx, redis, langfuse, opentelemetry-*
- **Frontend**: recharts (visualisations)
- **Infrastructure**: Langfuse (port 3100), Jaeger (ports 16686/4317), Prometheus (port 9090)

---

**Temps Total Estimé**: 15-20 minutes  
**Difficulté**: Facile (commandes copy-paste)

Bonne chance! 🚀

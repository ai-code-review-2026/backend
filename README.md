# AI Code Review Platform

Plateforme de revue de code automatisÃ©e orientÃ©e sÃ©curitÃ© et qualitÃ©, basÃ©e sur FastAPI + Celery + Next.js, avec pipeline asynchrone, scan de secrets, analyse statique (Ruff + Semgrep), catÃ©gorisation de changement (bugfix/feature/refactor), dashboard web avec authentification (Clerk), gestion d'organisations, observabilitÃ© (Prometheus/Grafana) et intÃ©grations optionnelles (OpenAI, Qdrant, MinIO).

---

## ⚡ Quick Start - Dashboard Analytics & Teams

**New**: Dashboard pages for statistics, teams, and organization are now fully implemented with real data integration!

- 📊 **Statistics Dashboard**: `/dashboard/statistics` - Code quality, velocity, and team metrics
- 👥 **Teams Management**: `/dashboard/teams` - Team members, invitations, and settings  
- 🏢 **Organization**: `/dashboard/organization` - GitHub organization and repository data

**Getting started**:
```bash
# 1. Seed sample data
cd apps/backend
poetry run python scripts/seed_sample_data.py

# 2. Start backend
poetry run uvicorn app.main:app --reload

# 3. Start frontend (in another terminal)
cd apps/dashboard
npm run dev

# 4. Visit http://localhost:3000/dashboard/statistics
```

📖 **Documentation**: See [`IMPLEMENTATION_GUIDE.md`](./IMPLEMENTATION_GUIDE.md) and [`DASHBOARD_IMPLEMENTATION_SUMMARY.md`](./DASHBOARD_IMPLEMENTATION_SUMMARY.md)

---

## Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Documentation utilisateur](#2-documentation-utilisateur)
3. [Documentation technique](#3-documentation-technique)
4. [Schémas high-level](#4-schémas-high-level)
5. [Structure du projet](#5-structure-du-projet)
6. [Prérequis](#6-prérequis)
7. [Configuration `.env`](#7-configuration-env)
8. [Exécution en local avec Docker (recommandé)](#8-exécution-en-local-avec-docker-recommandé)
9. [Exécution locale hybride (API/Worker sur host)](#9-exécution-locale-hybride-apiworker-sur-host)
10. [Dashboard et prototypage](#10-dashboard-et-prototypage)
11. [Commandes complètes](#11-commandes-complètes)
12. [API HTTP (contrat d'usage)](#12-api-http-contrat-dusage)
13. [Migrations base de données](#13-migrations-base-de-données)
14. [Tests, qualité et CI/CD](#14-tests-qualité-et-cicd)
15. [Observabilité et supervision](#15-observabilité-et-supervision)
16. [Déploiement cloud](#16-déploiement-cloud)
17. [Troubleshooting (Windows/Linux)](#17-troubleshooting-windowslinux)
18. [Sécurité](#18-sécurité)
19. [État courant des modules](#19-état-courant-des-modules)
20. [RepoContext](#20-repocontext-onboarding-initial--diff-context)
21. [Architecture RAG cible](#21-architecture-rag-cible-hybrid-rag--re-rank--router-leger)

---

## 1. Vue d'ensemble

Le projet reÃ§oit des diffs (via API ou webhook GitHub), les pousse en file Redis, puis un worker Celery exÃ©cute un pipeline de revue :

- parsing du diff unifiÃ©,
- scan de secrets et redaction,
- analyse statique Ruff/Semgrep,
- classification du changement (F4 : bugfix/feature/refactor),
- persistance des rÃ©sultats et mÃ©triques.

Le backend API est fonctionnel et documentÃ©. Le dashboard Next.js (`apps/dashboard`) est actif avec authentification Clerk, gestion multi-organisations, pages d'analyse, historique et rapports. Les modules `apps/cli` et `libs/contracts/*` sont prÃ©sents mais actuellement squelettiques (dossiers sans implÃ©mentation active).

---

## 2. Documentation utilisateur

### 2.1 Cas d'usage principal

1. Soumettre un diff avec `POST /v1/analyze`.
2. RÃ©cupÃ©rer `analysis_id`.
3. Poller `GET /v1/analyses/{analysis_id}` jusqu'Ã  `COMPLETED`.
4. Consommer :
   - `findings` (global),
   - `security_findings`,
   - `static_findings`,
   - `change_type` + `change_type_confidence` (F4),
   - `static_stats`, `redaction_stats`, `tool_runs`.

### 2.2 RÃ©sultat attendu

Un objet d'analyse complet contient notamment :

- statut (`RECEIVED/QUEUED/RUNNING/COMPLETED/FAILED`),
- progression et stage,
- dÃ©tails diff parsÃ© (fichiers/hunks/lignes),
- findings sÃ©curitÃ© + qualitÃ©,
- classification du changement (`bugfix|feature|refactor`),
- traces d'exÃ©cution outils.

### 2.3 Dashboard web

Le dashboard Next.js (`apps/dashboard`) offre une interface utilisateur complÃ¨te :

#### FonctionnalitÃ©s principales

- **Authentification** : IntÃ©gration Clerk avec sign-in/sign-up, gestion de sessions
- **Gestion d'organisations** : Support multi-organisations avec rÃ´les et permissions
- **Analyses** : Visualisation des analyses de code, dÃ©tails des findings, statuts en temps rÃ©el
- **Historique** : Consultation de l'historique complet des analyses
- **DiffÃ©rentiels** : Affichage enrichi des diffs avec annotations de sÃ©curitÃ©
- **Rapports** : GÃ©nÃ©ration et export de rapports d'analyse
- **RAG** : Interface pour recherche vectorielle (si Qdrant activÃ©)
- **Administration** : Panel admin pour gestion utilisateurs et configurations

#### DÃ©marrage

```bash
cd apps/dashboard
npm install
npm run dev
```

Le dashboard sera accessible sur http://localhost:3001

#### Configuration

Variables d'environnement dans `apps/dashboard/.env.local` :

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` : ClÃ© publique Clerk
- `CLERK_SECRET_KEY` : ClÃ© secrÃ¨te Clerk
- `NEXT_PUBLIC_API_URL` : URL backend (dÃ©faut: http://localhost:8000)

---

## 3. Documentation technique

### 3.1 Stack

- Backend: FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, Celery, Redis, Psycopg3.
- Analyse: Ruff, Semgrep, moteur de parsing diff, scanner de secrets.
- DonnÃ©es: PostgreSQL.
- ObservabilitÃ©: Prometheus, Grafana, Flower, exporters Redis/PostgreSQL.
- Optionnel: OpenAI (rÃ©sumÃ©), Qdrant (vector search), MinIO (S3 artifacts).

### 3.2 Pipeline d'analyse (worker)

Le task Celery `analysis.run_minimal_pipeline` :

1. met l'analyse en `RUNNING`,
2. parse le diff unifiÃ©,
3. exÃ©cute secret scan + redaction,
4. exÃ©cute F4 (classification changement),
5. exÃ©cute analyse statique (Ruff/Semgrep),
6. persiste findings + tool runs,
7. met l'analyse en `COMPLETED` ou `FAILED`.

### 3.3 F4 â€“ catÃ©gorisation changement

La classification est en place dans le backend (`heuristic` actuellement), basÃ©e sur:

- mÃ©tadonnÃ©es PR/commit/labels/branch,
- prÃ©fixes conventional commits (`fix:`, `feat:`, `refactor:`),
- ratio additions/deletions,
- types de fichiers (new/renamed/test/config),
- taille et structure du diff.

Sortie stockÃ©e dans `analyses` :

- `change_type` (`bugfix|feature|refactor`),
- `change_type_confidence` (`0..1`),
- `change_type_source` (`heuristic|llm`),
- `change_type_signals` (JSON des signaux).

Migration associÃ©e : `20260301_0009_f4_change_classification.py`.

### 3.4 Organisations et multi-tenancy

Support organisations multi-tenant intÃ©grÃ© (migration `20260306_0011_organizations.py`) :

- **Organizations** : EntitÃ©s principales pour regrouper utilisateurs et analyses
  - `id` : Identifiant unique (synchronisÃ© avec Clerk)
  - `slug` : Slug unique pour URLs
  - `name` : Nom de l'organisation
  - `is_active` : Statut activation

- **Memberships** : Relation utilisateurs-organisations avec rÃ´les
  - RÃ´les supportÃ©s : `owner`, `admin`, `member`, `viewer`
  - Permissions RBAC configurables

- **Isolation des donnÃ©es** : Analyses et ressources isolÃ©es par organisation

Les dashboards et APIs respectent automatiquement le contexte organisationnel.

---

## 4. SchÃ©mas high-level

### 4.1 Architecture globale (runtime local)

```text
Utilisateurs Web â†’ Dashboard Next.js :3001 (Clerk Auth)
                          â”‚
                          â–¼
Clients (Webhook GitHub / REST API)
              â”‚
              â–¼
        FastAPI :8000
              â”‚ enqueue
              â–¼
         Redis (broker)
              â”‚
              â–¼
         Celery Worker
      â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”¼â”€â”€â”€â”€â”€â”€â”€â”€â”
      â–¼        â–¼        â–¼
  PostgreSQL  Qdrant   MinIO
   (core DB) (opt.)   (opt.)
      â”‚
      â””â”€â–º Organizations & Memberships

ObservabilitÃ©:
Prometheus :9090 -> scrape FastAPI/Flower/exporters/MinIO
Grafana    :3000 -> dashboards
Flower     :5555 -> monitoring Celery
```

### 4.2 Diagramme pipeline (Mermaid)

```mermaid
flowchart LR
  A[POST /v1/analyze] --> B[(PostgreSQL: status RECEIVED)]
  B --> C[enqueue Redis]
  C --> D[Celery Worker]
  D --> E[Parse Unified Diff]
  E --> F[Secret Scan + Redaction]
  F --> G[F4 Change Classification]
  G --> H[Static Analysis Ruff + Semgrep]
  H --> I[(PostgreSQL: findings/tool_runs)]
  I --> J[Status COMPLETED]
```

### 4.3 Diagramme composants (Mermaid)

```mermaid
graph TD
  subgraph Frontend
    DASH[Dashboard Next.js + Clerk]
  end
  subgraph App
    API[FastAPI]
    W[Celery Worker]
  end
  subgraph Data
    PG[(PostgreSQL)]
    RD[(Redis)]
    QD[(Qdrant optionnel)]
    MN[(MinIO optionnel)]
  end
  subgraph Observability
    PR[Prometheus]
    GF[Grafana]
    FL[Flower]
  end
  DASH --> API
  API --> RD
  W --> RD
  W --> PG
  W --> QD
  W --> MN
  API --> PG
  API --> PR
  FL --> PR
  PR --> GF
```

Pour un schÃ©ma encore plus dÃ©taillÃ©: `docs/architecture/architecture.md`.

---

## 5. Structure du projet

```text
ai-code-review-platform/
â”œâ”€ apps/
â”‚  â”œâ”€ backend/                 # Service principal (FastAPI + Celery + Alembic)
â”‚  â”‚  â”œâ”€ app/
â”‚  â”‚  â”‚  â”œâ”€ api/http/          # Endpoints REST + webhook
â”‚  â”‚  â”‚  â”œâ”€ core/              # Pipeline, sÃ©curitÃ©, classification, static analysis
â”‚  â”‚  â”‚  â”œâ”€ data/              # ModÃ¨les/repositories DB
â”‚  â”‚  â”‚  â””â”€ workers/           # Celery app + tasks
â”‚  â”‚  â”œâ”€ alembic/
â”‚  â”‚  â”‚  â””â”€ versions/          # Migrations SQL
â”‚  â”‚  â””â”€ tests/unit/
â”‚  â”œâ”€ dashboard/               # Application Next.js (dashboard web complet)
â”‚  â”‚  â”œâ”€ app/                  # Pages Next.js (auth, dashboard, analyses, etc.)
â”‚  â”‚  â”œâ”€ components/           # Composants React/UI (Radix UI)
â”‚  â”‚  â”œâ”€ lib/                  # Utilitaires (auth, roles, etc.)
â”‚  â”‚  â””â”€ clerk-nextjs/         # Configuration Clerk
â”‚  â””â”€ cli/                     # Placeholder (src vide)
â”œâ”€ Developer Dashboard Features/ # Prototype dashboard (Vite/React, rÃ©fÃ©rence Figma)
â”œâ”€ infra/
â”‚  â”œâ”€ local/docker-compose.yml # Stack locale complÃ¨te
â”‚  â”œâ”€ observability/           # Prometheus + dashboards Grafana
â”‚  â””â”€ cloud/                   # Guide cloud + configs Fly
â”œâ”€ docs/
â”‚  â”œâ”€ architecture.md
â”‚  â””â”€ manual-test-windows.md
â”œâ”€ .github/workflows/          # CI/CD
â”œâ”€ Makefile
â””â”€ .env.example
```

---

## 6. PrÃ©requis

### 6.1 Outils minimaux

| Outil | Version recommandÃ©e | Obligatoire |
|---|---:|---|
| Docker Desktop | rÃ©cente | Oui (mode Docker) |
| Docker Compose plugin | rÃ©cente | Oui |
| Git | rÃ©cente | Oui |
| Python | 3.11+ | Oui (mode host/tests) |
| Poetry | 1.8+ | Oui (backend local) |
| Make | GNU Make | Optionnel mais conseillÃ© |

### 6.2 Installation rapide Windows

- Make via Winget: `winget install GnuWin32.Make`
- ou utiliser Git Bash sans Make et exÃ©cuter les commandes `docker compose` / `poetry` directement.

---

## 7. Configuration `.env`

### 7.1 CrÃ©ation

```bash
# Git Bash / Linux / macOS
cp .env.example .env
```

```powershell
# PowerShell
Copy-Item .env.example .env
```

### 7.2 Variables critiques

| Variable | Valeur locale type | RÃ´le |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://postgres:simplepass@localhost:5432/ai_code_review_platform` | DB principale |
| `REDIS_URL` | `redis://localhost:6380/0` | broker/cache |
| `CELERY_BROKER_URL` | `redis://localhost:6380/0` | file tÃ¢ches |
| `CELERY_RESULT_BACKEND` | `redis://localhost:6380/1` | backend rÃ©sultats |
| `GITHUB_WEBHOOK_SECRET` | `local-dev-secret` | validation HMAC webhook |
| `CELERY_WORKER_POOL` | `solo` (host Windows) | stabilitÃ© Celery Windows |

### 7.3 Variables optionnelles

- LLM : `LLM_ENABLED=true`, `OPENAI_API_KEY=...`
- Vector store : `QDRANT_ENABLED=true`, `QDRANT_URL=http://localhost:6333`
- Object storage : `OBJECT_STORAGE_ENABLED=true`, `MINIO_ENDPOINT=localhost:9000`
- RBAC : `RBAC_ENFORCEMENT_ENABLED=true`

### 7.4 GÃ©nÃ©rer clÃ© de chiffrement

```bash
make generate-fernet-key
```

ou

```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## 8. ExÃ©cution en local avec Docker (recommandÃ©)

### 8.1 DÃ©marrage standard

```bash
make build
make up
make migrate
```

### 8.2 VÃ©rification

```bash
curl http://localhost:8000/healthz
```

RÃ©ponse attendue:

```json
{"status":"ok"}
```

### 8.3 Services et ports

| Port | Service | URL |
|---:|---|---|
| 8000 | FastAPI + docs | http://localhost:8000/docs |
| 8000 | Metrics API | http://localhost:8000/metrics |
| 3001 | Dashboard Next.js | http://localhost:3001 |
| 5555 | Flower | http://localhost:5555 |
| 5432 | PostgreSQL | TCP |
| 6380 | Redis (host) | `redis://localhost:6380` |
| 6333 | Qdrant REST + dashboard | http://localhost:6333/dashboard |
| 6334 | Qdrant gRPC | TCP |
| 9000 | MinIO API | http://localhost:9000 |
| 9001 | MinIO Console | http://localhost:9001 |
| 9090 | Prometheus | http://localhost:9090 |
| 3000 | Grafana | http://localhost:3000 |
| 8080 | Adminer | http://localhost:8080 |
| 9121 | Redis exporter | http://localhost:9121/metrics |
| 9187 | Postgres exporter | http://localhost:9187/metrics |

---

## 9. ExÃ©cution locale hybride (API/Worker sur host)

Utile pour debug Python avec hot reload.

### 9.1 Lancer uniquement DB + Redis (Docker)

```bash
docker compose -f infra/local/docker-compose.yml up -d db redis
```

### 9.2 Backend sur host

```bash
cd apps/backend
poetry install --no-interaction
poetry run alembic -c alembic.ini upgrade head
poetry run uvicorn app.main:app --reload --port 8000
```

### 9.2.1 Backend host + ngrok auto

Pour redemarrer le backend local avec un tunnel public ngrok et mettre a jour automatiquement les URLs d'environnement:

```bash
python scripts/dev_backend_ngrok.py
```

Ou via Makefile:

```bash
make dev-backend-ngrok
```

Ce wrapper:

- lance `ngrok http 8000`,
- recupere la nouvelle URL publique HTTPS,
- met a jour `.env` (`BASE_URL`, `NGROK_PUBLIC_URL`),
- puis lance `uvicorn app.main:app --reload --port 8000`.

Par defaut, il ne touche pas `BACKEND_API_URL` ni `NEXT_PUBLIC_BACKEND_URL` pour eviter que le dashboard local parle a une URL ngrok temporaire ou offline au lieu du backend local.

Si tu veux vraiment forcer les cibles backend sur l'URL publique ngrok:

```bash
python scripts/dev_backend_ngrok.py --sync-backend-targets
```
Prerequis:

- binaire `ngrok` disponible dans le `PATH`,
- backend Poetry installe dans `apps/backend`,
- redemarrer le dashboard si tu utilises `--sync-backend-targets` et que `apps/dashboard/.env.local` a ete modifie.

### 9.2.2 Backend host + Cloudflare Quick Tunnel

Pour garder le backend en local tout en exposant une URL HTTPS publique via `trycloudflare.com`:

```bash
python scripts/dev_backend_cloudflare.py
```

Ou via Makefile:

```bash
make dev-backend-cloudflare
```

Ce wrapper:

- lance un Quick Tunnel Cloudflare vers `http://127.0.0.1:8000`,
- recupere l'URL publique `https://<random>.trycloudflare.com`,
- met a jour `.env` (`BASE_URL`, `CLOUDFLARE_QUICK_TUNNEL_URL`),
- puis lance `uvicorn app.main:app --reload --port 8000`.

Par defaut, il ne touche pas `BACKEND_API_URL` ni `NEXT_PUBLIC_BACKEND_URL` pour eviter que le dashboard local parle a une URL publique temporaire ou offline au lieu du backend local.

Si tu veux quand meme forcer les cibles backend sur l'URL publique du tunnel:

```bash
python scripts/dev_backend_cloudflare.py --sync-backend-targets
```

Prerequis:

- binaire `cloudflared` disponible dans le `PATH`,
- backend Poetry installe dans `apps/backend`,
- redemarrer le dashboard si tu utilises `--sync-backend-targets` et que `apps/dashboard/.env.local` a ete modifie,
- recopier manuellement la nouvelle URL `trycloudflare.com` dans les variables Vercel `BACKEND_API_URL` et `NEXT_PUBLIC_BACKEND_URL` si le tunnel a change.

Guide dedie:

- `docs/guides/vercel-cloudflare-quick-tunnel.md`

### 9.3 Worker sur host

#### Windows

```bash
cd apps/backend
python -m celery -A app.workers.celery_app.celery_app worker --loglevel=info -Q analyses -P solo
```

#### Linux/macOS

```bash
cd apps/backend
poetry run celery -A app.workers.celery_app.celery_app worker --loglevel=info -Q analyses
```

---

## 10. Dashboard et prototypage

### 10.1 Dashboard principal (Next.js)

Le dashboard de production se trouve dans `apps/dashboard` :

```bash
cd apps/dashboard
npm install
npm run dev
```

Accessible sur http://localhost:3001

Technologies :
- Next.js 14+ (App Router)
- Clerk (authentification)
- Radix UI (composants)
- Tailwind CSS
- TypeScript

#### Application Mobile (iOS/Android)

Le dashboard est également disponible en tant qu'application mobile native via Capacitor :

```bash
cd apps/dashboard

# Build l'app pour mobile
npm run mobile:build

# Ajouter les plateformes (première fois uniquement)
npm run mobile:add:ios      # macOS + Xcode requis
npm run mobile:add:android  # Android Studio requis

# Ouvrir dans l'IDE natif
npm run mobile:ios          # Ouvre Xcode
npm run mobile:android      # Ouvre Android Studio
```

Technologies :
- Capacitor (wrapper natif)
- Static Export (Next.js)
- Clerk React SDK (authentification client-side)
- Plugins natifs (StatusBar, SplashScreen, Keyboard, etc.)

**📖 Documentation complète** : Voir `apps/dashboard/MOBILE.md` pour le guide détaillé du développement mobile, troubleshooting, et configuration.

**Plateformes supportées** :
- ✅ iOS 13+ (Xcode sur macOS requis)
- ✅ Android 7.0+ (API 24+)

### 10.2 Dashboard Features (Prototype Figma)

Le dossier `Developer Dashboard Features` contient un prototype standalone basÃ© sur un design Figma :

```bash
cd "Developer Dashboard Features"
npm install
npm run dev
```

Ce prototype sert de rÃ©fÃ©rence de design et n'est pas utilisÃ© en production. Il utilise Vite/React.

---

## 11. Commandes complÃ¨tes

### 11.1 Makefile

```bash
make help
```

#### Stack

```bash
make build
make build-no-cache
make up
make down
make ps
make clean
```

#### Migrations

```bash
make migrate
make migrate-history
make migrate-create m=add_column_x
```

#### Logs / shells

```bash
make logs
make logs-api
make logs-worker
make api-shell
make worker-shell
make db-shell
```

#### Tests

```bash
make test
make test-ci
```

### 11.2 Sans Make

```bash
docker compose -f infra/local/docker-compose.yml build
docker compose -f infra/local/docker-compose.yml up -d
docker compose -f infra/local/docker-compose.yml ps
docker compose -f infra/local/docker-compose.yml logs -f api
docker compose -f infra/local/docker-compose.yml exec api alembic -c /app/alembic.ini upgrade head
```
# start Redis via compose (what I ran)
docker compose -f infra/local/docker-compose.yml up -d redis

# show service status (I ran this and saw healthy)
docker compose -f infra/local/docker-compose.yml ps

# tail Redis logs if needed
docker compose -f infra/local/docker-compose.yml logs -f redis

# restart / start the worker (from apps/backend)
cd apps/backend
poetry run celery -A app.workers.celery_app.celery_app worker --loglevel=info -Q analyses -P solo -c 1
# or (if using venv)
python -m celery -A app.workers.celery_app.celery_app worker --loglevel=info -Q analyses -P solo -c 1
---

## 12. API HTTP (contrat d'usage)

PrÃ©fixe principal: `/v1`

### 12.1 Endpoints

| MÃ©thode | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/analyze` | Soumettre diff JSON |
| `POST` | `/v1/analyses` | Alias de `/v1/analyze` |
| `POST` | `/v1/analyze/stream` | Soumettre diff en stream |
| `POST` | `/v1/analyses/stream` | Alias stream |
| `GET` | `/v1/analyses/{analysis_id}` | DÃ©tails d'analyse |
| `GET` | `/v1/analyses` | Liste paginÃ©e |
| `POST` | `/v1/analyses/{analysis_id}/status` | Update statut |
| `POST` | `/v1/analyses/{analysis_id}/findings` | Ajout finding manuel |
| `POST` | `/webhooks/github` | RÃ©ception webhook GitHub |
| `GET` | `/healthz` | Health check |
| `GET` | `/metrics` | Metrics Prometheus |

### 12.2 Exemple JSON (crÃ©ation d'analyse)

```json
{
  "source": "manual",
  "repo": "owner/repo",
  "pr_number": 12,
  "commit_sha": "abc123",
  "diff_text": "diff --git a/a.py b/a.py\n...",
  "metadata": {
    "title": "fix: handle null pointer",
    "labels": ["bug"]
  }
}
```

### 12.3 Test manuel PowerShell

Guide complet: `docs/runbooks/manual-test-windows.md`.

Exemple rapide:

```powershell
$diff = @"
diff --git a/demo.py b/demo.py
index 1111111..2222222 100644
--- a/demo.py
+++ b/demo.py
@@ -0,0 +1,3 @@
+import os
+def run(cmd: str):
+    return eval(cmd)
"@

$payload = @{
  source = "manual"
  repo = "owner/manual-test"
  pr_number = 1
  commit_sha = "abc123"
  diff_text = $diff
} | ConvertTo-Json -Depth 10

$r = Invoke-RestMethod -Uri "http://localhost:8000/v1/analyze" -Method Post -ContentType "application/json" -Body $payload
$id = $r.analysis_id
Invoke-RestMethod -Uri "http://localhost:8000/v1/analyses/$id" -Method Get
```

---

## 13. Migrations base de donnÃ©es

### 13.1 Ã‰tat actuel

Migrations prÃ©sentes (ordre):

- `20260227_0001_create_analyses.py`
- `20260227_0002_t2_schema_and_lifecycle.py`
- `20260227_0003_analysis_progress_and_stage.py`
- `20260227_0004_t4_unified_diff_schema.py`
- `20260227_0005_t5_secret_scan_and_redaction.py`
- `20260227_0006_t6_static_analysis_schema.py`
- `20260228_0007_t6_tool_runs_tracking.py`
- `20260228_0008_rbac_and_encrypted_secrets.py`
- `20260301_0009_f4_change_classification.py`
- `20260301_0010_f3_analysis_summary.py`
- `20260306_0011_organizations.py`

### 13.2 Commandes utiles

```bash
# Docker
make migrate
make migrate-history

# Host
cd apps/backend
poetry run alembic -c alembic.ini current
poetry run alembic -c alembic.ini history
poetry run alembic -c alembic.ini upgrade head
```

---

## 14. Tests, qualitÃ© et CI/CD

### 14.1 Local

```bash
cd apps/backend
poetry run pytest tests/ -v --tb=short
poetry run pytest tests/unit/test_change_classifier.py -v
poetry run ruff check .
poetry run ruff format --check .
```

### 14.2 CI (GitHub Actions)

Workflow `ci.yml`:

1. lint Ruff,
2. tests pytest avec services PostgreSQL+Redis,
3. smoke build Docker backend.

### 14.3 CD (GitHub Actions)

Workflow `cd.yml`:

1. build image backend,
2. push GHCR,
3. dÃ©ploiement Fly.io API,
4. dÃ©ploiement Fly.io Worker.

### 14.4 Review automatique PR via GitHub Actions

Un workflow optionnel `ai-pr-review.yml` est disponible pour brancher une PR GitHub sur le backend d'analyse existant.

Fonctionnement:

1. `pull_request` declenche le workflow
2. le runner recupere le diff GitHub
3. le diff est envoye a `/v1/analyses`
4. le workflow poll `/v1/analyses/{analysis_id}`
5. le resultat structure (`summary`, `risk_findings`, `generated_tests`, `merge_readiness`) est transforme en markdown
6. une review GitHub est publiee via `pulls.createReview`

Ce workflow n'introduit pas un second moteur de review. Il agit comme adaptateur GitHub du pipeline backend deja present.

Secrets requis:

- `AI_REVIEW_BACKEND_URL`: URL publique du backend
- `AI_REVIEW_BEARER_TOKEN`: optionnel si auth backend active
- `AI_REVIEW_USER_ID`: optionnel si RBAC backend exige un utilisateur technique

Fichiers:

- workflow: `.github/workflows/ai-pr-review.yml`
- client CLI workflow: `scripts/github_pr_review.py`

---

## 15. ObservabilitÃ© et supervision

### 15.1 Prometheus

- Config: `infra/observability/prometheus.yml`
- Cibles: API `/metrics`, Flower, exporters, MinIO.

### 15.2 Grafana

Dashboards provisionnÃ©s:

- `infra/observability/grafana/dashboards/fastapi.json`
- `infra/observability/grafana/dashboards/celery.json`
- `infra/observability/grafana/dashboards/redis.json`
- `infra/observability/grafana/dashboards/postgresql.json`

Credentials locales par dÃ©faut : `admin / admin`.

---

## 16. Déploiement cloud

Guide VPS: `infra/vps/README.md`.

Première étape recommandée :

- déploiement monolithique conteneurisé sur un seul VPS,
- reverse proxy TLS avec Caddy,
- frontend + API + worker + PostgreSQL + Redis + Qdrant + MinIO dans Docker Compose.

---

## 17. Troubleshooting (Windows/Linux)

### 17.1 `alembic upgrade head` Ã©choue

Causes frÃ©quentes:

- commande lancÃ©e hors `apps/backend`,
- `.env` absent/invalide,
- PostgreSQL non dÃ©marrÃ©,
- URL SQLAlchemy incorrecte.

Correctif:

```bash
cd apps/backend
poetry run alembic -c alembic.ini upgrade head
```

ou (Docker)

```bash
docker compose -f infra/local/docker-compose.yml exec api alembic -c /app/alembic.ini upgrade head
```

### 17.2 Chemins Windows avec espaces

```powershell
cd "C:\Users\Ahmed Amin Bejoui\Desktop\ai-code-review-platform\apps\backend"
```

### 17.3 `celery: command not found`

```bash
python -m celery -A app.workers.celery_app.celery_app worker --loglevel=info -Q analyses -P solo
```

### 17.4 Analyse bloquÃ©e Ã  `QUEUED`

VÃ©rifier:

- worker actif,
- broker Redis reachable,
- queue `analyses` identique cÃ´tÃ© API + worker,
- `CELERY_TASK_ALWAYS_EAGER` non activÃ© par erreur en prod.

---

## 18. SÃ©curitÃ©

- Ne jamais committer `.env` rÃ©el.
- `diff_redacted` est utilisÃ© pour Ã©viter l'exposition de secrets.
- Activer RBAC en production (`RBAC_ENFORCEMENT_ENABLED=true`).
- Garder `ALLOW_UNSAFE_DIFF_API=false` en production.
- Chiffrer les secrets avec `SECRETS_ENCRYPTION_KEY`.
- Faire rotation des clÃ©s/tokens si exposition.

---

## 19. Ã‰tat courant des modules

| Module | Ã‰tat |
|---|---|
| `apps/backend` | âœ… Actif et fonctionnel - API FastAPI + Celery + Alembic |
| `apps/dashboard` | âœ… Actif et fonctionnel - Dashboard Next.js avec Clerk (auth), pages analyses, organisations, rapports |
| `Developer Dashboard Features` | ðŸ“¦ Prototype de rÃ©fÃ©rence - Bundle Vite/React basÃ© sur design Figma |
| `apps/cli` | â¸ï¸ Placeholder - Dossier prÃ©sent, source vide |
| `libs/contracts/pydantic` | â¸ï¸ Placeholder - Dossier prÃ©sent, vide |
| `libs/contracts/typescript` | â¸ï¸ Placeholder - Dossier prÃ©sent, vide |
| `scripts` | â¸ï¸ Placeholder - Dossier prÃ©sent, vide |

---

## RÃ©fÃ©rences internes

- Architecture dÃ©taillÃ©e: `docs/architecture/architecture.md`
- Test manuel Windows: `docs/runbooks/manual-test-windows.md`
- Guide cloud: `infra/cloud/README.md`
- Stack locale Docker: `infra/local/docker-compose.yml`
- Variables d'environnement: `.env.example`
- Commandes dev: `Makefile`

---

## Licence

Ce projet est distribuÃ© sous licence MIT. Voir `LICENSE`.

---

## 20. RepoContext (onboarding initial + diff context)

Ce module ajoute une methode robuste pour eviter de relire tout le repository a chaque diff:

1. Onboarding initial (une seule fois): indexation complete du repo dans Qdrant.
2. Ensuite, par diff/PR: recuperation de contexte cible depuis l'index.
3. Mise a jour incrementale: reindex uniquement les fichiers modifies.

### 20.1 Endpoints API

| Methode | Endpoint | Usage |
|---|---|---|
| `POST` | `/v1/kb/onboard` | Indexation complete initiale |
| `POST` | `/v1/kb/update` | Indexation incrementale depuis git diff |
| `GET` | `/v1/kb/repos/{repo_id}/profile` | Lire le profil global du repo |
| `POST` | `/v1/kb/context/query` | Recuperer du contexte pour une requete libre |
| `POST` | `/v1/kb/context/diff` | Recuperer du contexte pertinent pour un diff |
| `POST` | `/v1/kb/context/bootstrap` | Recuperer le contexte "decouverte" d'un nouveau repo |
| `POST` | `/v1/kb/automation/onboard` | Lancer l'onboarding auto en tache Celery |
| `POST` | `/v1/kb/automation/diff` | Lancer update+retrieval diff auto en tache Celery |

### 20.2 Payloads exemples

Onboarding initial:

```json
{
  "repo_id": "ai-code-review-platform",
  "repo_path": "C:/Users/Ahmed Amin Bejoui/Desktop/ai-code-review-platform",
  "source": "manual",
  "force_full": true
}
```

Update incremental:

```json
{
  "repo_id": "ai-code-review-platform",
  "repo_path": "C:/Users/Ahmed Amin Bejoui/Desktop/ai-code-review-platform",
  "base_ref": "HEAD~1",
  "head_ref": "HEAD",
  "source": "manual"
}
```

Contexte pour diff:

```json
{
  "repo_id": "ai-code-review-platform",
  "diff_text": "diff --git a/app/main.py b/app/main.py\n...",
  "changed_files": [],
  "limit": 8
}
```

Si l'API tourne dans Docker compose, utilise plutot un chemin interne container:

- `/workspace` (repo complet)
- `/workspace/apps/backend` (backend seulement)

### 20.3 Variables d'environnement requises

Activer Qdrant + RepoContext dans `.env`:

```bash
QDRANT_ENABLED=true
QDRANT_URL=http://localhost:6333
QDRANT_REPO_CONTEXT_COLLECTION=repo_context
REPO_CONTEXT_VECTOR_SIZE=256
REPO_CONTEXT_CHUNK_SIZE=1400
REPO_CONTEXT_CHUNK_OVERLAP=200
REPO_CONTEXT_MAX_FILE_BYTES=250000
REPO_CONTEXT_MAX_FILES_PER_RUN=5000
KB_EXACT_TOP_K=8
KB_LEXICAL_TOP_K=12
KB_SEMANTIC_TOP_K=12
KB_RERANK_TOP_K=8
KB_CONTEXT_MAX_CHARS=14000
KB_CONTEXT_MAX_CHUNKS=8
KB_CROSS_ENCODER_MODEL=cross-encoder/ms-marco-MiniLM-L-6-v2
KB_RERANK_ENABLED=true
REPO_CONTEXT_ALLOWED_ROOTS=
# optionnel: map JSON repo->path local (prioritaire si definie)
REPO_CONTEXT_REPO_PATH_MAP={"owner/repo":"/workspace/owner-repo"}
```

Si `REPO_CONTEXT_ALLOWED_ROOTS` est rempli, le backend refusera toute indexation en dehors des chemins autorises.
Sans `REPO_CONTEXT_REPO_PATH_MAP`, le backend tente une resolution dynamique dans les roots autorises
(et workspace courant) via nom de dossier puis remote Git `origin` quand disponible.

Les reglages `KB_*` pilotent le retrieval hybride:

- `KB_EXACT_TOP_K`: volume de candidats exact-match (path/symbol/test)
- `KB_LEXICAL_TOP_K`: volume de candidats Postgres FTS
- `KB_SEMANTIC_TOP_K`: volume de candidats Qdrant
- `KB_RERANK_TOP_K`: taille cible avant context packing
- `KB_CONTEXT_MAX_CHARS` / `KB_CONTEXT_MAX_CHUNKS`: budget de contexte final
- `KB_CROSS_ENCODER_MODEL`: modele local de rerank si `sentence-transformers` est installe
- `KB_RERANK_ENABLED`: desactive le cross-encoder et bascule sur le fallback heuristique si necessaire

### 20.3.1 Mode evenementiel automatique (sans question utilisateur)

Le systeme supporte maintenant les deux triggers automatiques:

1. **Nouveau Repo** -> `kb.onboard_repo` (scan complet + bootstrap context).
2. **Nouveau Diff** -> `kb.process_diff` (update incremental + retrieval hybride diff).

Declenchement possible via:

- Webhook GitHub `/webhooks/github` (map statique optionnelle; resolution dynamique active),
- ou endpoints `/v1/kb/automation/*`.

### 20.4 Outils externes a installer (hors code)

Minimum:

- Git
- Docker Desktop
- Python 3.11+
- VS Code

Recommande:

- `rg` (ripgrep), `fd`, `tree`, `jq`
- Extensions VS Code: GitLens, Python, Pylance, YAML, Markdown All in One

### 20.5 Local puis Cloud Qdrant

Oui, le workflow est prevu pour:

1. demarrer localement avec Qdrant Docker (`localhost:6333`);
2. migrer ensuite vers Qdrant Cloud en changeant seulement `QDRANT_URL` et `QDRANT_API_KEY`.

Pour migration de donnees:

- Snapshot/restore Qdrant, ou
- outil de migration Qdrant.

La logique backend reste la meme (meme endpoints et meme schema de payloads).

---

## 21. Architecture RAG cible (Hybrid RAG + Re-rank + Router leger)

Architecture recommandee pour ce projet:

- **Hybrid RAG**: combine retrieval exact, lexical et semantique.
- **Re-rank**: rerank des candidats avant le prompt final.
- **Router leger**: selection deterministe du bon pipeline selon le type de requete.
- **Context packing**: budget de contexte, deduplication, diversification des preuves.

Cette architecture est adaptee a:

- revue de diff / PR,
- recherche de contexte repo,
- recherche dans policies et regles,
- ingestion de PDF / markdown,
- grounding des reponses avec citations exploitables.

### 21.1 Vue globale produit + backend + RAG

```mermaid
graph TD
  subgraph Frontend
    UI["Next.js Dashboard"]
    AUTH["Clerk Auth"]
  end

  subgraph API
    FAST["FastAPI"]
    KB["KB / Review Orchestrator"]
    ROUTER["Query Router"]
    PACK["Context Packer"]
  end

  subgraph Retrieval
    EXACT["Exact Retriever\npath / symbol / changed_files"]
    LEX["Lexical Retriever\nBM25 / FTS"]
    SEM["Semantic Retriever\nQdrant embeddings"]
    RERANK["Re-ranker"]
  end

  subgraph Async
    REDIS["Redis"]
    CELERY["Celery Worker"]
    INGEST["Ingestion Pipeline"]
  end

  subgraph Storage
    PG["PostgreSQL\nprofiles / docs / metadata"]
    QD["Qdrant\nsemantic vectors"]
    S3["MinIO / Artifacts optional"]
  end

  subgraph Intelligence
    LLM["LLM Provider\nOpenAI / Ollama"]
  end

  UI --> AUTH
  UI --> FAST
  FAST --> KB
  KB --> ROUTER
  ROUTER --> EXACT
  ROUTER --> LEX
  ROUTER --> SEM
  EXACT --> RERANK
  LEX --> RERANK
  SEM --> RERANK
  RERANK --> PACK
  PACK --> LLM
  LLM --> FAST
  FAST --> UI

  FAST --> PG
  FAST --> REDIS
  CELERY --> INGEST
  REDIS --> CELERY
  INGEST --> PG
  INGEST --> QD
  INGEST --> S3
  EXACT --> PG
  LEX --> PG
  SEM --> QD
```

### 21.2 Pipeline d'ingestion et d'indexation

```mermaid
flowchart LR
  SRC["Sources\nrepo / diff / markdown / pdf / policies"] --> VALID["Validation"]
  VALID --> PARSE["Parsing + normalization"]
  PARSE --> CHUNK["Chunking"]
  CHUNK --> META["Metadata enrichment\nrepo_id / path / symbol / source_type / tags"]
  META --> EMB["Embeddings"]
  META --> FTS["Lexical index / SQL FTS"]
  EMB --> VEC["Qdrant upsert"]
  FTS --> SQL["PostgreSQL upsert"]
  VEC --> PROFILE["Repo profile update"]
  SQL --> PROFILE
```

### 21.3 Decision router

```mermaid
flowchart TD
  Q["Incoming request"] --> A{"Has diff_text ?"}
  A -- Yes --> D["Route: diff_review"]
  A -- No --> B{"Has file path / symbol / repo context ?"}
  B -- Yes --> E["Route: repo_query"]
  B -- No --> C{"Mentions policy / security / compliance ?"}
  C -- Yes --> F["Route: policy_query"]
  C -- No --> G{"Selected source is pdf / docs ?"}
  G -- Yes --> H["Route: document_query"]
  G -- No --> I["Route: generic_hybrid_query"]
```

### 21.4 Pipeline review diff / pull request

```mermaid
sequenceDiagram
  participant UI as Dashboard
  participant API as FastAPI
  participant RT as Router
  participant EX as Exact Retriever
  participant LX as Lexical Retriever
  participant SM as Semantic Retriever
  participant RR as Re-ranker
  participant CP as Context Packer
  participant LLM as LLM

  UI->>API: POST /v1/kb/context/diff or review request
  API->>RT: classify as diff_review
  RT->>EX: changed_files / path / symbol / tests
  RT->>LX: lexical search on modified areas
  RT->>SM: semantic search on repo and docs
  EX-->>RR: candidates
  LX-->>RR: candidates
  SM-->>RR: candidates
  RR-->>CP: top ranked chunks
  CP-->>LLM: grounded prompt with evidence
  LLM-->>API: findings / answer / citations
  API-->>UI: review result
```

### 21.5 Composants recommandes

| Composant | Role |
|---|---|
| `RepoContextRetriever` | point d'entree retrieval existant a faire evoluer |
| `ExactRetriever` | fichiers modifies, symboles, chemins exacts |
| `LexicalRetriever` | recherche mot-cle / BM25 / SQL FTS |
| `SemanticRetriever` | recherche embeddings dans Qdrant |
| `ReRanker` | rerank top N avant prompt |
| `QueryRouter` | selection du pipeline selon le type de requete |
| `ContextPacker` | dedup, quotas, budget tokens |
| `CitationBuilder` | sorties traceables et verifiables |

### 21.6 Ordre d'implementation conseille

1. Ajouter un **LexicalRetriever** en plus du retrieval actuel.
2. Introduire un **ReRanker** sur les top candidats.
3. Ajouter un **QueryRouter** deterministe:
   - `diff_review`
   - `repo_query`
   - `policy_query`
   - `document_query`
4. Ajouter un **ContextPacker** avec deduplication et quotas par source.
5. Generaliser les **citations** dans les reponses UI/API.

### 21.7 Mapping direct avec ce repo

- Retrieval repo/diff actuel: `apps/backend/app/core/knowledge_base/retriever.py`
- Endpoints KB: `apps/backend/app/api/http/knowledge_base.py`
- Worker ingestion KB: `apps/backend/app/workers/tasks/ingest_kb.py`
- UI base de connaissance: `apps/dashboard/components/dashboard/KnowledgeBase.tsx`

La cible n'est donc pas de remplacer l'existant, mais de le faire evoluer vers un **Code-Aware Hybrid RAG** plus robuste pour la revue de code, les policies et les documents techniques.

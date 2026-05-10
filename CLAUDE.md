# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a monorepo with two main applications:

- **`apps/backend`** — FastAPI + Celery async pipeline (Python 3.11+, Poetry)
- **`apps/dashboard`** — Next.js 14 frontend with Clerk auth (TypeScript, Tailwind, Radix UI)

Supporting infra: PostgreSQL, Redis, Qdrant (vector store), MinIO (object storage), Prometheus/Grafana.

### Backend Request Flow

1. `POST /v1/analyze` → validates `AnalyzeRequest` (requires `project_id`) → enqueues Celery task via Redis
2. Worker (`app/workers/tasks/analyze_pr.py`) runs the pipeline: diff parsing → secret scan/redaction → static analysis (Ruff, Semgrep, CleanCode) → change classification (bugfix/feature/refactor) → optional LLM review (Ollama/OpenAI) → persist results
3. Client polls `GET /v1/analyses/{id}` for status (`RECEIVED → QUEUED → RUNNING → COMPLETED/FAILED`)

### Dashboard → Backend Communication

The Next.js dashboard does **not** call the backend directly from the browser. All backend calls go through **Next.js API route handlers** in `apps/dashboard/app/api/dashboard/`. These server-side routes:
- Authenticate the user via Clerk (`auth()` / `currentUser()`)
- Forward requests to the FastAPI backend at `BACKEND_API_URL` (default `http://localhost:8000`)
- The backend URL env var is `BACKEND_API_URL` (server-side) or `NEXT_PUBLIC_BACKEND_URL` (fallback)

### Authentication

- Dashboard uses **Clerk** (`@clerk/nextjs`). All `/dashboard/*` routes are protected by `clerkMiddleware` in `apps/dashboard/middleware.ts`.
- Backend validates Clerk JWTs when `CLERK_AUTH_ENABLED=true`. Key settings: `CLERK_ISSUER_URL`, `CLERK_JWKS_URL`.
- RBAC enforcement is separate (`RBAC_ENFORCEMENT_ENABLED`). When disabled, any authenticated user has full access.
- User role is read from `publicMetadata.role` (Clerk) — not from JWT session claims, which can be stale.

### Key Backend Modules

- `app/api/http/` — all FastAPI routers (one file per domain)
- `app/api/middleware/auth.py` — JWT validation, `AuthenticatedPrincipal`, 60s principal cache
- `app/core/` — domain logic: `review_engine`, `static_analysis`, `security`, `change_classification`, `review_intelligence`, `knowledge_base`, `rag_agents`
- `app/data/database.py` — SQLAlchemy engine + idempotent `init_db()` that creates all tables via raw SQL (Alembic is the canonical schema manager)
- `app/data/repos/` — repository pattern wrapping all DB access
- `app/workers/tasks/analyze_pr.py` — main Celery task orchestrating the full pipeline
- `app/settings.py` — all config via `pydantic-settings`, reads `.env` from project root

### Analysis `project_id` Requirement

Every analysis **must** reference an existing `project_profiles.id`. Creating an analysis without a valid `project_id` returns 404. Create a project first via `POST /api/v1/projects`.

---

## Development Commands

### Backend (run from `apps/backend/`)

```bash
# Install dependencies
poetry install

# Start infra only (DB + Redis + Qdrant) via Docker
make infra-core-up          # or: make up-minimal

# Apply DB migrations
make host-migrate           # runs alembic upgrade head on host Poetry env

# Run API server (with hot reload)
make host-api               # uvicorn on :8000

# Run Celery worker (Windows-compatible, solo pool)
make host-worker

# Run tests
make test                   # poetry run pytest tests/ -v --tb=short

# Run a single test file
cd apps/backend && poetry run pytest tests/unit/test_foo.py -v

# Create a new migration
make migrate-create m=<migration_name>
```

### Frontend (run from `apps/dashboard/`)

```bash
npm install
npm run dev        # starts on :3001 (also cleans Next cache + syncs Clerk assets)
npm run build
npm run lint
```

### Full Docker Stack

```bash
make up            # all services on Docker
make migrate       # run migrations inside the API container
make down
make logs-api      # tail API logs
make logs-worker   # tail worker logs
```

### Seed Sample Data

```bash
cd apps/backend && poetry run python scripts/seed_sample_data.py
```

---

## Environment Variables

Place a `.env` file at the **project root** (not inside `apps/backend`). The backend `settings.py` resolves it by walking up 3 levels from `app/settings.py`.

Key variables:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg://user:pass@host:5432/dbname` |
| `REDIS_URL` | Redis connection string |
| `CLERK_AUTH_ENABLED` | Set `true` to enforce JWT auth on the backend |
| `CLERK_ISSUER_URL` | Clerk frontend API URL |
| `CLERK_JWKS_URL` | Clerk JWKS endpoint |
| `BACKEND_API_URL` | Used by Next.js server routes to reach FastAPI |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk public key for the dashboard |
| `CLERK_SECRET_KEY` | Clerk secret key (server-side) |
| `LLM_ENABLED` | Enable Ollama/OpenAI LLM review |
| `QDRANT_ENABLED` | Enable vector store for RAG |
| `SECRETS_ENCRYPTION_KEY` | Fernet key — generate with `make generate-fernet-key` |

CORS: the backend hardcodes `localhost:3000` and `localhost:3001` as allowed origins.

---

## Adding a New API Endpoint

1. Create or add to a router in `apps/backend/app/api/http/<domain>.py`
2. Register the router in `apps/backend/app/main.py` with `app.include_router(...)`
3. Add the corresponding Next.js proxy route in `apps/dashboard/app/api/dashboard/<domain>/route.ts` — authenticate with Clerk, then forward to `BACKEND_API_URL`

## Dashboard API Proxy Pattern

Dashboard API routes follow this pattern:
- Authenticate with `auth()` from `@clerk/nextjs/server`
- Build backend URL from `process.env.BACKEND_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"`
- Use `AbortController` with a timeout (defaults: 15s reads, 30s writes via `DASHBOARD_BACKEND_FETCH_TIMEOUT_MS` / `DASHBOARD_BACKEND_WRITE_TIMEOUT_MS`)
- Return shaped responses — do not pass raw backend responses directly to the client

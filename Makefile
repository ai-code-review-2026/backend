# ─── AI Code Review Platform ─── Dev Makefile ────────────────────────────────
# Supported container stacks live under `infra/local` and `infra/vps`.
# Run `make help` to see all available targets.
.PHONY: help up down build build-no-cache migrate migrate-history \
        migrate-create logs logs-api logs-worker test test-ci api-shell \
        worker-shell generate-fernet-key ps clean db-shell dev-backend-ngrok \
        dev-backend-cloudflare infra-core-up infra-core-down host-migrate \
        host-api host-api-no-reload host-api-prod host-worker kill-api \
        prod-build prod-up prod-down prod-logs prod-migrate \
        langchain-parity langchain-qdrant-aliases langchain-promote langchain-rollback
COMPOSE_FILE = infra/local/docker-compose.yml
COMPOSE_MINIMAL_FILE = infra/local/docker-compose.minimal.yml
COMPOSE      = docker compose --env-file .env -f $(COMPOSE_FILE)
COMPOSE_MINIMAL = docker compose --env-file .env -f $(COMPOSE_MINIMAL_FILE)
PROD_COMPOSE_FILE = infra/vps/docker-compose.yml
PROD_ENV_FILE ?= infra/vps/.env.vps
PROD_COMPOSE = docker compose --env-file $(PROD_ENV_FILE) -f $(PROD_COMPOSE_FILE)
BACKEND_DIR  = apps/backend
MINIO_API_PORT ?= 9000
MINIO_CONSOLE_PORT ?= 9001
GRAFANA_PORT ?= 3000
# Default target
help:
	@echo ""
	@echo "  AI Code Review Platform - Dev Commands"
	@echo ""
	@echo "  Stack Control"
	@echo "  -----------------------------------------------------"
	@echo "  make up                 Start all services (detached)"
	@echo "  make up-minimal         Start minimal services only (db+redis+qdrant)"
	@echo "  make down               Stop and remove containers"
	@echo "  make down-minimal       Stop minimal services"
	@echo "  make build              Build Docker images (with cache)"
	@echo "  make build-no-cache     Build Docker images (no cache)"
	@echo "  make ps                 Show running service status"
	@echo "  make clean              Remove volumes + containers (DESTRUCTIVE)"
	@echo ""
	@echo "  Development"
	@echo "  -----------------------------------------------------"
	@echo "  make migrate            Run Alembic: upgrade head"
	@echo "  make migrate-history    Show Alembic migration history"
	@echo "  make migrate-create m=  Create new migration (m=<name>)"
	@echo "  make dev-backend-ngrok  Start ngrok, rewrite env URLs, then run backend"
	@echo "  make dev-backend-cloudflare  Start Cloudflare Quick Tunnel, rewrite env URL hints, then run backend"
	@echo "  make infra-core-up      Start only db + redis + qdrant locally"
	@echo "  make infra-core-down    Stop only db + redis + qdrant locally"
	@echo "  make host-migrate       Run Alembic on the host Poetry env"
	@echo "  make kill-api           Free port 8000 (host uvicorn + ai-review-api container)"
	@echo "  make host-api           Run uvicorn on the host Poetry env with stable reload"
	@echo "  make host-api-no-reload Run uvicorn on the host Poetry env without reload"
	@echo "  make host-api-prod      Alias for host-api-no-reload"
	@echo "  make host-worker        Run the Celery worker on the Windows host with -P solo"
	@echo "  make test               Run pytest (local Poetry env)"
	@echo "  make langchain-parity   Build a corpus-wide LangChain parity report"
	@echo "  make langchain-qdrant-aliases  Show LangChain Qdrant alias targets"
	@echo "  make langchain-promote collection=<name>  Promote active LangChain alias"
	@echo "  make langchain-rollback collection=<name> Roll back active LangChain alias"
	@echo "  make logs               Tail all container logs"
	@echo "  make logs-api           Tail API logs only"
	@echo "  make logs-worker        Tail worker logs only"
	@echo ""
	@echo "  Shells"
	@echo "  -----------------------------------------------------"
	@echo "  make api-shell          Enter running API container"
	@echo "  make worker-shell       Enter running worker container"
	@echo "  make db-shell           psql in DB container"
	@echo ""
	@echo "  Production / VPS"
	@echo "  -----------------------------------------------------"
	@echo "  make prod-build         Build VPS images"
	@echo "  make prod-migrate       Run Alembic migrations in VPS stack"
	@echo "  make prod-up            Start VPS stack (caddy+dashboard+api+worker)"
	@echo "  make prod-down          Stop prod stack"
	@echo "  make prod-logs          Tail prod stack logs"
	@echo ""
	@echo "  Security"
	@echo "  -----------------------------------------------------"
	@echo "  make generate-fernet-key  Generate SECRETS_ENCRYPTION_KEY"
	@echo ""
# ─── Stack Control ────────────────────────────────────────────────────────────
up:
	$(COMPOSE) up -d
	@echo ""
	@echo "  Services started:"
	@echo "  -------------------------------------------------------"
	@echo "  API:            http://localhost:8000"
	@echo "  API Docs:       http://localhost:8000/docs"
	@echo "  API Metrics:    http://localhost:8000/metrics"
	@echo "  Grafana:        http://localhost:$(GRAFANA_PORT)   (admin / admin)"
	@echo "  Prometheus:     http://localhost:9090"
	@echo "  Flower:         http://localhost:5555"
	@echo "  Adminer:        http://localhost:8080"
	@echo "  Qdrant:         http://localhost:6333/dashboard"
	@echo "  MinIO Console:  http://localhost:$(MINIO_CONSOLE_PORT)   (minioadmin / minioadmin)"
	@echo "  MinIO S3 API:   http://localhost:$(MINIO_API_PORT)"
	@echo "  -------------------------------------------------------"
	@echo "  Hint: run 'make migrate' to apply DB migrations."
	@echo ""
up-minimal:
	$(COMPOSE_MINIMAL) up -d
	@echo ""
	@echo "  Minimal services started:"
	@echo "  -------------------------------------------------------"
	@echo "  PostgreSQL:     localhost:5432    (postgres / simplepass)"
	@echo "  Redis:          localhost:6380"
	@echo "  Qdrant:         http://localhost:6333/dashboard"
	@echo "  -------------------------------------------------------"
	@echo "  Hint: run 'make host-migrate' then 'make host-api' to start backend."
	@echo ""
down:
	$(COMPOSE) down
down-minimal:
	$(COMPOSE_MINIMAL) down
build:
	$(COMPOSE) build
build-no-cache:
	$(COMPOSE) build --no-cache
ps:
	$(COMPOSE) ps
clean:
	@echo "WARNING: This will delete all volumes including database data."
	$(COMPOSE) down -v --remove-orphans
# ─── Database Migrations ──────────────────────────────────────────────────────
migrate:
	$(COMPOSE) exec api alembic -c /app/alembic.ini upgrade head
migrate-history:
	$(COMPOSE) exec api alembic -c /app/alembic.ini history --verbose
migrate-create:
	@if [ -z "$(m)" ]; then echo "Usage: make migrate-create m=<migration_name>"; exit 1; fi
	$(COMPOSE) exec api alembic -c /app/alembic.ini revision --autogenerate -m "$(m)"
# ─── Testing ──────────────────────────────────────────────────────────────────
test:
	cd $(BACKEND_DIR) && poetry run pytest tests/ -v --tb=short
test-ci:
	cd $(BACKEND_DIR) && poetry run pytest tests/ -v --tb=short --no-header -q
dev-backend-ngrok:
	python tools/dev/dev_backend_ngrok.py
dev-backend-cloudflare:
	python tools/dev/dev_backend_cloudflare.py
infra-core-up:
	$(COMPOSE) up -d db redis qdrant
infra-core-down:
	$(COMPOSE) stop db redis qdrant
host-migrate:
	cd $(BACKEND_DIR) && poetry run alembic -c alembic.ini upgrade head
host-api:
	cd $(BACKEND_DIR) && powershell -NoProfile -ExecutionPolicy Bypass -File run_uvicorn.ps1 -Port 8000

host-api-full: host-api
kill-api:
	cd $(BACKEND_DIR) && powershell -NoProfile -ExecutionPolicy Bypass -File run_uvicorn.ps1 -OnlyCleanup -Port 8000
host-api-no-reload:
	cd $(BACKEND_DIR) && powershell -NoProfile -ExecutionPolicy Bypass -File run_uvicorn.ps1 -NoReload -Port 8000
host-api-prod: host-api-no-reload
host-worker:
	cd $(BACKEND_DIR) && poetry run python -m celery -A app.workers.celery_app.celery_app worker --loglevel=info -Q analyses -P solo
langchain-parity:
	cd $(BACKEND_DIR) && poetry run python ../../tools/kb/langchain_parity_report.py
langchain-qdrant-aliases:
	cd $(BACKEND_DIR) && poetry run python ../../tools/kb/langchain_qdrant_aliases.py show
langchain-promote:
	@if [ -z "$(collection)" ]; then echo "Usage: make langchain-promote collection=<collection_name>"; exit 1; fi
	cd $(BACKEND_DIR) && poetry run python ../../tools/kb/langchain_qdrant_aliases.py promote --collection "$(collection)"
langchain-rollback:
	@if [ -z "$(collection)" ]; then echo "Usage: make langchain-rollback collection=<collection_name>"; exit 1; fi
	cd $(BACKEND_DIR) && poetry run python ../../tools/kb/langchain_qdrant_aliases.py rollback --collection "$(collection)"
# ─── Logs ─────────────────────────────────────────────────────────────────────
logs:
	$(COMPOSE) logs -f
logs-api:
	$(COMPOSE) logs -f api
logs-worker:
	$(COMPOSE) logs -f worker
# ─── Shells ───────────────────────────────────────────────────────────────────
api-shell:
	$(COMPOSE) exec api bash
worker-shell:
	$(COMPOSE) exec worker bash
db-shell:
	$(COMPOSE) exec db psql -U postgres -d ai_code_review_platform
# ─── Security Utilities ───────────────────────────────────────────────────────
generate-fernet-key:
	@python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# ——— Oracle Production Helpers ——————————————————————————————————————————————
prod-build:
	$(PROD_COMPOSE) build
prod-migrate:
	$(PROD_COMPOSE) run --rm api alembic -c /app/alembic.ini upgrade head
prod-up:
	$(PROD_COMPOSE) up -d
prod-down:
	$(PROD_COMPOSE) down
prod-logs:
	$(PROD_COMPOSE) logs -f

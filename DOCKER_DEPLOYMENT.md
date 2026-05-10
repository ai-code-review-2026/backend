# Docker Deployment Guide - AI Code Review Backend

This directory contains production-ready Docker configurations for deploying the AI Code Review Platform backend.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment Scenarios](#deployment-scenarios)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)
- [Security](#security)

## 🎯 Overview

The backend consists of:

- **FastAPI API Server** - HTTP REST API for code analysis requests
- **Celery Workers** - Asynchronous task processing for analysis pipeline
- **PostgreSQL** - Relational database for analysis results and metadata
- **Redis** - Message broker for Celery + caching layer
- **Neo4j** - Graph database + vector store for GraphRAG knowledge base
- **MinIO** - S3-compatible object storage for artifacts

## 🏗 Architecture

```
┌─────────────────┐      ┌─────────────────┐
│   Dashboard     │────▶ │  FastAPI API    │
│  (Next.js)      │      │   (Port 8000)   │
└─────────────────┘      └─────────────────┘
                                │
                                ▼
                         ┌─────────────┐
                         │    Redis    │◀─────┐
                         │  (Queue)    │      │
                         └─────────────┘      │
                                              │
                         ┌─────────────┐      │
                         │   Celery    │──────┘
                         │   Worker    │
                         └─────────────┘
                                │
                    ┌───────────┴───────────┐
                    ▼                       ▼
            ┌──────────────┐        ┌──────────────┐
            │  PostgreSQL  │        │    Neo4j     │
            │  (Metadata)  │        │  (GraphRAG)  │
            └──────────────┘        └──────────────┘
```

## 📦 Prerequisites

- Docker 24.0+ with BuildKit enabled
- Docker Compose 2.20+
- At least 8GB RAM available for containers
- At least 20GB disk space

**On Windows:**
- WSL2 backend enabled
- File sharing configured for workspace directory

**On Linux:**
- User added to `docker` group: `sudo usermod -aG docker $USER`

## 🚀 Quick Start

### 1. Build the Docker image

```bash
cd apps/backend
docker build -f Dockerfile.complete --target runtime -t ai-review-backend:latest .
```

### 2. Start all services

```bash
docker-compose -f docker-compose.complete.yml up -d
```

### 3. Run database migrations

```bash
docker-compose -f docker-compose.complete.yml exec backend alembic upgrade head
```

### 4. Verify services

```bash
# Check all containers are healthy
docker-compose -f docker-compose.complete.yml ps

# View API logs
docker-compose -f docker-compose.complete.yml logs -f backend

# View worker logs
docker-compose -f docker-compose.complete.yml logs -f worker

# Test API health endpoint
curl http://localhost:8000/health
```

### 5. Access services

- **API Server**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **Neo4j Browser**: http://localhost:7474 (user: `neo4j`, password: `ai-review-neo4j-password`)
- **MinIO Console**: http://localhost:9001 (user: `minioadmin`, password: `minioadmin`)

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the **project root** (not in `apps/backend`):

```bash
# Copy from example
cp ../../.env.example ../../.env

# Edit with your values
nano ../../.env
```

Key variables to configure:

```bash
# Database
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/ai_code_review

# Redis
REDIS_URL=redis://localhost:6380/0
CELERY_BROKER_URL=redis://localhost:6380/0
CELERY_RESULT_BACKEND=redis://localhost:6380/1

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your-secure-password

# Authentication
CLERK_AUTH_ENABLED=true
CLERK_ISSUER_URL=https://your-app.clerk.accounts.dev
CLERK_SECRET_KEY=sk_test_...

# Secrets encryption (generate with: make generate-fernet-key)
SECRETS_ENCRYPTION_KEY=...

# LLM (optional)
LLM_ENABLED=true
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# Static Analysis
STATIC_ANALYSIS_GIT_TOKEN=github_pat_...
```

### Docker Compose Overrides

Create `docker-compose.override.yml` for local customizations:

```yaml
version: "3.9"

services:
  backend:
    ports:
      - "8001:8000"  # Use different port
    environment:
      LOG_LEVEL: debug  # More verbose logging
    volumes:
      - ./custom-config.yml:/app/config.yml

  worker:
    environment:
      CELERY_CONCURRENCY: 8  # More workers
```

## 🎬 Deployment Scenarios

### Scenario 1: Development (Hot Reload)

Build development image with hot reload:

```bash
docker build -f Dockerfile.complete --target development -t ai-review-backend:dev .
```

Run with code mounting:

```bash
docker run -p 8000:8000 \
  --env-file ../../.env \
  -v $(pwd)/app:/app/app \
  ai-review-backend:dev
```

### Scenario 2: Production (All Services)

Start full stack:

```bash
docker-compose -f docker-compose.complete.yml up -d
docker-compose -f docker-compose.complete.yml exec backend alembic upgrade head
```

### Scenario 3: Scale Workers

Increase worker count for high load:

```bash
docker-compose -f docker-compose.complete.yml up -d --scale worker=5
```

### Scenario 4: External Databases

If using managed PostgreSQL/Redis/Neo4j, start only API + worker:

```bash
docker-compose -f docker-compose.complete.yml up -d backend worker
```

Update `.env` with external database URLs.

### Scenario 5: With Monitoring

Start with Prometheus + Grafana:

```bash
docker-compose -f docker-compose.complete.yml --profile monitoring up -d
```

Access:
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3030 (admin/admin)

## 📊 Monitoring

### Health Checks

All services have health checks configured:

```bash
# Check health status
docker-compose -f docker-compose.complete.yml ps

# Expected output:
# NAME                    STATUS
# ai-review-backend       Up (healthy)
# ai-review-worker        Up (healthy)
# ai-review-postgres      Up (healthy)
# ai-review-redis         Up (healthy)
# ai-review-neo4j         Up (healthy)
# ai-review-minio         Up (healthy)
```

### Logs

```bash
# All services
docker-compose -f docker-compose.complete.yml logs -f

# Specific service
docker-compose -f docker-compose.complete.yml logs -f backend

# Last 100 lines
docker-compose -f docker-compose.complete.yml logs --tail=100 worker

# Filter by timestamp
docker-compose -f docker-compose.complete.yml logs --since 30m backend
```

### Metrics

Backend exposes Prometheus metrics at `/metrics`:

```bash
curl http://localhost:8000/metrics
```

Key metrics:
- `http_requests_total` - Total HTTP requests by method/path/status
- `http_request_duration_seconds` - Request latency histogram
- `process_resident_memory_bytes` - Memory usage
- `celery_tasks_total` - Celery task counts

### Grafana Dashboards

1. Access Grafana: http://localhost:3030
2. Login: `admin` / `admin`
3. Add Prometheus datasource: `http://prometheus:9090`
4. Import dashboard ID: `17375` (FastAPI observability)

## 🔧 Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose -f docker-compose.complete.yml logs backend

# Common issues:
# - Missing .env file → Copy from .env.example
# - Port conflict → Change ports in docker-compose.yml
# - Out of memory → Increase Docker memory limit
```

### Database connection errors

```bash
# Verify PostgreSQL is healthy
docker-compose -f docker-compose.complete.yml ps postgres

# Test connection from backend container
docker-compose -f docker-compose.complete.yml exec backend \
  python -c "from app.data.database import get_db_connection; get_db_connection()"

# Reset database
docker-compose -f docker-compose.complete.yml down -v
docker-compose -f docker-compose.complete.yml up -d postgres
sleep 10
docker-compose -f docker-compose.complete.yml exec backend alembic upgrade head
```

### Celery worker not processing tasks

```bash
# Check worker logs
docker-compose -f docker-compose.complete.yml logs worker

# Verify worker is connected to Redis
docker-compose -f docker-compose.complete.yml exec worker \
  celery -A app.workers.celery_app inspect ping

# Check queue depth
docker-compose -f docker-compose.complete.yml exec redis redis-cli llen analyses

# Purge queue
docker-compose -f docker-compose.complete.yml exec worker \
  celery -A app.workers.celery_app purge
```

### Out of memory

```bash
# Check memory usage
docker stats

# Reduce worker concurrency in docker-compose.yml:
# CELERY_CONCURRENCY: 2

# Restart with limits
docker-compose -f docker-compose.complete.yml up -d --force-recreate
```

### Neo4j connection timeout

```bash
# Neo4j can take 60s to fully start
docker-compose -f docker-compose.complete.yml logs neo4j

# Wait for "Started" message, then test:
docker-compose -f docker-compose.complete.yml exec backend \
  python -c "from neo4j import GraphDatabase; driver = GraphDatabase.driver('bolt://neo4j:7687', auth=('neo4j', 'ai-review-neo4j-password')); driver.verify_connectivity(); print('OK')"
```

## 🔒 Security

### Production Hardening

**1. Change default passwords:**

```bash
# In .env:
NEO4J_PASSWORD=<generate-strong-password>
MINIO_ROOT_PASSWORD=<generate-strong-password>

# In docker-compose.yml:
POSTGRES_PASSWORD: <generate-strong-password>
```

**2. Use secrets management:**

```bash
# Docker secrets (Swarm mode)
echo "my-secret-key" | docker secret create clerk_secret_key -

# Then in docker-compose.yml:
secrets:
  - clerk_secret_key
```

**3. Enable TLS:**

```yaml
# Add to backend service:
environment:
  MINIO_SECURE: "true"
  NEO4J_URI: "neo4j+s://neo4j:7687"
```

**4. Network isolation:**

```yaml
# Remove port exposures for internal services
# postgres:
#   ports:  # Remove this
#     - "5432:5432"
```

**5. Run as non-root:**

Already configured in `Dockerfile.complete` (UID 1000).

**6. Scan images:**

```bash
# Using Trivy
trivy image ai-review-backend:latest

# Using Docker Scout
docker scout cves ai-review-backend:latest
```

### Secret Scanning

The backend automatically scans diffs for secrets. Ensure:

```bash
# In .env:
SECRET_SCAN_ENABLED=true
SECRETS_ENCRYPTION_KEY=<fernet-key>
```

## 📝 Maintenance

### Backup

```bash
# PostgreSQL backup
docker-compose -f docker-compose.complete.yml exec postgres \
  pg_dump -U postgres ai_code_review > backup_$(date +%Y%m%d).sql

# Neo4j backup
docker-compose -f docker-compose.complete.yml exec neo4j \
  neo4j-admin database dump neo4j --to-path=/backups

# MinIO backup (use mc client)
docker run --rm --network ai-review-backend-net \
  --entrypoint sh minio/mc -c "
    mc alias set local http://minio:9000 minioadmin minioadmin
    mc mirror local/ai-review-artifacts /backups
  "
```

### Restore

```bash
# PostgreSQL restore
cat backup_20260425.sql | docker-compose -f docker-compose.complete.yml exec -T postgres \
  psql -U postgres ai_code_review
```

### Update

```bash
# Pull latest code
git pull

# Rebuild image
docker build -f Dockerfile.complete --target runtime -t ai-review-backend:latest .

# Restart services
docker-compose -f docker-compose.complete.yml up -d --force-recreate backend worker

# Run migrations
docker-compose -f docker-compose.complete.yml exec backend alembic upgrade head
```

## 📚 Additional Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [Celery Documentation](https://docs.celeryproject.org/)
- [Neo4j Documentation](https://neo4j.com/docs/)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

## 📧 Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/ai-code-review-platform/issues
- Documentation: See `CLAUDE.md` in project root

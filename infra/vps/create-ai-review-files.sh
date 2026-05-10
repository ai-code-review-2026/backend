#!/usr/bin/env bash
set -e

PUBLIC_IP="135.125.100.150"
DOMAIN="dev-ora.tn"
EMAIL="bejaouiahmed053@gmail.com"

echo "========================================="
echo "Configuration AI Review / Devora"
echo "========================================="
read -p "Tape ton username Docker Hub : " DOCKER_USER

if [ -z "$DOCKER_USER" ]; then
  echo "Erreur: Docker Hub username vide."
  exit 1
fi

mkdir -p /opt/ai-review/infra/prometheus
mkdir -p /opt/ai-review/infra/grafana/provisioning/datasources
mkdir -p /opt/ai-review/backend
mkdir -p /opt/ai-review/frontend

POSTGRES_PASSWORD=$(openssl rand -hex 16)
PGADMIN_PASSWORD=$(openssl rand -hex 16)
MINIO_PASSWORD=$(openssl rand -hex 16)
NEO4J_PASSWORD=$(openssl rand -hex 16)
GRAFANA_PASSWORD=$(openssl rand -hex 16)
SECRETS_ENCRYPTION_KEY=$(openssl rand -hex 32)
GITHUB_WEBHOOK_SECRET=$(openssl rand -hex 24)

cat > /opt/ai-review/.deploy.env <<EOF
DOCKER_USER=$DOCKER_USER
PUBLIC_IP=$PUBLIC_IP
DOMAIN=$DOMAIN
EMAIL=$EMAIL
EOF

cat > /root/ai-review-generated-passwords.txt <<EOF
AI REVIEW GENERATED PASSWORDS
=============================

PostgreSQL:
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=ai_code_review

pgAdmin:
URL with tunnel: http://localhost:5050
PGADMIN_EMAIL=admin@$DOMAIN
PGADMIN_PASSWORD=$PGADMIN_PASSWORD

MinIO:
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=$MINIO_PASSWORD

Neo4j:
NEO4J_USER=neo4j
NEO4J_PASSWORD=$NEO4J_PASSWORD

Grafana:
URL with tunnel: http://localhost:3000
GRAFANA_USER=admin
GRAFANA_PASSWORD=$GRAFANA_PASSWORD

GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET
SECRETS_ENCRYPTION_KEY=$SECRETS_ENCRYPTION_KEY
EOF

chmod 600 /root/ai-review-generated-passwords.txt

cat > /opt/ai-review/infra/.env <<EOF
POSTGRES_DB=ai_code_review
POSTGRES_USER=postgres
POSTGRES_PASSWORD=$POSTGRES_PASSWORD

PGADMIN_EMAIL=admin@$DOMAIN
PGADMIN_PASSWORD=$PGADMIN_PASSWORD

MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=$MINIO_PASSWORD

NEO4J_USER=neo4j
NEO4J_PASSWORD=$NEO4J_PASSWORD

GRAFANA_PASSWORD=$GRAFANA_PASSWORD
EOF

cat > /opt/ai-review/infra/prometheus/prometheus.yml <<'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: "prometheus"
    static_configs:
      - targets:
          - "prometheus:9090"

  - job_name: "vps-node-exporter"
    static_configs:
      - targets:
          - "node-exporter:9100"

  - job_name: "docker-cadvisor"
    static_configs:
      - targets:
          - "cadvisor:8080"

  - job_name: "ai-review-api"
    metrics_path: "/metrics"
    static_configs:
      - targets:
          - "ai-review-api:8000"
EOF

cat > /opt/ai-review/infra/grafana/provisioning/datasources/prometheus.yml <<'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
EOF

cat > /opt/ai-review/infra/docker-compose.yml <<'EOF'
networks:
  ai-review-network:
    name: ai-review-network
    driver: bridge

volumes:
  postgres_data:
  redis_data:
  qdrant_data:
  neo4j_data:
  neo4j_logs:
  minio_data:
  grafana_data:
  pgadmin_data:
  prometheus_data:

services:
  postgres:
    image: postgres:15
    container_name: ai-review-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 10s

  pgadmin:
    image: dpage/pgadmin4:latest
    container_name: ai-review-pgadmin
    restart: unless-stopped
    environment:
      PGADMIN_DEFAULT_EMAIL: ${PGADMIN_EMAIL}
      PGADMIN_DEFAULT_PASSWORD: ${PGADMIN_PASSWORD}
      PGADMIN_LISTEN_PORT: 5050
    volumes:
      - pgadmin_data:/var/lib/pgadmin
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:5050:5050"
    depends_on:
      postgres:
        condition: service_healthy

  redis:
    image: redis:7-alpine
    container_name: ai-review-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--maxmemory", "512mb"]
    volumes:
      - redis_data:/data
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 20
      start_period: 5s

  qdrant:
    image: qdrant/qdrant:v1.9.2
    container_name: ai-review-qdrant
    restart: unless-stopped
    volumes:
      - qdrant_data:/qdrant/storage
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:6333:6333"

  neo4j:
    image: neo4j:5.15-community
    container_name: ai-review-neo4j
    restart: unless-stopped
    environment:
      NEO4J_AUTH: "${NEO4J_USER}/${NEO4J_PASSWORD}"
      NEO4J_PLUGINS: '["apoc"]'
      NEO4J_dbms_security_procedures_unrestricted: "apoc.*"
      NEO4J_dbms_memory_heap_initial__size: "512m"
      NEO4J_dbms_memory_heap_max__size: "1G"
      NEO4J_dbms_memory_pagecache_size: "256m"
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:7474:7474"
      - "127.0.0.1:7687:7687"
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:7474 || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 10
      start_period: 40s

  minio:
    image: minio/minio:RELEASE.2024-03-21T23-13-43Z
    container_name: ai-review-minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    volumes:
      - minio_data:/data
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    healthcheck:
      test: ["CMD-SHELL", "mc ready local || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 15s

  prometheus:
    image: prom/prometheus:latest
    container_name: ai-review-prometheus
    restart: unless-stopped
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:9090:9090"
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--web.enable-lifecycle"
    depends_on:
      - node-exporter
      - cadvisor

  node-exporter:
    image: prom/node-exporter:latest
    container_name: ai-review-node-exporter
    restart: unless-stopped
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:9100:9100"
    command:
      - "--path.rootfs=/host"
    volumes:
      - "/:/host:ro,rslave"

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    container_name: ai-review-cadvisor
    restart: unless-stopped
    privileged: true
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - "/:/rootfs:ro"
      - "/var/run:/var/run:ro"
      - "/sys:/sys:ro"
      - "/var/lib/docker/:/var/lib/docker:ro"
      - "/dev/disk/:/dev/disk:ro"

  grafana:
    image: grafana/grafana:10.4.2
    container_name: ai-review-grafana
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_PASSWORD}
      GF_USERS_ALLOW_SIGN_UP: "false"
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:3000:3000"

  flower:
    image: mher/flower:2.0
    container_name: ai-review-flower
    restart: unless-stopped
    command: celery --broker=redis://ai-review-redis:6379/0 flower --port=5555
    networks:
      - ai-review-network
    ports:
      - "127.0.0.1:5555:5555"
    depends_on:
      redis:
        condition: service_healthy
EOF

cat > /opt/ai-review/backend/.env <<EOF
ENV=production

DATABASE_URL=postgresql+psycopg://postgres:$POSTGRES_PASSWORD@ai-review-postgres:5432/ai_code_review

REDIS_URL=redis://ai-review-redis:6379/0
CELERY_BROKER_URL=redis://ai-review-redis:6379/0
CELERY_RESULT_BACKEND=redis://ai-review-redis:6379/1
ANALYSIS_QUEUE_NAME=analyses
CELERY_WORKER_POOL=prefork

QDRANT_ENABLED=true
QDRANT_MODE=http
QDRANT_URL=http://ai-review-qdrant:6333

NEO4J_ENABLED=false
NEO4J_URI=bolt://ai-review-neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=$NEO4J_PASSWORD

OBJECT_STORAGE_ENABLED=true
MINIO_ENDPOINT=ai-review-minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=$MINIO_PASSWORD
MINIO_BUCKET=ai-review-artifacts
MINIO_SECURE=false

SECRETS_ENCRYPTION_KEY=$SECRETS_ENCRYPTION_KEY
GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET

CLERK_AUTH_ENABLED=false
CLERK_ISSUER_URL=
CLERK_JWKS_URL=

LLM_ENABLED=false
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-20250514

CORS_ALLOWED_ORIGINS=http://$PUBLIC_IP:3001

STATIC_ANALYSIS_ENABLED=true
STATIC_ANALYSIS_WORKSPACE_PATH=/var/ai-review/workspace
STATIC_ANALYSIS_CHECKOUT_BASE_PATH=/var/ai-review/workspace
REPO_CONTEXT_ALLOWED_ROOTS=/var/ai-review/workspace

REVIEW_INTELLIGENCE_ENABLED=true
REVIEW_INTELLIGENCE_REQUIRE_QDRANT=true

EMAIL_ENABLED=false
SENDGRID_API_KEY=

RBAC_ENFORCEMENT_ENABLED=false
EOF

cat > /opt/ai-review/backend/docker-compose.yml <<EOF
networks:
  ai-review-network:
    external: true
    name: ai-review-network

volumes:
  analysis_workspace:

services:
  api:
    image: $DOCKER_USER/ai-review-api:latest
    container_name: ai-review-api
    restart: unless-stopped
    command: >
      /bin/sh -c "
        alembic -c /app/alembic.ini upgrade head &&
        exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
      "
    env_file:
      - .env
    volumes:
      - analysis_workspace:/var/ai-review/workspace
    networks:
      - ai-review-network
    ports:
      - "8000:8000"
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')\""]
      interval: 15s
      timeout: 10s
      retries: 10
      start_period: 60s

  worker:
    image: $DOCKER_USER/ai-review-api:latest
    container_name: ai-review-worker
    restart: unless-stopped
    command:
      - celery
      - -A
      - app.workers.celery_app.celery_app
      - worker
      - --loglevel=info
      - -Q
      - analyses
      - --concurrency=2
      - --pool=prefork
    env_file:
      - .env
    volumes:
      - analysis_workspace:/var/ai-review/workspace
    networks:
      - ai-review-network
    depends_on:
      api:
        condition: service_healthy
EOF

cat > /opt/ai-review/frontend/.env <<EOF
NODE_ENV=production
PORT=3001

BACKEND_API_URL=http://ai-review-api:8000

NEXT_PUBLIC_API_URL=http://$PUBLIC_IP:3001
NEXT_PUBLIC_APP_URL=http://$PUBLIC_IP:3001
NEXT_PUBLIC_BACKEND_URL=http://$PUBLIC_IP:8000
NEXT_PUBLIC_Y_WEBSOCKET_URL=ws://$PUBLIC_IP:1234

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
CLERK_SECRET_KEY=

GITHUB_WEBHOOK_SECRET=$GITHUB_WEBHOOK_SECRET
EOF

cat > /opt/ai-review/frontend/docker-compose.yml <<EOF
networks:
  ai-review-network:
    external: true
    name: ai-review-network

services:
  dashboard:
    image: $DOCKER_USER/ai-review-dashboard:latest
    container_name: ai-review-dashboard
    restart: unless-stopped
    env_file:
      - .env
    networks:
      - ai-review-network
    ports:
      - "3001:3001"
    healthcheck:
      test: ["CMD-SHELL", "node -e \"fetch('http://localhost:3001').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      interval: 15s
      timeout: 10s
      retries: 10
      start_period: 30s

  yjs:
    image: $DOCKER_USER/ai-review-yjs:latest
    container_name: ai-review-yjs
    restart: unless-stopped
    environment:
      PORT: "1234"
    env_file:
      - .env
    networks:
      - ai-review-network
    ports:
      - "1234:1234"
EOF

echo "========================================="
echo "Fichiers créés avec succès."
echo "Mots de passe : /root/ai-review-generated-passwords.txt"
echo "========================================="

# VPS Deployment Layout

This folder aligns the repository with the deployment guide used for the current project:

- `infra/vps/docker-compose.yml`: infrastructure stack for PostgreSQL, Redis, Qdrant, Neo4j, MinIO, Prometheus, Grafana, pgAdmin, Flower
- `infra/vps/backend/`: backend compose and environment template
- `infra/vps/frontend/`: frontend compose and environment template
- `infra/vps/prometheus/`: Prometheus scrape config
- `infra/vps/grafana/`: Grafana provisioning
- `infra/vps/create-ai-review-files.sh`: VPS bootstrap script for `/opt/ai-review`
- `infra/vps/setup-nginx-devora.sh`: Nginx and Certbot setup

The guide is split in two phases:

1. Deploy by public IP while the domain is not active.
2. Switch to DNS + Nginx + HTTPS once the domain is ready.

The current repository remains a monorepo. The guide's `backend`, `frontend`, and `infra` separation is represented through subfolders and dedicated compose files instead of physically splitting the application codebase.

# 🐳 Dashboard Docker Setup - Quick Reference

Complete production-ready Docker configuration for Next.js 16 dashboard.

---

## 📁 Files Created

| File | Purpose |
|------|---------|
| `Dockerfile.production` | Multi-stage production Dockerfile (5 stages) |
| `.dockerignore.production` | Build context exclusions (130+ patterns) |
| `docker-compose.dashboard.yml` | Full stack orchestration |
| `.env.docker.example` | Environment variable template |
| `Makefile.dashboard` | 40+ Docker commands |
| `DOCKER_DEPLOYMENT.md` | Complete deployment guide (7000+ words) |
| `app/api/health/route.ts` | Health check endpoint for Docker |

---

## ⚡ Quick Start

```bash
cd apps/dashboard

# 1. Configure environment
cp .env.docker.example .env.docker
# Edit .env.docker → add Clerk keys

# 2. Build & run
make -f Makefile.dashboard quick-start

# 3. Access
open http://localhost:3001
```

---

## 🎯 Key Features

### Multi-Stage Build
- **Stage 1 (base)**: Node 20 + security updates
- **Stage 2 (deps)**: Install dependencies with retry logic
- **Stage 3 (builder)**: Build Next.js + prune dev deps
- **Stage 4 (runtime)**: Production server (non-root, minimal)
- **Stage 5 (development)**: Hot reload with volume mounts

### Security
✅ Non-root user (nextjs:1001)  
✅ Minimal base image (~150MB)  
✅ No secrets in layers  
✅ Health checks  
✅ dumb-init (proper signal handling)

### Performance
✅ Layer caching (fast rebuilds)  
✅ Dev deps pruned (60% size reduction)  
✅ Network retry logic (stable builds)  
✅ Multi-stage (separates build from runtime)

---

## 📋 Common Commands

```bash
# Build
make -f Makefile.dashboard build              # Production image
make -f Makefile.dashboard build-dev          # Dev image

# Run
make -f Makefile.dashboard up                 # Production mode
make -f Makefile.dashboard dev                # Dev with hot reload

# Debug
make -f Makefile.dashboard logs               # View logs
make -f Makefile.dashboard shell              # Container shell
make -f Makefile.dashboard health             # Health check

# Maintenance
make -f Makefile.dashboard restart            # Restart container
make -f Makefile.dashboard clean              # Remove containers
make -f Makefile.dashboard fresh              # Nuclear option

# Docker Hub
make -f Makefile.dashboard push               # Push to registry
make -f Makefile.dashboard tag VERSION=1.0.0  # Tag version
```

---

## 🔧 Configuration

### Required Environment Variables

```bash
# .env.docker (minimum required)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
BACKEND_API_URL=http://backend:8000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

### Build Arguments (optional)

```bash
# Override at build time
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://dashboard.example.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx \
  -f Dockerfile.production .
```

---

## 🎭 Deployment Scenarios

### 1. Standalone Dashboard

```bash
# Backend on host
BACKEND_API_URL=http://host.docker.internal:8000
docker-compose -f docker-compose.dashboard.yml up dashboard
```

### 2. Full Stack

```bash
# Dashboard + Backend + Postgres + Redis
docker-compose -f docker-compose.dashboard.yml up -d
```

### 3. Development Mode

```bash
# Hot reload with volume mounts
docker-compose -f docker-compose.dashboard.yml --profile development up dashboard-dev
```

### 4. Production

```bash
# Custom domain with HTTPS
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://dashboard.example.com \
  -t dashboard:prod -f Dockerfile.production .
```

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails (network) | Retry logic already configured. Check `docker build --progress=plain` |
| "Clerk not loaded" | Verify keys: `grep CLERK .env.docker` |
| Backend fetch fails | Check `BACKEND_API_URL` (use `backend:8000` for Docker) |
| Hot reload not working | Use dev profile: `make -f Makefile.dashboard dev` |
| Container restarting | Check logs: `make -f Makefile.dashboard logs` |
| Image too large (>1GB) | Expected: ~500MB. Check `make -f Makefile.dashboard image-size` |

---

## 📊 Image Sizes

| Target | Size | Use Case |
|--------|------|----------|
| `runtime` | ~500 MB | Production deployment |
| `development` | ~1.2 GB | Local dev with hot reload |

---

## 🚀 CI/CD Integration

```yaml
# .github/workflows/dashboard-docker.yml
- name: Build Dashboard
  working-directory: apps/dashboard
  run: |
    docker build -t ahmedaminbejaoui/ai-review-dashboard:${{ github.sha }} \
      -f Dockerfile.production .
    docker push ahmedaminbejaoui/ai-review-dashboard:${{ github.sha }}
```

---

## 📚 Documentation

For complete guide, see:
- **[DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md)** - Full deployment guide (troubleshooting, security, monitoring)
- **[.env.docker.example](.env.docker.example)** - All environment variables
- **[Makefile.dashboard](Makefile.dashboard)** - All available commands

---

## 🎯 Architecture

```
Browser (localhost:3001)
    │
    ├─ Client-side calls ──→ NEXT_PUBLIC_BACKEND_URL ──→ Backend (localhost:8000)
    │
    └─ Dashboard Container (0.0.0.0:3001)
           │
           ├─ Server-side API routes ──→ BACKEND_API_URL ──→ Backend Container (backend:8000)
           │
           └─ Y.js WebSocket ──→ ws://y-websocket:1234
```

---

## ✅ Production Checklist

- [ ] Use HTTPS URLs (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`)
- [ ] Use Clerk production keys (`pk_live_*`, `sk_live_*`)
- [ ] Set `NODE_ENV=production`
- [ ] Configure `GITHUB_WEBHOOK_SECRET`
- [ ] Enable CORS on backend for dashboard domain
- [ ] Use secrets management (not .env files)
- [ ] Set up monitoring (health checks, logs)
- [ ] Configure rate limiting in Clerk
- [ ] Test with `make -f Makefile.dashboard test-build`

---

**Need help?** See [DOCKER_DEPLOYMENT.md](DOCKER_DEPLOYMENT.md) for detailed troubleshooting guide.

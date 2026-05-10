# 🐳 Dashboard Docker Deployment Guide

Production-ready Docker setup for AI Code Review Platform Dashboard (Next.js 16 + Clerk).

---

## 📦 What's Included

| File | Purpose |
|------|---------|
| `Dockerfile.production` | Multi-stage Dockerfile (runtime + development targets) |
| `.dockerignore.production` | Excludes 130+ patterns (tests, logs, secrets, node_modules) |
| `docker-compose.dashboard.yml` | Orchestrates dashboard, Y.js WebSocket, and backend |
| `.env.docker.example` | Environment variable template |
| `Makefile.dashboard` | 40+ make commands for Docker operations |

---

## 🚀 Quick Start (5 minutes)

### 1. Configure Environment

```bash
cd apps/dashboard

# Copy and edit environment file
cp .env.docker.example .env.docker
nano .env.docker  # Fill in CLERK keys
```

**Required variables:**
```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
```

### 2. Build & Run

```bash
# Using Makefile (recommended)
make -f Makefile.dashboard quick-start

# Or manually
docker-compose -f docker-compose.dashboard.yml build
docker-compose -f docker-compose.dashboard.yml up -d
```

### 3. Verify

```bash
# Check health
curl http://localhost:3001/api/health

# View logs
make -f Makefile.dashboard logs

# Open in browser
open http://localhost:3001
```

---

## 🏗️ Architecture

### Multi-Stage Build

```
┌─────────────────────────────────────────────────────────┐
│ Stage 1: base                                           │
│ - Node 20 bookworm-slim                                 │
│ - Security updates, dumb-init                           │
└────────────────┬────────────────────────────────────────┘
                 │
     ┌───────────┴───────────┐
     │                       │
┌────▼─────────────┐  ┌──────▼──────────────────────────┐
│ Stage 2: deps    │  │ Stage 5: development            │
│ - npm ci         │  │ - Hot reload (dev server)       │
│ - All deps       │  │ - Volume mounts for source      │
└────┬─────────────┘  └─────────────────────────────────┘
     │
┌────▼──────────────────┐
│ Stage 3: builder      │
│ - npm run build       │
│ - Prune dev deps      │
└────┬──────────────────┘
     │
┌────▼──────────────────┐
│ Stage 4: runtime      │  ← DEFAULT (production)
│ - Non-root user       │
│ - Minimal artifacts   │
│ - Health checks       │
└───────────────────────┘
```

### Image Sizes

| Target | Size | Use Case |
|--------|------|----------|
| `runtime` (default) | ~500 MB | Production deployment |
| `development` | ~1.2 GB | Local development with hot reload |

---

## 📋 Common Commands

### Build

```bash
# Production image
make -f Makefile.dashboard build

# Development image
make -f Makefile.dashboard build-dev

# Rebuild without cache
make -f Makefile.dashboard build-no-cache

# Build specific target
docker build --target runtime -t dashboard:prod -f Dockerfile.production .
```

### Run

```bash
# Production mode
make -f Makefile.dashboard up

# Development mode (hot reload)
make -f Makefile.dashboard dev

# All services (dashboard + y-websocket + backend)
make -f Makefile.dashboard up-all

# Specific service
docker-compose -f docker-compose.dashboard.yml up dashboard
```

### Logs & Debug

```bash
# Follow dashboard logs
make -f Makefile.dashboard logs

# All service logs
make -f Makefile.dashboard logs-all

# Shell into container
make -f Makefile.dashboard shell

# Root shell (for debugging)
make -f Makefile.dashboard shell-root
```

### Maintenance

```bash
# Restart dashboard
make -f Makefile.dashboard restart

# Stop all services
make -f Makefile.dashboard down

# Clean containers + volumes
make -f Makefile.dashboard clean

# Remove images
make -f Makefile.dashboard clean-images

# Fresh start (nuclear option)
make -f Makefile.dashboard fresh
```

---

## 🔧 Configuration

### Environment Variables

#### Build-time (ARG in Dockerfile)
Baked into `.next/` build output at compile time:

```dockerfile
ARG NEXT_PUBLIC_API_URL="http://localhost:3001"
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=""
```

**To override during build:**
```bash
docker build --build-arg NEXT_PUBLIC_API_URL=https://dashboard.example.com -f Dockerfile.production .
```

#### Runtime (ENV in docker-compose)
Server-side variables, can be changed without rebuild:

```yaml
environment:
  BACKEND_API_URL: http://backend:8000
  CLERK_SECRET_KEY: sk_test_xxxxx
```

### Full Variable Reference

See `.env.docker.example` for complete list. Key categories:

| Category | Examples |
|----------|----------|
| **Clerk Auth** | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` |
| **Backend** | `BACKEND_API_URL`, `NEXT_PUBLIC_BACKEND_URL` |
| **URLs** | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` |
| **WebSocket** | `NEXT_PUBLIC_Y_WEBSOCKET_URL` |
| **GitHub** | `GITHUB_WEBHOOK_SECRET` |
| **Admin** | `DASHBOARD_ADMIN_EMAILS` |

---

## 🎯 Deployment Scenarios

### Scenario 1: Standalone Dashboard (Backend on Host)

```bash
# Backend running on host (localhost:8000)
cat > .env.docker <<EOF
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
BACKEND_API_URL=http://host.docker.internal:8000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
EOF

docker-compose -f docker-compose.dashboard.yml up dashboard
```

### Scenario 2: Full Stack (Dashboard + Backend)

```bash
# Backend in Docker (backend:8000)
cat > .env.docker <<EOF
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
BACKEND_API_URL=http://backend:8000
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
DATABASE_URL=postgresql+psycopg://user:pass@postgres:5432/db
REDIS_URL=redis://redis:6379/0
EOF

docker-compose -f docker-compose.dashboard.yml up -d
```

### Scenario 3: Development with Hot Reload

```bash
# Mount source code for instant changes
docker-compose -f docker-compose.dashboard.yml --profile development up dashboard-dev

# Edit files locally → changes reflected immediately
# No rebuild needed
```

### Scenario 4: Production with Custom Domain

```bash
# Build with production URLs
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://dashboard.example.com \
  --build-arg NEXT_PUBLIC_APP_URL=https://dashboard.example.com \
  --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_xxxxx \
  -t dashboard:prod \
  -f Dockerfile.production .

docker run -d \
  -p 3001:3001 \
  -e CLERK_SECRET_KEY=sk_live_xxxxx \
  -e BACKEND_API_URL=https://api.example.com \
  dashboard:prod
```

---

## 🔐 Security Hardening

### Applied in Dockerfile

✅ **Non-root user** (`nextjs:nextjs`, UID 1001)
✅ **Minimal base image** (node:20-bookworm-slim, ~150MB)
✅ **No secrets in layers** (.dockerignore excludes .env*)
✅ **Read-only mounts** (development volumes use `:ro`)
✅ **Health checks** (auto-restart on failure)
✅ **dumb-init** (proper signal handling, prevents zombie processes)

### Production Checklist

- [ ] Use HTTPS for `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_APP_URL`
- [ ] Set `NODE_ENV=production`
- [ ] Use Clerk **production** keys (`pk_live_*` / `sk_live_*`)
- [ ] Configure GitHub webhook secret (`GITHUB_WEBHOOK_SECRET`)
- [ ] Set strong `BACKEND_API_URL` (internal service discovery)
- [ ] Enable rate limiting in Clerk dashboard
- [ ] Configure CORS on backend to allow only dashboard domain
- [ ] Use secrets management (AWS Secrets Manager, HashiCorp Vault)

---

## 📊 Monitoring & Health Checks

### Built-in Health Check

The dashboard exposes a health endpoint:

```bash
curl http://localhost:3001/api/health
# Expected: 200 OK
```

Docker health check runs every 30s:
```yaml
healthcheck:
  test: ["CMD", "node", "-e", "require('http').get('http://localhost:3001/api/health', ...)"]
  interval: 30s
  timeout: 10s
  start_period: 40s
  retries: 3
```

### Monitoring Commands

```bash
# Check container status
make -f Makefile.dashboard status

# View resource usage
docker stats ai-review-dashboard

# Inspect health
docker inspect --format='{{.State.Health.Status}}' ai-review-dashboard
```

---

## 🐛 Troubleshooting

### Issue 1: Build fails with "npm ERR! network"

**Cause:** Network instability during `npm ci`

**Fix:**
```dockerfile
# Already configured in Dockerfile.production:
RUN npm config set fetch-retries 10 \
    && npm config set fetch-retry-mintimeout 100000 \
    && npm ci --legacy-peer-deps || npm ci --legacy-peer-deps
```

If still failing:
```bash
# Build with more verbose output
docker build --progress=plain -f Dockerfile.production .
```

---

### Issue 2: "Clerk is not loaded" error

**Cause:** Missing or invalid Clerk keys

**Fix:**
```bash
# 1. Verify keys in .env.docker
grep "CLERK" .env.docker

# 2. Check Clerk public key in build output
docker-compose -f docker-compose.dashboard.yml exec dashboard \
  printenv | grep CLERK

# 3. Rebuild with correct keys
docker-compose -f docker-compose.dashboard.yml build --no-cache dashboard
```

---

### Issue 3: "Failed to fetch" backend errors

**Cause:** Dashboard can't reach backend

**Fix:**

1. **Backend in Docker:**
   ```bash
   # Use service name (docker-compose DNS)
   BACKEND_API_URL=http://backend:8000
   ```

2. **Backend on host:**
   ```bash
   # Use host.docker.internal (Docker Desktop)
   BACKEND_API_URL=http://host.docker.internal:8000
   
   # OR use host IP
   BACKEND_API_URL=http://192.168.1.100:8000
   ```

3. **Verify network:**
   ```bash
   docker-compose -f docker-compose.dashboard.yml exec dashboard \
     curl http://backend:8000/health
   ```

---

### Issue 4: Hot reload not working in development

**Cause:** Volume mounts not configured correctly

**Fix:**
```bash
# Use development profile
docker-compose -f docker-compose.dashboard.yml --profile development up dashboard-dev

# Verify mounts
docker inspect ai-review-dashboard-dev | grep -A 10 Mounts

# Check file changes are synced
docker-compose -f docker-compose.dashboard.yml exec dashboard-dev ls -la /app/app
```

---

### Issue 5: Container keeps restarting

**Cause:** Health check failing or startup error

**Fix:**
```bash
# 1. Check logs
make -f Makefile.dashboard logs

# 2. Disable health check temporarily
docker-compose -f docker-compose.dashboard.yml up --no-healthcheck dashboard

# 3. Shell into container
make -f Makefile.dashboard shell

# 4. Test health endpoint manually
docker-compose -f docker-compose.dashboard.yml exec dashboard \
  node -e "require('http').get('http://localhost:3001/api/health', r => console.log(r.statusCode))"
```

---

### Issue 6: Large image size (>1GB)

**Cause:** Dev dependencies not pruned or node_modules bloat

**Fix:**
```bash
# 1. Verify npm prune ran in builder stage
docker history ahmedaminbejaoui/ai-review-dashboard:latest | grep prune

# 2. Check layer sizes
make -f Makefile.dashboard inspect

# 3. Rebuild with explicit prune
docker build --target runtime -f Dockerfile.production .

# 4. Compare sizes
make -f Makefile.dashboard image-size
```

Expected sizes:
- Base image: ~150 MB
- Dependencies: ~300 MB
- Build artifacts: ~50 MB
- **Total: ~500 MB**

---

## 🚢 Docker Hub Publishing

### Tag & Push

```bash
# Tag with version
docker tag ahmedaminbejaoui/ai-review-dashboard:latest ahmedaminbejaoui/ai-review-dashboard:1.0.0

# Push to Docker Hub
docker push ahmedaminbejaoui/ai-review-dashboard:latest
docker push ahmedaminbejaoui/ai-review-dashboard:1.0.0

# Or use Makefile
make -f Makefile.dashboard tag VERSION=1.0.0
make -f Makefile.dashboard push
```

### Automated CI/CD (GitHub Actions)

```yaml
# .github/workflows/dashboard-docker.yml
name: Build Dashboard Docker Image

on:
  push:
    branches: [main]
    paths:
      - 'apps/dashboard/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build image
        working-directory: apps/dashboard
        run: docker build -t ahmedaminbejaoui/ai-review-dashboard:${{ github.sha }} -f Dockerfile.production .
      
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Push image
        run: |
          docker push ahmedaminbejaoui/ai-review-dashboard:${{ github.sha }}
          docker tag ahmedaminbejaoui/ai-review-dashboard:${{ github.sha }} ahmedaminbejaoui/ai-review-dashboard:latest
          docker push ahmedaminbejaoui/ai-review-dashboard:latest
```

---

## 🔗 Integration with Backend

The dashboard communicates with backend via:

### 1. Server-side API Routes (`/app/api/dashboard/*`)

```typescript
// apps/dashboard/app/api/dashboard/projects/route.ts
const backendUrl = process.env.BACKEND_API_URL || 'http://localhost:8000'
const response = await fetch(`${backendUrl}/api/v1/projects`, {
  headers: { Authorization: `Bearer ${token}` }
})
```

**Docker config:**
```yaml
environment:
  BACKEND_API_URL: http://backend:8000  # Service name (internal)
```

### 2. Client-side Direct Calls

```typescript
// apps/dashboard/lib/api-client.ts
const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'
```

**Docker config:**
```yaml
environment:
  NEXT_PUBLIC_BACKEND_URL: http://localhost:8000  # Public URL (browser)
```

### Network Topology

```
Browser (localhost:3001)
    │
    ├─ NEXT_PUBLIC_BACKEND_URL ──→ Backend (localhost:8000)
    │                               Public API calls
    │
    └─ Dashboard Container
           │
           └─ BACKEND_API_URL ──→ Backend Container (backend:8000)
                                  Server-side API routes
```

---

## 📚 Additional Resources

- [Next.js Docker Deployment](https://nextjs.org/docs/deployment#docker-image)
- [Clerk Next.js Integration](https://clerk.com/docs/quickstarts/nextjs)
- [Docker Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
- [Docker Compose Profiles](https://docs.docker.com/compose/profiles/)

---

## 🎓 Best Practices Summary

✅ **Use multi-stage builds** (separates build deps from runtime)
✅ **Layer caching** (copy package.json before source code)
✅ **Prune dev deps** (`npm prune --omit=dev`)
✅ **Non-root user** (security)
✅ **Health checks** (auto-recovery)
✅ **.dockerignore** (smaller context, faster builds)
✅ **Secrets via ENV** (never bake into image layers)
✅ **Explicit versions** (node:20, not node:latest)
✅ **dumb-init** (proper PID 1 process handling)
✅ **Read-only volumes** (development mounts)

---

**Need help?** Open an issue at [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode)

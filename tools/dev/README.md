# Development Tools

Development scripts for local development, tunneling, and debugging.

## Scripts

### dev_backend_ngrok.py
Starts ngrok tunnel on port 8000, updates `.env` with public URL, then starts uvicorn with hot reload.

**Usage:**
```bash
python tools/dev/dev_backend_ngrok.py
# Or via Makefile:
make dev-backend-ngrok
```

### dev_backend_cloudflare.py
Starts Cloudflare Quick Tunnel to localhost:8000, updates `.env` with tunnel URL, then starts uvicorn.

**Usage:**
```bash
python tools/dev/dev_backend_cloudflare.py
# Or via Makefile:
make dev-backend-cloudflare
```

### stop_queued_analyses.py
Stops all queued analyses in Celery queue.

**Usage:**
```bash
python tools/dev/stop_queued_analyses.py
```

### start_dev.sh / start_dev.ps1
Platform-specific development environment startup scripts.

**Usage:**
```bash
# Linux/Mac:
./tools/dev/start_dev.sh

# Windows:
./tools/dev/start_dev.ps1
```

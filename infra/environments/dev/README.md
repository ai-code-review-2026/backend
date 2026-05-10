# Development Environment Configuration

This directory contains development environment configuration and overrides.

## Purpose

Development-specific settings that differ from production:
- Local service URLs
- Development API keys (non-sensitive)
- Debug flags enabled
- Relaxed security for local testing
- Docker Compose overrides for dev tools

## Files

### .env.dev (Future)
Development environment variables that override `.env.example` defaults:
```bash
ENV=development
DEBUG=true
LOG_LEVEL=DEBUG

# Local services
DATABASE_URL=postgresql://postgres:simplepass@localhost:5432/ai_review_dev
REDIS_URL=redis://localhost:6380
QDRANT_URL=http://localhost:6333

# Development features
HOT_RELOAD=true
ENABLE_PROFILING=true
```

### docker-compose.override.yml (Future)
Dev-specific service overrides:
```yaml
version: '3.8'
services:
  api:
    volumes:
      - ./apps/backend:/app  # Hot reload
    environment:
      - LOG_LEVEL=DEBUG

  adminer:
    # Database UI for development
    image: adminer:latest
    ports:
      - "8080:8080"
```

## Usage

```bash
# Start with dev overrides
docker-compose -f docker-compose.yml -f infra/environments/dev/docker-compose.override.yml up

# Or use Makefile (when configured)
make up-dev
```

## Security Notes

⚠️ **Do NOT commit sensitive credentials to this directory!**
- Use `.env.example` as template
- Keep actual secrets in `.env` (gitignored)
- Use placeholder values for documentation

## Next Steps

1. Copy relevant settings from root `.env.example`
2. Create dev-specific overrides
3. Document any dev-only features or flags

# Staging Environment Configuration

This directory contains staging environment configuration.

## Purpose

Staging is a production-like environment for final testing before production deployment:
- Production-like infrastructure
- Real (but non-production) API keys
- Performance testing
- Integration testing with external services
- User acceptance testing (UAT)

## Files

### .env.staging (Future)
Staging environment variables:
```bash
ENV=staging
DEBUG=false
LOG_LEVEL=INFO

# Staging services (cloud-hosted)
DATABASE_URL=postgresql://user:pass@staging-db.example.com:5432/ai_review_staging
REDIS_URL=redis://staging-redis.example.com:6379
QDRANT_URL=https://staging-qdrant.example.com

# Feature flags
LANGCHAIN_ENABLED=true
QDRANT_ENABLED=true
```

### deploy.yml (Future)
Staging deployment configuration (GitHub Actions, Azure DevOps, etc.)

## Deployment

```bash
# Deploy to staging
make deploy-staging

# Or via CI/CD
git push origin develop  # Triggers staging deployment
```

## Testing in Staging

1. Run smoke tests
2. Verify integrations
3. Performance benchmarks
4. UAT with stakeholders

## Promotion to Production

After successful staging validation:
```bash
git checkout main
git merge develop
git push origin main  # Triggers production deployment
```

## Next Steps

1. Set up staging infrastructure (cloud provider)
2. Configure staging environment variables
3. Create deployment workflows
4. Document staging access and testing procedures

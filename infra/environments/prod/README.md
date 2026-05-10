# Production Environment Configuration

This directory contains production environment configuration.

## Purpose

Production is the live environment serving real users:
- High availability
- Performance optimized
- Security hardened
- Monitoring and alerting
- Disaster recovery

## Files

### .env.prod (Future)
Production environment variables (stored securely, NOT in git):
```bash
ENV=production
DEBUG=false
LOG_LEVEL=WARNING

# Production services (cloud-hosted)
DATABASE_URL=postgresql://user:secure-pass@prod-db.example.com:5432/ai_review_prod
REDIS_URL=redis://prod-redis.example.com:6379
QDRANT_URL=https://prod-qdrant.example.com

# Security
SECRETS_ENCRYPTION_KEY=<secure-key>
CLERK_SECRET_KEY=<production-clerk-key>
GITHUB_APP_PRIVATE_KEY_PEM=<production-github-key>

# Feature flags
LANGCHAIN_ENABLED=true
QDRANT_ENABLED=true
RBAC_ENFORCEMENT_ENABLED=true
```

### deploy.yml (Future)
Production deployment configuration with safeguards:
- Blue/green deployment
- Canary releases
- Rollback procedures
- Health checks

## Deployment

```bash
# Deploy to production (requires approval)
make deploy-prod

# Or via CI/CD
git push origin main  # Triggers production deployment after approval
```

## Production Checklist

Before deploying to production:
- [ ] All tests pass (unit, integration, e2e)
- [ ] Staging validation complete
- [ ] Database migrations tested
- [ ] Rollback plan documented
- [ ] Monitoring alerts configured
- [ ] Performance benchmarks met
- [ ] Security scan passed
- [ ] Changelog updated

## Monitoring

- **Grafana**: https://grafana.example.com
- **Prometheus**: https://prometheus.example.com
- **Logs**: Cloud provider logging (Azure, AWS, etc.)
- **Alerts**: PagerDuty, Slack, Email

## Disaster Recovery

1. Database backups: Daily automated backups, 30-day retention
2. Infrastructure as Code: All infra in version control
3. Runbooks: See `docs/runbooks/` for incident response
4. RTO/RPO: 1 hour RTO, 15 minutes RPO

## Security

⚠️ **NEVER commit production secrets to git!**
- Use secret management: Azure Key Vault, AWS Secrets Manager, etc.
- Rotate secrets regularly (90 days)
- Audit access logs
- Follow principle of least privilege

## Next Steps

1. Set up production infrastructure with high availability
2. Configure production secrets in secret manager
3. Create deployment workflows with approval gates
4. Document incident response procedures
5. Set up monitoring, alerting, and logging

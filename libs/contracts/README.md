# API Contracts

This directory contains API contracts, schemas, and shared interfaces.

## Contents (Future)

### openapi/
OpenAPI 3.0 specifications for all APIs:
- `backend-api-v1.yaml` - Backend REST API specification
- `webhook-schemas.yaml` - GitHub webhook payload schemas

## Generating Specifications

From backend:
```bash
cd apps/backend
poetry run python -m app.generate_openapi > ../../libs/contracts/openapi/backend-api-v1.yaml
```

## Using Specifications

### For API Documentation
Host with Swagger UI or ReDoc:
```bash
npx @redocly/cli preview-docs libs/contracts/openapi/backend-api-v1.yaml
```

### For Client Generation
Generate TypeScript clients:
```bash
npx openapi-typescript-codegen \
  --input libs/contracts/openapi/backend-api-v1.yaml \
  --output apps/dashboard/lib/api-client
```

### For Testing
Validate requests/responses against schema in tests.

## Versioning

- Use semantic versioning for breaking changes
- Document changes in each specification
- Maintain backward compatibility when possible

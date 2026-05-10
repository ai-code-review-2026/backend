# OpenAPI Specifications

This directory contains OpenAPI 3.0+ specifications for all REST APIs.

## Files

### backend-api-v1.yaml (Future)
Main backend REST API specification including:
- Analysis endpoints (`/v1/analyses/`)
- GitHub integration endpoints (`/v1/github/`)
- Knowledge base endpoints (`/v1/kb/`)
- Repository management (`/v1/repositories/`)
- User and organization management
- Authentication and authorization

### common.yaml (Future)
Shared OpenAPI components:
- Common schemas (User, Organization, Analysis, etc.)
- Standard error responses (400, 401, 403, 404, 500)
- Common parameters (pagination, filtering)
- Security schemes (Bearer token, API key)

## Usage

### Generate from Backend
```bash
cd apps/backend
poetry run python -c "
from app.main import app
import json
with open('../../libs/contracts/openapi/backend-api-v1.yaml', 'w') as f:
    f.write(json.dumps(app.openapi(), indent=2))
"
```

### Validate Specification
```bash
npx swagger-parser validate libs/contracts/openapi/backend-api-v1.yaml
```

### Generate Documentation
```bash
# ReDoc documentation
npx @redocly/cli preview-docs libs/contracts/openapi/backend-api-v1.yaml

# Swagger UI
npx swagger-ui-serve libs/contracts/openapi/backend-api-v1.yaml
```

### Generate Client Libraries
```bash
# TypeScript client for dashboard
npx openapi-typescript libs/contracts/openapi/backend-api-v1.yaml --output apps/dashboard/lib/types/api.ts

# Python client (future)
openapi-generator-cli generate -i backend-api-v1.yaml -g python -o ../python-client/
```

## Best Practices

- Use semantic versioning (v1, v2, etc.)
- Include comprehensive examples
- Document all error responses
- Use consistent naming conventions
- Validate specifications in CI/CD
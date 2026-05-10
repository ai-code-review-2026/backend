# Integration Tests

Cross-application API integration tests.

## Purpose

Integration tests verify:
- API endpoint correctness
- Request/response contracts
- Authentication/authorization flows
- GitHub webhooks and integrations
- Knowledge base API functionality
- End-to-end workflows across services

## Structure

```
tests/integration/
├── conftest.py              # Shared fixtures (test DB, test client)
├── test_analyses_api.py     # Analyses endpoints
├── test_github_integration.py  # GitHub webhooks
└── test_knowledge_base_api.py  # KB endpoints
```

## Running Integration Tests

```bash
# Run all integration tests
make test-integration

# Or directly with pytest:
poetry run pytest tests/integration/ -v --tb=short
```

## Writing Integration Tests

Use the shared fixtures from `conftest.py`:
```python
def test_create_analysis(client, test_db):
    """Test POST /v1/analyses endpoint."""
    response = client.post("/v1/analyses", json={...})
    assert response.status_code == 201
```

## Test Database

Integration tests use a separate test database:
- postgresql://test:test@localhost:5432/test_db
- Automatically created/cleaned up by fixtures
- Isolated from development database

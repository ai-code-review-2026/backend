# End-to-End Tests

Full workflow end-to-end tests across frontend and backend.

## Purpose

E2E tests verify complete user workflows:
- PR review workflow (submission → analysis → results)
- Dashboard flows (authentication → navigation → actions)
- Real-time features (notifications, live sessions)
- Multi-step processes involving multiple services

## Structure

```
tests/e2e/
├── test_pr_review_workflow.py  # Full PR review flow
└── test_dashboard_flow.py      # Dashboard workflows
```

## Running E2E Tests

```bash
# Run all E2E tests
make test-e2e

# Or directly with pytest:
poetry run pytest tests/e2e/ -v --tb=short
```

## Writing E2E Tests

E2E tests should:
1. Test complete workflows from end-to-end
2. Use real services (or realistic mocks)
3. Include setup and teardown
4. Be independent and isolated

Example:
```python
def test_pr_review_workflow():
    """Test complete PR review workflow."""
    # 1. Submit PR for analysis
    analysis_id = submit_pr(...)
    
    # 2. Wait for analysis to complete
    wait_for_completion(analysis_id)
    
    # 3. Verify results
    results = get_analysis_results(analysis_id)
    assert results["status"] == "completed"
    assert len(results["findings"]) > 0
```

## Test Framework

Consider using:
- Playwright/Cypress for frontend E2E tests
- pytest for backend workflow tests
- TestContainers for isolated service testing

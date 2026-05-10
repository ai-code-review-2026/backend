# Test Fixtures

Shared test data and fixtures for integration and E2E tests.

## Purpose

This directory contains:
- Sample diffs and PR payloads
- Mock API responses
- Test databases and seeds
- Reusable test data

## Structure

```
tests/fixtures/
├── sample_diffs/      # Sample unified diffs
├── sample_prs/        # Sample PR payloads from GitHub
└── README.md          # This file
```

## Usage

Load fixtures in your tests:
```python
import json
from pathlib import Path

fixtures_dir = Path(__file__).parent.parent / "fixtures"

def load_sample_diff(name):
    """Load a sample diff from fixtures."""
    diff_path = fixtures_dir / "sample_diffs" / f"{name}.diff"
    return diff_path.read_text()

def load_sample_pr(name):
    """Load a sample PR payload from fixtures."""
    pr_path = fixtures_dir / "sample_prs" / f"{name}.json"
    return json.loads(pr_path.read_text())
```

## Guidelines

- Keep fixtures small and focused
- Use realistic data (sanitized if from production)
- Document the purpose of each fixture
- Version control all fixtures (no sensitive data!)

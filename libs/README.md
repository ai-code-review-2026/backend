# Shared Libraries

This directory contains reusable code libraries shared across applications.

## Structure

```
libs/
├── contracts/          # API contracts and shared interfaces
│   └── openapi/        # OpenAPI specifications
└── python-common/      # Shared Python utilities
    └── common/         # Common Python modules
```

## Purpose

**libs/** is for code that:
- Is used by multiple applications (backend, dashboard, CLI, etc.)
- Provides shared contracts or interfaces
- Offers common utilities and helpers
- Should be versioned and potentially published

## Current Libraries

### contracts/
API contracts and shared data models.

**Future contents:**
- OpenAPI specifications (`openapi/`)
- Shared TypeScript types
- Protocol definitions
- Data schemas

### python-common/ (Future)
Shared Python utilities for backend and scripts.

**Planned contents:**
- Common logging configuration
- Shared exception classes
- Utility functions
- Configuration helpers

## Adding New Libraries

1. Create subdirectory under `libs/`
2. Add README.md explaining purpose and usage
3. Create setup.py or package.json for installability
4. Document API and usage examples
5. Add tests in library's own test directory
6. Update this README

## Usage

### Python Libraries
```python
# After setup.py installation
from python_common.logging import setup_logging
from python_common.exceptions import ServiceError
```

### Contracts
```typescript
// Import shared types
import { AnalysisRequest } from "@repo/contracts";
```

## Best Practices

1. **Keep libraries focused**: Each library should have a single, clear purpose
2. **Version carefully**: Use semantic versioning for breaking changes
3. **Document thoroughly**: README, docstrings, usage examples
4. **Test extensively**: Libraries should have high test coverage
5. **Minimize dependencies**: Keep library dependencies minimal and explicit

## When to Create a Library

Create a new library when:
- Code is duplicated across 2+ applications
- Logic is truly application-agnostic
- Code can be tested independently
- Versioning and change management is needed

**Don't** create a library for:
- Application-specific logic
- Tightly coupled code
- One-time utilities
- Premature abstraction

## Next Steps

1. **Extract common code**: Identify duplicated code across apps
2. **Create python-common**: Start with logging and exceptions
3. **Define contracts**: Export OpenAPI specs from backend
4. **Add tests**: Ensure libraries are well-tested
5. **Document**: Add usage guides and examples

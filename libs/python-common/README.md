# Shared Python Common Library

Common Python utilities shared across backend, workers, and scripts.

## Purpose (Future)

Provide reusable Python code for:
- Logging configuration
- Common exceptions
- Utility functions
- Configuration helpers
- Shared data models

## Structure

```
python-common/
├── setup.py                # Package installation
├── README.md               # This file
├── common/
│   ├── __init__.py
│   ├── logging.py          # Logging setup
│   ├── exceptions.py       # Common exceptions
│   ├── utils.py            # Utility functions
│   └── config.py           # Configuration helpers
└── tests/                  # Library tests
```

## Installation (Future)

From project root:
```bash
pip install -e libs/python-common
```

## Usage Examples (Future)

### Logging
```python
from common.logging import setup_logging

logger = setup_logging("my_service")
logger.info("Service started")
```

### Exceptions
```python
from common.exceptions import ServiceError, NotFoundError

raise ServiceError("Something went wrong", code="SERVICE_ERROR")
```

### Utilities
```python
from common.utils import generate_id, parse_iso_date

id = generate_id()
date = parse_iso_date("2026-03-26T12:00:00Z")
```

## Next Steps

1. Extract common logging setup from backend
2. Create shared exception classes
3. Move reusable utility functions
4. Add comprehensive tests
5. Create setup.py for installability

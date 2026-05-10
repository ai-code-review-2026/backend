# Knowledge Base Management Tools

Scripts for managing Knowledge Base (RAG) and Qdrant vector store.

## Scripts

### langchain_parity_report.py
Builds corpus-wide LangChain parity report comparing old vs new implementations.

**Usage:**
```bash
python tools/kb/langchain_parity_report.py
# Or via Makefile:
make langchain-parity
```

### langchain_qdrant_aliases.py
Manages Qdrant collection aliases for zero-downtime updates.

**Commands:**
- `show` - Display current alias targets
- `promote` - Promote new collection to active alias
- `rollback` - Roll back alias to previous collection

**Usage:**
```bash
# Show aliases
python tools/kb/langchain_qdrant_aliases.py show
# Or: make langchain-qdrant-aliases

# Promote collection
python tools/kb/langchain_qdrant_aliases.py promote --collection my-collection
# Or: make langchain-promote collection=my-collection

# Rollback alias
python tools/kb/langchain_qdrant_aliases.py rollback --collection my-collection
# Or: make langchain-rollback collection=my-collection
```

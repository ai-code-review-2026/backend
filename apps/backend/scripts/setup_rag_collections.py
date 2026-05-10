#!/usr/bin/env python3
"""Initialize Neo4j schema, indexes, and constraints for the GraphRAG system.

Replaces the old Qdrant collection setup script. Neo4j is now the single store
for all graph nodes, relationships, vector embeddings, and analysis history.

Usage:
    python scripts/setup_rag_collections.py

Environment variables required:
    - NEO4J_ENABLED=true
    - NEO4J_URI=bolt://localhost:7687
    - NEO4J_USER=neo4j
    - NEO4J_PASSWORD=<password>
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.integrations.graph_database.neo4j_client import get_neo4j_client
from app.settings import settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def main() -> int:
    """Initialize Neo4j schema."""
    logger.info("Starting Neo4j schema setup...")
    logger.info("Neo4j URI: %s", settings.NEO4J_URI)
    logger.info("Neo4j Enabled: %s", settings.NEO4J_ENABLED)

    if not settings.NEO4J_ENABLED:
        logger.error("NEO4J_ENABLED is false. Set NEO4J_ENABLED=true to proceed.")
        return 1

    try:
        client = get_neo4j_client()
        client.init_schema()
        logger.info("Neo4j schema initialized successfully (constraints, indexes, vector indexes).")
        stats = client.get_repo_stats("__probe__")
        logger.info("Neo4j connection verified.")
        return 0
    except Exception as exc:
        logger.exception("Failed to initialize Neo4j schema: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())

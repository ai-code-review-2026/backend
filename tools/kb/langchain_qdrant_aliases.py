from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_APP = ROOT / "apps" / "backend"
if str(BACKEND_APP) not in sys.path:
    sys.path.insert(0, str(BACKEND_APP))

from app.integrations.vector_store.qdrant_client import QdrantClient  # noqa: E402
from app.settings import settings  # noqa: E402


async def _show_aliases() -> dict[str, str | None]:
    client = QdrantClient()
    return {
        "active_alias": settings.LANGCHAIN_QDRANT_COLLECTION_ALIAS_ACTIVE,
        "active_target": await client.resolve_alias(alias_name=settings.LANGCHAIN_QDRANT_COLLECTION_ALIAS_ACTIVE),
        "shadow_alias": settings.LANGCHAIN_QDRANT_COLLECTION_ALIAS_SHADOW,
        "shadow_target": await client.resolve_alias(alias_name=settings.LANGCHAIN_QDRANT_COLLECTION_ALIAS_SHADOW),
        "physical_collection": settings.langchain_qdrant_physical_collection,
        "recommended_primary_flag": "LANGCHAIN_PRIMARY_STACK=langchain",
        "recommended_legacy_flag": "LANGCHAIN_PRIMARY_STACK=legacy",
    }


async def _promote(collection: str) -> dict[str, str]:
    client = QdrantClient()
    await client.ensure_alias(
        alias_name=settings.LANGCHAIN_QDRANT_COLLECTION_ALIAS_ACTIVE,
        collection_name=collection,
    )
    return {
        "status": "promoted",
        "active_alias": settings.LANGCHAIN_QDRANT_COLLECTION_ALIAS_ACTIVE,
        "collection": collection,
        "next_flags": "Set LANGCHAIN_PRIMARY_STACK=langchain and keep LANGCHAIN_ALLOW_LEGACY_FALLBACK=true during stabilization.",
    }


async def _rollback(collection: str) -> dict[str, str]:
    client = QdrantClient()
    await client.ensure_alias(
        alias_name=settings.LANGCHAIN_QDRANT_COLLECTION_ALIAS_ACTIVE,
        collection_name=collection,
    )
    return {
        "status": "rolled_back",
        "active_alias": settings.LANGCHAIN_QDRANT_COLLECTION_ALIAS_ACTIVE,
        "collection": collection,
        "next_flags": "Set LANGCHAIN_PRIMARY_STACK=legacy before resuming normal traffic.",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Inspect or move LangChain Qdrant aliases.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("show", help="Show current active/shadow alias targets.")

    promote_parser = subparsers.add_parser("promote", help="Point the active alias at a collection.")
    promote_parser.add_argument(
        "--collection",
        type=str,
        default=settings.langchain_qdrant_physical_collection,
        help="Collection to attach to the active alias.",
    )

    rollback_parser = subparsers.add_parser("rollback", help="Point the active alias back to a previous collection.")
    rollback_parser.add_argument(
        "--collection",
        type=str,
        required=True,
        help="Previous collection to restore on the active alias.",
    )

    args = parser.parse_args()
    if args.command == "show":
        payload = asyncio.run(_show_aliases())
    elif args.command == "promote":
        payload = asyncio.run(_promote(args.collection))
    else:
        payload = asyncio.run(_rollback(args.collection))

    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

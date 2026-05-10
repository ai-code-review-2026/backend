from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Sequence

from app.core.knowledge_base.embeddings import hash_embed_text
from app.settings import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class QdrantPoint:
    id: str | int
    vector: Sequence[float]
    payload: dict[str, Any]


@dataclass(frozen=True)
class QdrantHit:
    id: str | int | None
    payload: dict[str, Any]
    score: float = 0.0


# Global singleton for local embedded client
_local_qdrant_client: Any = None
_local_qdrant_lock = asyncio.Lock()


def _get_local_client() -> Any:
    """Get or create the local embedded Qdrant client (singleton)."""
    global _local_qdrant_client
    if _local_qdrant_client is not None:
        return _local_qdrant_client

    try:
        from qdrant_client import QdrantClient as NativeQdrantClient
    except ImportError:
        raise RuntimeError(
            "qdrant-client package not installed. Run: poetry add qdrant-client"
        )

    storage_path = Path(settings.QDRANT_LOCAL_PATH).resolve()
    storage_path.mkdir(parents=True, exist_ok=True)
    logger.info("Initializing embedded Qdrant at %s", storage_path)
    _local_qdrant_client = NativeQdrantClient(path=str(storage_path))
    return _local_qdrant_client


class QdrantClient:
    """Async wrapper around Qdrant supporting both HTTP and embedded local modes.

    Modes:
    - QDRANT_MODE=http: Connect to remote Qdrant server via REST API
    - QDRANT_MODE=local: Use embedded Qdrant (in-process, no Docker needed)

    When QDRANT_ENABLED=false, all calls return empty results gracefully.
    """

    def __init__(self) -> None:
        # Start enabled flag based on config; use lazy client init so tests can monkeypatch _get_client.
        self._enabled = bool(settings.QDRANT_ENABLED)
        self._mode = (settings.QDRANT_MODE or "http").lower()
        self._url = (settings.QDRANT_URL or "").rstrip("/")
        self._collection = settings.QDRANT_COLLECTION
        self._api_key = settings.QDRANT_API_KEY
        self._vector_size = settings.REPO_CONTEXT_VECTOR_SIZE
        self._http_client: Any = None  # httpx.AsyncClient for HTTP mode
        self._client: Any = None  # Lazily materialized via _ensure_client()

    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def default_collection(self) -> str:
        return self._collection

    def _disable(self, *, reason: str, exc: Exception) -> None:
        if self._enabled:
            logger.warning("Disabling Qdrant after %s failure: %s", reason, exc)
        self._enabled = False
        self._http_client = None

    def ensure_enabled(self) -> None:
        if not self._enabled:
            raise RuntimeError(
                "Qdrant is disabled. Set QDRANT_ENABLED=true and configure QDRANT_MODE (http/local)."
            )

    # ─────────────────────────────────────────────────────────────────────────
    # HTTP Mode Implementation
    # ─────────────────────────────────────────────────────────────────────────

    def _get_http_client(self) -> Any:
        import httpx

        if self._http_client is None:
            headers: dict[str, str] = {}
            if self._api_key:
                headers["api-key"] = self._api_key
            self._http_client = httpx.AsyncClient(base_url=self._url, headers=headers, timeout=30.0)
        return self._http_client

    def _get_client(self) -> Any:
        """Return the low-level client object for testing/monkeypatching.

        - local mode: returns the native Qdrant client
        - http mode: returns the httpx.AsyncClient instance
        """
        if self._mode == "local":
            return self._get_local_client()
        return self._get_http_client()

    def _ensure_client(self) -> Any:
        """Lazily materialize the underlying client and protect against runtime failures.

        If the underlying client cannot be created, mark Qdrant as disabled so callers
        observe enabled == False. Returns the client instance or None.
        """
        if not self._enabled:
            return None
        if self._client is not None:
            return self._client
        try:
            client = self._get_client()
            self._client = client
            return self._client
        except Exception as exc:
            logger.warning("Qdrant runtime client init failed; disabling Qdrant: %s", exc)
            self._enabled = False
            self._client = None
            return None

    @staticmethod
    def _build_filter(filter_payload: dict[str, Any] | None) -> dict[str, Any] | None:
        if not filter_payload:
            return None
        must = []
        for key, value in filter_payload.items():
            must.append({"key": key, "match": {"value": value}})
        return {"must": must}

    async def _http_request(
        self,
        *,
        method: str,
        path: str,
        json_body: dict[str, Any] | None = None,
        expected_statuses: tuple[int, ...] = (200,),
    ) -> Any:
        client = self._get_http_client()
        response = await client.request(method=method, url=path, json=json_body)
        if response.status_code not in expected_statuses:
            raise RuntimeError(f"Unexpected Response: {response.status_code} ({response.text})")
        if not response.content:
            return None
        payload = response.json()
        status = payload.get("status")
        if status not in {None, "ok"}:
            raise RuntimeError(f"Unexpected Qdrant status: {status}")
        return payload.get("result")

    # ─────────────────────────────────────────────────────────────────────────
    # Local Mode Implementation
    # ─────────────────────────────────────────────────────────────────────────

    def _get_local_client(self) -> Any:
        return _get_local_client()

    @staticmethod
    def _build_local_filter(filter_payload: dict[str, Any] | None) -> Any:
        """Build a qdrant_client.models.Filter from payload dict."""
        if not filter_payload:
            return None

        try:
            from qdrant_client.models import FieldCondition, Filter, MatchValue
        except ImportError:
            return None

        conditions = []
        for key, value in filter_payload.items():
            conditions.append(FieldCondition(key=key, match=MatchValue(value=value)))
        return Filter(must=conditions)

    # ─────────────────────────────────────────────────────────────────────────
    # Unified API Methods
    # ─────────────────────────────────────────────────────────────────────────

    async def ensure_collection(self, *, collection_name: str, vector_size: int | None = None) -> None:
        if not self._enabled:
            return

        # Ensure underlying client can be created at runtime; tests monkeypatch _get_client()
        client = self._ensure_client()
        if client is None:
            # _ensure_client will mark enabled=False on failure
            return

        target_size = vector_size or self._vector_size

        try:
            if self._mode == "local":
                await self._ensure_collection_local(collection_name, target_size)
            else:
                await self._ensure_collection_http(collection_name, target_size)
        except Exception as exc:
            self._disable(reason=f"ensure_collection({collection_name})", exc=exc)
            logger.warning("Qdrant ensure_collection failed; continuing without vectors: %s", exc)

    async def _ensure_collection_http(self, collection_name: str, vector_size: int) -> None:
        existing = await self.get_collection_info(collection_name=collection_name)
        if existing is not None:
            return
        await self._http_request(
            method="PUT",
            path=f"/collections/{collection_name}",
            json_body={"vectors": {"size": vector_size, "distance": "Cosine"}},
        )

    async def _ensure_collection_local(self, collection_name: str, vector_size: int) -> None:
        client = self._get_local_client()
        try:
            from qdrant_client.models import Distance, VectorParams
        except ImportError:
            raise RuntimeError("qdrant-client package not installed")

        collections = await asyncio.to_thread(client.get_collections)
        existing_names = [c.name for c in collections.collections]

        if collection_name not in existing_names:
            await asyncio.to_thread(
                client.create_collection,
                collection_name=collection_name,
                vectors_config=VectorParams(size=vector_size, distance=Distance.COSINE),
            )
            logger.info("Created local Qdrant collection: %s", collection_name)

    async def get_collection_info(self, *, collection_name: str) -> dict[str, Any] | None:
        if not self._enabled:
            return None

        try:
            if self._mode == "local":
                return await self._get_collection_info_local(collection_name)
            else:
                return await self._get_collection_info_http(collection_name)
        except Exception as exc:
            self._disable(reason=f"get_collection_info({collection_name})", exc=exc)
            logger.warning("Qdrant get_collection_info failed; continuing without vectors: %s", exc)
            return None

    async def _get_collection_info_http(self, collection_name: str) -> dict[str, Any] | None:
        client = self._get_http_client()
        response = await client.get(f"/collections/{collection_name}")
        if response.status_code == 404:
            return None
        if response.status_code != 200:
            raise RuntimeError(f"Unexpected Response: {response.status_code} ({response.text})")
        payload = response.json()
        result = payload.get("result")
        return result if isinstance(result, dict) else {}

    async def _get_collection_info_local(self, collection_name: str) -> dict[str, Any] | None:
        client = self._get_local_client()
        try:
            info = await asyncio.to_thread(client.get_collection, collection_name=collection_name)
            # Extract status - can be str or enum
            status_val = info.status
            if hasattr(status_val, "value"):
                status_val = status_val.value
            elif hasattr(status_val, "name"):
                status_val = status_val.name
            status_str = str(status_val) if status_val else "unknown"

            # Extract vector size from nested config
            vector_size = None
            if info.config and info.config.params and info.config.params.vectors:
                vectors_cfg = info.config.params.vectors
                if hasattr(vectors_cfg, "size"):
                    vector_size = vectors_cfg.size

            return {
                "status": status_str,
                "points_count": info.points_count,
                "indexed_vectors_count": getattr(info, "indexed_vectors_count", 0),
                "config": {
                    "params": {
                        "vectors": {
                            "size": vector_size,
                        }
                    }
                },
            }
        except Exception:
            return None

    async def get_collection_vector_size(self, *, collection_name: str) -> int | None:
        info = await self.get_collection_info(collection_name=collection_name)
        if not info:
            return None
        config = info.get("config")
        if not isinstance(config, dict):
            return None
        params = config.get("params")
        if not isinstance(params, dict):
            return None
        vectors = params.get("vectors")
        if isinstance(vectors, dict):
            size = vectors.get("size")
            if isinstance(size, int):
                return size
        return None

    async def ensure_alias(self, *, alias_name: str, collection_name: str) -> None:
        if not self._enabled:
            return

        current = await self.resolve_alias(alias_name=alias_name)
        if current == collection_name:
            return

        try:
            if self._mode == "local":
                await self._ensure_alias_local(alias_name, collection_name, current)
            else:
                await self._ensure_alias_http(alias_name, collection_name, current)
        except Exception as exc:
            self._disable(reason=f"ensure_alias({alias_name})", exc=exc)
            logger.warning("Qdrant ensure_alias failed; continuing without vectors: %s", exc)

    async def _ensure_alias_http(self, alias_name: str, collection_name: str, current: str | None) -> None:
        actions = []
        if current:
            actions.append({"delete_alias": {"alias_name": alias_name}})
        actions.append({"create_alias": {"collection_name": collection_name, "alias_name": alias_name}})
        await self._http_request(
            method="POST",
            path="/aliases",
            json_body={"actions": actions},
        )

    async def _ensure_alias_local(self, alias_name: str, collection_name: str, current: str | None) -> None:
        client = self._get_local_client()
        if current:
            await asyncio.to_thread(client.delete_alias, alias_name=alias_name)
        await asyncio.to_thread(
            client.update_collection_aliases,
            change_aliases_operations=[
                {"create_alias": {"alias_name": alias_name, "collection_name": collection_name}}
            ],
        )

    async def resolve_alias(self, *, alias_name: str) -> str | None:
        if not self._enabled:
            return None

        try:
            if self._mode == "local":
                return await self._resolve_alias_local(alias_name)
            else:
                return await self._resolve_alias_http(alias_name)
        except Exception as exc:
            self._disable(reason=f"resolve_alias({alias_name})", exc=exc)
            logger.warning("Qdrant resolve_alias failed; continuing without vectors: %s", exc)
            return None

    async def _resolve_alias_http(self, alias_name: str) -> str | None:
        result = await self._http_request(method="GET", path="/aliases")
        aliases = result.get("aliases") if isinstance(result, dict) else None
        if not isinstance(aliases, list):
            return None
        for item in aliases:
            if not isinstance(item, dict):
                continue
            if item.get("alias_name") == alias_name and isinstance(item.get("collection_name"), str):
                return item["collection_name"]
        return None

    async def _resolve_alias_local(self, alias_name: str) -> str | None:
        client = self._get_local_client()
        aliases = await asyncio.to_thread(client.get_aliases)
        for alias in aliases.aliases:
            if alias.alias_name == alias_name:
                return alias.collection_name
        return None

    async def upsert_points(self, *, collection_name: str, points: list[QdrantPoint]) -> None:
        if not self._enabled or not points:
            return

        # Try delegating to underlying client (useful for tests/monkeypatch)
        try:
            client = self._ensure_client()
            if client and hasattr(client, "upsert"):
                # Some clients expect native PointStructs; attempt best-effort delegation
                try:
                    result = client.upsert(collection_name=collection_name, points=points, wait=True)
                    if asyncio.iscoroutine(result):
                        await result
                    return
                except Exception:
                    # delegate failed — disable Qdrant and fall back
                    self._enabled = False
                    self._client = None
                    pass
        except Exception:
            # ensure we disable on unexpected errors
            self._enabled = False
            self._client = None
            pass

        try:
            if self._mode == "local":
                await self._upsert_points_local(collection_name, points)
            else:
                await self._upsert_points_http(collection_name, points)
        except Exception as exc:
            self._disable(reason=f"upsert_points({collection_name})", exc=exc)
            logger.warning("Qdrant upsert failed; continuing without vectors: %s", exc)

    async def _upsert_points_http(self, collection_name: str, points: list[QdrantPoint]) -> None:
        await self._http_request(
            method="PUT",
            path=f"/collections/{collection_name}/points?wait=true",
            json_body={
                "points": [
                    {"id": point.id, "vector": list(point.vector), "payload": point.payload}
                    for point in points
                ]
            },
        )

    async def _upsert_points_local(self, collection_name: str, points: list[QdrantPoint]) -> None:
        client = self._get_local_client()
        try:
            from qdrant_client.models import PointStruct
        except ImportError:
            raise RuntimeError("qdrant-client package not installed")

        point_structs = [
            PointStruct(id=p.id, vector=list(p.vector), payload=p.payload)
            for p in points
        ]
        await asyncio.to_thread(
            client.upsert,
            collection_name=collection_name,
            points=point_structs,
            wait=True,
        )

    async def search(
        self,
        *,
        collection_name: str,
        query_vector: Sequence[float],
        limit: int,
        filter_payload: dict[str, Any] | None = None,
    ) -> list[Any]:
        if not self._enabled:
            await asyncio.sleep(0)
            return []

        # Try delegating to underlying client (tests may monkeypatch _get_client)
        try:
            client = self._ensure_client()
            if client and hasattr(client, "search"):
                result = client.search(collection_name=collection_name, query_vector=query_vector, limit=limit, filter_payload=filter_payload)
                if asyncio.iscoroutine(result):
                    result = await result
                hits: list[QdrantHit] = []
                for item in (result or []):
                    if isinstance(item, dict):
                        hits.append(QdrantHit(id=item.get("id"), payload=item.get("payload") if isinstance(item.get("payload"), dict) else {}, score=float(item.get("score") or 0.0)))
                    else:
                        try:
                            payload = getattr(item, "payload", {}) or {}
                            score = float(getattr(item, "score", 0.0) or 0.0)
                            idv = getattr(item, "id", None)
                            hits.append(QdrantHit(id=idv, payload=payload, score=score))
                        except Exception:
                            continue
                return hits
        except Exception:
            # delegate failure — disable and fall back
            self._enabled = False
            self._client = None
            pass

        try:
            if self._mode == "local":
                return await self._search_local(collection_name, query_vector, limit, filter_payload)
            else:
                return await self._search_http(collection_name, query_vector, limit, filter_payload)
        except Exception as exc:
            self._disable(reason=f"search({collection_name})", exc=exc)
            logger.warning("Qdrant search failed; returning no vector hits: %s", exc)
            await asyncio.sleep(0)
            return []

    async def _search_http(
        self, collection_name: str, query_vector: Sequence[float], limit: int, filter_payload: dict[str, Any] | None
    ) -> list[QdrantHit]:
        result = await self._http_request(
            method="POST",
            path=f"/collections/{collection_name}/points/search",
            json_body={
                "vector": list(query_vector),
                "limit": limit,
                "with_payload": True,
                "with_vector": False,
                "filter": self._build_filter(filter_payload),
            },
        )
        return [
            QdrantHit(
                id=item.get("id"),
                payload=item.get("payload") if isinstance(item.get("payload"), dict) else {},
                score=float(item.get("score") or 0.0),
            )
            for item in (result or [])
            if isinstance(item, dict)
        ]

    async def _search_local(
        self, collection_name: str, query_vector: Sequence[float], limit: int, filter_payload: dict[str, Any] | None
    ) -> list[QdrantHit]:
        client = self._get_local_client()
        query_filter = self._build_local_filter(filter_payload)

        # qdrant-client >= 1.7 uses query_points instead of search
        response = await asyncio.to_thread(
            client.query_points,
            collection_name=collection_name,
            query=list(query_vector),
            limit=limit,
            query_filter=query_filter,
            with_payload=True,
        )
        # response.points contains ScoredPoint objects
        return [
            QdrantHit(
                id=hit.id,
                payload=hit.payload if isinstance(hit.payload, dict) else {},
                score=float(hit.score or 0.0),
            )
            for hit in (response.points if hasattr(response, 'points') else [])
        ]

    async def scroll(
        self,
        *,
        collection_name: str,
        limit: int = 100,
        filter_payload: dict[str, Any] | None = None,
    ) -> list[Any]:
        if not self._enabled:
            await asyncio.sleep(0)
            return []

        try:
            if self._mode == "local":
                return await self._scroll_local(collection_name, limit, filter_payload)
            else:
                return await self._scroll_http(collection_name, limit, filter_payload)
        except Exception as exc:
            self._disable(reason=f"scroll({collection_name})", exc=exc)
            logger.warning("Qdrant scroll failed; returning no vector hits: %s", exc)
            await asyncio.sleep(0)
            return []

    async def _scroll_http(
        self, collection_name: str, limit: int, filter_payload: dict[str, Any] | None
    ) -> list[QdrantHit]:
        result = await self._http_request(
            method="POST",
            path=f"/collections/{collection_name}/points/scroll",
            json_body={
                "limit": limit,
                "with_payload": True,
                "with_vector": False,
                "filter": self._build_filter(filter_payload),
            },
        )
        points = result.get("points") if isinstance(result, dict) else []
        return [
            QdrantHit(
                id=item.get("id"),
                payload=item.get("payload") if isinstance(item.get("payload"), dict) else {},
                score=0.0,
            )
            for item in (points or [])
            if isinstance(item, dict)
        ]

    async def _scroll_local(
        self, collection_name: str, limit: int, filter_payload: dict[str, Any] | None
    ) -> list[QdrantHit]:
        client = self._get_local_client()
        query_filter = self._build_local_filter(filter_payload)

        results, _ = await asyncio.to_thread(
            client.scroll,
            collection_name=collection_name,
            limit=limit,
            scroll_filter=query_filter,
            with_payload=True,
        )
        return [
            QdrantHit(
                id=point.id,
                payload=point.payload if isinstance(point.payload, dict) else {},
                score=0.0,
            )
            for point in results
        ]

    async def delete_by_filter(self, *, collection_name: str, filter_payload: dict[str, Any]) -> None:
        if not self._enabled:
            return

        try:
            if self._mode == "local":
                await self._delete_by_filter_local(collection_name, filter_payload)
            else:
                await self._delete_by_filter_http(collection_name, filter_payload)
        except Exception as exc:
            self._disable(reason=f"delete_by_filter({collection_name})", exc=exc)
            logger.warning("Qdrant delete failed; continuing without vectors: %s", exc)

    async def _delete_by_filter_http(self, collection_name: str, filter_payload: dict[str, Any]) -> None:
        query_filter = self._build_filter(filter_payload)
        if query_filter is None:
            return
        await self._http_request(
            method="POST",
            path=f"/collections/{collection_name}/points/delete?wait=true",
            json_body={"filter": query_filter},
        )

    async def _delete_by_filter_local(self, collection_name: str, filter_payload: dict[str, Any]) -> None:
        client = self._get_local_client()
        query_filter = self._build_local_filter(filter_payload)
        if query_filter is None:
            return
        await asyncio.to_thread(
            client.delete,
            collection_name=collection_name,
            points_selector=query_filter,
            wait=True,
        )

    async def search_related_rules(self, repo: str, diff_text: str, limit: int = 3) -> list[str]:
        """Return up to *limit* rule snippets relevant to the given diff."""
        if not self._enabled:
            await asyncio.sleep(0)
            return []

        try:
            await self.ensure_collection(collection_name=self._collection, vector_size=self._vector_size)
            query_vector = hash_embed_text(f"{repo}\n{diff_text}", vector_size=self._vector_size)
            results = await self.search(
                collection_name=self._collection,
                query_vector=query_vector,
                limit=limit,
                filter_payload={"repo_id": repo},
            )

            snippets = _extract_text_snippets(results=results, limit=limit)

            repo_ctx_collection = settings.QDRANT_REPO_CONTEXT_COLLECTION
            if not snippets and repo_ctx_collection and repo_ctx_collection != self._collection:
                await self.ensure_collection(collection_name=repo_ctx_collection, vector_size=self._vector_size)
                ctx_results = await self.search(
                    collection_name=repo_ctx_collection,
                    query_vector=query_vector,
                    limit=limit,
                    filter_payload={"repo_id": repo, "type": "chunk"},
                )
                snippets = _extract_text_snippets(results=ctx_results, limit=limit)
            return snippets
        except Exception as exc:
            logger.warning("Qdrant search failed (repo=%s): %s", repo, exc)
            return []
    
    async def create_collection(
        self,
        *,
        collection_name: str,
        vector_size: int,
    ) -> None:
        """
        Create a new collection with given vector size.
        Alias for ensure_collection for compatibility with new services.
        """
        await self.ensure_collection(
            collection_name=collection_name,
            vector_size=vector_size,
        )
    
    async def upsert_chunk_batch(
        self,
        *,
        collection_name: str,
        chunks: list[dict[str, Any]],
        embeddings: list[list[float]],
    ) -> None:
        """
        Batch upsert code/KB chunks with embeddings.
        
        Args:
            collection_name: Collection to insert into
            chunks: List of chunk dicts with 'id' and payload fields
            embeddings: List of embedding vectors (same order as chunks)
        """
        if not chunks or not embeddings:
            return
        
        points = []
        for chunk, embedding in zip(chunks, embeddings):
            chunk_id = chunk.get("id")
            if not chunk_id:
                logger.warning("Chunk missing 'id', skipping")
                continue
            
            # Build payload from chunk data
            payload = {k: v for k, v in chunk.items() if k != "id"}
            
            points.append(QdrantPoint(
                id=str(chunk_id),
                vector=embedding,
                payload=payload,
            ))
        
        await self.upsert_points(collection_name=collection_name, points=points)
    
    async def search_chunks(
        self,
        *,
        collection_name: str,
        query_embedding: list[float],
        limit: int = 10,
        filters: dict[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """
        Search for chunks by embedding similarity.
        
        Args:
            collection_name: Collection to search
            query_embedding: Query embedding vector
            limit: Max results to return
            filters: Optional payload filters
            
        Returns:
            List of chunk dicts with 'score' field added
        """
        hits = await self.search(
            collection_name=collection_name,
            query_vector=query_embedding,
            limit=limit,
            filter_payload=filters,
        )
        
        # Convert QdrantHit to dict
        results = []
        for hit in hits:
            chunk = dict(hit.payload) if hit.payload else {}
            chunk["score"] = hit.score
            if hit.id:
                chunk["id"] = hit.id
            results.append(chunk)
        
        return results


def _extract_text_snippets(*, results: list[Any], limit: int) -> list[str]:
    snippets: list[str] = []
    for hit in results:
        payload = getattr(hit, "payload", None) or {}
        candidate = payload.get("rule") or payload.get("text") or payload.get("content")
        if isinstance(candidate, str) and candidate.strip():
            snippets.append(candidate.strip())
        if len(snippets) >= limit:
            break
    return snippets


async def setup_rag_collections(client: QdrantClient) -> dict[str, bool]:
    """Initialize all RAG collections with their schemas.

    Returns a dict of collection_name -> success status.
    """
    from app.integrations.vector_store.collection_schemas import (
        ALL_COLLECTION_SCHEMAS,
        get_collection_create_body,
        get_payload_index_body,
    )

    results: dict[str, bool] = {}

    for schema in ALL_COLLECTION_SCHEMAS:
        try:
            # Check if collection exists
            existing = await client.get_collection_info(collection_name=schema.name)

            if existing is None:
                if client.mode == "local":
                    # Local mode: use native client
                    native_client = client._get_local_client()
                    try:
                        from qdrant_client.models import Distance, VectorParams
                    except ImportError:
                        raise RuntimeError("qdrant-client package not installed")

                    await asyncio.to_thread(
                        native_client.create_collection,
                        collection_name=schema.name,
                        vectors_config=VectorParams(size=schema.vector_size, distance=Distance.COSINE),
                    )
                else:
                    # HTTP mode: use REST API
                    body = get_collection_create_body(schema)
                    await client._http_request(
                        method="PUT",
                        path=f"/collections/{schema.name}",
                        json_body=body,
                    )
                logger.info("Created Qdrant collection: %s", schema.name)

            # Create payload indexes (HTTP mode only for now)
            if client.mode != "local":
                for index_def in schema.payload_indexes:
                    try:
                        index_body = get_payload_index_body(index_def)
                        await client._http_request(
                            method="PUT",
                            path=f"/collections/{schema.name}/index",
                            json_body=index_body,
                        )
                    except Exception as idx_exc:
                        logger.debug("Index creation skipped for %s.%s: %s", schema.name, index_def["field_name"], idx_exc)
            else:
                # Local mode: create indexes via native client
                native_client = client._get_local_client()
                for index_def in schema.payload_indexes:
                    try:
                        await asyncio.to_thread(
                            native_client.create_payload_index,
                            collection_name=schema.name,
                            field_name=index_def["field_name"],
                            field_schema=index_def.get("field_schema", "keyword"),
                        )
                    except Exception as idx_exc:
                        logger.debug("Index creation skipped for %s.%s: %s", schema.name, index_def["field_name"], idx_exc)

            results[schema.name] = True
            logger.info("Qdrant collection ready: %s", schema.name)

        except Exception as exc:
            logger.error("Failed to setup collection %s: %s", schema.name, exc)
            results[schema.name] = False

    return results

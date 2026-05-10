from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping

from app.data.database import get_engine
from app.data.models.secret import StoredSecret


_SECRETS_LOCK = Lock()


class SecretsRepo:
    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def upsert(self, *, namespace: str, secret_key: str, ciphertext: str, meta: dict[str, Any] | None = None) -> StoredSecret:
        payload_meta = json.dumps(meta or {})
        with _SECRETS_LOCK:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO encrypted_secrets (id, namespace, secret_key, ciphertext, meta_json)
                        VALUES (:id, :namespace, :secret_key, :ciphertext, CAST(:meta_json AS jsonb))
                        ON CONFLICT (namespace, secret_key)
                        DO UPDATE
                        SET ciphertext = EXCLUDED.ciphertext,
                            meta_json = EXCLUDED.meta_json,
                            updated_at = NOW()
                        """
                    ),
                    {
                        "id": uuid.uuid4().hex,
                        "namespace": namespace,
                        "secret_key": secret_key,
                        "ciphertext": ciphertext,
                        "meta_json": payload_meta,
                    },
                )
                row = (
                    conn.execute(
                        text(
                            """
                            SELECT *
                            FROM encrypted_secrets
                            WHERE namespace = :namespace AND secret_key = :secret_key
                            LIMIT 1
                            """
                        ),
                        {"namespace": namespace, "secret_key": secret_key},
                    )
                    .mappings()
                    .first()
                )
        if row is None:
            raise ValueError("upsert failed for encrypted secret")
        return self._row_to_model(row)

    def get(self, *, namespace: str, secret_key: str) -> StoredSecret | None:
        with _SECRETS_LOCK:
            with self._engine.connect() as conn:
                row = (
                    conn.execute(
                        text(
                            """
                            SELECT *
                            FROM encrypted_secrets
                            WHERE namespace = :namespace AND secret_key = :secret_key
                            LIMIT 1
                            """
                        ),
                        {"namespace": namespace, "secret_key": secret_key},
                    )
                    .mappings()
                    .first()
                )

        if row is None:
            return None
        return self._row_to_model(row)

    @staticmethod
    def _row_to_model(row: RowMapping | dict[str, Any]) -> StoredSecret:
        meta_json = row.get("meta_json")
        if isinstance(meta_json, str):
            meta_serialized = meta_json
        else:
            meta_serialized = json.dumps(meta_json or {})

        return StoredSecret(
            id=str(row["id"]),
            namespace=str(row["namespace"]),
            secret_key=str(row["secret_key"]),
            ciphertext=str(row["ciphertext"]),
            meta_json=meta_serialized,
            created_at=SecretsRepo._to_utc_iso_str(row.get("created_at")),
            updated_at=SecretsRepo._to_utc_iso_str(row.get("updated_at")),
        )

    @staticmethod
    def _to_utc_iso_str(raw_value: Any) -> str:
        if isinstance(raw_value, datetime):
            value = raw_value
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.isoformat().replace("+00:00", "Z")
        return str(raw_value)

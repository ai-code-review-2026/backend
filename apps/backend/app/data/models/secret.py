from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class StoredSecret:
    id: str
    namespace: str
    secret_key: str
    ciphertext: str
    meta_json: str
    created_at: str
    updated_at: str

    @property
    def meta(self) -> dict[str, Any]:
        try:
            return json.loads(self.meta_json)
        except Exception:
            return {}

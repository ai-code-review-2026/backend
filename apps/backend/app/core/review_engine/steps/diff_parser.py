from __future__ import annotations

from typing import Any

from app.core.review_engine.diff_engine import parse_unified_diff


def parse_diff(diff_text: str) -> dict[str, Any]:
    parsed = parse_unified_diff(diff_text)
    return {
        "files": [
            {
                "file_path": file.path_new,
                "change_type": file.change_type,
                "old_path": file.path_old,
            }
            for file in parsed.files
        ]
    }

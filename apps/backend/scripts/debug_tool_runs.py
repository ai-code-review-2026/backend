from __future__ import annotations

import json

from sqlalchemy import text

from app.data.database import get_engine


def main() -> int:
    engine = get_engine()
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                """
                SELECT
                  id,
                  analysis_id,
                  tool_name,
                  status,
                  warning,
                  exit_code,
                  version,
                  COALESCE(stderr_snippet, '') AS stderr_snippet,
                  COALESCE(stdout_snippet, '') AS stdout_snippet,
                  created_at
                FROM tool_runs
                WHERE tool_name IN ('semgrep','ruff')
                ORDER BY created_at DESC
                LIMIT 50
                """
            )
        ).mappings().all()

    print(f"total_rows={len(rows)}")
    for row in rows:
        payload = {
            "created_at": str(row["created_at"]),
            "analysis_id": row["analysis_id"],
            "tool_name": row["tool_name"],
            "status": row["status"],
            "warning": row["warning"],
            "exit_code": row["exit_code"],
            "version": row["version"],
            "stderr_snippet": (row["stderr_snippet"] or "")[:400],
            "stdout_snippet": (row["stdout_snippet"] or "")[:400],
        }
        print(json.dumps(payload, ensure_ascii=True))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

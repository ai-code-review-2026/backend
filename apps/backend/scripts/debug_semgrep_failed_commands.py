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
                  analysis_id,
                  command,
                  LENGTH(command) AS command_length,
                  workspace_path,
                  warning,
                  exit_code,
                  version,
                  created_at
                FROM tool_runs
                WHERE tool_name = 'semgrep' AND status = 'FAILED'
                ORDER BY created_at DESC
                LIMIT 20
                """
            )
        ).mappings().all()

    print(f"total_rows={len(rows)}")
    for row in rows:
        command = row["command"]
        command_len = len(command) if isinstance(command, list) else None
        payload = {
            "created_at": str(row["created_at"]),
            "analysis_id": row["analysis_id"],
            "warning": row["warning"],
            "exit_code": row["exit_code"],
            "version": row["version"],
            "workspace_path": row["workspace_path"],
            "command_is_list": isinstance(command, list),
            "command_len": command_len,
            "command_str_len": row["command_length"],
            "command_head": command[:10] if isinstance(command, list) else command,
            "targets_count": max(0, command_len - 7) if isinstance(command, list) else None,
        }
        print(json.dumps(payload, ensure_ascii=True))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

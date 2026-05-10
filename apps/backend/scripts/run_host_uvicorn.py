from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import uvicorn

BACKEND_ROOT = Path(__file__).resolve().parent.parent
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

RELOAD_DIRS = ["app", "alembic"]
RELOAD_EXCLUDES = [
    "__pycache__/*",
    "*.py[cod]",
    "*.log",
    ".ruff_cache/*",
    ".pytest_cache/*",
    ".venv/*",
]
RELOAD_DELAY_SECONDS = 0.75


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the backend Uvicorn server on the host.")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-reload", action="store_true")
    return parser.parse_args()


def build_uvicorn_kwargs(port: int, no_reload: bool) -> dict[str, object]:
    kwargs: dict[str, object] = {
        "app": "app.main:app",
        "port": port,
    }

    if no_reload:
        return kwargs

    kwargs.update(
        {
            "reload": True,
            "reload_dirs": RELOAD_DIRS,
            "reload_excludes": RELOAD_EXCLUDES,
            "reload_delay": RELOAD_DELAY_SECONDS,
        }
    )
    return kwargs


def main() -> int:
    args = parse_args()
    os.environ.setdefault("WATCHFILES_FORCE_POLLING", "true")
    uvicorn.run(**build_uvicorn_kwargs(port=args.port, no_reload=args.no_reload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

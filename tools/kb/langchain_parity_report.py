from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BACKEND_APP = ROOT / "apps" / "backend"
if str(BACKEND_APP) not in sys.path:
    sys.path.insert(0, str(BACKEND_APP))

from app.core.langchain_runtime import LangChainParityCampaignService  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a corpus-wide LangChain parity report from completed analyses.")
    parser.add_argument("--limit", type=int, default=200, help="Maximum number of completed analyses to inspect.")
    parser.add_argument("--since-days", type=int, default=14, help="Only inspect analyses updated in the last N days.")
    parser.add_argument("--repo", type=str, default=None, help="Optional repo filter (owner/name).")
    parser.add_argument("--output", type=str, default=None, help="Optional JSON file path for the full report.")
    args = parser.parse_args()

    report = LangChainParityCampaignService().build_report(
        limit=args.limit,
        since_days=args.since_days,
        repo=args.repo,
    ).payload

    if args.output:
        output_path = Path(args.output).expanduser().resolve()
        output_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

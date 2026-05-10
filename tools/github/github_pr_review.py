from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Submit a GitHub PR diff to the backend review API and format a review body."
    )
    parser.add_argument("--backend-url", required=True, help="Backend base URL, e.g. http://localhost:8000")
    parser.add_argument("--repo", required=True, help="owner/repo")
    parser.add_argument("--pr-number", required=True, type=int, help="GitHub PR number")
    parser.add_argument("--commit-sha", required=True, help="Head commit SHA")
    parser.add_argument("--diff-file", required=True, help="Path to the PR diff file")
    parser.add_argument("--title", default="", help="PR title")
    parser.add_argument("--author", default="", help="PR author login")
    parser.add_argument("--base-ref", default="", help="Base SHA")
    parser.add_argument("--head-ref", default="", help="Head SHA")
    parser.add_argument("--output-json", required=True, help="Path to write the final analysis JSON")
    parser.add_argument("--output-markdown", required=True, help="Path to write the GitHub review markdown")
    parser.add_argument("--bearer-token", default=os.environ.get("AI_REVIEW_BEARER_TOKEN", ""), help="Optional backend bearer token")
    parser.add_argument("--user-id", default=os.environ.get("AI_REVIEW_USER_ID", ""), help="Optional X-User-Id header")
    parser.add_argument("--poll-interval", type=int, default=10, help="Polling interval in seconds")
    parser.add_argument("--timeout-seconds", type=int, default=900, help="Max wait time for analysis completion")
    return parser.parse_args()


def _request_json(
    *,
    method: str,
    url: str,
    payload: dict[str, Any] | None,
    bearer_token: str,
    user_id: str,
) -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "ai-code-review-platform/github-pr-review",
    }
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    else:
        data = None

    if bearer_token.strip():
        headers["Authorization"] = f"Bearer {bearer_token.strip()}"
    if user_id.strip():
        headers["X-User-Id"] = user_id.strip()

    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=60) as response:
            raw = response.read().decode("utf-8")
            if not raw:
                return {}
            return json.loads(raw)
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Backend returned HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(f"Backend network error: {exc.reason}") from exc


def build_metadata(args: argparse.Namespace) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "title": args.title,
        "pr_title": args.title,
        "author": args.author,
        "pr_author": args.author,
        "base_ref": args.base_ref,
        "head_ref": args.head_ref or args.commit_sha,
        "workflow_source": "github_actions_pr_review",
        "github_run_id": os.environ.get("GITHUB_RUN_ID"),
        "github_run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
        "github_repository": os.environ.get("GITHUB_REPOSITORY"),
        "github_workflow": os.environ.get("GITHUB_WORKFLOW"),
        "github_actor": os.environ.get("GITHUB_ACTOR"),
    }
    return {key: value for key, value in metadata.items() if value not in (None, "")}


def submit_analysis(args: argparse.Namespace, diff_text: str) -> str:
    backend_url = args.backend_url.rstrip("/")
    payload = {
        "source": "github_actions",
        "repo": args.repo,
        "pr_number": args.pr_number,
        "commit_sha": args.commit_sha,
        "diff_text": diff_text,
        "metadata": build_metadata(args),
    }
    response = _request_json(
        method="POST",
        url=f"{backend_url}/v1/analyses",
        payload=payload,
        bearer_token=args.bearer_token,
        user_id=args.user_id,
    )
    analysis_id = str(response.get("analysis_id") or "").strip()
    if not analysis_id:
        raise RuntimeError(f"Backend did not return analysis_id: {response}")
    return analysis_id


def poll_analysis(args: argparse.Namespace, analysis_id: str) -> dict[str, Any]:
    backend_url = args.backend_url.rstrip("/")
    deadline = time.time() + max(args.timeout_seconds, args.poll_interval)
    last_response: dict[str, Any] = {}

    while time.time() < deadline:
        last_response = _request_json(
            method="GET",
            url=f"{backend_url}/v1/analyses/{analysis_id}",
            payload=None,
            bearer_token=args.bearer_token,
            user_id=args.user_id,
        )
        status = str(last_response.get("status") or "").upper()
        if status in {"COMPLETED", "FAILED"}:
            return last_response
        time.sleep(max(args.poll_interval, 1))

    raise RuntimeError(
        f"Timed out waiting for analysis {analysis_id}. Last status: {last_response.get('status', 'unknown')}"
    )


def _bullet_list(items: list[str], empty_message: str) -> list[str]:
    if not items:
        return [f"- {empty_message}"]
    return [f"- {item}" for item in items]


def _clean_code_findings(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    raw_findings = analysis.get("static_findings") or analysis.get("findings") or []
    if not isinstance(raw_findings, list):
        return []
    results: list[dict[str, Any]] = []
    for item in raw_findings:
        if not isinstance(item, dict):
            continue
        if str(item.get("source") or "").upper() != "STATIC_CLEAN_CODE":
            continue
        results.append(item)
    return results


def format_review_markdown(analysis: dict[str, Any]) -> str:
    review_output = analysis.get("review_output") or {}
    summary = review_output.get("summary") or {}
    change_explanation = review_output.get("change_explanation") or {}
    merge_readiness = review_output.get("merge_readiness") or {}
    risk_findings = review_output.get("risk_findings") or []
    clean_code_findings = _clean_code_findings(analysis)
    generated_tests = review_output.get("generated_tests") or []
    key_changes = review_output.get("key_changes") or []

    lines: list[str] = [
        "## AI Code Review",
        "",
        f"- Analysis ID: `{analysis.get('analysis_id', 'n/a')}`",
        f"- Status: `{analysis.get('status', 'unknown')}`",
        f"- Change type: `{summary.get('change_type', analysis.get('change_type', 'unknown'))}`",
        f"- Risk level: `{summary.get('risk_level', 'unknown')}`",
        f"- Merge readiness: `{merge_readiness.get('status', 'unknown')}`",
        "",
        "### Summary",
        "",
        summary.get("short_summary") or analysis.get("summary") or "No summary generated.",
        "",
    ]

    detailed_summary = summary.get("detailed_summary")
    if detailed_summary:
        lines.extend(["### Detailed Summary", "", detailed_summary, ""])

    lines.extend(["### Key Changes", "", *_bullet_list(list(key_changes)[:6], "No key changes extracted."), ""])

    what_changed = change_explanation.get("what_changed")
    if what_changed:
        lines.extend(["### What Changed", "", what_changed, ""])

    watch_areas = change_explanation.get("watch_areas") or []
    lines.extend(["### Watch Areas", "", *_bullet_list(list(watch_areas)[:6], "No specific watch area highlighted."), ""])

    lines.extend(["### Risk Findings", ""])
    if risk_findings:
        for finding in list(risk_findings)[:5]:
            file_path = finding.get("file_path") or "repo-wide"
            severity = finding.get("severity") or "medium"
            title = finding.get("title") or "Risk finding"
            suggestion = finding.get("suggestion") or "No suggestion provided."
            lines.extend(
                [
                    f"- **[{severity.upper()}] {title}** (`{file_path}`)",
                    f"  - {finding.get('explanation', 'No explanation provided.')}",
                    f"  - Suggested fix: {suggestion}",
                ]
            )
    else:
        lines.append("- No material risk finding generated.")
    lines.append("")

    lines.extend(["### Clean Code Findings", ""])
    if clean_code_findings:
        for finding in clean_code_findings[:8]:
            file_path = finding.get("file_path") or "repo-wide"
            severity = finding.get("severity") or "INFO"
            rule_id = finding.get("rule_id") or "clean_code_violation"
            message = finding.get("message") or "Clean Code issue detected."
            suggestion = finding.get("suggestion") or "No suggestion provided."
            line_start = finding.get("line_start")
            line_suffix = f":{line_start}" if isinstance(line_start, int) and line_start > 0 else ""
            lines.extend(
                [
                    f"- **[{severity}] {rule_id}** (`{file_path}{line_suffix}`)",
                    f"  - {message}",
                    f"  - Suggested fix: {suggestion}",
                ]
            )
    else:
        lines.append("- No Clean Code finding generated.")
    lines.append("")

    lines.extend(["### Suggested Tests", ""])
    if generated_tests:
        for test in list(generated_tests)[:5]:
            target_file = test.get("target_file") or "changed code"
            lines.extend(
                [
                    f"- **{test.get('test_name', 'Generated test')}** (`{test.get('test_type', 'unit')}`, priority `{test.get('priority', 'medium')}`)",
                    f"  - Target: `{target_file}`",
                    f"  - {test.get('rationale', 'No rationale provided.')}",
                ]
            )
            scenarios = test.get("scenarios") or []
            for scenario in list(scenarios)[:4]:
                lines.append(f"    - {scenario}")
    else:
        lines.append("- No additional test recommendation generated.")
    lines.append("")

    lines.extend(
        [
            "### Merge Readiness",
            "",
            merge_readiness.get("reason") or "No merge readiness rationale available.",
        ]
    )

    blocking_items = merge_readiness.get("blocking_items") or []
    if blocking_items:
        lines.extend(["", *_bullet_list(list(blocking_items)[:6], "No blocking item.")])

    return "\n".join(lines).strip() + "\n"


def write_output(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def main() -> int:
    args = parse_args()
    diff_text = Path(args.diff_file).read_text(encoding="utf-8")

    try:
        analysis_id = submit_analysis(args, diff_text)
        analysis = poll_analysis(args, analysis_id)
        write_output(args.output_json, json.dumps(analysis, ensure_ascii=False, indent=2))
        write_output(args.output_markdown, format_review_markdown(analysis))
        if str(analysis.get("status") or "").upper() == "FAILED":
            return 1
        return 0
    except Exception as exc:
        failure_payload = {
            "status": "FAILED",
            "error": str(exc),
        }
        write_output(args.output_json, json.dumps(failure_payload, ensure_ascii=False, indent=2))
        write_output(
            args.output_markdown,
            "\n".join(
                [
                    "## AI Code Review",
                    "",
                    "- Status: `FAILED`",
                    "",
                    f"Backend review execution failed: {exc}",
                    "",
                ]
            ),
        )
        print(f"Error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

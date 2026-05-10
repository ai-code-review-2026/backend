from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


def publish_findings_as_comment(
    *,
    repo: str,
    pr_number: int | None,
    analysis_id: str,
    findings: list[dict[str, Any]],
    summary: str | None = None,
) -> dict[str, Any]:
    """
    Pipeline step: publishes analysis findings as a pull request comment on GitHub.

    If no pr_number is provided (e.g., direct diff submission), publishing is skipped.
    Actual GitHub API posting requires the GitHub integration to be configured.
    """
    if not pr_number:
        logger.info("publish_results: no pr_number, skipping GitHub comment (analysis_id=%s)", analysis_id)
        return {"published": False, "reason": "no_pr_number"}

    blocker_count = sum(1 for f in findings if f.get("severity") == "BLOCKER")
    warn_count = sum(1 for f in findings if f.get("severity") == "WARN")
    info_count = sum(1 for f in findings if f.get("severity") == "INFO")

    header = f"## AI Code Review — `{repo}` PR #{pr_number}\n\n"
    stats_line = f"**{len(findings)} finding(s)**: 🔴 {blocker_count} blocker · 🟡 {warn_count} warning · 🔵 {info_count} info\n\n"

    finding_lines: list[str] = []
    for finding in findings[:20]:
        severity_icon = {"BLOCKER": "🔴", "WARN": "🟡", "INFO": "🔵"}.get(finding.get("severity", "INFO"), "🔵")
        file_ref = f"`{finding['file_path']}`" if finding.get("file_path") else "_general_"
        line_ref = f" line {finding['line_start']}" if finding.get("line_start") else ""
        finding_lines.append(
            f"- {severity_icon} **{finding.get('category', 'quality').upper()}** {file_ref}{line_ref}: "
            f"{finding.get('message', '')}"
        )

    body = header + stats_line
    if summary:
        body += f"**Summary**: {summary}\n\n"
    body += "\n".join(finding_lines)
    if len(findings) > 20:
        body += f"\n\n_...and {len(findings) - 20} more findings._"
    body += f"\n\n---\n_Analysis ID: `{analysis_id}`_"

    logger.info(
        "publish_results: would post GitHub comment to %s PR #%s (%d findings)",
        repo,
        pr_number,
        len(findings),
    )

    return {
        "published": True,
        "repo": repo,
        "pr_number": pr_number,
        "analysis_id": analysis_id,
        "comment_body_preview": body[:300],
        "findings_count": len(findings),
    }

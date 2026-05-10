from __future__ import annotations

"""
Review pipeline orchestrator.

Chains the individual pipeline steps in the correct order:
  1. Parse diff        → ParsedDiff
  2. Static scan       → StaticAnalysisResult (Ruff + Semgrep + CleanCode)
  3. LLM review        → GroundedFindingOutput  (RAG-grounded findings)
  4. Publish results   → comment on GitHub PR (optional)

This module is intentionally thin — each step delegates to its own
service/module so that individual steps can be tested and replaced.
"""

import logging
from dataclasses import dataclass, field
from typing import Any

from app.core.review_engine.diff_engine import parse_unified_diff
from app.core.review_engine.steps.llm_review import run_llm_review
from app.core.review_engine.steps.static_scan import run_static_scan
from app.core.static_analysis.base import StaticAnalysisResult
from app.core.static_analysis.workspace import prepare_workspace
from app.workers.tasks.publish_results import publish_findings_as_comment

logger = logging.getLogger(__name__)


@dataclass
class ChangeSet:
    """Input contract for the review pipeline orchestrator."""

    repo: str
    diff_text: str
    pr_number: int | None = None
    analysis_id: str = ""
    knowledge_base_context: str = ""
    workspace_path: str = ""
    publish_comment: bool = False


@dataclass
class PipelineResult:
    """Aggregated output of the review pipeline."""

    analysis_id: str
    repo: str
    pr_number: int | None
    files_changed: list[str] = field(default_factory=list)
    static_result: StaticAnalysisResult | None = None
    llm_findings: list[dict[str, Any]] = field(default_factory=list)
    publish_result: dict[str, Any] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)


def run_pipeline(change_set: ChangeSet | dict) -> PipelineResult:
    """
    Run the full review pipeline for a given change set.

    Accepts either a :class:`ChangeSet` dataclass or a plain dict
    (for backwards compatibility with callers passing raw dicts).
    """
    if isinstance(change_set, dict):
        change_set = ChangeSet(**{k: v for k, v in change_set.items() if k in ChangeSet.__dataclass_fields__})

    result = PipelineResult(
        analysis_id=change_set.analysis_id,
        repo=change_set.repo,
        pr_number=change_set.pr_number,
    )

    # ── Step 1: Parse diff ────────────────────────────────────────────────────
    try:
        parsed = parse_unified_diff(change_set.diff_text)
        result.files_changed = [f.path_new for f in parsed.files if not f.is_binary]
        logger.info("orchestrator: parsed %d files (analysis_id=%s)", len(result.files_changed), change_set.analysis_id)
    except Exception as exc:
        logger.exception("orchestrator: diff parsing failed")
        result.errors.append(f"diff_parse: {exc}")
        return result

    # ── Step 2: Static scan ───────────────────────────────────────────────────
    workspace = change_set.workspace_path
    if workspace:
        try:
            static_result = run_static_scan(
                parsed=parsed,
                workspace_path=workspace,
                repo=change_set.repo,
            )
            result.static_result = static_result
            logger.info(
                "orchestrator: static scan found %d findings (analysis_id=%s)",
                len(static_result.findings),
                change_set.analysis_id,
            )
        except Exception as exc:
            logger.exception("orchestrator: static scan failed")
            result.errors.append(f"static_scan: {exc}")
    else:
        logger.info("orchestrator: no workspace_path provided, skipping static scan")

    # ── Step 3: LLM review (RAG-grounded) ────────────────────────────────────
    if change_set.knowledge_base_context:
        try:
            llm_output = run_llm_review(
                repo=change_set.repo,
                pr_number=change_set.pr_number,
                diff_redacted=change_set.diff_text,
                files_changed=result.files_changed,
                knowledge_base_context=change_set.knowledge_base_context,
            )
            result.llm_findings = [f.model_dump() for f in llm_output.findings]
            logger.info(
                "orchestrator: LLM review produced %d findings (analysis_id=%s)",
                len(result.llm_findings),
                change_set.analysis_id,
            )
        except Exception as exc:
            logger.exception("orchestrator: LLM review failed")
            result.errors.append(f"llm_review: {exc}")
    else:
        logger.info("orchestrator: no KB context provided, skipping LLM review")

    # ── Step 4: Publish results ───────────────────────────────────────────────
    if change_set.publish_comment:
        all_findings = result.llm_findings.copy()
        if result.static_result:
            for sf in result.static_result.findings:
                all_findings.append({
                    "file_path": sf.file_path,
                    "line_start": sf.line_start,
                    "severity": sf.severity,
                    "category": sf.source,
                    "message": sf.message,
                })
        try:
            result.publish_result = publish_findings_as_comment(
                repo=change_set.repo,
                pr_number=change_set.pr_number,
                analysis_id=change_set.analysis_id,
                findings=all_findings,
            )
        except Exception as exc:
            logger.exception("orchestrator: publish failed")
            result.errors.append(f"publish: {exc}")

    return result

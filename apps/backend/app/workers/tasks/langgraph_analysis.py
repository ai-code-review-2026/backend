from __future__ import annotations

import asyncio
import logging
from typing import Any

from analysis.langGraph.models import LangGraphAnalysisRequest
from analysis.langGraph.pipeline import run_langgraph_analysis
from app.core.knowledge_base.repo_path_resolver import resolve_repo_context_repo_path
from app.core.review_engine.diff_engine import parse_unified_diff
from app.data.repos.analyses_repo import AnalysesRepo
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="analysis.run_langgraph_pipeline", bind=True)
def run_langgraph_pipeline(self, analysis_id: str) -> dict[str, Any]:
    _ = self
    repo = AnalysesRepo()
    analysis = repo.get_by_id(analysis_id)
    if analysis is None:
        return {
            "analysis_id": analysis_id,
            "status": "FAILED",
            "error": "analysis_not_found",
        }

    repo_path = resolve_repo_context_repo_path(repo=analysis.repo, metadata=analysis.metadata)
    if not repo_path:
        return {
            "analysis_id": analysis_id,
            "status": "SKIPPED",
            "reason": "repo_path_unresolved",
        }

    parsed = parse_unified_diff(analysis.diff_raw)
    changed_files = [item.path_new for item in parsed.files if item.path_new]
    request = LangGraphAnalysisRequest(
        analysis_id=analysis_id,
        repo_id=analysis.repo,
        repo_path=repo_path,
        diff_text=analysis.diff_raw,
        changed_files=changed_files,
        pr_number=analysis.pr_number,
        commit_sha=analysis.commit_sha,
        metadata={"diff_hash": analysis.diff_hash, **(analysis.metadata or {})},
    )

    try:
        result = asyncio.run(run_langgraph_analysis(request=request))
    except Exception as exc:
        logger.exception("LangGraph pipeline task failed", extra={"analysis_id": analysis_id})
        return {
            "analysis_id": analysis_id,
            "status": "FAILED",
            "error": str(exc),
        }

    repo.update_status(
        analysis_id=analysis_id,
        status=analysis.status,
        stage=analysis.stage,
        progress=analysis.progress,
        metadata_updates={"pipeline": {"langgraph_async": result.to_dict()}},
    )
    return {
        "analysis_id": analysis_id,
        "status": "COMPLETED",
        "langgraph": result.to_dict(),
    }


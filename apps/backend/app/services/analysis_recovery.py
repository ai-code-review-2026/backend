from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Callable

from app.data.models.analysis import Analysis
from app.data.repos.analyses_repo import AnalysesRepo
from app.settings import settings
from app.workers.celery_app import is_celery_task_active
from app.workers.queue import EnqueueResult, QueueUnavailableError, enqueue_analysis_job

logger = logging.getLogger(__name__)

_RECOVERY_THROTTLE_LOCK = Lock()
_LAST_RECOVERY_RUN_MONOTONIC = 0.0


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(value.strip())
        except ValueError:
            return default
    return default


def _extract_requeue_attempts(analysis: Analysis) -> int:
    metadata = analysis.metadata or {}
    recovery = metadata.get("queue_recovery")
    if not isinstance(recovery, dict):
        return 0
    return max(0, _safe_int(recovery.get("requeue_attempts"), default=0))


def _extract_running_task_id(analysis: Analysis) -> str | None:
    metadata = analysis.metadata or {}
    pipeline = metadata.get("pipeline")
    if not isinstance(pipeline, dict):
        return None
    task_id = pipeline.get("task_id")
    if not isinstance(task_id, str):
        return None
    normalized = task_id.strip()
    return normalized or None


def _recovery_metadata(
    *,
    reason: str,
    actor: str,
    attempts: int,
    task_id: str | None = None,
    previous_task_id: str | None = None,
    error: str | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "reason": reason,
        "recovered_at": _utc_now_iso(),
        "recovered_by": actor,
        "requeue_attempts": attempts,
    }
    if task_id:
        payload["task_id"] = task_id
    if previous_task_id:
        payload["previous_task_id"] = previous_task_id
    if error:
        payload["error"] = error
    return {"queue_recovery": payload}


def _mark_failed(
    *,
    repo: AnalysesRepo,
    analysis: Analysis,
    error_code: str,
    error_message: str,
    metadata_updates: dict[str, Any],
) -> None:
    repo.update_status(
        analysis_id=analysis.id,
        status="FAILED",
        stage="FAILED",
        progress=100,
        error_code=error_code,
        error_message=error_message,
        metadata_updates=metadata_updates,
    )


def _recover_one_stale_job(
    *,
    repo: AnalysesRepo,
    analysis: Analysis,
    reason: str,
    actor: str,
    enqueue_fn: Callable[[str], EnqueueResult],
) -> tuple[bool, bool]:
    attempts = _extract_requeue_attempts(analysis)
    max_attempts = max(0, int(settings.ANALYSIS_STALE_RECOVERY_MAX_REQUEUE_ATTEMPTS))

    if attempts >= max_attempts:
        _mark_failed(
            repo=repo,
            analysis=analysis,
            error_code="QUEUE_STALE_TIMEOUT",
            error_message="Analysis exceeded stale recovery attempts",
            metadata_updates=_recovery_metadata(
                reason=f"{reason}.max_attempts_reached",
                actor=actor,
                attempts=attempts,
            ),
        )
        return False, True

    previous_task_id = _extract_running_task_id(analysis)
    try:
        enqueue_result = enqueue_fn(analysis.id)
    except QueueUnavailableError as exc:
        _mark_failed(
            repo=repo,
            analysis=analysis,
            error_code="QUEUE_UNAVAILABLE",
            error_message="Queue unavailable during stale analysis recovery",
            metadata_updates=_recovery_metadata(
                reason=f"{reason}.queue_unavailable",
                actor=actor,
                attempts=attempts,
                previous_task_id=previous_task_id,
                error=str(exc),
            ),
        )
        return False, True
    except Exception as exc:
        _mark_failed(
            repo=repo,
            analysis=analysis,
            error_code="QUEUE_RECOVERY_ERROR",
            error_message="Unexpected error while recovering stale analysis",
            metadata_updates=_recovery_metadata(
                reason=f"{reason}.unexpected_error",
                actor=actor,
                attempts=attempts,
                previous_task_id=previous_task_id,
                error=type(exc).__name__,
            ),
        )
        return False, True

    repo.update_status(
        analysis_id=analysis.id,
        status="QUEUED",
        stage="QUEUED",
        progress=10,
        error_code=None,
        error_message=None,
        metadata_updates=_recovery_metadata(
            reason=reason,
            actor=actor,
            attempts=attempts + 1,
            task_id=enqueue_result.task_id,
            previous_task_id=previous_task_id,
        ),
    )
    return True, False


def recover_stale_analyses(
    *,
    repo: AnalysesRepo | None = None,
    enqueue_fn: Callable[[str], EnqueueResult] = enqueue_analysis_job,
    is_task_active_fn: Callable[[str], bool] = is_celery_task_active,
) -> dict[str, Any]:
    if not settings.ANALYSIS_STALE_RECOVERY_ENABLED:
        return {"enabled": False}

    repo = repo or AnalysesRepo()
    actor = "analysis_stale_recovery"
    max_batch = max(1, int(settings.ANALYSIS_STALE_RECOVERY_MAX_BATCH))
    queued_timeout_seconds = max(1, int(settings.ANALYSIS_STALE_QUEUE_TIMEOUT_SECONDS))
    running_timeout_seconds = max(1, int(settings.ANALYSIS_STALE_RUNNING_TIMEOUT_SECONDS))

    stale_queued = repo.list_stale(
        statuses=("RECEIVED", "QUEUED"),
        stale_for_seconds=queued_timeout_seconds,
        limit=max_batch,
    )
    stale_running = repo.list_stale(
        statuses=("RUNNING",),
        stale_for_seconds=running_timeout_seconds,
        limit=max_batch,
    )

    requeued = 0
    failed = 0
    skipped_running_active = 0

    for analysis in stale_queued:
        recovered, marked_failed = _recover_one_stale_job(
            repo=repo,
            analysis=analysis,
            reason="stale_queue_timeout",
            actor=actor,
            enqueue_fn=enqueue_fn,
        )
        if recovered:
            requeued += 1
        if marked_failed:
            failed += 1

    for analysis in stale_running:
        running_task_id = _extract_running_task_id(analysis)
        if running_task_id and is_task_active_fn(running_task_id):
            skipped_running_active += 1
            continue
        recovered, marked_failed = _recover_one_stale_job(
            repo=repo,
            analysis=analysis,
            reason="stale_running_timeout",
            actor=actor,
            enqueue_fn=enqueue_fn,
        )
        if recovered:
            requeued += 1
        if marked_failed:
            failed += 1

    result = {
        "enabled": True,
        "checked_queued": len(stale_queued),
        "checked_running": len(stale_running),
        "running_active_skipped": skipped_running_active,
        "requeued": requeued,
        "failed": failed,
        "at": _utc_now_iso(),
    }
    if requeued or failed:
        logger.warning("Stale analysis recovery result: %s", result)
    return result


def run_stale_recovery_if_due() -> dict[str, Any] | None:
    if not settings.ANALYSIS_STALE_RECOVERY_ENABLED:
        return None

    interval_seconds = max(1, int(settings.ANALYSIS_STALE_RECOVERY_INTERVAL_SECONDS))
    now_monotonic = time.monotonic()
    should_run = False

    global _LAST_RECOVERY_RUN_MONOTONIC
    with _RECOVERY_THROTTLE_LOCK:
        if now_monotonic - _LAST_RECOVERY_RUN_MONOTONIC >= interval_seconds:
            _LAST_RECOVERY_RUN_MONOTONIC = now_monotonic
            should_run = True

    if not should_run:
        return None

    return recover_stale_analyses()

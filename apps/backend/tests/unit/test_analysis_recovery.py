from __future__ import annotations

import json

from app.data.models.analysis import Analysis
from app.services import analysis_recovery
from app.workers.queue import EnqueueResult


def _build_analysis(
    *,
    analysis_id: str,
    status: str,
    metadata: dict[str, object] | None = None,
) -> Analysis:
    return Analysis(
        id=analysis_id,
        repo="octo/repo",
        provider="github",
        pr_number=1,
        commit_sha="abc1234",
        source="manual",
        status=status,
        stage=status,
        progress=10,
        nb_files_changed=0,
        additions_total=0,
        deletions_total=0,
        diff_hash=f"hash-{analysis_id}",
        diff_raw="diff --git a/a.py b/a.py\n@@ -1 +1 @@\n-a\n+b\n",
        summary=None,
        diff_redacted=None,
        has_secrets=False,
        redaction_stats_json="{}",
        static_stats_json="{}",
        change_type=None,
        change_type_confidence=None,
        change_type_source=None,
        change_type_signals_json="{}",
        error_code=None,
        error_message=None,
        created_at="2026-04-19T00:00:00Z",
        updated_at="2026-04-19T00:00:00Z",
        metadata_json=json.dumps(metadata or {}),
    )


class _FakeRepo:
    def __init__(self, *, queued: list[Analysis], running: list[Analysis]) -> None:
        self._queued = queued
        self._running = running
        self.status_updates: list[dict[str, object]] = []

    def list_stale(self, *, statuses: tuple[str, ...], stale_for_seconds: int, limit: int) -> list[Analysis]:
        _ = stale_for_seconds, limit
        if statuses == ("RECEIVED", "QUEUED"):
            return list(self._queued)
        if statuses == ("RUNNING",):
            return list(self._running)
        return []

    def update_status(self, **payload: object) -> None:
        self.status_updates.append(dict(payload))


def test_recover_stale_queued_analysis_requeues(monkeypatch) -> None:
    repo = _FakeRepo(
        queued=[_build_analysis(analysis_id="a1", status="QUEUED")],
        running=[],
    )
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RECOVERY_ENABLED", True)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RECOVERY_MAX_REQUEUE_ATTEMPTS", 2)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RECOVERY_MAX_BATCH", 25)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_QUEUE_TIMEOUT_SECONDS", 60)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RUNNING_TIMEOUT_SECONDS", 60)

    summary = analysis_recovery.recover_stale_analyses(
        repo=repo,  # type: ignore[arg-type]
        enqueue_fn=lambda _analysis_id: EnqueueResult(task_id="task-123"),
        is_task_active_fn=lambda _task_id: False,
    )

    assert summary["requeued"] == 1
    assert summary["failed"] == 0
    assert repo.status_updates[0]["status"] == "QUEUED"
    metadata_updates = repo.status_updates[0]["metadata_updates"]
    assert isinstance(metadata_updates, dict)
    queue_recovery = metadata_updates.get("queue_recovery")
    assert isinstance(queue_recovery, dict)
    assert queue_recovery.get("requeue_attempts") == 1
    assert queue_recovery.get("task_id") == "task-123"


def test_recover_stale_running_skips_active_task(monkeypatch) -> None:
    repo = _FakeRepo(
        queued=[],
        running=[
            _build_analysis(
                analysis_id="a2",
                status="RUNNING",
                metadata={"pipeline": {"task_id": "active-task"}},
            )
        ],
    )
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RECOVERY_ENABLED", True)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RECOVERY_MAX_BATCH", 25)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_QUEUE_TIMEOUT_SECONDS", 60)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RUNNING_TIMEOUT_SECONDS", 60)

    summary = analysis_recovery.recover_stale_analyses(
        repo=repo,  # type: ignore[arg-type]
        enqueue_fn=lambda _analysis_id: EnqueueResult(task_id="unused"),
        is_task_active_fn=lambda task_id: task_id == "active-task",
    )

    assert summary["running_active_skipped"] == 1
    assert summary["requeued"] == 0
    assert summary["failed"] == 0
    assert repo.status_updates == []


def test_recover_stale_queued_fails_after_max_attempts(monkeypatch) -> None:
    repo = _FakeRepo(
        queued=[
            _build_analysis(
                analysis_id="a3",
                status="QUEUED",
                metadata={"queue_recovery": {"requeue_attempts": 2}},
            )
        ],
        running=[],
    )
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RECOVERY_ENABLED", True)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RECOVERY_MAX_REQUEUE_ATTEMPTS", 2)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RECOVERY_MAX_BATCH", 25)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_QUEUE_TIMEOUT_SECONDS", 60)
    monkeypatch.setattr(analysis_recovery.settings, "ANALYSIS_STALE_RUNNING_TIMEOUT_SECONDS", 60)

    summary = analysis_recovery.recover_stale_analyses(
        repo=repo,  # type: ignore[arg-type]
        enqueue_fn=lambda _analysis_id: EnqueueResult(task_id="should-not-be-used"),
        is_task_active_fn=lambda _task_id: False,
    )

    assert summary["requeued"] == 0
    assert summary["failed"] == 1
    assert repo.status_updates[0]["status"] == "FAILED"
    assert repo.status_updates[0]["error_code"] == "QUEUE_STALE_TIMEOUT"

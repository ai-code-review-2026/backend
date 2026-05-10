import sys

from celery import Celery

from app.settings import settings

celery_app = Celery("ai_review")


def configure_celery_app() -> None:
    broker_url = settings.resolved_celery_broker_url
    result_backend = settings.resolved_celery_result_backend

    if broker_url:
        celery_app.conf.broker_url = broker_url
    if result_backend:
        celery_app.conf.result_backend = result_backend

    celery_app.conf.timezone = settings.CELERY_TIMEZONE
    celery_app.conf.enable_utc = settings.CELERY_ENABLE_UTC

    # Connection resilience: limited retries + tight socket timeouts so that
    # a missing Redis instance fails in <10s instead of hanging for ~30s.
    celery_app.conf.broker_connection_retry = True
    celery_app.conf.broker_connection_max_retries = 3
    celery_app.conf.broker_transport_options = {
        "max_retries": 2,
        "interval_start": 0,
        "interval_step": 0.5,
        "interval_max": 1,
        "socket_timeout": 5,
        "socket_connect_timeout": 3,
    }
    # Limit connection pool to avoid exhausting Redis on small local instances
    celery_app.conf.broker_pool_limit = 10

    celery_app.conf.task_default_queue = settings.ANALYSIS_QUEUE_NAME
    celery_app.conf.task_always_eager = settings.CELERY_TASK_ALWAYS_EAGER
    celery_app.conf.task_eager_propagates = settings.CELERY_TASK_EAGER_PROPAGATES
    # Reliability for long-running tasks:
    # - ack late so crashes do not silently drop tasks.
    # - reject on worker-lost to requeue unacknowledged jobs.
    # - prefetch=1 to avoid one worker hoarding jobs while another is idle.
    celery_app.conf.task_acks_late = True
    celery_app.conf.task_reject_on_worker_lost = True
    celery_app.conf.task_track_started = True
    celery_app.conf.worker_prefetch_multiplier = 1
    if settings.CELERY_WORKER_POOL:
        celery_app.conf.worker_pool = settings.CELERY_WORKER_POOL
    elif sys.platform.startswith("win"):
        # Celery prefork is unstable on Windows; default to solo unless overridden.
        celery_app.conf.worker_pool = "solo"
        # Solo pool on Windows should run single-threaded to avoid intermittent
        # connection pressure against local Redis instances.
        celery_app.conf.worker_concurrency = 1
    celery_app.conf.imports = (
        "app.workers.tasks.analyze_pr",
        "app.workers.tasks.ingest_kb",
        "app.workers.tasks.langgraph_analysis",
    )
    if settings.KB_DOCUMENT_MAINTENANCE_SCHEDULE_MINUTES > 0:
        celery_app.conf.beat_schedule = {
            "kb-document-maintenance": {
                "task": "kb.maintain_documents",
                "schedule": settings.KB_DOCUMENT_MAINTENANCE_SCHEDULE_MINUTES * 60,
                "kwargs": {"reason": "scheduled"},
            }
        }


def is_celery_task_active(task_id: str, timeout: float | None = None) -> bool:
    normalized = (task_id or "").strip()
    if not normalized:
        return False

    configure_celery_app()

    inspect_timeout = timeout if timeout is not None else settings.CELERY_ENQUEUE_INSPECT_TIMEOUT_SECONDS
    try:
        inspector = celery_app.control.inspect(timeout=inspect_timeout)
    except Exception:
        return False

    if inspector is None:
        return False

    for accessor in (inspector.active, inspector.reserved):
        try:
            payload = accessor() or {}
        except Exception:
            continue
        if not isinstance(payload, dict):
            continue
        for tasks in payload.values():
            if not isinstance(tasks, list):
                continue
            for task in tasks:
                if not isinstance(task, dict):
                    continue
                if str(task.get("id") or "").strip() == normalized:
                    return True

    return False


configure_celery_app()

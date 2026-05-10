# app/core/observability/metrics.py
#
# Centralized Prometheus metrics for the AI Code Review pipeline.
#
# Architecture note:
#   - The FastAPI API process exposes these metrics at GET /metrics automatically
#     via prometheus_fastapi_instrumentator (already wired in main.py).
#   - Celery worker processes are separate OS processes and CANNOT expose /metrics.
#     Worker metrics are pushed to the Prometheus Pushgateway via push_worker_metrics()
#     at the end of each task. Prometheus then scrapes the Pushgateway.
#
# Usage in workers:
#   from app.core.observability import ANALYSIS_COMPLETED, ANALYSIS_DURATION, push_worker_metrics
#   ANALYSIS_COMPLETED.labels(status="completed").inc()
#   ANALYSIS_DURATION.observe(elapsed)
#   push_worker_metrics()   # call once at end of task

from __future__ import annotations

import logging
import os
import socket

from prometheus_client import (
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    push_to_gateway,
)

logger = logging.getLogger(__name__)

# ── Pipeline — top-level counters ────────────────────────────────────────────

ANALYSIS_STARTED = Counter(
    "analysis_pipeline_started_total",
    "Total number of analysis pipeline runs started",
    ["source"],  # api | webhook | manual
)

ANALYSIS_COMPLETED = Counter(
    "analysis_pipeline_completed_total",
    "Analysis pipeline runs by final status",
    ["status"],  # completed | failed | timeout
)

ANALYSIS_DURATION = Histogram(
    "analysis_pipeline_duration_seconds",
    "End-to-end duration of the full analysis pipeline",
    buckets=[5, 15, 30, 60, 120, 300, 600],
)

# ── Pipeline — per-step timing ────────────────────────────────────────────────
# step labels: diff_parse | secret_scan | change_classification |
#              static_analysis | langgraph_rag | review_intelligence

PIPELINE_STEP_DURATION = Histogram(
    "analysis_step_duration_seconds",
    "Duration of each individual pipeline step",
    ["step"],
    buckets=[0.1, 0.5, 1, 2, 5, 15, 30, 60, 120],
)

PIPELINE_STEP_ERRORS = Counter(
    "analysis_step_errors_total",
    "Errors raised during a pipeline step",
    ["step", "error_type"],
)

# ── LLM / Ollama ──────────────────────────────────────────────────────────────

LLM_REQUESTS = Counter(
    "llm_requests_total",
    "LLM API calls by provider, model, and outcome",
    ["provider", "model", "status"],  # status: success | timeout | error
)

LLM_DURATION = Histogram(
    "llm_request_duration_seconds",
    "Latency of LLM generate() calls",
    ["provider", "model"],
    buckets=[1, 2, 5, 10, 30, 60, 120, 300],
)

LLM_TOKENS = Counter(
    "llm_tokens_used_total",
    "Total tokens processed by the LLM",
    ["provider", "model"],
)

# ── Security / secret scan ────────────────────────────────────────────────────

SECRETS_FOUND = Counter(
    "security_secrets_detected_total",
    "Secrets detected in diffs by rule type",
    ["rule_id"],
)

SECRETS_REDACTED = Counter(
    "security_secrets_redacted_total",
    "Total secrets redacted before being sent to the LLM",
)

# ── Static analysis findings ──────────────────────────────────────────────────

STATIC_FINDINGS = Counter(
    "static_analysis_findings_total",
    "Static analysis findings by tool and severity",
    ["tool", "severity"],  # tool: ruff | semgrep | cleancode
)

# ── RAG / Qdrant ──────────────────────────────────────────────────────────────

RAG_QUERIES = Counter(
    "rag_queries_total",
    "RAG retrieval attempts by outcome",
    ["status"],  # success | failed | skipped
)

RAG_QUERY_DURATION = Histogram(
    "rag_query_duration_seconds",
    "Duration of RAG context retrieval",
    buckets=[0.1, 0.5, 1, 2, 5, 10],
)

# ── Celery queue depth (set from worker at task start) ───────────────────────

CELERY_QUEUE_DEPTH = Gauge(
    "celery_analysis_queue_depth",
    "Approximate number of tasks waiting in the analyses queue",
)


# ── Pushgateway helper ────────────────────────────────────────────────────────

_PUSHGATEWAY_URL = os.getenv("PROMETHEUS_PUSHGATEWAY_URL", "http://pushgateway:9091")
_WORKER_HOSTNAME = socket.gethostname()


def push_worker_metrics(*, job: str = "celery_worker") -> None:
    """Push the current process's metrics to the Prometheus Pushgateway.

    Call this once at the end of each Celery task. Safe to call even if the
    Pushgateway is unavailable — failures are logged and swallowed so they
    never abort a task.
    """
    try:
        push_to_gateway(
            _PUSHGATEWAY_URL,
            job=job,
            grouping_key={"worker": _WORKER_HOSTNAME},
            registry=None,  # uses the default global registry
        )
    except Exception as exc:
        logger.warning("Failed to push metrics to Pushgateway (%s): %s", _PUSHGATEWAY_URL, exc)

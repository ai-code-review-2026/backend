import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_fastapi_instrumentator import Instrumentator
from app.api.http.graphrag import router as graphrag_router
from app.api.http.graph_visualization import router as graph_viz_router
from app.api.http.patterns import router as patterns_router

from app.api.errors import register_exception_handlers
from app.api.middleware.rate_limit import RateLimitMiddleware
from app.api.http import (
    admin,
    ai,
    analyses,
    branch_policies,
    branch_protection,
    branches,
    internal_analysis_engine,
    jira_integration,
    knowledge_base,
    llm_gateway,
    mobile,
    notifications,
    object_storage,
    observability,
    organizations,
    org_structure,
    project_comprehension,
    project_settings,
    project_roles,
    projects,
    rag_evaluation,
    rag_feedback,
    rag_query,
    repositories,
    review_states,
    reviewer_metrics,
    review_queue,
    reviews,
    role_permissions,
    security,
    statistics,
    suggestions,
    teams,
    webhook_github,
    vscode_reviews,
    integrations,
)
from app.api.websockets import notifications as notifications_ws
from app.api.websockets import review_sessions as review_sessions_ws
from app.api.websockets import llm_progress as llm_progress_ws
from app.core.security.secret_store import get_secret_store
from app.data.database import close_db, init_db
from app.services.analysis_recovery import run_stale_recovery_if_due
from app.settings import settings


async def _analysis_stale_recovery_loop(stop_event: asyncio.Event) -> None:
    logger = logging.getLogger(__name__)
    while not stop_event.is_set():
        try:
            summary = await asyncio.to_thread(run_stale_recovery_if_due)
            if summary and (summary.get("requeued") or summary.get("failed")):
                logger.warning("Stale analysis recovery handled jobs: %s", summary)
        except Exception:
            logger.exception("Stale analysis recovery loop failed")

        wait_seconds = max(1, int(settings.ANALYSIS_STALE_RECOVERY_INTERVAL_SECONDS))
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=wait_seconds)
        except asyncio.TimeoutError:
            continue


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    get_secret_store().bootstrap_from_env()
    
    # Initialize observability infrastructure (LLM traces + metrics)
    try:
        from app.observability import init_observability
        init_observability()
        logging.info("Observability infrastructure initialized (LLM traces + metrics)")
    except Exception:
        logging.exception("Failed to initialize observability infrastructure (non-fatal)")
    
    logger = logging.getLogger(__name__)

    # Initialise Neo4j schema (constraints, indexes, vector indexes) if enabled
    try:
        from app.integrations.graph_database.neo4j_client import get_neo4j_client
        neo4j = get_neo4j_client()
        if neo4j.enabled:
            await asyncio.to_thread(neo4j.init_schema)
            logger.info("Neo4j schema initialised")
    except Exception:
        logger.exception("Neo4j schema init failed (non-fatal — service will continue)")

    recovery_stop_event = asyncio.Event()
    recovery_task: asyncio.Task[None] | None = None
    if settings.ANALYSIS_STALE_RECOVERY_ENABLED:
        recovery_task = asyncio.create_task(_analysis_stale_recovery_loop(recovery_stop_event))
    # Print registered routes to help debug 404s from external webhooks.
    try:
        routes = []
        for route in app.routes:
            methods = getattr(route, "methods", None)
            path = getattr(route, "path", None)
            routes.append({"path": path, "methods": list(methods) if methods else None})
        logger.info("Registered routes: %s", routes)
    except Exception:
        pass
    try:
        yield
    finally:
        if recovery_task is not None:
            recovery_stop_event.set()
            try:
                await recovery_task
            except Exception:
                logger.exception("Stale analysis recovery loop shutdown failed")
        close_db()


app = FastAPI(
    title="AI Code Review Backend",
    version="1.0.0",
    lifespan=lifespan,
    openapi_tags=[
        {"name": "analyses", "description": "Analysis intake and read APIs."},
        {"name": "branches", "description": "Branch management and operations APIs."},
        {"name": "branch-protection", "description": "Branch protection rules and validation APIs."},
        {"name": "branch-policies", "description": "Organization-level branch policies for naming, workflow, and merge strategies."},
        {"name": "reviews", "description": "Review management, assignments, comments, and change requests APIs."},
        {"name": "knowledge-base", "description": "Repo context onboarding and retrieval APIs."},
        {"name": "projects", "description": "Project comprehension and context management APIs."},
        {"name": "project-settings", "description": "Project settings including auto-analysis toggle management."},
        {"name": "rag", "description": "RAG query and intelligent code analysis APIs."},
        {"name": "rag-evaluation", "description": "RAG performance evaluation and benchmarking APIs."},
        {"name": "observability", "description": "System monitoring and observability APIs."},
        {"name": "jira", "description": "Jira integration for issue creation and linking APIs."},
        {"name": "review-states", "description": "Review state machine and workflow management APIs."},
        {"name": "patterns", "description": "Design pattern extraction, analysis, and violation tracking APIs."},
        {"name": "llm-gateway", "description": "LLM Gateway for intelligent routing, tracing, and cost management."},
    ],
)
register_exception_handlers(app)
app.add_middleware(RateLimitMiddleware)

# ─── CORS Configuration ────────────────────────────────────────────────────────
# Allow requests from frontend (Next.js running on localhost:3000 or :3001)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Type",
        "Authorization",
        "X-API-Key",
        "X-Requested-With",
    ],
    expose_headers=["Content-Type", "X-Total-Count"],
    max_age=3600,
)

# ─── Prometheus metrics ────────────────────────────────────────────────────────
# Exposes /metrics endpoint for Prometheus scraping.
# Called before include_router so all routes are instrumented.
Instrumentator(
    should_group_status_codes=True,
    should_ignore_untemplated=True,
    excluded_handlers=["/metrics", "/health", "/healthz", "/__routes"],
).instrument(app).expose(app, include_in_schema=False, tags=["observability"])


@app.get("/health")
@app.get("/healthz")
async def health():
    """Health check endpoint with service status."""
    from app.integrations.object_storage.s3_minio_client import get_minio_client
    from app.settings import settings

    services = {
        "api": "ok",
    }

    # Check MinIO health if enabled
    if settings.OBJECT_STORAGE_ENABLED:
        try:
            minio_health = get_minio_client().health_check()
            services["minio"] = minio_health.get("status", "unknown")
        except Exception:
            services["minio"] = "error"

    # Check Neo4j health if enabled
    if settings.NEO4J_ENABLED:
        services["neo4j"] = "configured"

    overall_status = "ok" if all(
        s in ("ok", "healthy", "configured", "disabled")
        for s in services.values()
    ) else "degraded"

    return {"status": overall_status, "services": services}


app.include_router(webhook_github.router)
app.include_router(analyses.router, prefix="/v1")
app.include_router(branches.router)
app.include_router(branch_protection.router)
app.include_router(branch_policies.router)
app.include_router(reviews.router)
app.include_router(review_queue.router)
app.include_router(review_states.router)
app.include_router(reviewer_metrics.router)
app.include_router(vscode_reviews.router)
app.include_router(notifications.router)
app.include_router(knowledge_base.router)
app.include_router(admin.router)
app.include_router(internal_analysis_engine.router)
app.include_router(project_comprehension.router)
app.include_router(project_settings.router, prefix="/api/v1", tags=["project-settings"])
app.include_router(rag_evaluation.router)
app.include_router(rag_feedback.router)
app.include_router(rag_query.router)
app.include_router(repositories.router)
app.include_router(projects.router)
app.include_router(organizations.router, prefix="/v1")
app.include_router(org_structure.router)
app.include_router(statistics.router)
app.include_router(security.router)
app.include_router(teams.router)
app.include_router(object_storage.router)
app.include_router(observability.router)
app.include_router(jira_integration.router)
app.include_router(integrations.router)
app.include_router(project_roles.router)
app.include_router(role_permissions.router)
app.include_router(ai.router, prefix="/api/v1", tags=["ai"])
app.include_router(llm_gateway.router)
app.include_router(suggestions.router, prefix="/v1")
app.include_router(notifications_ws.router)
app.include_router(review_sessions_ws.router)
app.include_router(llm_progress_ws.router)
app.include_router(graphrag_router)
app.include_router(graph_viz_router)
app.include_router(patterns_router)
app.include_router(mobile.router, prefix="/v1")


@app.get("/__routes")
async def list_routes():
    return [{"path": getattr(r, "path", None), "methods": list(getattr(r, "methods", []))} for r in app.routes]

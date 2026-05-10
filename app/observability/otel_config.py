"""
OpenTelemetry (OTEL) Configuration for Distributed Tracing.

Provides comprehensive distributed tracing for:
- FastAPI request/response lifecycle
- LLM operations (generate, route, fallback)
- Database queries
- External service calls
- Custom business logic spans

Architecture:
- Auto-instrumentation for FastAPI, SQLAlchemy, HTTP clients
- Custom span creation for LLM operations
- Export to Jaeger, Zipkin, or OTLP-compatible backends
- Semantic conventions for LLM attributes
- Graceful degradation if OTEL unavailable

Environment Variables:
- OTEL_ENABLED: Enable OpenTelemetry tracing (default: False)
- OTEL_SERVICE_NAME: Service name for traces (default: "devora-backend")
- OTEL_EXPORTER_OTLP_ENDPOINT: OTLP endpoint URL (default: http://localhost:4317)
- OTEL_EXPORTER_TYPE: Exporter type - "otlp", "jaeger", "zipkin" (default: "otlp")
- OTEL_SAMPLE_RATE: Trace sampling rate 0.0-1.0 (default: 1.0 = all traces)
- OTEL_RESOURCE_ATTRIBUTES: Additional resource attributes (comma-separated key=value pairs)

Usage:
    # Initialize at application startup
    from app.observability.otel_config import init_otel_tracing
    
    @app.on_event("startup")
    async def startup():
        init_otel_tracing(app)
    
    # Create custom spans for LLM operations
    from app.observability.otel_config import create_llm_span
    
    async def generate(ctx: LLMRequestContext):
        with create_llm_span("llm.generate", ctx):
            # ... LLM operation ...
            pass
"""

from __future__ import annotations

import logging
from contextlib import contextmanager
from typing import TYPE_CHECKING, Any

from app.settings import settings

if TYPE_CHECKING:
    from fastapi import FastAPI
    from opentelemetry.trace import Span
    from app.gateway.request_context import LLMRequestContext

logger = logging.getLogger(__name__)

# Global tracer instance
_tracer = None
_otel_initialized = False
_otel_import_error: Exception | None = None


def is_otel_enabled() -> bool:
    """
    Check if OpenTelemetry tracing is enabled.
    
    Returns:
        True if OTEL is enabled in settings
    """
    return getattr(settings, "OTEL_ENABLED", False)


def _init_otel_exporter():
    """
    Initialize OTEL exporter based on configuration.
    
    Returns:
        Configured span exporter or None if setup fails
    """
    try:
        exporter_type = getattr(settings, "OTEL_EXPORTER_TYPE", "otlp").lower()
        
        if exporter_type == "otlp":
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            
            endpoint = getattr(
                settings,
                "OTEL_EXPORTER_OTLP_ENDPOINT",
                "http://localhost:4317"
            )
            logger.info("Initializing OTLP exporter (endpoint=%s)", endpoint)
            return OTLPSpanExporter(endpoint=endpoint)
            
        elif exporter_type == "jaeger":
            from opentelemetry.exporter.jaeger.thrift import JaegerExporter
            
            agent_host = getattr(settings, "OTEL_JAEGER_AGENT_HOST", "localhost")
            agent_port = getattr(settings, "OTEL_JAEGER_AGENT_PORT", 6831)
            logger.info(
                "Initializing Jaeger exporter (agent=%s:%s)",
                agent_host,
                agent_port
            )
            return JaegerExporter(
                agent_host_name=agent_host,
                agent_port=agent_port,
            )
            
        elif exporter_type == "zipkin":
            from opentelemetry.exporter.zipkin.json import ZipkinExporter
            
            endpoint = getattr(
                settings,
                "OTEL_ZIPKIN_ENDPOINT",
                "http://localhost:9411/api/v2/spans"
            )
            logger.info("Initializing Zipkin exporter (endpoint=%s)", endpoint)
            return ZipkinExporter(endpoint=endpoint)
            
        else:
            logger.error("Unknown OTEL exporter type: %s", exporter_type)
            return None
            
    except ImportError as exc:
        logger.warning(
            "OTEL exporter for '%s' not available. Install with: pip install opentelemetry-exporter-%s",
            exporter_type,
            exporter_type,
        )
        raise exc
    except Exception as exc:
        logger.error("Failed to initialize OTEL exporter: %s", exc)
        raise exc


def init_otel_tracing(app: FastAPI | None = None) -> bool:
    """
    Initialize OpenTelemetry tracing with auto-instrumentation.
    
    Sets up:
    - Span processor with configured exporter
    - Resource with service name and attributes
    - Auto-instrumentation for FastAPI, SQLAlchemy, HTTP clients
    - Sampling based on OTEL_SAMPLE_RATE
    
    Args:
        app: FastAPI application instance (optional, for auto-instrumentation)
        
    Returns:
        True if OTEL was initialized successfully, False otherwise
    """
    global _tracer, _otel_initialized, _otel_import_error
    
    if _otel_initialized:
        logger.debug("OTEL already initialized")
        return True
    
    if not is_otel_enabled():
        logger.info("OpenTelemetry tracing is disabled")
        return False
    
    try:
        from opentelemetry import trace
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.trace.sampling import TraceIdRatioBased
        from opentelemetry.sdk.resources import Resource, SERVICE_NAME
        
        # Build resource with service name and custom attributes
        service_name = getattr(settings, "OTEL_SERVICE_NAME", "devora-backend")
        resource_attrs = {
            SERVICE_NAME: service_name,
        }
        
        # Parse additional resource attributes from env
        custom_attrs = getattr(settings, "OTEL_RESOURCE_ATTRIBUTES", "")
        if custom_attrs:
            for pair in custom_attrs.split(","):
                if "=" in pair:
                    key, value = pair.split("=", 1)
                    resource_attrs[key.strip()] = value.strip()
        
        resource = Resource.create(resource_attrs)
        
        # Initialize exporter
        try:
            exporter = _init_otel_exporter()
            if exporter is None:
                logger.error("Failed to initialize OTEL exporter")
                _otel_import_error = ValueError("Exporter initialization failed")
                return False
        except Exception as exc:
            logger.error("Failed to create OTEL exporter: %s", exc)
            _otel_import_error = exc
            return False
        
        # Configure sampling
        sample_rate = getattr(settings, "OTEL_SAMPLE_RATE", 1.0)
        sampler = TraceIdRatioBased(sample_rate)
        
        # Create tracer provider
        provider = TracerProvider(
            resource=resource,
            sampler=sampler,
        )
        
        # Add batch span processor
        processor = BatchSpanProcessor(exporter)
        provider.add_span_processor(processor)
        
        # Set as global tracer provider
        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer(__name__)
        
        logger.info(
            "OpenTelemetry tracing initialized (service=%s, sample_rate=%.2f)",
            service_name,
            sample_rate,
        )
        
        # Auto-instrument FastAPI if app provided
        if app is not None:
            try:
                from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
                FastAPIInstrumentor.instrument_app(app)
                logger.info("FastAPI auto-instrumentation enabled")
            except ImportError:
                logger.warning(
                    "FastAPI instrumentation not available. "
                    "Install with: pip install opentelemetry-instrumentation-fastapi"
                )
            except Exception as exc:
                logger.warning("Failed to instrument FastAPI: %s", exc)
        
        # Auto-instrument SQLAlchemy
        try:
            from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
            SQLAlchemyInstrumentor().instrument()
            logger.info("SQLAlchemy auto-instrumentation enabled")
        except ImportError:
            logger.debug(
                "SQLAlchemy instrumentation not available. "
                "Install with: pip install opentelemetry-instrumentation-sqlalchemy"
            )
        except Exception as exc:
            logger.warning("Failed to instrument SQLAlchemy: %s", exc)
        
        # Auto-instrument HTTP clients (requests, httpx)
        try:
            from opentelemetry.instrumentation.requests import RequestsInstrumentor
            RequestsInstrumentor().instrument()
            logger.info("Requests library auto-instrumentation enabled")
        except ImportError:
            logger.debug("Requests instrumentation not available")
        except Exception as exc:
            logger.warning("Failed to instrument requests: %s", exc)
        
        try:
            from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
            HTTPXClientInstrumentor().instrument()
            logger.info("HTTPX library auto-instrumentation enabled")
        except ImportError:
            logger.debug("HTTPX instrumentation not available")
        except Exception as exc:
            logger.warning("Failed to instrument httpx: %s", exc)
        
        _otel_initialized = True
        return True
        
    except ImportError as exc:
        logger.warning(
            "OpenTelemetry SDK not installed. "
            "Install with: pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp"
        )
        _otel_import_error = exc
        return False
    except Exception as exc:
        logger.error("Failed to initialize OpenTelemetry: %s", exc, exc_info=True)
        _otel_import_error = exc
        return False


@contextmanager
def create_llm_span(
    operation: str,
    ctx: LLMRequestContext | None = None,
    attributes: dict[str, Any] | None = None,
):
    """
    Create a custom span for LLM operations.
    
    Follows OpenTelemetry semantic conventions for LLM observability:
    - Span name: "llm.<operation>" (e.g., "llm.generate", "llm.route", "llm.fallback")
    - Attributes prefixed with "llm." for LLM-specific data
    
    Args:
        operation: Operation type (generate, route, fallback, etc.)
        ctx: LLM request context (optional, auto-extracts attributes)
        attributes: Additional custom attributes
        
    Yields:
        OpenTelemetry Span instance (or no-op if OTEL disabled)
        
    Example:
        with create_llm_span("llm.generate", ctx):
            response = await provider.generate(prompt)
    """
    if not _otel_initialized or _tracer is None:
        # OTEL disabled or not initialized - yield no-op
        yield None
        return
    
    try:
        from opentelemetry.trace import Status, StatusCode
        
        # Build span name
        span_name = f"llm.{operation}" if not operation.startswith("llm.") else operation
        
        # Start span
        with _tracer.start_as_current_span(span_name) as span:
            # Add LLM context attributes
            if ctx is not None:
                span.set_attribute("llm.trace_id", ctx.trace_id)
                
                if ctx.selected_provider:
                    span.set_attribute("llm.provider", ctx.selected_provider)
                if ctx.selected_model:
                    span.set_attribute("llm.model", ctx.selected_model)
                if ctx.user_id:
                    span.set_attribute("llm.user_id", ctx.user_id)
                if ctx.project_id:
                    span.set_attribute("llm.project_id", ctx.project_id)
                if ctx.analysis_id:
                    span.set_attribute("llm.analysis_id", ctx.analysis_id)
                
                # Routing attributes
                if ctx.priority:
                    span.set_attribute("llm.priority", ctx.priority.value)
                if ctx.sensitivity:
                    span.set_attribute("llm.sensitivity", ctx.sensitivity.value)
                if ctx.cost_target:
                    span.set_attribute("llm.cost_target", ctx.cost_target.value)
                if ctx.routing_reason:
                    span.set_attribute("llm.routing_reason", ctx.routing_reason)
                
                # Performance attributes (will be updated after completion)
                if ctx.duration_ms is not None:
                    span.set_attribute("llm.latency_ms", ctx.duration_ms)
                if ctx.input_tokens is not None:
                    span.set_attribute("llm.tokens.input", ctx.input_tokens)
                if ctx.output_tokens is not None:
                    span.set_attribute("llm.tokens.output", ctx.output_tokens)
                if ctx.total_tokens is not None:
                    span.set_attribute("llm.tokens.total", ctx.total_tokens)
                if ctx.actual_cost_cents is not None:
                    span.set_attribute("llm.cost_cents", ctx.actual_cost_cents)
                
                # Error handling
                if ctx.fallback_used:
                    span.set_attribute("llm.fallback_used", True)
                    if ctx.fallback_provider:
                        span.set_attribute("llm.fallback_provider", ctx.fallback_provider)
                if ctx.retry_count > 0:
                    span.set_attribute("llm.retry_count", ctx.retry_count)
                
                # Quality scores
                if ctx.hallucination_score is not None:
                    span.set_attribute("llm.score.hallucination", ctx.hallucination_score)
                if ctx.relevance_score is not None:
                    span.set_attribute("llm.score.relevance", ctx.relevance_score)
                if ctx.faithfulness_score is not None:
                    span.set_attribute("llm.score.faithfulness", ctx.faithfulness_score)
            
            # Add custom attributes
            if attributes:
                for key, value in attributes.items():
                    if value is not None:
                        span.set_attribute(key, value)
            
            # Yield span for custom operations
            yield span
            
            # Mark success or error
            if ctx and ctx.error:
                span.set_status(Status(StatusCode.ERROR, ctx.error))
                span.record_exception(Exception(ctx.error))
            else:
                span.set_status(Status(StatusCode.OK))
                
    except Exception as exc:
        logger.error("Failed to create OTEL span: %s", exc)
        yield None


def add_span_event(name: str, attributes: dict[str, Any] | None = None) -> None:
    """
    Add an event to the current active span.
    
    Useful for marking significant points within an operation.
    
    Args:
        name: Event name
        attributes: Event attributes
        
    Example:
        add_span_event("fallback.triggered", {"reason": "timeout"})
    """
    if not _otel_initialized or _tracer is None:
        return
    
    try:
        from opentelemetry import trace
        
        current_span = trace.get_current_span()
        if current_span and current_span.is_recording():
            current_span.add_event(name, attributes or {})
            
    except Exception as exc:
        logger.debug("Failed to add span event: %s", exc)


def get_otel_status() -> dict[str, Any]:
    """
    Get OpenTelemetry status for health checks.
    
    Returns:
        Status dictionary with enabled state, initialization status, and config
    """
    enabled = is_otel_enabled()
    
    if not enabled:
        return {
            "enabled": False,
            "status": "disabled",
            "message": "OpenTelemetry tracing is disabled in settings",
        }
    
    if not _otel_initialized:
        error_msg = str(_otel_import_error) if _otel_import_error else "Not initialized"
        return {
            "enabled": True,
            "status": "error",
            "message": f"OpenTelemetry initialization failed: {error_msg}",
        }
    
    return {
        "enabled": True,
        "status": "ready",
        "message": "OpenTelemetry tracing is active",
        "service_name": getattr(settings, "OTEL_SERVICE_NAME", "devora-backend"),
        "exporter_type": getattr(settings, "OTEL_EXPORTER_TYPE", "otlp"),
        "sample_rate": getattr(settings, "OTEL_SAMPLE_RATE", 1.0),
        "endpoint": getattr(settings, "OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317"),
    }

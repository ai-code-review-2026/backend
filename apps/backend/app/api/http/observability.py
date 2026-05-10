from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field

from app.api.middleware.auth import AuthenticatedPrincipal, require_permission
from app.data.database import get_engine
from app.settings import settings
import psutil
import redis
from sqlalchemy import text

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/observability", tags=["observability"])


class SystemMetric(BaseModel):
    name: str
    value: float
    unit: str
    timestamp: str
    status: str  # "healthy", "warning", "critical"


class ServiceHealth(BaseModel):
    service: str
    status: str
    response_time_ms: float | None = None
    error: str | None = None
    details: dict[str, Any] | None = None


class LogEntry(BaseModel):
    timestamp: str
    level: str
    service: str
    message: str
    trace_id: str | None = None
    metadata: dict[str, Any] | None = None


class ObservabilityResponse(BaseModel):
    timestamp: str
    system_metrics: list[SystemMetric]
    service_health: list[ServiceHealth]
    alerts: list[dict[str, Any]]
    recent_logs: list[LogEntry]


class PerformanceMetrics(BaseModel):
    timestamp: str
    api_latency_p50: float
    api_latency_p95: float
    api_latency_p99: float
    request_rate: float
    error_rate: float
    active_connections: int
    throughput: float


async def check_database_health() -> ServiceHealth:
    """Check database connectivity and performance"""
    start_time = time.perf_counter()
    try:
        engine = get_engine()
        with engine.connect() as conn:
            result = conn.execute(text("SELECT 1"))
            result.fetchone()
        
        response_time = (time.perf_counter() - start_time) * 1000
        return ServiceHealth(
            service="postgresql",
            status="healthy" if response_time < 100 else "warning" if response_time < 500 else "critical",
            response_time_ms=response_time,
            details={"connection_pool": "active"}
        )
    except Exception as e:
        return ServiceHealth(
            service="postgresql",
            status="critical",
            response_time_ms=(time.perf_counter() - start_time) * 1000,
            error=str(e)
        )


async def check_redis_health() -> ServiceHealth:
    """Check Redis connectivity and performance"""
    start_time = time.perf_counter()
    try:
        redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        redis_client.ping()
        response_time = (time.perf_counter() - start_time) * 1000
        
        info = redis_client.info()
        return ServiceHealth(
            service="redis",
            status="healthy" if response_time < 50 else "warning" if response_time < 200 else "critical",
            response_time_ms=response_time,
            details={
                "connected_clients": info.get("connected_clients", 0),
                "used_memory_human": info.get("used_memory_human", "unknown")
            }
        )
    except Exception as e:
        return ServiceHealth(
            service="redis",
            status="critical",
            response_time_ms=(time.perf_counter() - start_time) * 1000,
            error=str(e)
        )


def get_system_metrics() -> list[SystemMetric]:
    """Get current system metrics"""
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    # CPU metrics
    cpu_percent = psutil.cpu_percent(interval=1)
    cpu_status = "healthy" if cpu_percent < 70 else "warning" if cpu_percent < 90 else "critical"
    
    # Memory metrics
    memory = psutil.virtual_memory()
    memory_status = "healthy" if memory.percent < 70 else "warning" if memory.percent < 85 else "critical"
    
    # Disk metrics
    disk = psutil.disk_usage('/')
    disk_status = "healthy" if disk.percent < 80 else "warning" if disk.percent < 90 else "critical"
    
    return [
        SystemMetric(
            name="cpu_usage",
            value=cpu_percent,
            unit="%",
            timestamp=timestamp,
            status=cpu_status
        ),
        SystemMetric(
            name="memory_usage",
            value=memory.percent,
            unit="%",
            timestamp=timestamp,
            status=memory_status
        ),
        SystemMetric(
            name="disk_usage",
            value=disk.percent,
            unit="%",
            timestamp=timestamp,
            status=disk_status
        ),
        SystemMetric(
            name="memory_available",
            value=memory.available / 1024 / 1024 / 1024,  # GB
            unit="GB",
            timestamp=timestamp,
            status="healthy"
        ),
    ]


def get_recent_logs() -> list[LogEntry]:
    """Get recent log entries (mock implementation)"""
    # In a real implementation, you'd query your log aggregation system
    timestamp = datetime.utcnow().isoformat() + "Z"
    return [
        LogEntry(
            timestamp=timestamp,
            level="INFO",
            service="api",
            message="Analysis request processed successfully",
            trace_id="trace_001",
            metadata={"duration_ms": 150, "repo_id": "example/repo"}
        ),
        LogEntry(
            timestamp=timestamp,
            level="WARNING",
            service="worker",
            message="High queue depth detected",
            metadata={"queue_size": 25}
        ),
    ]


@router.get("/status", response_model=ObservabilityResponse)
async def get_observability_status(
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("admin.read")),
) -> ObservabilityResponse:
    """
    Get comprehensive system observability status including metrics,
    service health, and recent logs.
    """
    timestamp = datetime.utcnow().isoformat() + "Z"
    
    # Gather system metrics
    system_metrics = get_system_metrics()
    
    # Check service health
    db_health, redis_health = await asyncio.gather(
        check_database_health(),
        check_redis_health(),
        return_exceptions=True
    )
    
    service_health = []
    if isinstance(db_health, ServiceHealth):
        service_health.append(db_health)
    if isinstance(redis_health, ServiceHealth):
        service_health.append(redis_health)
    
    # Generate alerts based on metrics
    alerts = []
    for metric in system_metrics:
        if metric.status == "critical":
            alerts.append({
                "severity": "critical",
                "title": f"High {metric.name}",
                "description": f"{metric.name} is at {metric.value}{metric.unit}",
                "timestamp": timestamp
            })
        elif metric.status == "warning":
            alerts.append({
                "severity": "warning",
                "title": f"Elevated {metric.name}",
                "description": f"{metric.name} is at {metric.value}{metric.unit}",
                "timestamp": timestamp
            })
    
    # Add service health alerts
    for service in service_health:
        if service.status == "critical":
            alerts.append({
                "severity": "critical",
                "title": f"{service.service} service down",
                "description": service.error or f"{service.service} is not responding",
                "timestamp": timestamp
            })
    
    return ObservabilityResponse(
        timestamp=timestamp,
        system_metrics=system_metrics,
        service_health=service_health,
        alerts=alerts,
        recent_logs=get_recent_logs()
    )


@router.get("/metrics/performance", response_model=list[PerformanceMetrics])
async def get_performance_metrics(
    hours: int = Query(default=24, ge=1, le=168),  # Max 1 week
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("admin.read")),
) -> list[PerformanceMetrics]:
    """
    Get performance metrics over time.
    In a real implementation, this would query your metrics store (Prometheus, etc.)
    """
    # Mock data - in reality, you'd query your metrics database
    end_time = datetime.utcnow()
    start_time = end_time - timedelta(hours=hours)
    
    metrics = []
    current_time = start_time
    
    while current_time <= end_time:
        # Generate mock performance data
        import random
        metrics.append(PerformanceMetrics(
            timestamp=current_time.isoformat() + "Z",
            api_latency_p50=random.uniform(50, 200),
            api_latency_p95=random.uniform(200, 500),
            api_latency_p99=random.uniform(500, 1000),
            request_rate=random.uniform(10, 100),
            error_rate=random.uniform(0, 5),
            active_connections=random.randint(5, 50),
            throughput=random.uniform(100, 1000)
        ))
        current_time += timedelta(hours=1)
    
    return metrics


@router.get("/alerts", response_model=list[dict[str, Any]])
async def get_alerts(
    severity: str = Query(default="all", regex="^(all|critical|warning|info)$"),
    limit: int = Query(default=50, ge=1, le=500),
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("admin.read")),
) -> list[dict[str, Any]]:
    """
    Get system alerts with optional filtering by severity.
    """
    # Mock alert data - in reality, you'd query your alerting system
    all_alerts = [
        {
            "id": "alert_001",
            "severity": "critical",
            "title": "High memory usage",
            "description": "Memory usage is above 90%",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "status": "active",
            "service": "api"
        },
        {
            "id": "alert_002",
            "severity": "warning",
            "title": "Elevated response time",
            "description": "API response time is above threshold",
            "timestamp": (datetime.utcnow() - timedelta(minutes=15)).isoformat() + "Z",
            "status": "acknowledged",
            "service": "api"
        }
    ]
    
    if severity != "all":
        all_alerts = [a for a in all_alerts if a["severity"] == severity]
    
    return all_alerts[:limit]


@router.get("/traces/{trace_id}")
async def get_trace_details(
    trace_id: str,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("admin.read")),
) -> dict[str, Any]:
    """
    Get detailed trace information for debugging.
    """
    # Mock trace data - in reality, you'd query your tracing system (Jaeger, etc.)
    return {
        "trace_id": trace_id,
        "duration_ms": 450,
        "status": "success",
        "spans": [
            {
                "span_id": "span_001",
                "operation": "http_request",
                "duration_ms": 450,
                "tags": {"method": "POST", "endpoint": "/api/v1/analyses"},
                "logs": [
                    {"timestamp": "2024-01-01T12:00:00Z", "message": "Request received"},
                    {"timestamp": "2024-01-01T12:00:01Z", "message": "Processing analysis"}
                ]
            }
        ]
    }
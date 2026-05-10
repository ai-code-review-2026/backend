from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

import asyncio

from app.api.middleware.auth import AuthenticatedPrincipal, enforce_permission, get_current_principal
from app.data.database import get_engine
from app.data.repos.reviewer_metrics_repo import ReviewerMetricsRepo
from app.services.reviewer_metrics_calculator import ReviewerMetricsCalculator

router = APIRouter(prefix="/v1/reviews/metrics", tags=["metrics"])


@router.get("/test")
async def test_endpoint():
    """Test endpoint without any dependencies."""
    return {"status": "working", "message": "Basic endpoint works"}


@router.get("/personal", response_model=dict[str, Any])
async def get_personal_metrics(
    period_days: int = Query(30, ge=7, le=365, description="Période en jours (7-365)"),
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> dict[str, Any]:
    """
    Récupère les métriques personnelles du reviewer connecté.
    """
    enforce_permission(principal, "metrics.read_self")

    # If auth is disabled and no principal, use a test user ID
    user_id = principal.user_id if principal else "test_user"

    end_date = date.today()
    start_date = end_date - timedelta(days=period_days)

    # Return minimal response for now to test basic functionality
    return {
        "reviewer_id": user_id,
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "days": period_days,
        },
        "current_period": {
            "reviews_completed": 0,
            "avg_review_time_minutes": 0,
            "avg_comments_per_review": 0,
            "sla_compliance_rate": 0,
            "approvals": 0,
            "warnings": 0,
            "blocks": 0,
            "findings_identified": 0,
        },
        "trends": {
            "dates": [],
            "reviews_completed": [],
            "avg_review_time": [],
            "sla_compliance": [],
            "avg_comments": [],
        },
        "rankings": {
            "reviews_count": 0,
            "quality_score": 0,
            "response_time": 0,
        },
    }

    if not metrics:
        # Aucune métrique trouvée, retourner des valeurs par défaut
        return {
            "reviewer_id": user_id,
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": period_days,
            },
            "current_period": {
                "reviews_completed": 0,
                "avg_review_time_minutes": 0,
                "avg_comments_per_review": 0,
                "sla_compliance_rate": 0,
                "approvals": 0,
                "warnings": 0,
                "blocks": 0,
            },
            "trends": await calculator.get_reviewer_trends(user_id, periods=4),
            "rankings": {
                "reviews_count": 0,
                "quality_score": 0,
                "response_time": 0,
            },
        }

    # Agréger les métriques de la période
    total_completed = sum(m["reviews_completed"] for m in metrics)
    total_within_sla = sum(m["reviews_within_sla"] for m in metrics)
    total_breached_sla = sum(m["reviews_breached_sla"] for m in metrics)

    avg_times = [m["avg_review_time_minutes"] for m in metrics if m["avg_review_time_minutes"]]
    avg_review_time = int(sum(avg_times) / len(avg_times)) if avg_times else 0

    avg_comments = [float(m["avg_comments_per_review"] or 0) for m in metrics]
    avg_comments_per_review = round(sum(avg_comments) / len(avg_comments), 2) if avg_comments else 0

    sla_compliance = (
        (total_within_sla / (total_within_sla + total_breached_sla))
        if (total_within_sla + total_breached_sla) > 0 else 1.0
    )

    # Récupérer tendances
    trends = await calculator.get_reviewer_trends(user_id, periods=4)

    return {
        "reviewer_id": user_id,
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "days": period_days,
        },
        "current_period": {
            "reviews_completed": total_completed,
            "avg_review_time_minutes": avg_review_time,
            "avg_comments_per_review": avg_comments_per_review,
            "sla_compliance_rate": round(sla_compliance, 3),
            "approvals": sum(m["approvals"] for m in metrics),
            "warnings": sum(m["warnings"] for m in metrics),
            "blocks": sum(m["blocks"] for m in metrics),
            "findings_identified": sum(m["findings_identified"] for m in metrics),
        },
        "trends": trends,
        "rankings": {
            "reviews_count": 0,  # À implémenter avec leaderboard
            "quality_score": 0,
            "response_time": 0,
        },
    }


@router.get("/team", response_model=dict[str, Any])
async def get_team_metrics(
    period_days: int = Query(30, ge=7, le=365),
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> dict[str, Any]:
    """
    Récupère les métriques d'équipe (Lead/Admin seulement).
    """
    enforce_permission(principal, "metrics.read_team")

    end_date = date.today()
    start_date = end_date - timedelta(days=period_days)

    repo = ReviewerMetricsRepo()

    # Récupérer résumé d'équipe pour la période
    team_summary = repo.get_team_summary(start_date, end_date)
    
    # Fournir des valeurs par défaut si pas de données
    default_team_overview = {
        "reviewer_count": 0,
        "total_assigned": 0,
        "total_completed": 0,
        "total_declined": 0,
        "total_comments": 0,
        "total_change_requests": 0,
        "avg_team_review_time": 0,
        "avg_team_response_time": 0,
        "total_findings": 0,
        "total_approvals": 0,
        "total_warnings": 0,
        "total_blocks": 0,
        "team_sla_rate": 0,
    }
    
    # Fusionner les valeurs par défaut avec les données existantes
    team_overview = {**default_team_overview, **{k: v for k, v in team_summary.items() if v is not None}}

    # Récupérer métriques individuelles pour le leaderboard
    all_metrics = repo.get_metrics_by_period(start_date, end_date)

    # Créer leaderboard par nombre de reviews complétées
    leaderboard_data = []
    reviewer_totals = {}

    for metric in all_metrics:
        reviewer_id = metric["reviewer_id"]
        if reviewer_id not in reviewer_totals:
            reviewer_totals[reviewer_id] = {
                "reviewer_id": reviewer_id,
                "reviews_completed": 0,
                "avg_review_time": 0,
                "sla_compliance": 0,
                "comment_count": 0,
            }

        reviewer_totals[reviewer_id]["reviews_completed"] += metric["reviews_completed"]
        reviewer_totals[reviewer_id]["comment_count"] += metric["comments_created"]

        if metric["avg_review_time_minutes"]:
            reviewer_totals[reviewer_id]["avg_review_time"] = metric["avg_review_time_minutes"]

        within_sla = metric["reviews_within_sla"]
        breached_sla = metric["reviews_breached_sla"]
        if within_sla + breached_sla > 0:
            reviewer_totals[reviewer_id]["sla_compliance"] = within_sla / (within_sla + breached_sla)

    # Trier par nombre de reviews complétées
    leaderboard_data = sorted(
        reviewer_totals.values(),
        key=lambda x: x["reviews_completed"],
        reverse=True
    )[:10]  # Top 10

    return {
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "days": period_days,
        },
        "team_overview": team_overview,
        "leaderboard": leaderboard_data,
        "capacity_analysis": {
            "total_capacity": 0,  # À calculer en fonction des users.reviewer_capacity
            "utilization_rate": 0,
            "bottlenecks": [],  # À implémenter avec analyse des assignments
        },
    }


@router.get("/leaderboard", response_model=list[dict[str, Any]])
async def get_leaderboard(
    metric: str = Query("reviews_completed", description="Métrique pour le classement"),
    period_days: int = Query(30, ge=7, le=365),
    limit: int = Query(10, ge=5, le=50),
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> list[dict[str, Any]]:
    """
    Récupère le leaderboard des reviewers pour une métrique donnée.
    """
    enforce_permission(principal, "metrics.read_team")

    end_date = date.today()
    start_date = end_date - timedelta(days=period_days)

    repo = ReviewerMetricsRepo()

    try:
        leaderboard = repo.get_leaderboard(start_date, end_date, metric, limit)
        return [dict(entry) for entry in leaderboard]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/trends", response_model=dict[str, Any])
async def get_metrics_trends(
    reviewer_id: str | None = Query(None, description="ID du reviewer (défaut: utilisateur connecté)"),
    periods: int = Query(8, ge=2, le=24, description="Nombre de périodes hebdomadaires"),
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> dict[str, Any]:
    """
    Récupère les tendances de métriques sur plusieurs périodes.
    """
    user_id = principal.user_id if principal else "test_user"
    target_reviewer_id = reviewer_id or user_id

    # Vérifier permissions
    if target_reviewer_id != user_id:
        enforce_permission(principal, "metrics.read_team")
    else:
        enforce_permission(principal, "metrics.read_self")

    calculator = ReviewerMetricsCalculator()
    trends = await calculator.get_reviewer_trends(target_reviewer_id, periods)

    return {
        "reviewer_id": target_reviewer_id,
        "periods": periods,
        "trends": trends,
    }


@router.post("/refresh", status_code=202)
async def refresh_metrics(
    reviewer_id: str | None = Query(None, description="ID du reviewer (défaut: tous)"),
    target_date: date | None = Query(None, description="Date cible (défaut: hier)"),
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> dict[str, Any]:
    """
    Déclenche un recalcul des métriques (Admin seulement).
    """
    enforce_permission(principal, "metrics.refresh")

    calculator = ReviewerMetricsCalculator()

    if reviewer_id:
        # Recalculer pour un reviewer spécifique
        if target_date is None:
            target_date = date.today() - timedelta(days=1)

        metrics = await calculator.calculate_reviewer_metrics(
            reviewer_id, target_date, target_date
        )

        return {
            "message": "Metrics recalculated for reviewer",
            "reviewer_id": reviewer_id,
            "date": target_date.isoformat(),
            "metrics_id": metrics["id"] if metrics else None,
        }
    else:
        # Recalculer pour tous les reviewers (job quotidien)
        processed_count = await calculator.calculate_daily_metrics(target_date)

        return {
            "message": "Daily metrics calculation triggered",
            "date": (target_date or date.today() - timedelta(days=1)).isoformat(),
            "reviewers_processed": processed_count,
        }


@router.get("/summary", response_model=dict[str, Any])
async def get_metrics_summary(
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> dict[str, Any]:
    """
    Récupère un résumé global des métriques (Admin/Lead seulement).
    """
    enforce_permission(principal, "metrics.read_all")

    repo = ReviewerMetricsRepo()
    summary = repo.get_metrics_summary()

    return summary


@router.get("/reviewer/{reviewer_id}", response_model=dict[str, Any])
async def get_reviewer_metrics(
    reviewer_id: str,
    period_days: int = Query(30, ge=7, le=365),
    principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> dict[str, Any]:
    """
    Récupère les métriques d'un reviewer spécifique (Lead/Admin seulement).
    """
    enforce_permission(principal, "metrics.read_all")

    end_date = date.today()
    start_date = end_date - timedelta(days=period_days)

    repo = ReviewerMetricsRepo()
    calculator = ReviewerMetricsCalculator()

    # Récupérer métriques
    metrics = repo.get_metrics_for_period(reviewer_id, start_date, end_date)
    trends = await calculator.get_reviewer_trends(reviewer_id, periods=6)

    if not metrics:
        raise HTTPException(status_code=404, detail="No metrics found for this reviewer")

    # Agréger métriques
    total_completed = sum(m["reviews_completed"] for m in metrics)
    avg_times = [m["avg_review_time_minutes"] for m in metrics if m["avg_review_time_minutes"]]
    avg_review_time = int(sum(avg_times) / len(avg_times)) if avg_times else 0

    return {
        "reviewer_id": reviewer_id,
        "period": {
            "start": start_date.isoformat(),
            "end": end_date.isoformat(),
            "days": period_days,
        },
        "summary": {
            "total_reviews": total_completed,
            "avg_review_time": avg_review_time,
            "total_comments": sum(m["comments_created"] for m in metrics),
            "total_change_requests": sum(m["change_requests_created"] for m in metrics),
        },
        "trends": trends,
        "detailed_metrics": [dict(m) for m in metrics],
    }


@router.get("/rag-impact", response_model=dict[str, Any])
async def get_rag_impact_metrics(
    limit: int = Query(default=200, ge=10, le=1000, description="Nombre max d'analyses à analyser"),
    _principal: AuthenticatedPrincipal | None = Depends(get_current_principal),
) -> dict[str, Any]:
    """
    Calcule l'impact du RAG sur la qualité des reviews d'IA.

    Compare les analyses avec RAG (knowledge base context retrieved) vs
    sans RAG pour mettre en évidence la valeur ajoutée du système RAG.
    """
    import json as _json
    from sqlalchemy import text as sa_text

    def _query_analyses() -> list[dict[str, Any]]:
        engine = get_engine()
        with engine.connect() as conn:
            # Récupérer les analyses avec leurs compteurs de findings calculés via sous-requête
            rows = conn.execute(
                sa_text(
                    """
                    SELECT
                        a.id,
                        a.status,
                        a.metadata_json,
                        COALESCE(f.findings_count, 0) AS findings_count,
                        COALESCE(f.blocker_count, 0) AS blocker_count,
                        COALESCE(f.warn_count, 0) AS warn_count,
                        COALESCE(f.info_count, 0) AS info_count
                    FROM analyses a
                    LEFT JOIN LATERAL (
                        SELECT
                            COUNT(*) AS findings_count,
                            COUNT(*) FILTER (WHERE severity = 'BLOCKER') AS blocker_count,
                            COUNT(*) FILTER (WHERE severity = 'WARN') AS warn_count,
                            COUNT(*) FILTER (WHERE severity = 'INFO') AS info_count
                        FROM findings
                        WHERE findings.analysis_id = a.id
                    ) f ON TRUE
                    WHERE a.status = 'COMPLETED'
                    ORDER BY a.created_at DESC
                    LIMIT :limit
                    """
                ),
                {"limit": limit},
            ).mappings().all()
            return [dict(row) for row in rows]

    rows = await asyncio.to_thread(_query_analyses)

    with_rag: list[dict[str, Any]] = []
    without_rag: list[dict[str, Any]] = []

    for row in rows:
        metadata = row.get("metadata_json") or {}
        if isinstance(metadata, str):
            try:
                metadata = _json.loads(metadata)
            except Exception:
                metadata = {}
        kb = (metadata.get("pipeline") or {}).get("kb_retrieval") or {}
        chunks_count = int(kb.get("context_chunks") or 0)
        llm_review = (metadata.get("pipeline") or {}).get("llm_grounded_review") or {}
        llm_findings = int(llm_review.get("findings_count") or 0)
        entry = {
            "findings_count": int(row.get("findings_count") or 0),
            "blocker_count": int(row.get("blocker_count") or 0),
            "warn_count": int(row.get("warn_count") or 0),
            "info_count": int(row.get("info_count") or 0),
            "llm_findings_count": llm_findings,
            "kb_chunks": chunks_count,
        }
        if chunks_count > 0:
            with_rag.append(entry)
        else:
            without_rag.append(entry)

    def _avg(items: list[dict], key: str) -> float:
        values = [item[key] for item in items if item[key] is not None]
        return round(sum(values) / len(values), 2) if values else 0.0

    return {
        "total_analyses": len(rows),
        "analyses_with_rag": len(with_rag),
        "analyses_without_rag": len(without_rag),
        "with_rag": {
            "avg_findings": _avg(with_rag, "findings_count"),
            "avg_blocker": _avg(with_rag, "blocker_count"),
            "avg_warn": _avg(with_rag, "warn_count"),
            "avg_llm_findings": _avg(with_rag, "llm_findings_count"),
            "avg_kb_chunks": _avg(with_rag, "kb_chunks"),
        },
        "without_rag": {
            "avg_findings": _avg(without_rag, "findings_count"),
            "avg_blocker": _avg(without_rag, "blocker_count"),
            "avg_warn": _avg(without_rag, "warn_count"),
            "avg_llm_findings": _avg(without_rag, "llm_findings_count"),
            "avg_kb_chunks": 0.0,
        },
        "impact": {
            "findings_delta": round(
                _avg(with_rag, "findings_count") - _avg(without_rag, "findings_count"), 2
            ),
            "llm_findings_delta": round(
                _avg(with_rag, "llm_findings_count") - _avg(without_rag, "llm_findings_count"), 2
            ),
        },
    }
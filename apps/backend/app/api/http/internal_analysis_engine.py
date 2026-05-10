from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter, Depends

from app.api.errors import ApiError
from app.api.middleware.auth import AuthenticatedPrincipal, require_permission

# NOTE: This endpoint is temporarily disabled because analysis_engine has been archived
# This was a prototype analyzer not used in the main production pipeline
# The main analysis uses Ruff/Semgrep/CleanCodeAnalyzer instead
#
# To re-enable this endpoint, the archived analysis_engine imports would need to be fixed
# or the analysis_engine could be restored from archive/

"""
_REPO_ROOT = Path(__file__).resolve().parents[5]
if str(_REPO_ROOT) not in sys.path:
    sys.path.append(str(_REPO_ROOT))

# NOTE: analysis_engine has been archived but imports maintained for backward compatibility
# This is a prototype analyzer, not used in main production pipeline
from archive.analysis_engine.dispatcher import detect_language, get_parser
from archive.analysis_engine.models import AnalysisRequest, AnalysisResult
from archive.analysis_engine.rules.bugs.null_return import NullReturnRule
from archive.analysis_engine.rules.complexity.cyclomatic import CyclomaticComplexityRule
from archive.analysis_engine.rules.security.hardcoded_secret import HardcodedSecretRule
from archive.analysis_engine.rules.smells.long_function import LongFunctionRule
from archive.analysis_engine.scorer import build_summary, compute_score
"""

router = APIRouter(prefix="/v1/internal/analysis-engine", tags=["internal-analysis-engine"])

# NOTE: All endpoints disabled because analysis_engine has been archived
# This was a prototype analyzer not used in the main production pipeline

"""
ALL_RULES = [
    NullReturnRule(),
    LongFunctionRule(),
    HardcodedSecretRule(),
    CyclomaticComplexityRule(),
]


@router.post("/analyze", response_model=AnalysisResult)
async def analyze_with_internal_engine(
    req: AnalysisRequest,
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.write")),
) -> AnalysisResult:
    language = detect_language(req.filename)
    if language == "unknown":
        raise ApiError(
            status_code=400,
            code="ANALYSIS_ENGINE_UNSUPPORTED_LANGUAGE",
            message="Unsupported language",
            details={"filename": req.filename},
        )

    parser = get_parser(language)
    try:
        tree = parser.parse(req.code)
    except Exception as exc:
        raise ApiError(
            status_code=422,
            code="ANALYSIS_ENGINE_PARSE_ERROR",
            message="Unable to parse source code",
            details={"error": str(exc), "language": language},
        ) from exc

    issues = []
    for rule in ALL_RULES:
        issues.extend(rule.check(tree, req.code, language))

    return AnalysisResult(
        filename=req.filename,
        language=language,
        issues=issues,
        score=compute_score(issues),
        summary=build_summary(issues),
    )
"""


@router.get("/health")
async def internal_analysis_engine_health(
    _principal: AuthenticatedPrincipal | None = Depends(require_permission("analyses.read")),
) -> dict[str, str]:
    return {"status": "archived", "message": "analysis_engine has been archived, endpoint disabled"}

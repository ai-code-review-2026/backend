from fastapi import FastAPI, HTTPException

from analysis_engine.dispatcher import detect_language, get_parser
from analysis_engine.models import AnalysisRequest, AnalysisResult
from analysis_engine.rules.bugs.null_return import NullReturnRule
from analysis_engine.rules.complexity.cyclomatic import CyclomaticComplexityRule
from analysis_engine.rules.security.hardcoded_secret import HardcodedSecretRule
from analysis_engine.rules.smells.long_function import LongFunctionRule
from analysis_engine.scorer import build_summary, compute_score

app = FastAPI(title="Code Analysis Engine")

ALL_RULES = [
    NullReturnRule(),
    LongFunctionRule(),
    HardcodedSecretRule(),
    CyclomaticComplexityRule(),
]


@app.post("/analyze", response_model=AnalysisResult)
def analyze(req: AnalysisRequest):
    language = detect_language(req.filename)
    if language == "unknown":
        raise HTTPException(400, "Langage non supporte")

    parser = get_parser(language)
    try:
        tree = parser.parse(req.code)
    except Exception as e:
        raise HTTPException(422, f"Erreur de parsing: {e}")

    issues = []
    for rule in ALL_RULES:
        issues.extend(rule.check(tree, req.code, language))

    score = compute_score(issues)
    summary = build_summary(issues)

    return AnalysisResult(
        filename=req.filename,
        language=language,
        issues=issues,
        score=score,
        summary=summary,
    )


@app.get("/health")
def health():
    return {"status": "ok"}

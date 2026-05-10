from collections import Counter
from typing import List

from analysis_engine.models import Issue, Severity

PENALTY = {
    Severity.CRITICAL: 15,
    Severity.HIGH: 8,
    Severity.MEDIUM: 4,
    Severity.LOW: 1,
    Severity.INFO: 0,
}


def compute_score(issues: List[Issue]) -> float:
    total_penalty = sum(PENALTY[i.severity] for i in issues)
    score = max(0.0, 100.0 - total_penalty)
    return round(score, 1)


def build_summary(issues: List[Issue]) -> dict:
    by_type = Counter(i.type for i in issues)
    by_sev = Counter(i.severity for i in issues)
    return {
        "total": len(issues),
        "by_type": dict(by_type),
        "by_severity": dict(by_sev),
    }

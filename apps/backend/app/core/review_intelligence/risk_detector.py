from __future__ import annotations

from app.core.review_engine.diff_engine import ParsedDiff
from app.core.review_intelligence.schemas import RiskFindingOutput
from app.data.models.finding import Finding


class RiskDetector:
    def generate(
        self,
        *,
        parsed_diff: ParsedDiff,
        findings: list[Finding],
    ) -> list[RiskFindingOutput]:
        risks = self._from_findings(findings=findings)
        if not risks:
            risks.extend(self._from_paths(parsed_diff=parsed_diff))
        return risks[:8]

    def _from_findings(self, *, findings: list[Finding]) -> list[RiskFindingOutput]:
        results: list[RiskFindingOutput] = []
        seen: set[tuple[str | None, str]] = set()
        for finding in findings:
            dedupe_key = (finding.file_path, finding.message.strip().lower())
            if dedupe_key in seen:
                continue
            seen.add(dedupe_key)
            results.append(
                RiskFindingOutput(
                    title=_build_title(finding=finding),
                    severity=_map_severity(finding=finding),
                    file_path=finding.file_path,
                    line_start=finding.line_start,
                    line_end=finding.line_end,
                    explanation=finding.message,
                    risk=_risk_text(finding=finding),
                    suggestion=finding.suggestion
                    or "Review this change against the surrounding call sites and add regression coverage before merge.",
                    confidence=float(finding.confidence or 0.65),
                )
            )
        return results

    def _from_paths(self, *, parsed_diff: ParsedDiff) -> list[RiskFindingOutput]:
        results: list[RiskFindingOutput] = []
        for file_item in parsed_diff.files[:6]:
            lowered = file_item.path_new.lower()
            if any(token in lowered for token in ("auth", "permission", "session", "token", "security")):
                results.append(
                    RiskFindingOutput(
                        title="Security-sensitive surface changed",
                        severity="high",
                        file_path=file_item.path_new,
                        line_start=None,
                        line_end=None,
                        explanation="The change touches authentication, authorization, or security-related code paths.",
                        risk="Behavior regressions here can expose unauthorized access, broken session handling, or policy bypasses.",
                        suggestion="Verify authentication flows, permission checks, and failure cases with focused tests.",
                        confidence=0.62,
                    )
                )
            elif any(token in lowered for token in ("api", "controller", "route", "endpoint", "schema")):
                results.append(
                    RiskFindingOutput(
                        title="API contract may have shifted",
                        severity="medium",
                        file_path=file_item.path_new,
                        line_start=None,
                        line_end=None,
                        explanation="The change touches API-facing modules or schemas.",
                        risk="Request validation, response payloads, or compatibility with existing clients may regress.",
                        suggestion="Run integration coverage around request validation, response shape, and backward compatibility.",
                        confidence=0.55,
                    )
                )
            elif any(token in lowered for token in ("migration", "sql", "repository", "model", "db")):
                results.append(
                    RiskFindingOutput(
                        title="Persistence behavior changed",
                        severity="medium",
                        file_path=file_item.path_new,
                        line_start=None,
                        line_end=None,
                        explanation="The change modifies persistence or database-adjacent code.",
                        risk="Schema assumptions, query behavior, or data compatibility may regress under real workloads.",
                        suggestion="Validate migrations, repository behavior, and error handling against realistic database states.",
                        confidence=0.57,
                    )
                )
        return results


def _build_title(*, finding: Finding) -> str:
    if finding.rule_id:
        return f"{finding.rule_id}: {finding.message[:120]}"
    return finding.message[:160]


def _map_severity(*, finding: Finding) -> str:
    if finding.severity == "BLOCKER":
        return "critical"
    if finding.severity == "WARN":
        if finding.category == "security":
            return "high"
        return "medium"
    return "low"


def _risk_text(*, finding: Finding) -> str:
    if finding.category == "security":
        return "This can expose a security weakness or policy violation if merged without a fix."
    if finding.category in {"perf", "maintainability"}:
        return "This can degrade runtime behavior or make future changes more error-prone."
    return "This can introduce a regression or reduce confidence in the modified behavior."

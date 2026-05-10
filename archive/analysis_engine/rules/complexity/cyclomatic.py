import ast

from analysis_engine.models import Issue, IssueType, Severity
from analysis_engine.rules.base_rule import BaseRule


class CyclomaticComplexityRule(BaseRule):
    rule_id = "COMP001"
    type = IssueType.COMPLEXITY
    severity = Severity.MEDIUM
    MAX_SCORE = 10

    def _calc(self, node):
        score = 1
        for child in ast.walk(node):
            if isinstance(
                child,
                (
                    ast.If,
                    ast.While,
                    ast.For,
                    ast.ExceptHandler,
                    ast.With,
                    ast.Assert,
                    ast.comprehension,
                ),
            ):
                score += 1
            if isinstance(child, ast.BoolOp):
                score += len(child.values) - 1
        return score

    def check(self, tree, code, language):
        issues = []
        if language != "python":
            return issues
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                score = self._calc(node)
                if score > self.MAX_SCORE:
                    issues.append(
                        Issue(
                            rule_id=self.rule_id,
                            type=self.type,
                            severity=self.severity,
                            message=f"Complexite cyclomatique de '{node.name}' = {score} (max {self.MAX_SCORE}).",
                            line=node.lineno,
                        )
                    )
        return issues

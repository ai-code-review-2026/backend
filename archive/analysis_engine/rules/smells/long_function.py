import ast

from analysis_engine.models import Issue, IssueType, Severity
from analysis_engine.rules.base_rule import BaseRule


class LongFunctionRule(BaseRule):
    rule_id = "SMELL001"
    type = IssueType.SMELL
    severity = Severity.MEDIUM
    MAX_LINES = 30

    def check(self, tree, code, language):
        issues = []
        if language != "python":
            return issues
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                end_lineno = node.end_lineno or node.lineno
                length = end_lineno - node.lineno
                if length > self.MAX_LINES:
                    issues.append(
                        Issue(
                            rule_id=self.rule_id,
                            type=self.type,
                            severity=self.severity,
                            message=f"Fonction '{node.name}' trop longue ({length} lignes > {self.MAX_LINES}).",
                            line=node.lineno,
                        )
                    )
        return issues

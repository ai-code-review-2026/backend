import ast

from analysis_engine.models import Issue, IssueType, Severity
from analysis_engine.rules.base_rule import BaseRule


class NullReturnRule(BaseRule):
    rule_id = "BUG001"
    type = IssueType.BUG
    severity = Severity.HIGH

    def check(self, tree, code, language):
        issues = []
        if language != "python":
            return issues
        for node in ast.walk(tree):
            if isinstance(node, ast.Return) and node.value is None:
                issues.append(
                    Issue(
                        rule_id=self.rule_id,
                        type=self.type,
                        severity=self.severity,
                        message="Fonction retourne None implicitement - risque de NullPointerError.",
                        line=node.lineno,
                    )
                )
        return issues

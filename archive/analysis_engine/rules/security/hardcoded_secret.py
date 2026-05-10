import re

from analysis_engine.models import Issue, IssueType, Severity
from analysis_engine.rules.base_rule import BaseRule

SECRET_PATTERNS = [
    (r"password\s*=\s*[\"'][^\"']{4,}[\"']", "Mot de passe hardcode"),
    (r"api_key\s*=\s*[\"'][^\"']{8,}[\"']", "Cle API hardcodee"),
    (r"secret\s*=\s*[\"'][^\"']{4,}[\"']", "Secret hardcode"),
    (r"token\s*=\s*[\"'][^\"']{8,}[\"']", "Token hardcode"),
]


class HardcodedSecretRule(BaseRule):
    rule_id = "SEC001"
    type = IssueType.SECURITY
    severity = Severity.CRITICAL

    def check(self, tree, code, language):
        issues = []
        for i, line in enumerate(code.splitlines(), 1):
            for pattern, msg in SECRET_PATTERNS:
                if re.search(pattern, line, re.IGNORECASE):
                    issues.append(
                        Issue(
                            rule_id=self.rule_id,
                            type=self.type,
                            severity=self.severity,
                            message=f"{msg} detecte.",
                            line=i,
                        )
                    )
        return issues

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Finding:
    id: str
    analysis_id: str
    source: str
    file_path: str | None
    line_start: int | None
    line_end: int | None
    severity: str
    category: str
    message: str
    suggestion: str | None
    confidence: float | None
    issue_type: str | None
    rule_id: str | None
    evidence_json: str
    fingerprint: str
    created_at: str
    jira_issue_key: str | None = None

    @property
    def evidence(self) -> dict[str, Any]:
        try:
            return json.loads(self.evidence_json)
        except Exception:
            return {}
    
    @property
    def line_number(self) -> int | None:
        """Alias for line_start for backward compatibility"""
        return self.line_start
        
    @property
    def rule_name(self) -> str | None:
        """Extract rule name from rule_id for display"""
        if not self.rule_id:
            return None
        # Convert something like "security.hardcoded-secrets" to "Hardcoded Secrets"
        return self.rule_id.split(".")[-1].replace("-", " ").replace("_", " ").title()
    
    @property
    def language(self) -> str | None:
        """Infer language from file extension"""
        if not self.file_path:
            return None
        
        ext = self.file_path.split(".")[-1].lower()
        lang_map = {
            "py": "python",
            "js": "javascript", 
            "ts": "typescript",
            "tsx": "typescript",
            "jsx": "javascript",
            "java": "java",
            "cpp": "cpp",
            "c": "c",
            "cs": "csharp",
            "php": "php",
            "rb": "ruby",
            "go": "go",
            "rs": "rust",
            "scala": "scala",
            "kt": "kotlin",
            "swift": "swift"
        }
        return lang_map.get(ext, ext)
    
    @property 
    def code_snippet(self) -> str | None:
        """Get code snippet from evidence if available"""
        evidence = self.evidence
        return evidence.get("code_snippet") or evidence.get("snippet")

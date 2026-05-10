"""
Repository for managing findings (code analysis issues).

Provides CRUD operations for findings from static analysis, security scans, etc.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from sqlalchemy import text
from sqlalchemy.engine import Engine

from app.data.database import get_engine
from app.data.models.finding import Finding


@dataclass
class CreateFindingInput:
    """Input for creating a finding."""
    analysis_id: str
    source: str
    file_path: str | None = None
    line_start: int | None = None
    line_end: int | None = None
    severity: Literal["INFO", "WARN", "BLOCKER"] = "WARN"
    category: str = "quality"
    message: str = ""
    suggestion: str | None = None
    confidence: float | None = None
    issue_type: str | None = None
    rule_id: str | None = None
    evidence: dict[str, Any] | None = None


@dataclass
class UpdateFindingInput:
    """Input for updating a finding."""
    severity: Literal["INFO", "WARN", "BLOCKER"] | None = None
    category: str | None = None
    message: str | None = None
    suggestion: str | None = None
    status: str | None = None  # For future status tracking


class FindingsRepo:
    """Repository for findings operations."""

    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def create_finding(self, input_data: CreateFindingInput) -> str:
        """Create a new finding and return its ID."""
        finding_id = str(uuid.uuid4())
        
        # Generate fingerprint
        fingerprint = self._generate_fingerprint(
            input_data.file_path,
            input_data.line_start,
            input_data.rule_id,
            input_data.message,
        )
        
        evidence_json = json.dumps(input_data.evidence or {})
        now = datetime.now(timezone.utc)
        
        query = text("""
            INSERT INTO findings (
                id, analysis_id, source, file_path, line_start, line_end,
                severity, category, message, suggestion, confidence,
                issue_type, rule_id, evidence_json, fingerprint, created_at
            ) VALUES (
                :id, :analysis_id, :source, :file_path, :line_start, :line_end,
                :severity, :category, :message, :suggestion, :confidence,
                :issue_type, :rule_id, :evidence_json, :fingerprint, :created_at
            )
            RETURNING id
        """)
        
        with self._engine.begin() as conn:
            result = conn.execute(query, {
                "id": finding_id,
                "analysis_id": input_data.analysis_id,
                "source": input_data.source,
                "file_path": input_data.file_path,
                "line_start": input_data.line_start,
                "line_end": input_data.line_end,
                "severity": input_data.severity,
                "category": input_data.category,
                "message": input_data.message,
                "suggestion": input_data.suggestion,
                "confidence": input_data.confidence,
                "issue_type": input_data.issue_type,
                "rule_id": input_data.rule_id,
                "evidence_json": evidence_json,
                "fingerprint": fingerprint,
                "created_at": now,
            })
            row = result.first()
            return row[0] if row else finding_id

    def get_finding_by_id(self, finding_id: str) -> Finding | None:
        """Get a finding by ID."""
        query = text("""
            SELECT * FROM findings WHERE id = :id
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, {"id": finding_id})
            row = result.mappings().first()
            
            if not row:
                return None
            
            return self._row_to_finding(row)

    def get_findings_by_analysis(
        self,
        analysis_id: str,
        severity: str | None = None,
        category: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Finding]:
        """Get findings for an analysis with optional filtering."""
        conditions = ["analysis_id = :analysis_id"]
        params: dict[str, Any] = {
            "analysis_id": analysis_id,
            "limit": limit,
            "offset": offset,
        }
        
        if severity:
            conditions.append("severity = :severity")
            params["severity"] = severity
        
        if category:
            conditions.append("category = :category")
            params["category"] = category
        
        where_clause = " AND ".join(conditions)
        
        query = text(f"""
            SELECT * FROM findings
            WHERE {where_clause}
            ORDER BY 
                CASE severity WHEN 'BLOCKER' THEN 1 WHEN 'WARN' THEN 2 ELSE 3 END,
                created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return [self._row_to_finding(row) for row in result.mappings()]

    def get_findings_by_file(
        self,
        analysis_id: str,
        file_path: str,
    ) -> list[Finding]:
        """Get findings for a specific file in an analysis."""
        query = text("""
            SELECT * FROM findings
            WHERE analysis_id = :analysis_id AND file_path = :file_path
            ORDER BY line_start, created_at
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, {
                "analysis_id": analysis_id,
                "file_path": file_path,
            })
            return [self._row_to_finding(row) for row in result.mappings()]

    def get_security_findings(
        self,
        analysis_id: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Finding]:
        """Get security-related findings."""
        conditions = ["category = 'security'"]
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        
        if analysis_id:
            conditions.append("analysis_id = :analysis_id")
            params["analysis_id"] = analysis_id
        
        where_clause = " AND ".join(conditions)
        
        query = text(f"""
            SELECT * FROM findings
            WHERE {where_clause}
            ORDER BY 
                CASE severity WHEN 'BLOCKER' THEN 1 WHEN 'WARN' THEN 2 ELSE 3 END,
                created_at DESC
            LIMIT :limit OFFSET :offset
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            return [self._row_to_finding(row) for row in result.mappings()]

    def count_findings(
        self,
        analysis_id: str,
        severity: str | None = None,
        category: str | None = None,
    ) -> int:
        """Count findings with optional filtering."""
        conditions = ["analysis_id = :analysis_id"]
        params: dict[str, Any] = {"analysis_id": analysis_id}
        
        if severity:
            conditions.append("severity = :severity")
            params["severity"] = severity
        
        if category:
            conditions.append("category = :category")
            params["category"] = category
        
        where_clause = " AND ".join(conditions)
        
        query = text(f"""
            SELECT COUNT(*) as count FROM findings
            WHERE {where_clause}
        """)
        
        with self._engine.connect() as conn:
            result = conn.execute(query, params)
            row = result.mappings().first()
            return row["count"] if row else 0

    def get_severity_counts(self, analysis_id: str) -> dict[str, int]:
        """Get count of findings by severity for an analysis."""
        query = text("""
            SELECT severity, COUNT(*) as count
            FROM findings
            WHERE analysis_id = :analysis_id
            GROUP BY severity
        """)
        
        counts = {"BLOCKER": 0, "WARN": 0, "INFO": 0}
        
        with self._engine.connect() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            for row in result.mappings():
                severity = row.get("severity")
                if severity in counts:
                    counts[severity] = row.get("count") or 0
        
        return counts

    def update_finding_jira_issue(self, finding_id: str, jira_issue_key: str) -> bool:
        """Update a finding's linked Jira issue key."""
        query = text("""
            UPDATE findings 
            SET jira_issue_key = :jira_issue_key 
            WHERE id = :id
        """)
        
        with self._engine.begin() as conn:
            result = conn.execute(query, {
                "id": finding_id,
                "jira_issue_key": jira_issue_key
            })
            return result.rowcount > 0

    def delete_findings_by_analysis(self, analysis_id: str) -> int:
        """Delete all findings for an analysis. Returns count deleted."""
        query = text("""
            DELETE FROM findings WHERE analysis_id = :analysis_id
        """)
        
        with self._engine.begin() as conn:
            result = conn.execute(query, {"analysis_id": analysis_id})
            return result.rowcount

    def _generate_fingerprint(
        self,
        file_path: str | None,
        line_start: int | None,
        rule_id: str | None,
        message: str,
    ) -> str:
        """Generate a fingerprint for deduplication."""
        import hashlib
        
        components = [
            file_path or "",
            str(line_start or 0),
            rule_id or "",
            message[:100],  # First 100 chars of message
        ]
        
        content = "|".join(components)
        return hashlib.sha256(content.encode()).hexdigest()[:32]

    def _row_to_finding(self, row) -> Finding:
        """Convert a database row to a Finding model."""
        return Finding(
            id=str(row["id"]),
            analysis_id=str(row["analysis_id"]),
            source=str(row.get("source") or ""),
            file_path=row.get("file_path"),
            line_start=row.get("line_start"),
            line_end=row.get("line_end"),
            severity=str(row.get("severity") or "WARN"),
            category=str(row.get("category") or "quality"),
            message=str(row.get("message") or ""),
            suggestion=row.get("suggestion"),
            confidence=float(row["confidence"]) if row.get("confidence") is not None else None,
            issue_type=row.get("issue_type"),
            rule_id=row.get("rule_id"),
            evidence_json=row.get("evidence_json") or "{}",
            fingerprint=str(row.get("fingerprint") or ""),
            created_at=row["created_at"].isoformat() if isinstance(row.get("created_at"), datetime) else str(row.get("created_at", "")),
            jira_issue_key=row.get("jira_issue_key"),
        )

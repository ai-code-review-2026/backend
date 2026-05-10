from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine, RowMapping
from sqlalchemy.exc import IntegrityError

from app.core.review_engine.diff_engine import ParsedDiff
from app.data.database import get_engine
from app.data.models.analysis import Analysis
from app.data.models.finding import Finding
from app.data.models.parsed_diff import AnalysisFileData, AnalysisHunkData, AnalysisHunkLineData
from app.data.models.tool_run import ToolRun


class DuplicateAnalysisError(Exception):
    def __init__(self, existing_id: str | None) -> None:
        self.existing_id = existing_id
        super().__init__("Duplicate analysis")


@dataclass
class CreateAnalysisInput:
    analysis_id: str
    repo: str
    provider: str
    pr_number: int | None
    commit_sha: str | None
    source: str
    status: str
    stage: str | None
    progress: int | None
    nb_files_changed: int | None
    additions_total: int | None
    deletions_total: int | None
    created_at: str
    updated_at: str
    diff_hash: str
    diff_raw: str
    summary: str | None = None
    diff_redacted: str | None = None
    has_secrets: bool = False
    redaction_stats: dict[str, Any] = field(default_factory=dict)
    static_stats: dict[str, Any] = field(default_factory=dict)
    change_type: str | None = None
    change_type_confidence: float | None = None
    change_type_source: str | None = None
    change_type_signals: dict[str, Any] = field(default_factory=dict)
    error_code: str | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    project_id: str | None = None


@dataclass
class CreateFindingInput:
    finding_id: str
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
    fingerprint: str
    issue_type: str | None = None
    rule_id: str | None = None
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass
class CreateToolRunInput:
    tool_run_id: str
    analysis_id: str
    tool_name: str
    status: str
    started_at: str
    finished_at: str | None
    duration_ms: int
    exit_code: int | None
    findings_count: int
    scanned_files: int
    version: str | None
    warning: str | None
    command: str | None
    workspace_path: str | None
    stdout_snippet: str | None
    stderr_snippet: str | None


class AnalysesRepo:
    def __init__(self) -> None:
        self._engine: Engine = get_engine()

    def find_duplicate(self, repo: str, diff_hash: str) -> str | None:
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text("SELECT id FROM analyses WHERE repo = :repo AND diff_hash = :diff_hash LIMIT 1"),
                    {"repo": repo, "diff_hash": diff_hash},
                )
                .mappings()
                .first()
            )
        return None if row is None else str(row["id"])

    def create(self, payload: CreateAnalysisInput) -> Analysis:
        try:
            with self._engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO analyses (
                            id, project_id, repo, provider, pr_number, commit_sha, source, status,
                            stage, progress, nb_files_changed, additions_total, deletions_total,
                            created_at, updated_at, diff_hash, diff_raw, summary, diff_text, diff_redacted,
                            has_secrets, redaction_stats, static_stats, change_type, change_type_confidence,
                            change_type_source, change_type_signals, error_code, error_message, metadata_json
                        )
                        VALUES (
                            :id, :project_id, :repo, :provider, :pr_number, :commit_sha, :source, :status,
                            :stage, :progress, :nb_files_changed, :additions_total, :deletions_total,
                            :created_at, :updated_at, :diff_hash, :diff_raw, :summary, :diff_text, :diff_redacted,
                            :has_secrets, CAST(:redaction_stats AS jsonb), CAST(:static_stats AS jsonb),
                            :change_type, :change_type_confidence, :change_type_source, CAST(:change_type_signals AS jsonb),
                            :error_code, :error_message, CAST(:metadata_json AS jsonb)
                        )
                        """
                    ),
                    {
                        "id": payload.analysis_id,
                        "project_id": payload.project_id,
                        "repo": payload.repo,
                        "provider": payload.provider,
                        "pr_number": payload.pr_number,
                        "commit_sha": payload.commit_sha,
                        "source": payload.source,
                        "status": payload.status,
                        "stage": payload.stage,
                        "progress": payload.progress,
                        "nb_files_changed": payload.nb_files_changed,
                        "additions_total": payload.additions_total,
                        "deletions_total": payload.deletions_total,
                        "created_at": payload.created_at,
                        "updated_at": payload.updated_at,
                        "diff_hash": payload.diff_hash,
                        "diff_raw": payload.diff_raw,
                        "summary": payload.summary,
                        "diff_text": payload.diff_raw,  # legacy compatibility column
                        "diff_redacted": payload.diff_redacted,
                        "has_secrets": payload.has_secrets,
                        "redaction_stats": json.dumps(payload.redaction_stats),
                        "static_stats": json.dumps(payload.static_stats),
                        "change_type": payload.change_type,
                        "change_type_confidence": payload.change_type_confidence,
                        "change_type_source": payload.change_type_source,
                        "change_type_signals": json.dumps(payload.change_type_signals),
                        "error_code": payload.error_code,
                        "error_message": payload.error_message,
                        "metadata_json": json.dumps(payload.metadata),
                    },
                )
                row = (
                    conn.execute(
                        text("SELECT * FROM analyses WHERE id = :id"),
                        {"id": payload.analysis_id},
                    )
                    .mappings()
                    .first()
                )
        except IntegrityError as exc:
            sqlstate = getattr(getattr(exc, "orig", None), "sqlstate", None)
            if sqlstate == "23505":
                existing_id = self.find_duplicate(payload.repo, payload.diff_hash)
                raise DuplicateAnalysisError(existing_id=existing_id) from exc
            raise

        return self._row_to_model(row)

    def get_by_id(self, analysis_id: str) -> Analysis | None:
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text("SELECT * FROM analyses WHERE id = :analysis_id LIMIT 1"),
                    {"analysis_id": analysis_id},
                )
                .mappings()
                .first()
            )
        if row is None:
            return None
        return self._row_to_model(row)

    def list_stale(
        self,
        *,
        statuses: tuple[str, ...],
        stale_for_seconds: int,
        limit: int,
    ) -> list[Analysis]:
        normalized_statuses = tuple(status.strip().upper() for status in statuses if isinstance(status, str) and status.strip())
        if not normalized_statuses or stale_for_seconds <= 0 or limit <= 0:
            return []

        status_placeholders = [f":status_{index}" for index in range(len(normalized_statuses))]
        status_clause = ", ".join(status_placeholders)
        params: dict[str, Any] = {
            "stale_for_seconds": int(stale_for_seconds),
            "limit": int(limit),
        }
        for index, status in enumerate(normalized_statuses):
            params[f"status_{index}"] = status

        with self._engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        f"""
                        SELECT *
                        FROM analyses
                        WHERE status IN ({status_clause})
                          AND updated_at <= NOW() - make_interval(secs => :stale_for_seconds)
                        ORDER BY updated_at ASC
                        LIMIT :limit
                        """
                    ),
                    params,
                )
                .mappings()
                .all()
            )

        return [self._row_to_model(row) for row in rows]

    def delete(self, analysis_id: str) -> bool:
        with self._engine.begin() as conn:
            deleted_row = conn.execute(
                text(
                    """
                    DELETE FROM analyses
                    WHERE id = :analysis_id
                    RETURNING id
                    """
                ),
                {"analysis_id": analysis_id},
            ).mappings().first()
        return deleted_row is not None

    def update_status(
        self,
        *,
        analysis_id: str,
        status: str,
        error_code: str | None = None,
        error_message: str | None = None,
        stage: str | None = None,
        progress: int | None = None,
        nb_files_changed: int | None = None,
        additions_total: int | None = None,
        deletions_total: int | None = None,
        metadata_updates: dict[str, Any] | None = None,
    ) -> Analysis | None:
        has_metadata = metadata_updates is not None
        metadata_json = json.dumps(metadata_updates) if metadata_updates is not None else "{}"
        with self._engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        UPDATE analyses
                        SET status = :status,
                            error_code = :error_code,
                            error_message = :error_message,
                            stage = COALESCE(:stage, stage),
                            progress = COALESCE(:progress, progress),
                            nb_files_changed = COALESCE(:nb_files_changed, nb_files_changed),
                            additions_total = COALESCE(:additions_total, additions_total),
                            deletions_total = COALESCE(:deletions_total, deletions_total),
                            metadata_json = CASE
                                WHEN :has_metadata = FALSE THEN metadata_json
                                ELSE COALESCE(metadata_json, '{}'::jsonb) || CAST(:metadata_json AS jsonb)
                            END,
                            updated_at = NOW()
                        WHERE id = :analysis_id
                        RETURNING *
                        """
                    ),
                    {
                        "analysis_id": analysis_id,
                        "status": status,
                        "error_code": error_code,
                        "error_message": error_message,
                        "stage": stage,
                        "progress": progress,
                        "nb_files_changed": nb_files_changed,
                        "additions_total": additions_total,
                        "deletions_total": deletions_total,
                        "has_metadata": has_metadata,
                        "metadata_json": metadata_json,
                    },
                )
                .mappings()
                .first()
            )
        if row is None:
            return None
        return self._row_to_model(row)

    def update_security_scan_result(
        self,
        *,
        analysis_id: str,
        diff_redacted: str,
        has_secrets: bool,
        redaction_stats: dict[str, Any],
        purge_raw_diff: bool,
    ) -> Analysis | None:
        with self._engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        UPDATE analyses
                        SET diff_redacted = :diff_redacted,
                            has_secrets = :has_secrets,
                            redaction_stats = CAST(:redaction_stats AS jsonb),
                            diff_raw = CASE WHEN :purge_raw_diff = TRUE THEN :diff_redacted ELSE diff_raw END,
                            diff_text = CASE WHEN :purge_raw_diff = TRUE THEN :diff_redacted ELSE diff_text END,
                            updated_at = NOW()
                        WHERE id = :analysis_id
                        RETURNING *
                        """
                    ),
                    {
                        "analysis_id": analysis_id,
                        "diff_redacted": diff_redacted,
                        "has_secrets": has_secrets,
                        "redaction_stats": json.dumps(redaction_stats),
                        "purge_raw_diff": purge_raw_diff,
                    },
                )
                .mappings()
                .first()
            )

        if row is None:
            return None
        return self._row_to_model(row)

    def update_static_analysis_result(
        self,
        *,
        analysis_id: str,
        static_stats: dict[str, Any],
    ) -> Analysis | None:
        with self._engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        UPDATE analyses
                        SET static_stats = CAST(:static_stats AS jsonb),
                            updated_at = NOW()
                        WHERE id = :analysis_id
                        RETURNING *
                        """
                    ),
                    {
                        "analysis_id": analysis_id,
                        "static_stats": json.dumps(static_stats),
                    },
                )
                .mappings()
                .first()
            )

        if row is None:
            return None
        return self._row_to_model(row)

    def update_summary_result(
        self,
        *,
        analysis_id: str,
        summary: str,
    ) -> Analysis | None:
        with self._engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        UPDATE analyses
                        SET summary = :summary,
                            updated_at = NOW()
                        WHERE id = :analysis_id
                        RETURNING *
                        """
                    ),
                    {
                        "analysis_id": analysis_id,
                        "summary": summary,
                    },
                )
                .mappings()
                .first()
            )

        if row is None:
            return None
        return self._row_to_model(row)

    def update_change_classification(
        self,
        *,
        analysis_id: str,
        change_type: str,
        confidence: float,
        source: str,
        signals: dict[str, Any],
    ) -> Analysis | None:
        with self._engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        UPDATE analyses
                        SET change_type = :change_type,
                            change_type_confidence = :change_type_confidence,
                            change_type_source = :change_type_source,
                            change_type_signals = CAST(:change_type_signals AS jsonb),
                            updated_at = NOW()
                        WHERE id = :analysis_id
                        RETURNING *
                        """
                    ),
                    {
                        "analysis_id": analysis_id,
                        "change_type": change_type,
                        "change_type_confidence": confidence,
                        "change_type_source": source,
                        "change_type_signals": json.dumps(signals),
                    },
                )
                .mappings()
                .first()
            )

        if row is None:
            return None
        return self._row_to_model(row)

    def update_metadata(
        self,
        *,
        analysis_id: str,
        metadata: dict[str, Any],
    ) -> Analysis | None:
        """Update analysis metadata field."""
        with self._engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        UPDATE analyses
                        SET metadata = CAST(:metadata AS jsonb),
                            updated_at = NOW()
                        WHERE id = :analysis_id
                        RETURNING *
                        """
                    ),
                    {
                        "analysis_id": analysis_id,
                        "metadata": json.dumps(metadata),
                    },
                )
                .mappings()
                .first()
            )

        if row is None:
            return None
        return self._row_to_model(row)

    def list_paginated(self, page: int, size: int) -> tuple[list[Analysis], int]:
        offset = (page - 1) * size

        with self._engine.connect() as conn:
            total_row = conn.execute(text("SELECT COUNT(*) AS total FROM analyses")).mappings().first()
            total = int(total_row["total"] if total_row else 0)
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT
                            a.*,
                            COUNT(f.id)::int AS findings_count,
                            COUNT(*) FILTER (WHERE f.severity = 'BLOCKER')::int AS blocker_count,
                            COUNT(*) FILTER (WHERE f.severity = 'WARN')::int AS warn_count,
                            COUNT(*) FILTER (WHERE f.severity = 'INFO')::int AS info_count
                        FROM analyses AS a
                        LEFT JOIN findings AS f
                            ON f.analysis_id = a.id
                        GROUP BY a.id
                        ORDER BY a.created_at DESC, a.id DESC
                        LIMIT :limit OFFSET :offset
                        """
                    ),
                    {"limit": size, "offset": offset},
                )
                .mappings()
                .all()
            )

        return [self._row_to_model(row) for row in rows], total

    def create_finding(self, payload: CreateFindingInput) -> Finding:
        with self._engine.begin() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        INSERT INTO findings (
                            id, analysis_id, source, file_path, line_start, line_end, severity, category,
                            message, suggestion, confidence, issue_type, rule_id, evidence_json, fingerprint
                        )
                        VALUES (
                            :id, :analysis_id, :source, :file_path, :line_start, :line_end, :severity, :category,
                            :message, :suggestion, :confidence, :issue_type, :rule_id, CAST(:evidence_json AS jsonb), :fingerprint
                        )
                        RETURNING *
                        """
                    ),
                    {
                        "id": payload.finding_id,
                        "analysis_id": payload.analysis_id,
                        "source": payload.source,
                        "file_path": payload.file_path,
                        "line_start": payload.line_start,
                        "line_end": payload.line_end,
                        "severity": payload.severity,
                        "category": payload.category,
                        "message": payload.message,
                        "suggestion": payload.suggestion,
                        "confidence": payload.confidence,
                        "issue_type": payload.issue_type,
                        "rule_id": payload.rule_id,
                        "evidence_json": json.dumps(payload.evidence),
                        "fingerprint": payload.fingerprint,
                    },
                )
                .mappings()
                .first()
            )
        return self._row_to_finding(row)

    def replace_tool_runs(self, analysis_id: str, tool_runs: list[CreateToolRunInput]) -> None:
        with self._engine.begin() as conn:
            conn.execute(text("DELETE FROM tool_runs WHERE analysis_id = :analysis_id"), {"analysis_id": analysis_id})
            for item in tool_runs:
                conn.execute(
                    text(
                        """
                        INSERT INTO tool_runs (
                            id, analysis_id, tool_name, status, started_at, finished_at,
                            duration_ms, exit_code, findings_count, scanned_files, version,
                            warning, command, workspace_path, stdout_snippet, stderr_snippet
                        )
                        VALUES (
                            :id, :analysis_id, :tool_name, :status, :started_at, :finished_at,
                            :duration_ms, :exit_code, :findings_count, :scanned_files, :version,
                            :warning, :command, :workspace_path, :stdout_snippet, :stderr_snippet
                        )
                        """
                    ),
                    {
                        "id": item.tool_run_id,
                        "analysis_id": item.analysis_id,
                        "tool_name": item.tool_name,
                        "status": item.status,
                        "started_at": item.started_at,
                        "finished_at": item.finished_at,
                        "duration_ms": item.duration_ms,
                        "exit_code": item.exit_code,
                        "findings_count": item.findings_count,
                        "scanned_files": item.scanned_files,
                        "version": item.version,
                        "warning": item.warning,
                        "command": item.command,
                        "workspace_path": item.workspace_path,
                        "stdout_snippet": item.stdout_snippet,
                        "stderr_snippet": item.stderr_snippet,
                    },
                )

    def replace_files_changed(self, analysis_id: str, files: list[dict[str, str | None]]) -> None:
        with self._engine.begin() as conn:
            conn.execute(
                text("DELETE FROM files_changed WHERE analysis_id = :analysis_id"),
                {"analysis_id": analysis_id},
            )

            for file_item in files:
                conn.execute(
                    text(
                        """
                        INSERT INTO files_changed (id, analysis_id, file_path, change_type, old_path)
                        VALUES (:id, :analysis_id, :file_path, :change_type, :old_path)
                        """
                    ),
                    {
                        "id": uuid.uuid4().hex,
                        "analysis_id": analysis_id,
                        "file_path": file_item["file_path"],
                        "change_type": file_item["change_type"],
                        "old_path": file_item.get("old_path"),
                    },
                )

    def replace_parsed_diff(self, analysis_id: str, parsed: ParsedDiff) -> tuple[int, int, int]:
        files_count = 0
        additions_total = 0
        deletions_total = 0

        with self._engine.begin() as conn:
            conn.execute(
                text(
                    """
                    DELETE FROM analysis_hunk_lines
                    WHERE hunk_id IN (
                        SELECT h.id
                        FROM analysis_hunks h
                        JOIN analysis_files f ON f.id = h.analysis_file_id
                        WHERE f.analysis_id = :analysis_id
                    )
                    """
                ),
                {"analysis_id": analysis_id},
            )
            conn.execute(
                text(
                    """
                    DELETE FROM analysis_hunks
                    WHERE analysis_file_id IN (
                        SELECT id
                        FROM analysis_files
                        WHERE analysis_id = :analysis_id
                    )
                    """
                ),
                {"analysis_id": analysis_id},
            )
            conn.execute(text("DELETE FROM analysis_files WHERE analysis_id = :analysis_id"), {"analysis_id": analysis_id})

            for file_item in parsed.files:
                analysis_file_id = uuid.uuid4().hex
                conn.execute(
                    text(
                        """
                        INSERT INTO analysis_files (
                            id, analysis_id, path_old, path_new, change_type, is_binary, additions_count, deletions_count
                        )
                        VALUES (
                            :id, :analysis_id, :path_old, :path_new, :change_type, :is_binary, :additions_count, :deletions_count
                        )
                        """
                    ),
                    {
                        "id": analysis_file_id,
                        "analysis_id": analysis_id,
                        "path_old": file_item.path_old,
                        "path_new": file_item.path_new,
                        "change_type": file_item.change_type,
                        "is_binary": file_item.is_binary,
                        "additions_count": file_item.additions_count,
                        "deletions_count": file_item.deletions_count,
                    },
                )
                files_count += 1
                additions_total += file_item.additions_count
                deletions_total += file_item.deletions_count

                for hunk_item in file_item.hunks:
                    hunk_id = uuid.uuid4().hex
                    conn.execute(
                        text(
                            """
                            INSERT INTO analysis_hunks (
                                id, analysis_file_id, old_start, old_lines, new_start, new_lines, header, raw_text
                            )
                            VALUES (
                                :id, :analysis_file_id, :old_start, :old_lines, :new_start, :new_lines, :header, :raw_text
                            )
                            """
                        ),
                        {
                            "id": hunk_id,
                            "analysis_file_id": analysis_file_id,
                            "old_start": hunk_item.old_start,
                            "old_lines": hunk_item.old_lines,
                            "new_start": hunk_item.new_start,
                            "new_lines": hunk_item.new_lines,
                            "header": hunk_item.header,
                            "raw_text": hunk_item.raw_text,
                        },
                    )

                    for line_item in hunk_item.lines:
                        conn.execute(
                            text(
                                """
                                INSERT INTO analysis_hunk_lines (
                                    id, hunk_id, line_type, content, old_line_no, new_line_no
                                )
                                VALUES (
                                    :id, :hunk_id, :line_type, :content, :old_line_no, :new_line_no
                                )
                                """
                            ),
                            {
                                "id": uuid.uuid4().hex,
                                "hunk_id": hunk_id,
                                "line_type": line_item.line_type,
                                "content": line_item.content,
                                "old_line_no": line_item.old_line_no,
                                "new_line_no": line_item.new_line_no,
                            },
                        )

        return files_count, additions_total, deletions_total

    def list_analysis_files_with_hunks(self, analysis_id: str) -> list[AnalysisFileData]:
        with self._engine.connect() as conn:
            files_rows = (
                conn.execute(
                    text(
                        """
                        SELECT *
                        FROM analysis_files
                        WHERE analysis_id = :analysis_id
                        ORDER BY path_new ASC, id ASC
                        """
                    ),
                    {"analysis_id": analysis_id},
                )
                .mappings()
                .all()
            )

            hunks_rows = (
                conn.execute(
                    text(
                        """
                        SELECT *
                        FROM analysis_hunks
                        WHERE analysis_file_id IN (
                            SELECT id FROM analysis_files WHERE analysis_id = :analysis_id
                        )
                        ORDER BY new_start ASC, id ASC
                        """
                    ),
                    {"analysis_id": analysis_id},
                )
                .mappings()
                .all()
            )

            lines_rows = (
                conn.execute(
                    text(
                        """
                        SELECT *
                        FROM analysis_hunk_lines
                        WHERE hunk_id IN (
                            SELECT h.id
                            FROM analysis_hunks h
                            JOIN analysis_files f ON f.id = h.analysis_file_id
                            WHERE f.analysis_id = :analysis_id
                        )
                        ORDER BY id ASC
                        """
                    ),
                    {"analysis_id": analysis_id},
                )
                .mappings()
                .all()
            )

        lines_by_hunk: dict[str, list[AnalysisHunkLineData]] = {}
        for row in lines_rows:
            hunk_id = str(row["hunk_id"])
            lines_by_hunk.setdefault(hunk_id, []).append(
                AnalysisHunkLineData(
                    id=str(row["id"]),
                    hunk_id=hunk_id,
                    line_type=str(row["line_type"]),
                    content=str(row["content"]),
                    old_line_no=row.get("old_line_no"),
                    new_line_no=row.get("new_line_no"),
                )
            )

        hunks_by_file: dict[str, list[AnalysisHunkData]] = {}
        for row in hunks_rows:
            hunk_id = str(row["id"])
            file_id = str(row["analysis_file_id"])
            hunks_by_file.setdefault(file_id, []).append(
                AnalysisHunkData(
                    id=hunk_id,
                    analysis_file_id=file_id,
                    old_start=int(row["old_start"]),
                    old_lines=int(row["old_lines"]),
                    new_start=int(row["new_start"]),
                    new_lines=int(row["new_lines"]),
                    header=row.get("header"),
                    raw_text=row.get("raw_text"),
                    lines=lines_by_hunk.get(hunk_id, []),
                )
            )

        result: list[AnalysisFileData] = []
        for row in files_rows:
            file_id = str(row["id"])
            result.append(
                AnalysisFileData(
                    id=file_id,
                    analysis_id=str(row["analysis_id"]),
                    path_old=row.get("path_old"),
                    path_new=str(row["path_new"]),
                    change_type=str(row["change_type"]),
                    is_binary=bool(row["is_binary"]),
                    additions_count=int(row.get("additions_count") or 0),
                    deletions_count=int(row.get("deletions_count") or 0),
                    hunks=hunks_by_file.get(file_id, []),
                )
            )

        return result

    def get_finding_by_id(self, finding_id: str) -> Finding | None:
        """Get a single finding by its ID."""
        with self._engine.connect() as conn:
            row = (
                conn.execute(
                    text(
                        """
                        SELECT *
                        FROM findings
                        WHERE id = :finding_id
                        """
                    ),
                    {"finding_id": finding_id},
                )
                .mappings()
                .first()
            )

        if row is None:
            return None
        return self._row_to_finding(row)

    def list_findings_by_analysis(self, analysis_id: str) -> list[Finding]:
        with self._engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT *
                        FROM findings
                        WHERE analysis_id = :analysis_id
                        ORDER BY created_at ASC, id ASC
                        """
                    ),
                    {"analysis_id": analysis_id},
                )
                .mappings()
                .all()
            )

        return [self._row_to_finding(row) for row in rows]

    def list_tool_runs_by_analysis(self, analysis_id: str) -> list[ToolRun]:
        with self._engine.connect() as conn:
            rows = (
                conn.execute(
                    text(
                        """
                        SELECT *
                        FROM tool_runs
                        WHERE analysis_id = :analysis_id
                        ORDER BY created_at ASC, id ASC
                        """
                    ),
                    {"analysis_id": analysis_id},
                )
                .mappings()
                .all()
            )
        return [self._row_to_tool_run(row) for row in rows]

    @staticmethod
    def _row_to_model(row: RowMapping | dict[str, Any] | None) -> Analysis:
        if row is None:
            raise ValueError("Row cannot be None")

        metadata_json = row.get("metadata_json")
        if isinstance(metadata_json, str):
            metadata_serialized = metadata_json
        else:
            metadata_serialized = json.dumps(metadata_json or {})

        redaction_stats = row.get("redaction_stats")
        if isinstance(redaction_stats, str):
            redaction_stats_serialized = redaction_stats
        else:
            redaction_stats_serialized = json.dumps(redaction_stats or {})
        static_stats = row.get("static_stats")
        if isinstance(static_stats, str):
            static_stats_serialized = static_stats
        else:
            static_stats_serialized = json.dumps(static_stats or {})
        change_type_signals = row.get("change_type_signals")
        if isinstance(change_type_signals, str):
            change_type_signals_serialized = change_type_signals
        else:
            change_type_signals_serialized = json.dumps(change_type_signals or {})

        created_at_str = AnalysesRepo._to_utc_iso_str(row.get("created_at"))
        updated_at_str = AnalysesRepo._to_utc_iso_str(row.get("updated_at"))
        diff_raw = row.get("diff_raw")
        if diff_raw is None:
            diff_raw = row.get("diff_text", "")
        progress_value = row.get("progress")
        if progress_value is not None:
            progress_value = int(progress_value)
        nb_files_changed = row.get("nb_files_changed")
        if nb_files_changed is not None:
            nb_files_changed = int(nb_files_changed)
        additions_total = row.get("additions_total")
        if additions_total is not None:
            additions_total = int(additions_total)
        deletions_total = row.get("deletions_total")
        if deletions_total is not None:
            deletions_total = int(deletions_total)
        change_type_confidence = row.get("change_type_confidence")
        if change_type_confidence is not None:
            change_type_confidence = float(change_type_confidence)
        findings_count = int(row.get("findings_count") or 0)
        blocker_count = int(row.get("blocker_count") or 0)
        warn_count = int(row.get("warn_count") or 0)
        info_count = int(row.get("info_count") or 0)

        return Analysis(
            id=str(row["id"]),
            repo=str(row["repo"]),
            provider=str(row.get("provider", "github")),
            pr_number=row["pr_number"],
            commit_sha=row["commit_sha"],
            source=str(row["source"]),
            status=str(row["status"]),
            stage=row.get("stage"),
            progress=progress_value,
            nb_files_changed=nb_files_changed,
            additions_total=additions_total,
            deletions_total=deletions_total,
            diff_hash=str(row["diff_hash"]),
            diff_raw=str(diff_raw),
            summary=row.get("summary"),
            diff_redacted=row.get("diff_redacted"),
            has_secrets=bool(row.get("has_secrets", False)),
            redaction_stats_json=redaction_stats_serialized,
            static_stats_json=static_stats_serialized,
            change_type=row.get("change_type"),
            change_type_confidence=change_type_confidence,
            change_type_source=row.get("change_type_source"),
            change_type_signals_json=change_type_signals_serialized,
            error_code=row.get("error_code"),
            error_message=row.get("error_message"),
            created_at=created_at_str,
            updated_at=updated_at_str,
            metadata_json=metadata_serialized,
            findings_count=findings_count,
            blocker_count=blocker_count,
            warn_count=warn_count,
            info_count=info_count,
            project_id=(str(row["project_id"]) if row.get("project_id") else None),
        )

    @staticmethod
    def _row_to_finding(row: RowMapping | dict[str, Any] | None) -> Finding:
        if row is None:
            raise ValueError("Row cannot be None")

        confidence = row.get("confidence")
        if confidence is not None:
            confidence = float(confidence)

        evidence_json = row.get("evidence_json")
        if isinstance(evidence_json, str):
            evidence_serialized = evidence_json
        else:
            evidence_serialized = json.dumps(evidence_json or {})

        return Finding(
            id=str(row["id"]),
            analysis_id=str(row["analysis_id"]),
            source=str(row["source"]),
            file_path=row.get("file_path"),
            line_start=row.get("line_start"),
            line_end=row.get("line_end"),
            severity=str(row["severity"]),
            category=str(row["category"]),
            message=str(row["message"]),
            suggestion=row.get("suggestion"),
            confidence=confidence,
            issue_type=row.get("issue_type"),
            rule_id=row.get("rule_id"),
            evidence_json=evidence_serialized,
            fingerprint=str(row["fingerprint"]),
            created_at=AnalysesRepo._to_utc_iso_str(row.get("created_at")),
        )

    @staticmethod
    def _row_to_tool_run(row: RowMapping | dict[str, Any] | None) -> ToolRun:
        if row is None:
            raise ValueError("Row cannot be None")

        duration_ms = row.get("duration_ms")
        findings_count = row.get("findings_count")
        scanned_files = row.get("scanned_files")
        exit_code = row.get("exit_code")

        return ToolRun(
            id=str(row["id"]),
            analysis_id=str(row["analysis_id"]),
            tool_name=str(row["tool_name"]),
            status=str(row["status"]),
            started_at=AnalysesRepo._to_utc_iso_str(row.get("started_at")),
            finished_at=(
                AnalysesRepo._to_utc_iso_str(row.get("finished_at"))
                if row.get("finished_at") is not None
                else None
            ),
            duration_ms=int(duration_ms or 0),
            exit_code=(int(exit_code) if exit_code is not None else None),
            findings_count=int(findings_count or 0),
            scanned_files=int(scanned_files or 0),
            version=row.get("version"),
            warning=row.get("warning"),
            command=row.get("command"),
            workspace_path=row.get("workspace_path"),
            stdout_snippet=row.get("stdout_snippet"),
            stderr_snippet=row.get("stderr_snippet"),
            created_at=AnalysesRepo._to_utc_iso_str(row.get("created_at")),
        )

    @staticmethod
    def _to_utc_iso_str(raw_value: Any) -> str:
        if isinstance(raw_value, datetime):
            value = raw_value
            if value.tzinfo is None:
                value = value.replace(tzinfo=timezone.utc)
            return value.isoformat().replace("+00:00", "Z")
        return str(raw_value)

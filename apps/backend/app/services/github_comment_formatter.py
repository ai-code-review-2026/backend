"""GitHub comment formatter for code review analysis results.

Formats analysis findings, summary, and review outputs into structured 
GitHub-flavored markdown comments ready for publication.
"""
from __future__ import annotations

from typing import Any

from app.data.models.analysis import Analysis
from app.data.models.finding import Finding
from app.data.models.review_output import AnalysisReviewOutput


class GitHubCommentFormatter:
    """Formats code review analysis results into GitHub comments."""

    @staticmethod
    def format_review_comment(
        analysis: Analysis,
        findings: list[Finding],
        review_output: AnalysisReviewOutput | None = None,
    ) -> str:
        """
        Generate a comprehensive GitHub comment from analysis results.

        Args:
            analysis: The analysis record containing metadata and summary
            findings: List of findings (security, static analysis, LLM)
            review_output: Optional review intelligence output with risks and merge readiness

        Returns:
            Formatted GitHub markdown comment string
        """
        sections: list[str] = []

        # Header
        sections.append(GitHubCommentFormatter._format_header(analysis))

        # Summary
        if analysis.summary:
            sections.append(GitHubCommentFormatter._format_summary(analysis))

        # Review Intelligence (if available)
        if review_output:
            sections.append(
                GitHubCommentFormatter._format_review_intelligence(review_output)
            )

        # Findings grouped by severity
        if findings:
            sections.append(GitHubCommentFormatter._format_findings(findings))

        # Metrics and metadata
        sections.append(GitHubCommentFormatter._format_metrics(analysis, findings))

        # Footer
        sections.append(GitHubCommentFormatter._format_footer(analysis))

        return "\n\n".join(sections)

    @staticmethod
    def _format_header(analysis: Analysis) -> str:
        """Generate comment header with status badge."""
        status_badge = "✅ **Review Complete**"
        if analysis.status == "FAILED":
            status_badge = "❌ **Review Failed**"
        elif analysis.blocker_count > 0:
            status_badge = "🚨 **Critical Issues Found**"
        elif analysis.warn_count > 0:
            status_badge = "⚠️ **Issues Found**"

        change_type_badge = ""
        if analysis.change_type:
            emoji_map = {
                "bugfix": "🐛",
                "feature": "✨",
                "refactor": "♻️",
                "docs": "📝",
                "style": "💄",
                "test": "✅",
                "chore": "🔧",
            }
            emoji = emoji_map.get(analysis.change_type.lower(), "🔄")
            change_type_badge = f" {emoji} `{analysis.change_type}`"

        return f"## {status_badge}{change_type_badge}\n\n> Automated code review by AI Code Review Platform"

    @staticmethod
    def _format_summary(analysis: Analysis) -> str:
        """Format analysis summary section."""
        summary = analysis.summary or "No summary available"
        return f"### 📋 Summary\n\n{summary}"

    @staticmethod
    def _format_review_intelligence(review_output: AnalysisReviewOutput) -> str:
        """Format review intelligence section with merge readiness and risks."""
        payload = review_output.payload
        sections = []

        # Merge readiness
        merge_readiness = payload.get("merge_readiness", {})
        status = merge_readiness.get("status", "unknown")
        recommendation = merge_readiness.get("recommendation", "")

        status_icon = {
            "ready": "✅",
            "ready_with_minor_issues": "⚠️",
            "not_ready": "❌",
            "needs_discussion": "💬",
        }.get(status, "❓")

        sections.append(
            f"### {status_icon} Merge Readiness: **{status.replace('_', ' ').title()}**"
        )
        if recommendation:
            sections.append(f"\n{recommendation}")

        # Risk findings
        risk_findings = payload.get("risk_findings", [])
        if risk_findings:
            sections.append("\n### 🔍 Risk Analysis")
            for risk in risk_findings[:5]:  # Limit to top 5 risks
                severity = risk.get("severity", "info").upper()
                severity_icon = {
                    "CRITICAL": "🔴",
                    "HIGH": "🟠",
                    "MEDIUM": "🟡",
                    "LOW": "🔵",
                    "INFO": "ℹ️",
                }.get(severity, "❓")

                title = risk.get("title", "Risk detected")
                file_path = risk.get("file_path")
                line = risk.get("line_start")
                explanation = risk.get("explanation", "")
                suggestion = risk.get("suggestion", "")

                location = f"`{file_path}:{line}`" if file_path and line else ""
                
                sections.append(f"\n**{severity_icon} {severity}** {location}")
                sections.append(f"\n**Issue:** {title}")
                if explanation:
                    sections.append(f"\n{explanation}")
                if suggestion:
                    sections.append(f"\n💡 **Suggestion:** {suggestion}")

        return "\n".join(sections)

    @staticmethod
    def _format_findings(findings: list[Finding]) -> str:
        """Format findings grouped by severity."""
        # Group findings by severity
        by_severity: dict[str, list[Finding]] = {
            "CRITICAL": [],
            "HIGH": [],
            "MEDIUM": [],
            "LOW": [],
            "INFO": [],
        }

        for finding in findings:
            severity = (finding.severity or "INFO").upper()
            if severity in by_severity:
                by_severity[severity].append(finding)

        sections = []
        severity_icons = {
            "CRITICAL": "🔴",
            "HIGH": "🟠",
            "MEDIUM": "🟡",
            "LOW": "🔵",
            "INFO": "ℹ️",
        }

        for severity in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]:
            severity_findings = by_severity[severity]
            if not severity_findings:
                continue

            icon = severity_icons[severity]
            sections.append(f"### {icon} {severity} Issues ({len(severity_findings)})")

            # Show up to 10 findings per severity
            for finding in severity_findings[:10]:
                sections.append(
                    GitHubCommentFormatter._format_single_finding(finding)
                )

            if len(severity_findings) > 10:
                sections.append(
                    f"\n<details>\n<summary>➕ {len(severity_findings) - 10} more {severity} issues</summary>\n\n"
                )
                for finding in severity_findings[10:]:
                    sections.append(
                        GitHubCommentFormatter._format_single_finding(finding)
                    )
                sections.append("</details>")

        return "\n\n".join(sections)

    @staticmethod
    def _format_single_finding(finding: Finding) -> str:
        """Format a single finding."""
        location = ""
        if finding.file_path:
            location = f"`{finding.file_path}`"
            if finding.line_start:
                location += f":{finding.line_start}"
                if finding.line_end and finding.line_end != finding.line_start:
                    location += f"-{finding.line_end}"

        source_badge = f"`{finding.source}`" if finding.source else ""
        rule_badge = f"`{finding.rule_id}`" if finding.rule_id else ""

        parts = []
        if location:
            parts.append(f"**{location}**")
        if source_badge or rule_badge:
            badges = " ".join(filter(None, [source_badge, rule_badge]))
            parts.append(f"[{badges}]")

        header = " ".join(parts) if parts else "**Issue detected**"

        message = finding.message or "No details available"
        suggestion = finding.suggestion

        result = [f"- {header}", f"  {message}"]

        if suggestion:
            result.append(f"  💡 **Fix:** {suggestion}")

        return "\n".join(result)

    @staticmethod
    def _format_metrics(analysis: Analysis, findings: list[Finding]) -> str:
        """Format metrics and statistics section."""
        metrics = [
            f"**Files Changed:** {analysis.nb_files_changed or 0}",
            f"**Additions:** +{analysis.additions_total or 0}",
            f"**Deletions:** -{analysis.deletions_total or 0}",
            f"**Total Issues:** {len(findings)}",
        ]

        if analysis.blocker_count > 0:
            metrics.append(f"**Critical:** {analysis.blocker_count}")
        if analysis.warn_count > 0:
            metrics.append(f"**Warnings:** {analysis.warn_count}")
        if analysis.info_count > 0:
            metrics.append(f"**Info:** {analysis.info_count}")

        # Security scan results
        if analysis.has_secrets:
            redaction_stats = analysis.redaction_stats
            masked_count = redaction_stats.get("masked_count", 0)
            metrics.append(f"🔐 **Secrets Detected:** {masked_count}")

        # Change classification
        if analysis.change_type:
            confidence = analysis.change_type_confidence
            conf_str = f" ({int(confidence * 100)}%)" if confidence else ""
            metrics.append(f"**Change Type:** {analysis.change_type}{conf_str}")

        return f"### 📊 Metrics\n\n{' • '.join(metrics)}"

    @staticmethod
    def _format_footer(analysis: Analysis) -> str:
        """Format comment footer with links and metadata."""
        analysis_url = f"View detailed report: Analysis `{analysis.id[:8]}...`"
        
        metadata = analysis.metadata
        pipeline = metadata.get("pipeline", {})
        duration_ms = pipeline.get("duration_ms", 0)
        duration_sec = duration_ms / 1000 if duration_ms else 0

        return (
            f"---\n\n"
            f"<sub>{analysis_url}</sub>\n"
            f"<sub>⏱️ Analysis completed in {duration_sec:.1f}s</sub>"
        )

    @staticmethod
    def format_quick_summary_comment(
        analysis: Analysis,
        findings_count: int,
        blocker_count: int,
        warn_count: int,
    ) -> str:
        """
        Generate a quick summary comment for immediate feedback.
        
        This is useful for posting early feedback before full analysis completes.
        """
        status = "✅ No critical issues" if blocker_count == 0 else f"🚨 {blocker_count} critical issues"
        
        lines = [
            f"## 🤖 Code Review in Progress...",
            f"",
            f"**Status:** {status}",
            f"**Issues Found:** {findings_count} ({blocker_count} critical, {warn_count} warnings)",
            f"",
            f"_Full analysis report will be posted shortly..._",
        ]
        
        return "\n".join(lines)

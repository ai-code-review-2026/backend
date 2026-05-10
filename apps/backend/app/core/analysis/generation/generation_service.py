"""
Generation Service - LLM-based Code Analysis with KB Priority

CRITICAL: Knowledge Base has PRIORITY over repository context.

Context priority (HIGH → LOW):
1. KB Rules (admin-defined, strict)
2. KB Documents (design patterns, guidelines)
3. Graph context (code relationships)
4. Repository context (code snippets)

Output:
- Findings grounded in KB rules
- Comments with evidence
- Auto-fix suggestions
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any

from app.core.analysis.generation.llm_orchestrator import LLMOrchestrator, LLMRequest

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class Finding:
    """Analysis finding."""
    
    severity: str  # INFO, WARN, BLOCKER
    category: str
    message: str
    explanation: str
    suggestion: str | None
    confidence: float
    file_path: str | None
    line_start: int | None
    line_end: int | None
    kb_grounded: bool
    graph_context: dict[str, Any]
    evidence: dict[str, Any]
    fix_suggestion: str | None = None
    fix_confidence: float = 0.0


@dataclass(frozen=True)
class GenerationResult:
    """Complete generation result."""
    
    findings: list[Finding]
    trace: dict[str, Any]


class GenerationService:
    """
    LLM-based code analysis with KB priority.
    
    Prompt structure:
    1. System: Role (expert code reviewer)
    2. KB Rules: Strict rules from admin
    3. KB Docs: Design patterns, guidelines
    4. Graph Context: Code relationships
    5. Repo Context: Code snippets (supporting)
    6. Task: Analyze diff, generate findings
    
    CRITICAL CONSTRAINT:
    - KB rules are MANDATORY
    - LLM must check code against KB rules FIRST
    - Repository context is SUPPORTING, not primary
    - No hallucination beyond KB + repo context
    
    Output format:
    - Structured findings (JSON)
    - Each finding references KB rule if applicable
    - Evidence includes graph relations
    - Auto-fix suggestions when possible
    """
    
    def __init__(self, llm_orchestrator: LLMOrchestrator | None = None) -> None:
        self._llm = llm_orchestrator or LLMOrchestrator()
    
    async def generate(
        self,
        *,
        analysis_id: str,
        repository_id: str,
        project_id: str,
        diff_text: str,
        changed_files: list[str],
        repo_context: str,
        kb_context: str,
        graph_context: dict[str, Any],
        static_findings: list[dict[str, Any]],
    ) -> GenerationResult:
        """
        Generate analysis with KB priority.
        
        Args:
            analysis_id: Analysis ID
            repository_id: Repository ID
            project_id: Project ID
            diff_text: Code diff
            changed_files: Changed file paths
            repo_context: Repository code context
            kb_context: Knowledge base context (PRIORITY)
            graph_context: Graph relationships
            static_findings: Findings from static analysis
            
        Returns:
            Generated findings and trace
        """
        started = time.perf_counter()
        
        # Build prompt with KB priority
        system_prompt = self._build_system_prompt()
        user_prompt = self._build_user_prompt(
            diff_text=diff_text,
            kb_context=kb_context,  # FIRST
            graph_context=graph_context,
            repo_context=repo_context,  # LAST
            static_findings=static_findings,
        )
        
        # Generate with LLM
        logger.info(f"[{analysis_id}] Generating with LLM")
        llm_response = await self._llm.generate(
            LLMRequest(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=0.2,
                max_tokens=4000,
            )
        )
        
        # Parse findings from LLM response
        findings = self._parse_findings(llm_response.content)
        
        # Generate auto-fix suggestions
        findings_with_fixes = await self._generate_auto_fixes(
            analysis_id=analysis_id,
            findings=findings,
            repo_context=repo_context,
            kb_context=kb_context,
        )
        
        duration_ms = int((time.perf_counter() - started) * 1000)
        
        trace = {
            "llm_provider": llm_response.provider,
            "llm_model": llm_response.model,
            "tokens_used": llm_response.tokens_used,
            "duration_ms": duration_ms,
            "findings_count": len(findings_with_fixes),
        }
        
        return GenerationResult(
            findings=findings_with_fixes,
            trace=trace,
        )
    
    def _build_system_prompt(self) -> str:
        """Build system prompt."""
        return """You are an expert code reviewer with deep knowledge of software engineering best practices.

Your task is to analyze code changes and provide actionable feedback.

CRITICAL RULES:
1. Knowledge Base rules are MANDATORY and STRICT
2. Always check code against KB rules FIRST
3. Use repository context only as supporting evidence
4. Do not hallucinate beyond provided context
5. Ground all findings in KB rules or graph relationships
6. Provide specific, actionable suggestions
7. When possible, suggest automatic fixes

Output format: Structured JSON with findings."""
    
    def _build_user_prompt(
        self,
        *,
        diff_text: str,
        kb_context: str,
        graph_context: dict[str, Any],
        repo_context: str,
        static_findings: list[dict[str, Any]],
    ) -> str:
        """Build user prompt with KB PRIORITY."""
        return f"""# Code Review Task

## KNOWLEDGE BASE RULES (STRICT - HIGHEST PRIORITY)

{kb_context if kb_context else "No KB rules provided."}

## Graph Context (Code Relationships)

Dependencies: {graph_context.get('dependencies', [])}
Callers: {graph_context.get('callers', [])}
Imports: {graph_context.get('imports', [])}

## Repository Context (Supporting Evidence)

{repo_context[:2000] if repo_context else "No repo context available."}

## Static Analysis Findings

{self._format_static_findings(static_findings)}

## Code Diff to Review

```diff
{diff_text[:4000]}
```

## Task

Analyze the code diff against:
1. KB rules (MANDATORY checks)
2. Graph relationships (impact analysis)
3. Repository patterns (consistency)

Generate findings in JSON format:
[
  {{
    "severity": "BLOCKER|WARN|INFO",
    "category": "security|performance|style|bug|kb_violation",
    "message": "Short description",
    "explanation": "Detailed explanation with KB rule reference",
    "file_path": "path/to/file.py",
    "line_start": 10,
    "line_end": 15,
    "kb_rule_id": "RULE-001",
    "evidence": {{"graph_relation": "...", "kb_reference": "..."}},
    "suggestion": "How to fix",
    "auto_fix": "Proposed code fix (optional)"
  }}
]

IMPORTANT: 
- Prioritize KB rule violations
- Reference specific KB rules in findings
- Use graph context for impact analysis
- Provide auto-fix when obvious
"""
    
    def _format_static_findings(self, findings: list[dict[str, Any]]) -> str:
        """Format static findings for prompt."""
        if not findings:
            return "No static analysis findings."
        
        formatted = []
        for f in findings[:10]:  # Top 10
            formatted.append(
                f"- {f.get('severity')}: {f.get('message')} ({f.get('file_path')}:{f.get('line_start')})"
            )
        return "\n".join(formatted)
    
    def _parse_findings(self, llm_output: str) -> list[Finding]:
        """Parse findings from LLM JSON output."""
        import json
        import re
        
        # Extract JSON from LLM output
        json_match = re.search(r'\[.*\]', llm_output, re.DOTALL)
        if not json_match:
            logger.warning("No JSON found in LLM output")
            return []
        
        try:
            findings_data = json.loads(json_match.group(0))
        except json.JSONDecodeError as exc:
            logger.error(f"Failed to parse JSON: {exc}")
            return []
        
        findings = []
        for item in findings_data:
            findings.append(
                Finding(
                    severity=item.get("severity", "INFO"),
                    category=item.get("category", "code_quality"),
                    message=item.get("message", ""),
                    explanation=item.get("explanation", ""),
                    suggestion=item.get("suggestion"),
                    confidence=item.get("confidence", 0.7),
                    file_path=item.get("file_path"),
                    line_start=item.get("line_start"),
                    line_end=item.get("line_end"),
                    kb_grounded=bool(item.get("kb_rule_id")),
                    graph_context=item.get("evidence", {}),
                    evidence=item.get("evidence", {}),
                    fix_suggestion=item.get("auto_fix"),
                    fix_confidence=0.8 if item.get("auto_fix") else 0.0,
                )
            )
        
        return findings
    
    async def _generate_auto_fixes(
        self,
        *,
        analysis_id: str,
        findings: list[Finding],
        repo_context: str,
        kb_context: str,
    ) -> list[Finding]:
        """Generate auto-fix suggestions for findings without one."""
        # For findings without fix_suggestion, generate one
        # Use LLM with focused prompt
        return findings  # Placeholder

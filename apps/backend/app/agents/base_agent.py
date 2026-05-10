"""
Base agent class for code review agents.

Provides common functionality for all specialized agents:
- LLM orchestration via gateway
- Prompt template system
- Finding data structure
- Context management
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from app.gateway.api_gateway import get_gateway
from app.gateway.request_context import LLMRequestContext, SensitivityLevel, CostTarget

logger = logging.getLogger(__name__)


@dataclass
class Finding:
    """
    Code review finding from an agent.
    
    Attributes:
        file_path: Path to the file with the issue
        line: Line number where the issue occurs
        severity: CRITICAL, HIGH, MEDIUM, LOW
        category: security, performance, maintainability, architecture, devops, testing
        message: Description of the issue
        suggestion: Suggested fix or improvement
        agent_id: ID of the agent that generated this finding
        confidence: Confidence score (0.0-1.0)
        evidence: Additional context or evidence
        rule_id: Optional rule ID for the issue
    """
    file_path: str
    line: int
    severity: str  # CRITICAL, HIGH, MEDIUM, LOW
    category: str
    message: str
    suggestion: str | None
    agent_id: str
    confidence: float = 0.8
    evidence: dict[str, Any] = field(default_factory=dict)
    rule_id: str | None = None
    
    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "file_path": self.file_path,
            "line_start": self.line,
            "line_end": self.line,
            "severity": self.severity,
            "category": self.category,
            "message": self.message,
            "suggestion": self.suggestion,
            "agent_id": self.agent_id,
            "confidence": self.confidence,
            "evidence": self.evidence,
            "rule_id": self.rule_id,
        }


@dataclass
class ReviewContext:
    """
    Context for code review analysis.
    
    Attributes:
        diff_content: Unified diff content
        changed_files: List of changed file paths
        project_type: Type of project (e.g., python, typescript, go)
        repository_path: Path to the repository
        metadata: Additional metadata
    """
    diff_content: str
    changed_files: list[str]
    project_type: str | None = None
    repository_path: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseAgent:
    """
    Base class for all code review agents.
    
    Each specialized agent should:
    1. Inherit from this class
    2. Set agent_id, category, and default_severity
    3. Override get_prompt_template() to provide domain-specific prompts
    4. Override parse_llm_response() if custom parsing is needed
    5. Optionally override should_analyze() for smarter routing
    """
    
    agent_id: str = "base_agent"
    category: str = "general"
    default_severity: str = "MEDIUM"
    
    def __init__(self):
        self.gateway = get_gateway()
        self.logger = logging.getLogger(f"{__name__}.{self.agent_id}")
    
    async def analyze(
        self,
        diff_content: str,
        context: ReviewContext,
    ) -> list[Finding]:
        """
        Analyze code changes and return findings.
        
        Args:
            diff_content: Unified diff content
            context: Review context with metadata
        
        Returns:
            List of findings from this agent
        """
        self.logger.info(f"Starting analysis with {self.agent_id}")
        
        # Check if this agent should analyze these changes
        if not self.should_analyze(diff_content, context):
            self.logger.info(f"{self.agent_id} skipping analysis (not applicable)")
            return []
        
        try:
            # Build prompt
            prompt = self.build_prompt(diff_content, context)
            
            # Call LLM via gateway
            llm_context = LLMRequestContext(
                user_prompt=prompt,
                sensitivity=SensitivityLevel.INTERNAL,
                cost_target=CostTarget.BALANCED,
                tags={
                    "agent_id": self.agent_id,
                    "category": self.category,
                },
            )
            
            response = await self.gateway.generate(llm_context)
            
            if response.error:
                self.logger.error(f"{self.agent_id} LLM call failed: {response.error}")
                return []
            
            # Parse response
            findings = self.parse_llm_response(response.response_content or "", context)
            
            self.logger.info(f"{self.agent_id} found {len(findings)} issues")
            return findings
        
        except Exception as e:
            self.logger.error(f"{self.agent_id} analysis failed: {e}", exc_info=True)
            return []
    
    def should_analyze(self, diff_content: str, context: ReviewContext) -> bool:
        """
        Determine if this agent should analyze the given changes.
        
        Override this method for smarter routing logic.
        Default: analyze everything.
        
        Args:
            diff_content: Unified diff content
            context: Review context
        
        Returns:
            True if this agent should analyze the changes
        """
        return True
    
    def build_prompt(self, diff_content: str, context: ReviewContext) -> str:
        """
        Build prompt for LLM analysis.
        
        Args:
            diff_content: Unified diff content
            context: Review context
        
        Returns:
            Formatted prompt string
        """
        template = self.get_prompt_template()
        
        return template.format(
            diff_content=diff_content,
            changed_files=", ".join(context.changed_files),
            project_type=context.project_type or "unknown",
            agent_id=self.agent_id,
            category=self.category,
        )
    
    def get_prompt_template(self) -> str:
        """
        Get prompt template for this agent.
        
        Override this method to provide domain-specific prompts.
        
        Returns:
            Prompt template string with placeholders
        """
        return """You are a {agent_id} analyzing code changes for {category} issues.

Analyze the following diff and identify any {category} concerns:

Changed files: {changed_files}
Project type: {project_type}

Diff:
{diff_content}

Provide your findings in the following JSON format:
[
  {{
    "file_path": "path/to/file.py",
    "line": 42,
    "severity": "HIGH",
    "message": "Description of the issue",
    "suggestion": "How to fix it",
    "rule_id": "optional-rule-id"
  }}
]

If no issues are found, return an empty array: []
"""
    
    def parse_llm_response(
        self,
        response: str,
        context: ReviewContext,
    ) -> list[Finding]:
        """
        Parse LLM response into Finding objects.
        
        Default implementation expects JSON array format.
        Override for custom parsing logic.
        
        Args:
            response: Raw LLM response
            context: Review context
        
        Returns:
            List of Finding objects
        """
        import json
        import re
        
        findings = []
        
        try:
            # Extract JSON from response (handle markdown code blocks)
            json_match = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', response, re.DOTALL)
            if json_match:
                json_str = json_match.group(1)
            else:
                # Try to find JSON array directly
                json_match = re.search(r'\[.*?\]', response, re.DOTALL)
                if json_match:
                    json_str = json_match.group(0)
                else:
                    self.logger.warning(f"{self.agent_id} no JSON found in response")
                    return []
            
            parsed = json.loads(json_str)
            
            if not isinstance(parsed, list):
                self.logger.warning(f"{self.agent_id} expected JSON array, got {type(parsed)}")
                return []
            
            for item in parsed:
                try:
                    finding = Finding(
                        file_path=item.get("file_path", "unknown"),
                        line=item.get("line", 0),
                        severity=item.get("severity", self.default_severity),
                        category=self.category,
                        message=item.get("message", ""),
                        suggestion=item.get("suggestion"),
                        agent_id=self.agent_id,
                        confidence=item.get("confidence", 0.8),
                        rule_id=item.get("rule_id"),
                        evidence=item.get("evidence", {}),
                    )
                    findings.append(finding)
                except Exception as e:
                    self.logger.warning(f"Failed to parse finding: {e}")
        
        except json.JSONDecodeError as e:
            self.logger.error(f"{self.agent_id} failed to parse JSON response: {e}")
        except Exception as e:
            self.logger.error(f"{self.agent_id} unexpected error parsing response: {e}")
        
        return findings

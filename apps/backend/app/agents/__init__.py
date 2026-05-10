"""
Multi-agent code review system.

This module provides specialized agents for different aspects of code review:
- security_agent: Security vulnerability detection
- performance_agent: Performance optimization
- cleancode_agent: Code quality and maintainability
- architecture_agent: Architecture and design patterns
- devops_agent: DevOps and infrastructure
- testing_agent: Test coverage and quality

Usage:
    from app.agents.agent_dispatcher import dispatch_review
    
    findings = await dispatch_review(diff_content, context)
"""

from app.agents.base_agent import BaseAgent, Finding
from app.agents.agent_dispatcher import dispatch_review

__all__ = [
    "BaseAgent",
    "Finding",
    "dispatch_review",
]

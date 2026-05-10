"""
Security agent - specialized in detecting security vulnerabilities.

Focus areas:
- SQL injection
- XSS (Cross-site scripting)
- Secrets exposure
- Authentication/authorization issues
- CSRF vulnerabilities
- Insecure dependencies
- Cryptography misuse
- Input validation

Severity bias: HIGH/CRITICAL
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent, ReviewContext


class SecurityAgent(BaseAgent):
    """
    Security vulnerability detection agent.
    
    Focuses on identifying critical security issues that could
    lead to data breaches, unauthorized access, or system compromise.
    """
    
    agent_id = "security_agent"
    category = "security"
    default_severity = "HIGH"
    
    def should_analyze(self, diff_content: str, context: ReviewContext) -> bool:
        """
        Always analyze for security issues.
        
        Security is critical for all code changes.
        """
        return True
    
    def get_prompt_template(self) -> str:
        """Security-focused prompt template."""
        return """You are an expert security auditor analyzing code changes for vulnerabilities.

Your task is to identify security issues in the following code diff:

Changed files: {changed_files}
Project type: {project_type}

Diff:
{diff_content}

CRITICAL SECURITY CHECKLIST:
1. SQL Injection - Look for string concatenation in SQL queries, unsanitized user input in database calls
2. XSS (Cross-Site Scripting) - Check for unescaped user input in HTML/JavaScript contexts
3. Secrets Exposure - Identify hardcoded passwords, API keys, tokens, credentials
4. Authentication Issues - Weak authentication, missing session validation, insecure password handling
5. Authorization Issues - Missing access controls, privilege escalation risks
6. CSRF Vulnerabilities - Missing CSRF tokens, state-changing GET requests
7. Insecure Dependencies - Usage of vulnerable packages or outdated libraries
8. Cryptography Misuse - Weak algorithms, hardcoded keys, improper random generation
9. Input Validation - Missing validation, improper sanitization, type confusion
10. Path Traversal - File operations with user-controlled paths
11. Command Injection - Shell execution with unsanitized input
12. XXE (XML External Entity) - Unsafe XML parsing
13. Deserialization - Unsafe deserialization of untrusted data
14. SSRF (Server-Side Request Forgery) - Unvalidated external requests
15. Race Conditions - Concurrent access to shared resources

SEVERITY GUIDELINES:
- CRITICAL: Direct exploit path (SQL injection, RCE, auth bypass, secrets in code)
- HIGH: Significant security risk (XSS, CSRF, weak crypto, missing authorization)
- MEDIUM: Security concern requiring attention (input validation, insecure defaults)
- LOW: Best practice violation (minor hardening opportunity)

Provide your findings in the following JSON format:
[
  {{
    "file_path": "path/to/file.py",
    "line": 42,
    "severity": "CRITICAL",
    "message": "SQL injection vulnerability: User input is concatenated into SQL query without sanitization",
    "suggestion": "Use parameterized queries: cursor.execute('SELECT * FROM users WHERE id = %s', (user_id,))",
    "rule_id": "sql-injection",
    "confidence": 0.95
  }}
]

Be thorough but precise. Only report real vulnerabilities, not theoretical concerns.
If no security issues are found, return an empty array: []
"""


# Singleton instance
_security_agent_instance: SecurityAgent | None = None


def get_security_agent() -> SecurityAgent:
    """Get singleton security agent instance."""
    global _security_agent_instance
    if _security_agent_instance is None:
        _security_agent_instance = SecurityAgent()
    return _security_agent_instance

"""
Clean code agent - specialized in code quality and maintainability.

Focus areas:
- Naming conventions
- Code complexity
- Code duplication
- SOLID principles
- Readability
- Code smells

Severity bias: LOW/MEDIUM
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent, ReviewContext


class CleanCodeAgent(BaseAgent):
    """
    Code quality and maintainability agent.
    
    Focuses on code readability, maintainability, and adherence
    to clean code principles.
    """
    
    agent_id = "cleancode_agent"
    category = "maintainability"
    default_severity = "MEDIUM"
    
    def should_analyze(self, diff_content: str, context: ReviewContext) -> bool:
        """
        Always analyze for code quality.
        
        Code quality applies to all code changes.
        """
        return True
    
    def get_prompt_template(self) -> str:
        """Clean code focused prompt template."""
        return """You are an expert software engineer analyzing code changes for quality and maintainability.

Your task is to identify code quality issues, code smells, and maintainability concerns in the following code diff:

Changed files: {changed_files}
Project type: {project_type}

Diff:
{diff_content}

CLEAN CODE CHECKLIST:

1. Naming Conventions
   - Are variables, functions, classes named clearly and consistently?
   - Avoid abbreviations, single letters (except loop indices)
   - Names should reveal intent: getUserById vs getData

2. Function Complexity
   - Functions > 50 lines are hard to understand
   - Cyclomatic complexity > 10 needs refactoring
   - Too many parameters (> 4) suggest poor design
   - Deep nesting (> 3 levels) reduces readability

3. Code Duplication (DRY)
   - Repeated code blocks that could be extracted
   - Similar logic that could be generalized
   - Copy-pasted functions that should be reused

4. SOLID Principles
   - Single Responsibility: Does class/function do one thing?
   - Open/Closed: Is code open for extension, closed for modification?
   - Liskov Substitution: Are inheritance relationships correct?
   - Interface Segregation: Are interfaces focused?
   - Dependency Inversion: Are dependencies abstracted?

5. Code Smells
   - Long functions (> 50 lines)
   - Large classes (> 300 lines)
   - Long parameter lists (> 4 params)
   - Magic numbers (use named constants)
   - Dead code (unused variables, functions)
   - Commented-out code
   - God classes (doing too much)
   - Feature envy (method using another class's data extensively)
   - Shotgun surgery (one change requires many small edits)

6. Readability
   - Consistent formatting and indentation
   - Meaningful comments (why, not what)
   - Clear control flow
   - Appropriate use of abstractions

7. Error Handling
   - Generic exception catching (catch Exception)
   - Silent failures (empty except blocks)
   - Missing error messages
   - No cleanup in error paths

8. Best Practices
   - Missing type hints (Python)
   - Mutable default arguments
   - Using global variables
   - Mixing concerns (business logic + I/O)

SEVERITY GUIDELINES:
- MEDIUM: Significant maintainability impact (high complexity, major code smell, SOLID violation)
- LOW: Minor quality issue (naming, small duplication, minor smell)

Provide your findings in the following JSON format:
[
  {{
    "file_path": "path/to/file.py",
    "line": 42,
    "severity": "MEDIUM",
    "message": "Function has cyclomatic complexity of 15 (threshold: 10). Consider breaking into smaller functions.",
    "suggestion": "Extract conditional logic into separate helper functions: validate_user(), check_permissions(), process_data()",
    "rule_id": "high-complexity",
    "confidence": 0.85,
    "evidence": {{
      "complexity": 15,
      "threshold": 10
    }}
  }}
]

Be constructive and specific in your suggestions.
If no code quality issues are found, return an empty array: []
"""


# Singleton instance
_cleancode_agent_instance: CleanCodeAgent | None = None


def get_cleancode_agent() -> CleanCodeAgent:
    """Get singleton clean code agent instance."""
    global _cleancode_agent_instance
    if _cleancode_agent_instance is None:
        _cleancode_agent_instance = CleanCodeAgent()
    return _cleancode_agent_instance

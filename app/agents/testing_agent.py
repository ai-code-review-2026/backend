"""
Testing agent - specialized in test coverage and quality.

Focus areas:
- Test coverage
- Test quality
- Mocking and stubbing
- Edge cases
- Test maintainability
- Test effectiveness

Severity bias: LOW/MEDIUM
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent, ReviewContext


class TestingAgent(BaseAgent):
    """
    Test coverage and quality agent.
    
    Focuses on test effectiveness, coverage, and quality
    of test code.
    """
    
    agent_id = "testing_agent"
    category = "testing"
    default_severity = "MEDIUM"
    
    def should_analyze(self, diff_content: str, context: ReviewContext) -> bool:
        """
        Analyze if diff involves test files or new functionality.
        
        Look for:
        - Test files (test_*.py, *.test.ts, *.spec.js)
        - New functions/classes that need tests
        - Changes to existing code that affect tests
        """
        test_indicators = [
            "test_", "_test", ".test.", ".spec.",  # Test files
            "pytest", "unittest", "jest", "mocha",  # Test frameworks
            "assert", "expect", "should",  # Test assertions
            "mock", "stub", "spy", "fake",  # Test doubles
        ]
        
        diff_lower = diff_content.lower()
        changed_files_lower = " ".join(context.changed_files).lower()
        
        # Check if test files are involved or new code is added
        has_test_files = any(
            indicator in changed_files_lower for indicator in ["test_", "_test", ".test.", ".spec."]
        )
        has_test_code = any(indicator in diff_lower for indicator in test_indicators)
        has_new_code = "+def " in diff_content or "+class " in diff_content or "+function " in diff_content
        
        return has_test_files or has_test_code or has_new_code
    
    def get_prompt_template(self) -> str:
        """Testing-focused prompt template."""
        return """You are an expert test engineer analyzing code changes for test coverage and quality.

Your task is to identify testing gaps, test quality issues, and opportunities to improve test effectiveness in the following code diff:

Changed files: {changed_files}
Project type: {project_type}

Diff:
{diff_content}

TESTING ANALYSIS CHECKLIST:

1. Test Coverage
   - New functions/classes without tests
   - Modified code without updated tests
   - Missing tests for critical paths
   - Low branch coverage (conditionals not tested)
   - Missing error path tests

2. Test Quality
   - Tests that don't actually assert anything
   - Tests that test implementation details instead of behavior
   - Brittle tests (break on minor refactoring)
   - Tests with unclear purpose
   - Tests that are too complex

3. Test Structure (AAA Pattern)
   - Missing Arrange (setup)
   - Missing Act (execution)
   - Missing Assert (verification)
   - Multiple assertions testing different things
   - Setup/teardown issues

4. Edge Cases and Boundaries
   - Missing null/None checks
   - Missing empty input tests
   - Missing boundary value tests (0, 1, max)
   - Missing negative test cases
   - Missing concurrent access tests

5. Mocking and Stubbing
   - Over-mocking (testing mocks instead of real behavior)
   - Under-mocking (slow tests due to real I/O)
   - Improper mock setup
   - Missing mock verification
   - Mocking the wrong layer

6. Test Maintainability
   - Copy-pasted test code (missing test helpers)
   - Hardcoded test data (use fixtures/factories)
   - Large test files (> 500 lines)
   - Complex test setup
   - Missing test documentation

7. Test Performance
   - Slow tests (> 1 second for unit test)
   - Missing test parallelization
   - Redundant test setup
   - Tests hitting real database/network unnecessarily

8. Test Effectiveness
   - Flaky tests (intermittent failures)
   - Tests that pass even with bugs
   - Missing integration tests
   - Missing end-to-end tests for critical flows
   - No performance/load tests

9. Test Anti-patterns
   - Test pollution (tests affect each other)
   - Mystery guest (unclear test dependencies)
   - Erratic test (random failures)
   - Hidden test call (unclear what's being tested)
   - Line hitter (test for coverage, not behavior)

10. Security Testing
    - Missing authentication/authorization tests
    - Missing input validation tests
    - No SQL injection tests
    - No XSS tests
    - Missing rate limiting tests

SEVERITY GUIDELINES:
- MEDIUM: Critical functionality without tests, poor test quality affecting reliability
- LOW: Missing edge case tests, minor test quality issues, test maintainability concerns

NEW CODE ANALYSIS:
If the diff adds new functions or classes, check if corresponding tests are added.
If tests are missing, suggest what should be tested.

MODIFIED CODE ANALYSIS:
If existing code is modified, check if tests are updated accordingly.
Flag cases where behavior changes but tests remain the same.

Provide your findings in the following JSON format:
[
  {{
    "file_path": "path/to/file.py",
    "line": 42,
    "severity": "MEDIUM",
    "message": "New function 'process_payment()' added without tests. Critical payment logic should have comprehensive test coverage.",
    "suggestion": "Add tests covering: successful payment, insufficient funds, invalid card, payment timeout, duplicate payment protection",
    "rule_id": "missing-tests-critical-path",
    "confidence": 0.9,
    "evidence": {{
      "new_function": "process_payment",
      "criticality": "high",
      "test_file": "tests/test_payment.py"
    }}
  }}
]

Be constructive - suggest what tests should be added, not just that tests are missing.
If testing is adequate, return an empty array: []
"""


# Singleton instance
_testing_agent_instance: TestingAgent | None = None


def get_testing_agent() -> TestingAgent:
    """Get singleton testing agent instance."""
    global _testing_agent_instance
    if _testing_agent_instance is None:
        _testing_agent_instance = TestingAgent()
    return _testing_agent_instance

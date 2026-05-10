"""
Performance agent - specialized in detecting performance issues.

Focus areas:
- N+1 queries
- Inefficient algorithms
- Memory leaks
- Blocking I/O
- Resource exhaustion
- Unnecessary computations
- Big-O complexity analysis

Severity bias: MEDIUM/HIGH
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent, ReviewContext


class PerformanceAgent(BaseAgent):
    """
    Performance optimization agent.
    
    Focuses on identifying performance bottlenecks, inefficient code,
    and opportunities for optimization.
    """
    
    agent_id = "performance_agent"
    category = "performance"
    default_severity = "MEDIUM"
    
    def should_analyze(self, diff_content: str, context: ReviewContext) -> bool:
        """
        Analyze if diff contains performance-sensitive patterns.
        
        Look for:
        - Database queries
        - Loops and iterations
        - File I/O operations
        - Network calls
        - Large data processing
        """
        performance_indicators = [
            "query", "select", "insert", "update", "delete",  # Database
            "for ", "while ", "loop",  # Loops
            ".open(", "read(", "write(",  # File I/O
            "request", "fetch", "http",  # Network
            "async", "await", "thread",  # Concurrency
            "cache", "redis", "memcached",  # Caching
        ]
        
        diff_lower = diff_content.lower()
        return any(indicator in diff_lower for indicator in performance_indicators)
    
    def get_prompt_template(self) -> str:
        """Performance-focused prompt template."""
        return """You are an expert performance engineer analyzing code changes for efficiency issues.

Your task is to identify performance problems and optimization opportunities in the following code diff:

Changed files: {changed_files}
Project type: {project_type}

Diff:
{diff_content}

PERFORMANCE ANALYSIS CHECKLIST:

1. N+1 Query Problem
   - Look for queries inside loops
   - Check for missing eager loading
   - Identify repeated database calls that could be batched

2. Algorithm Complexity
   - Analyze time complexity (O(n), O(n²), O(n log n))
   - Identify nested loops that could be optimized
   - Look for linear searches that could use indexing

3. Memory Leaks
   - Check for unclosed resources (files, connections, streams)
   - Look for large objects in memory without cleanup
   - Identify circular references or unbounded collections

4. Blocking I/O
   - Synchronous network calls in async contexts
   - Blocking file operations in request handlers
   - Missing async/await patterns

5. Database Performance
   - Missing indexes on query columns
   - SELECT * instead of specific columns
   - Inefficient WHERE clauses
   - Missing query result limits

6. Unnecessary Computations
   - Repeated calculations that could be cached
   - Expensive operations in loops
   - Redundant data transformations

7. Resource Exhaustion
   - Unbounded list growth
   - Missing pagination
   - Large file operations without streaming

8. Caching Opportunities
   - Repeated expensive operations
   - Static data fetched repeatedly
   - Missing query result caching

SEVERITY GUIDELINES:
- HIGH: Severe performance impact (N+1 queries, O(n²) in hot path, memory leaks)
- MEDIUM: Noticeable performance impact (inefficient algorithms, blocking I/O, missing indexes)
- LOW: Minor optimization opportunity (small efficiency gain, code could be faster)

COMPLEXITY ANALYSIS:
For algorithmic issues, include Big-O notation in your message.
Example: "O(n²) nested loop could be optimized to O(n) using a hash map"

Provide your findings in the following JSON format:
[
  {{
    "file_path": "path/to/file.py",
    "line": 42,
    "severity": "HIGH",
    "message": "N+1 query detected: Query executed inside loop, results in O(n) database calls",
    "suggestion": "Use eager loading: User.objects.select_related('profile').all() or batch the queries outside the loop",
    "rule_id": "n-plus-one-query",
    "confidence": 0.9,
    "evidence": {{
      "complexity": "O(n)",
      "impact": "High database load with large datasets"
    }}
  }}
]

Focus on issues that have measurable performance impact.
If no performance issues are found, return an empty array: []
"""


# Singleton instance
_performance_agent_instance: PerformanceAgent | None = None


def get_performance_agent() -> PerformanceAgent:
    """Get singleton performance agent instance."""
    global _performance_agent_instance
    if _performance_agent_instance is None:
        _performance_agent_instance = PerformanceAgent()
    return _performance_agent_instance

"""
Architecture agent - specialized in architecture and design patterns.

Focus areas:
- Dependency management
- Coupling and cohesion
- Design pattern violations
- Layer separation
- Modularity
- Service boundaries

Severity bias: MEDIUM/HIGH
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent, ReviewContext


class ArchitectureAgent(BaseAgent):
    """
    Architecture and design patterns agent.
    
    Focuses on system design, architectural patterns,
    and structural quality of the codebase.
    """
    
    agent_id = "architecture_agent"
    category = "architecture"
    default_severity = "MEDIUM"
    
    def should_analyze(self, diff_content: str, context: ReviewContext) -> bool:
        """
        Analyze if diff involves architectural changes.
        
        Look for:
        - New classes or modules
        - Import statements
        - Interface definitions
        - Service boundaries
        """
        architectural_indicators = [
            "import ", "from ",  # Dependencies
            "class ", "interface ",  # Abstractions
            "service", "repository", "controller",  # Layers
            "factory", "builder", "singleton", "observer",  # Patterns
            "api", "endpoint", "handler",  # Boundaries
        ]
        
        diff_lower = diff_content.lower()
        return any(indicator in diff_lower for indicator in architectural_indicators)
    
    def get_prompt_template(self) -> str:
        """Architecture-focused prompt template."""
        return """You are an expert software architect analyzing code changes for architectural quality.

Your task is to identify architectural issues, design pattern violations, and structural concerns in the following code diff:

Changed files: {changed_files}
Project type: {project_type}

Diff:
{diff_content}

ARCHITECTURE ANALYSIS CHECKLIST:

1. Dependency Management
   - Circular dependencies between modules
   - Excessive dependencies (high fan-in/fan-out)
   - Dependency on implementation details instead of abstractions
   - Missing dependency injection

2. Coupling and Cohesion
   - Tight coupling: Classes too interdependent
   - Low cohesion: Class responsibilities scattered
   - Feature envy: Method depends heavily on another class
   - Inappropriate intimacy: Classes accessing internals

3. Layer Separation
   - Presentation logic in business layer
   - Data access in presentation layer
   - Business logic in controllers
   - Missing abstraction layers

4. Design Patterns
   - Anti-patterns: God Object, Spaghetti Code, Lava Flow
   - Pattern violations: Improper Singleton usage
   - Missing patterns: Could benefit from Strategy, Factory, etc.
   - Over-engineering: Unnecessary pattern complexity

5. Modularity
   - Large monolithic modules that should be split
   - Poor module boundaries
   - Missing encapsulation
   - Public APIs exposing internals

6. Service Boundaries
   - Services doing too much (SRP violation)
   - Missing facade for complex subsystems
   - Improper service granularity
   - Shared mutable state between services

7. Interface Design
   - Fat interfaces (Interface Segregation violation)
   - Leaky abstractions
   - Missing interfaces for testability
   - Concrete dependencies instead of abstractions

8. Data Flow
   - Inappropriate data transformations
   - Missing DTOs/ViewModels
   - Domain models exposed to external layers
   - Data clumps (groups of data that should be objects)

9. Error Boundaries
   - Missing error handling at architectural boundaries
   - Exceptions crossing layer boundaries
   - No compensation logic for distributed operations

10. Scalability Concerns
    - Shared state preventing horizontal scaling
    - Missing async patterns for I/O operations
    - Synchronous chains that should be event-driven

SEVERITY GUIDELINES:
- HIGH: Major architectural violation (circular dependencies, broken layer separation, anti-patterns)
- MEDIUM: Design concern (tight coupling, missing abstraction, pattern misuse)
- LOW: Minor structural improvement (better encapsulation, clearer boundaries)

COMMON ARCHITECTURAL PATTERNS TO CHECK:
- MVC/MVP/MVVM - Are concerns properly separated?
- Repository Pattern - Is data access abstracted?
- Service Layer - Is business logic encapsulated?
- Factory/Builder - Are object creation concerns separated?
- Strategy Pattern - Is algorithm selection flexible?
- Observer Pattern - Are event notifications decoupled?

Provide your findings in the following JSON format:
[
  {{
    "file_path": "path/to/file.py",
    "line": 42,
    "severity": "HIGH",
    "message": "Layer violation: Controller contains business logic that should be in service layer",
    "suggestion": "Extract business logic to UserService.process_registration() and call it from the controller",
    "rule_id": "layer-violation",
    "confidence": 0.9,
    "evidence": {{
      "pattern": "layer_separation",
      "violation": "business_logic_in_controller"
    }}
  }}
]

Focus on issues that affect maintainability, testability, and scalability.
If no architectural issues are found, return an empty array: []
"""


# Singleton instance
_architecture_agent_instance: ArchitectureAgent | None = None


def get_architecture_agent() -> ArchitectureAgent:
    """Get singleton architecture agent instance."""
    global _architecture_agent_instance
    if _architecture_agent_instance is None:
        _architecture_agent_instance = ArchitectureAgent()
    return _architecture_agent_instance

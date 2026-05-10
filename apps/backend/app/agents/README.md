# Multi-Agent Code Review System

Specialized AI agents for comprehensive code review across different domains.

## Architecture

The multi-agent system consists of:

1. **Base Agent** (`base_agent.py`) - Abstract base class with:
   - LLM orchestration via gateway
   - Prompt template system
   - Finding data structure
   - JSON response parsing

2. **Specialized Agents** - Domain experts:
   - `security_agent.py` - Security vulnerabilities (SQL injection, XSS, secrets)
   - `performance_agent.py` - Performance issues (N+1 queries, complexity)
   - `cleancode_agent.py` - Code quality (naming, complexity, SOLID)
   - `architecture_agent.py` - Architecture (coupling, patterns, layers)
   - `devops_agent.py` - Infrastructure (Docker, CI/CD, config)
   - `testing_agent.py` - Test coverage and quality

3. **Agent Dispatcher** (`agent_dispatcher.py`) - Intelligent routing:
   - Analyzes diff to select applicable agents
   - Executes agents in parallel (asyncio.gather)
   - Deduplicates similar findings
   - Combines results

## Usage

### Basic Usage

```python
from app.agents.agent_dispatcher import dispatch_review

findings = await dispatch_review(
    diff_content=unified_diff,
    changed_files=["app/api.py", "tests/test_api.py"],
    project_type="python",
    repository_path="/path/to/repo",
)

for finding in findings:
    print(f"{finding.severity}: {finding.message}")
    print(f"  File: {finding.file_path}:{finding.line}")
    print(f"  Suggestion: {finding.suggestion}")
```

### Integration in Pipeline

The multi-agent system is integrated in `analyze_graphrag.py` at line 345:

```python
# After pattern analysis, before metrics calculation
agent_findings = await dispatch_review(
    diff_content=diff_redacted,
    changed_files=changed_files,
    project_type=analysis.metadata.get("project_type"),
    repository_path=resolved_scope.repo_path,
)
```

## Agent Selection

The dispatcher intelligently selects agents based on:

1. **Always Run:**
   - Security Agent (critical for all changes)
   - CleanCode Agent (quality applies to all)

2. **File-Based Selection:**
   - `Dockerfile`, `docker-compose.yml` → DevOps Agent
   - `test_*.py`, `*.spec.ts` → Testing Agent

3. **Pattern-Based Selection:**
   - SQL queries, database calls → Security + Performance Agents
   - `import`, `class`, `service` → Architecture Agent
   - Loops, async code → Performance Agent

4. **Change-Based Selection:**
   - New functions/classes → Testing Agent (check for tests)
   - Modified code → All applicable agents

## Finding Structure

```python
@dataclass
class Finding:
    file_path: str              # Path to file
    line: int                   # Line number
    severity: str               # CRITICAL, HIGH, MEDIUM, LOW
    category: str               # security, performance, maintainability, etc.
    message: str                # Issue description
    suggestion: str | None      # How to fix
    agent_id: str               # Which agent found it
    confidence: float           # 0.0-1.0
    evidence: dict              # Additional context
    rule_id: str | None         # Optional rule identifier
```

## Severity Guidelines

Each agent has a severity bias based on its domain:

- **Security Agent**: HIGH/CRITICAL
  - CRITICAL: Direct exploit (SQL injection, RCE, secrets in code)
  - HIGH: Significant risk (XSS, CSRF, weak crypto)
  
- **Performance Agent**: MEDIUM/HIGH
  - HIGH: Severe impact (N+1 queries, O(n²) in hot path)
  - MEDIUM: Noticeable impact (inefficient algorithms, missing indexes)

- **CleanCode Agent**: LOW/MEDIUM
  - MEDIUM: Significant maintainability issue (high complexity)
  - LOW: Minor quality issue (naming, small duplication)

- **Architecture Agent**: MEDIUM/HIGH
  - HIGH: Major violation (circular dependencies, broken layers)
  - MEDIUM: Design concern (tight coupling, missing abstraction)

- **DevOps Agent**: MEDIUM
  - HIGH: Security risk or deployment failure potential
  - MEDIUM: Operational concern (poor logging, config issues)

- **Testing Agent**: LOW/MEDIUM
  - MEDIUM: Critical functionality without tests
  - LOW: Missing edge case tests

## Deduplication

The dispatcher deduplicates similar findings using:

1. **Key**: `{file_path}:{line}:{severity}`
2. **Similarity**: Word overlap in messages (threshold: 0.7)
3. **Priority**: More specialized agent wins
   - Security > Performance > Testing > Architecture > DevOps > CleanCode

When duplicates are found:
- Keep finding from higher priority agent
- Merge evidence from both findings

## Extending the System

### Adding a New Agent

1. Create new agent file in `app/agents/`:

```python
from app.agents.base_agent import BaseAgent, ReviewContext

class MyAgent(BaseAgent):
    agent_id = "my_agent"
    category = "my_category"
    default_severity = "MEDIUM"
    
    def should_analyze(self, diff_content: str, context: ReviewContext) -> bool:
        # Return True if this agent should analyze
        return "my_pattern" in diff_content.lower()
    
    def get_prompt_template(self) -> str:
        return """Your specialized prompt here..."""

def get_my_agent() -> MyAgent:
    global _instance
    if _instance is None:
        _instance = MyAgent()
    return _instance
```

2. Register in dispatcher (`agent_dispatcher.py`):

```python
from app.agents.my_agent import get_my_agent

class AgentDispatcher:
    def __init__(self):
        self.my_agent = get_my_agent()
        self.all_agents.append(self.my_agent)
```

3. Add selection logic in `_select_agents()`:

```python
if "my_pattern" in diff_lower:
    selected.append(self.my_agent)
```

## Performance Considerations

- **Parallel Execution**: All agents run concurrently via `asyncio.gather()`
- **Smart Routing**: Only applicable agents analyze the diff
- **Shared Gateway**: All agents use the same LLM gateway (caching, fallback)
- **Rate Limiting**: Controlled via gateway's rate limiter

## Metrics and Observability

Each agent execution is tracked:

- Agent selection logged
- Findings per agent logged
- Execution time tracked
- LLM calls traced via gateway

Final metrics include:
- `total_findings` from all agents
- `findings_by_severity` breakdown
- `agents_used` list
- Individual agent contribution

## Configuration

Agents use settings from `app/settings.py`:

- `LLM_ENABLED`: Enable/disable LLM-based review
- `OLLAMA_BASE_URL`: Local LLM endpoint
- Gateway settings: Model selection, fallback, etc.

Disable multi-agent review by commenting out lines 344-427 in `analyze_graphrag.py`.

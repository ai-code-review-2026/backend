# Multi-Agent Review System - Quick Reference

## 📁 File Structure

```
apps/backend/app/agents/
├── __init__.py                 # Package exports
├── base_agent.py              # Base class + Finding/ReviewContext
├── agent_dispatcher.py        # Intelligent routing + parallel execution
├── security_agent.py          # SQL injection, XSS, secrets (HIGH/CRITICAL)
├── performance_agent.py       # N+1 queries, complexity (MEDIUM/HIGH)
├── cleancode_agent.py         # Code quality, SOLID (LOW/MEDIUM)
├── architecture_agent.py      # Dependencies, patterns (MEDIUM/HIGH)
├── devops_agent.py            # Docker, CI/CD, config (MEDIUM)
├── testing_agent.py           # Test coverage, quality (LOW/MEDIUM)
└── README.md                  # Full documentation

apps/backend/tests/unit/
└── test_agents.py             # 50+ unit tests

apps/backend/scripts/
└── example_multi_agent_review.py  # Demo script
```

## 🚀 Quick Start

### Use in Code

```python
from app.agents.agent_dispatcher import dispatch_review

findings = await dispatch_review(
    diff_content=diff,
    changed_files=["file.py"],
    project_type="python",
)
```

### Run Example

```bash
cd apps/backend
poetry run python scripts/example_multi_agent_review.py
```

### Run Tests

```bash
cd apps/backend
poetry run pytest tests/unit/test_agents.py -v
```

## 🔧 Integration Location

**File:** `apps/backend/app/workers/tasks/analyze_graphrag.py`
**Lines:** 344-427 (step 6.6 - multi-agent review)
**Position:** After pattern analysis, before metrics

## 🎯 Agent Triggers

| Agent | Always | Triggers On |
|-------|--------|------------|
| Security | ✅ | All changes |
| CleanCode | ✅ | All changes |
| Performance | ❌ | SQL, loops, async, cache |
| Architecture | ❌ | imports, classes, services |
| DevOps | ❌ | Dockerfile, .yml, CI files |
| Testing | ❌ | test files, new functions |

## 📊 Finding Structure

```python
Finding(
    file_path="app/api.py",
    line=42,
    severity="HIGH",              # CRITICAL|HIGH|MEDIUM|LOW
    category="security",          # domain
    message="SQL injection...",
    suggestion="Use params...",
    agent_id="security_agent",
    confidence=0.95,
    rule_id="sql-injection",
)
```

## 🔄 Execution Flow

```
1. Select agents (based on files/patterns)
2. Run in parallel (asyncio.gather)
3. Deduplicate findings
4. Persist to database
5. Update metrics
```

## 📈 Metrics

Tracked in analysis metadata:
- `multi_agent_review.total_findings`
- `multi_agent_review.findings_by_severity`
- `multi_agent_review.agents_used`

## 🎨 Priority System

```
Security > Performance > Testing > Architecture > DevOps > CleanCode
```

When two agents find the same issue, keep higher priority finding.

## 🔌 Disable

Comment out lines 344-427 in `analyze_graphrag.py`

## 📚 Full Docs

See `apps/backend/app/agents/README.md`

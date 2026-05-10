---
mode: agent
description: Analyze project folder structure and return a clear, phased reorganization plan
---

Analyze this repository's folder and module architecture, then propose a practical reorganization plan.

## Goal
Return only a structured improvement plan to make the project architecture clearer, more scalable, and easier to maintain.
Do not modify files and do not generate code changes.

## Scope
- Inspect the full workspace structure (top-level + major subfolders).
- Focus on boundaries between domains, apps, shared libraries, scripts, infra, docs, and tests.
- Detect unclear naming, duplicated responsibilities, mixed concerns, and misplaced files.

## Constraints
- Respect the current tech stack and workflows.
- Favor incremental migration (no big-bang refactor).
- Keep backward compatibility for build/dev/test commands whenever possible.

## Required Output Format
Use exactly these sections:

1. Current Structure Diagnosis
- 5 to 10 concrete findings about what is unclear or fragile.

2. Target Folder Architecture (Proposed)
- A proposed tree (high level) with short explanations per major folder.

3. Migration Plan (Phased)
- Phase 1: Quick wins (low risk)
- Phase 2: Medium changes
- Phase 3: Structural cleanup
For each phase include:
- Actions
- Impact
- Risks
- Rollback strategy

4. Old Path -> New Path Mapping
- A concrete mapping table for the most important files/folders to move.
- Include migration order for moves that could break imports, scripts, or docs links.

5. Governance Rules
- Naming conventions
- File placement rules
- Ownership boundaries
- Documentation expectations

6. Prioritized Checklist
- A numbered checklist sorted by priority and effort.

## Inputs
- Main objective: ${input:mainObjective:What do you want to optimize first? (readability, scalability, onboarding speed, delivery speed)}
- Constraints: ${input:constraints:Any constraints? (team size, deadlines, tooling, CI/CD)}
- Preferred language for output: ${input:language:French, English, or Tunisian Arabic}

## Quality Bar
- Be specific and actionable.
- Avoid generic advice.
- Tie recommendations to observed structure.
- Keep the plan practical for a real team.
- Prefer changes that can be executed safely in small pull requests.

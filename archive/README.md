# Archive

This directory contains archived code and artifacts that are no longer actively maintained but preserved for reference and potential future restoration.

## Contents

### analysis_engine/
- **Status**: Archived (superseded by backend static analysis)
- **Date Archived**: 2026-03-26
- **Original Location**: Root (`analysis_engine/`)
- **Reason**: Early prototype analyzer with custom rules engine. Superseded by Ruff/Semgrep/CleanCodeAnalyzer in backend's main analysis pipeline.
- **Components**:
  - 18 Python files
  - FastAPI microservice with own rules engine
  - Parsers for Python (AST) and JavaScript (TreeSitter)
  - Rules: bugs, complexity, security, code smells
- **Coupling**: LOOSELY COUPLED - only 7 imports in ONE backend file (`internal_analysis_engine.py`)
- **Usage**: NOT used in main production pipeline
- **Restoration**: Can be restored if custom rules engine needed in future. All code is intact.

### t6_manual/
- **Status**: Archived (legacy testing artifacts)
- **Date Archived**: 2026-03-26
- **Original Location**: Root (`t6_manual/`)
- **Reason**: Legacy manual testing artifacts from T6 development phase. Replaced by automated test suite in `apps/backend/tests/`.
- **Restoration**: Kept for reference only, not intended for restoration.

## Archiving Policy

Code is archived when:
1. It's no longer actively used in production
2. It has been superseded by better implementations
3. It may have historical or reference value
4. Removal from main codebase improves clarity

Archived code:
- Is fully functional (at time of archival)
- Can be restored if needed
- Is documented with archival reason and date
- Does not participate in CI/CD or active development

## Restoring Archived Code

To restore archived code:
1. Review the archival reason and assess if restoration is truly needed
2. Check for outdated dependencies or breaking changes
3. Move from `archive/` back to appropriate location
4. Update imports and dependencies
5. Add tests and CI/CD integration
6. Document the restoration in this file

## Archive History

| Date       | Item               | Action   | Reason                              |
|------------|--------------------|---------|------------------------------------|
| 2026-03-26 | analysis_engine/   | Archived | Superseded by backend analyzers    |
| 2026-03-26 | t6_manual/         | Archived | Legacy testing artifacts           |

---

**Note**: This archive strategy is part of the folder structure reorganization migration (Phase 1). For more details, see `docs/reports/folder-reorganization-context.md`.

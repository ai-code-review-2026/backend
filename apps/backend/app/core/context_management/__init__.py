"""Context Management Module.

Provides functionality for managing project context across analyses,
including caching, incremental updates, and staleness checking.
"""

from app.core.context_management.context_manager import ContextManager, ProjectContext
from app.core.context_management.staleness_checker import StalenessChecker, StalenessStatus
from app.core.context_management.incremental_updater import IncrementalUpdater, UpdateResult

__all__ = [
    "ContextManager",
    "ProjectContext",
    "StalenessChecker",
    "StalenessStatus",
    "IncrementalUpdater",
    "UpdateResult",
]

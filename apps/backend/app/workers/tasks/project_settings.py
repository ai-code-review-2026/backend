"""Celery task for managing project settings, including auto-analysis toggle.

This module provides background tasks for:
- Cleaning up expired temporary disables
- Periodic state verification
"""

from __future__ import annotations

import logging

from celery import shared_task

from app.data.repos.project_settings_repo import ProjectSettingsRepo

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def cleanup_expired_temporary_disables(self) -> dict[str, int]:
    """Clean up expired temporary disables.
    
    This task should be run periodically (e.g., every minute) to ensure
    that temporary disables are cleared promptly after expiration.
    
    Returns:
        Dictionary with count of cleared settings
    """
    try:
        repo = ProjectSettingsRepo()
        
        # Get all projects with expired temporary disables
        expired_project_ids = repo.get_expired_temporary_disables()
        
        if not expired_project_ids:
            logger.debug("No expired temporary disables to clear")
            return {"cleared": 0}
        
        cleared_count = 0
        for project_id in expired_project_ids:
            try:
                repo.clear_temporary_disable(
                    project_id=project_id,
                    user_id=None,
                    user_email="system",
                    reason="Temporary disable period expired",
                )
                cleared_count += 1
                logger.info(
                    "Cleared expired temporary disable for project: %s",
                    project_id,
                )
            except Exception as e:
                logger.warning(
                    "Failed to clear expired temporary disable for project %s: %s",
                    project_id,
                    str(e),
                )
        
        logger.info(
            "Temporary disable cleanup complete: %d of %d cleared",
            cleared_count,
            len(expired_project_ids),
        )
        
        return {"cleared": cleared_count, "total_expired": len(expired_project_ids)}
        
    except Exception as e:
        logger.exception("Error in cleanup_expired_temporary_disables: %s", str(e))
        raise self.retry(exc=e)

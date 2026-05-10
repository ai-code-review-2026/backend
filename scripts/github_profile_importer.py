"""
GitHub Profile Repository Importer - Import all repositories from a GitHub profile.

This script clones and imports all repositories from a GitHub user profile,
extracting design patterns from each repository.
"""

import asyncio
import logging
import os
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from app.core.design_patterns import (
    PatternExtractor,
    PatternNeo4jRepository,
)
from app.settings import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class GitHubRepository:
    """GitHub repository metadata."""
    name: str
    full_name: str
    clone_url: str
    html_url: str
    description: str
    language: str
    size: int
    default_branch: str
    topics: List[str]
    is_fork: bool
    is_archived: bool


class GitHubProfileImporter:
    """Import repositories from a GitHub profile."""
    
    def __init__(
        self,
        github_token: Optional[str] = None,
        workspace_dir: Optional[str] = None,
    ):
        self.github_token = github_token or os.getenv("GITHUB_TOKEN")
        self.workspace_dir = workspace_dir or tempfile.mkdtemp(prefix="devora_repos_")
        
        # Setup HTTP session with retries
        self.session = requests.Session()
        retries = Retry(
            total=3,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504]
        )
        self.session.mount('https://', HTTPAdapter(max_retries=retries))
        
        # Setup headers
        self.headers = {
            "Accept": "application/vnd.github.v3+json",
        }
        if self.github_token:
            self.headers["Authorization"] = f"token {self.github_token}"
        
        # Pattern extractor and Neo4j repo
        self.pattern_extractor = PatternExtractor()
        self.neo4j_repo = PatternNeo4jRepository()
    
    def get_user_repositories(
        self,
        username: str,
        include_forks: bool = False,
        include_archived: bool = False,
    ) -> List[GitHubRepository]:
        """
        Get all repositories for a GitHub user.
        
        Args:
            username: GitHub username
            include_forks: Include forked repositories
            include_archived: Include archived repositories
        
        Returns:
            List of repositories
        """
        logger.info(f"Fetching repositories for user: {username}")
        
        repositories = []
        page = 1
        per_page = 100
        
        while True:
            url = f"https://api.github.com/users/{username}/repos"
            params = {
                "per_page": per_page,
                "page": page,
                "sort": "updated",
                "direction": "desc",
            }
            
            try:
                response = self.session.get(
                    url,
                    headers=self.headers,
                    params=params,
                    timeout=30,
                )
                response.raise_for_status()
                
                repos_data = response.json()
                
                if not repos_data:
                    break
                
                for repo_data in repos_data:
                    # Filter based on criteria
                    if not include_forks and repo_data.get("fork", False):
                        continue
                    
                    if not include_archived and repo_data.get("archived", False):
                        continue
                    
                    repositories.append(GitHubRepository(
                        name=repo_data["name"],
                        full_name=repo_data["full_name"],
                        clone_url=repo_data["clone_url"],
                        html_url=repo_data["html_url"],
                        description=repo_data.get("description", ""),
                        language=repo_data.get("language", ""),
                        size=repo_data.get("size", 0),
                        default_branch=repo_data.get("default_branch", "main"),
                        topics=repo_data.get("topics", []),
                        is_fork=repo_data.get("fork", False),
                        is_archived=repo_data.get("archived", False),
                    ))
                
                page += 1
                
            except requests.exceptions.RequestException as e:
                logger.error(f"Failed to fetch repositories: {e}")
                break
        
        logger.info(f"Found {len(repositories)} repositories for {username}")
        return repositories
    
    def clone_repository(
        self,
        repo: GitHubRepository,
    ) -> Optional[str]:
        """
        Clone a repository to the workspace.
        
        Args:
            repo: Repository to clone
        
        Returns:
            Path to cloned repository or None if failed
        """
        repo_path = Path(self.workspace_dir) / repo.name
        
        # Skip if already cloned
        if repo_path.exists():
            logger.info(f"Repository {repo.name} already cloned")
            return str(repo_path)
        
        logger.info(f"Cloning repository: {repo.name}")
        
        try:
            # Clone with depth=1 to save space
            cmd = [
                "git", "clone",
                "--depth", "1",
                "--single-branch",
                "--branch", repo.default_branch,
                repo.clone_url,
                str(repo_path)
            ]
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minutes timeout
            )
            
            if result.returncode != 0:
                logger.error(f"Failed to clone {repo.name}: {result.stderr}")
                return None
            
            logger.info(f"Successfully cloned {repo.name}")
            return str(repo_path)
        
        except subprocess.TimeoutExpired:
            logger.error(f"Timeout cloning {repo.name}")
            return None
        except Exception as e:
            logger.error(f"Error cloning {repo.name}: {e}")
            return None
    
    def extract_patterns_from_repository(
        self,
        repo: GitHubRepository,
        repo_path: str,
    ) -> int:
        """
        Extract patterns from a repository.
        
        Args:
            repo: Repository metadata
            repo_path: Path to cloned repository
        
        Returns:
            Number of patterns extracted
        """
        logger.info(f"Extracting patterns from {repo.name}")
        
        try:
            # Extract patterns
            patterns = self.pattern_extractor.extract_patterns_from_repository(
                repo_path=repo_path,
                repo_name=repo.name,
            )
            
            if not patterns:
                logger.warning(f"No patterns found in {repo.name}")
                return 0
            
            # Store in Neo4j
            stored_count = 0
            for pattern in patterns:
                success = self.neo4j_repo.store_pattern(
                    pattern=pattern,
                    repository_name=repo.name,
                )
                if success:
                    stored_count += 1
            
            logger.info(f"Stored {stored_count}/{len(patterns)} patterns for {repo.name}")
            return stored_count
        
        except Exception as e:
            logger.error(f"Failed to extract patterns from {repo.name}: {e}")
            return 0
    
    def import_profile(
        self,
        username: str,
        include_forks: bool = False,
        include_archived: bool = False,
        filter_languages: Optional[List[str]] = None,
        max_repos: Optional[int] = None,
    ) -> Dict:
        """
        Import all repositories from a GitHub profile.
        
        Args:
            username: GitHub username
            include_forks: Include forked repositories
            include_archived: Include archived repositories
            filter_languages: Only import repos with these languages
            max_repos: Maximum number of repos to import
        
        Returns:
            Import statistics
        """
        logger.info(f"Starting import for GitHub profile: {username}")
        
        # Get repositories
        repositories = self.get_user_repositories(
            username=username,
            include_forks=include_forks,
            include_archived=include_archived,
        )
        
        # Filter by language
        if filter_languages:
            repositories = [
                r for r in repositories
                if r.language and r.language.lower() in [l.lower() for l in filter_languages]
            ]
            logger.info(f"Filtered to {len(repositories)} repos with languages: {filter_languages}")
        
        # Limit number of repos
        if max_repos:
            repositories = repositories[:max_repos]
            logger.info(f"Limited to {len(repositories)} repos")
        
        # Statistics
        stats = {
            "total_repos": len(repositories),
            "cloned": 0,
            "patterns_extracted": 0,
            "total_patterns": 0,
            "failed": 0,
            "skipped": 0,
            "repositories": [],
        }
        
        # Process each repository
        for i, repo in enumerate(repositories, 1):
            logger.info(f"Processing {i}/{len(repositories)}: {repo.name}")
            
            repo_stats = {
                "name": repo.name,
                "language": repo.language,
                "size": repo.size,
                "patterns": 0,
                "status": "pending",
            }
            
            # Skip very large repos (> 100MB)
            if repo.size > 100_000:
                logger.warning(f"Skipping {repo.name}: too large ({repo.size} KB)")
                repo_stats["status"] = "skipped_large"
                stats["skipped"] += 1
                stats["repositories"].append(repo_stats)
                continue
            
            # Clone repository
            repo_path = self.clone_repository(repo)
            
            if not repo_path:
                repo_stats["status"] = "failed_clone"
                stats["failed"] += 1
                stats["repositories"].append(repo_stats)
                continue
            
            stats["cloned"] += 1
            
            # Extract patterns
            patterns_count = self.extract_patterns_from_repository(repo, repo_path)
            
            if patterns_count > 0:
                stats["patterns_extracted"] += 1
                stats["total_patterns"] += patterns_count
                repo_stats["patterns"] = patterns_count
                repo_stats["status"] = "success"
            else:
                repo_stats["status"] = "no_patterns"
            
            stats["repositories"].append(repo_stats)
            
            # Cleanup cloned repo to save space
            try:
                shutil.rmtree(repo_path)
            except Exception as e:
                logger.warning(f"Failed to cleanup {repo_path}: {e}")
        
        # Log summary
        logger.info("=" * 60)
        logger.info("Import Summary")
        logger.info("=" * 60)
        logger.info(f"Total repositories: {stats['total_repos']}")
        logger.info(f"Cloned: {stats['cloned']}")
        logger.info(f"Patterns extracted from: {stats['patterns_extracted']} repos")
        logger.info(f"Total patterns: {stats['total_patterns']}")
        logger.info(f"Failed: {stats['failed']}")
        logger.info(f"Skipped: {stats['skipped']}")
        logger.info("=" * 60)
        
        return stats
    
    def cleanup(self):
        """Cleanup workspace directory."""
        try:
            if os.path.exists(self.workspace_dir):
                shutil.rmtree(self.workspace_dir)
                logger.info(f"Cleaned up workspace: {self.workspace_dir}")
        except Exception as e:
            logger.warning(f"Failed to cleanup workspace: {e}")
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cleanup()


async def main():
    """Main function to import GitHub profile."""
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python github_profile_importer.py <github_username>")
        print("\nExample:")
        print("  python github_profile_importer.py AhmedAmineBejaoui")
        sys.exit(1)
    
    username = sys.argv[1]
    
    # Configuration
    filter_languages = ["JavaScript", "TypeScript", "Python"]  # MERN + Python
    max_repos = None  # Import all repos
    include_forks = False
    include_archived = False
    
    logger.info(f"Importing GitHub profile: {username}")
    logger.info(f"Languages: {filter_languages}")
    logger.info(f"Include forks: {include_forks}")
    logger.info(f"Include archived: {include_archived}")
    
    # Import
    with GitHubProfileImporter() as importer:
        stats = importer.import_profile(
            username=username,
            filter_languages=filter_languages,
            max_repos=max_repos,
            include_forks=include_forks,
            include_archived=include_archived,
        )
        
        # Save stats to file
        import json
        stats_file = f"github_import_{username}_stats.json"
        with open(stats_file, "w") as f:
            json.dump(stats, f, indent=2)
        
        logger.info(f"Stats saved to: {stats_file}")
        
        print("\n" + "=" * 60)
        print(f"✅ Import completed for {username}")
        print("=" * 60)
        print(f"Total repositories: {stats['total_repos']}")
        print(f"Successfully processed: {stats['patterns_extracted']}")
        print(f"Total patterns extracted: {stats['total_patterns']}")
        print(f"Failed: {stats['failed']}")
        print(f"Skipped: {stats['skipped']}")
        print("=" * 60)
        
        # Show top repos by patterns
        print("\nTop repositories by patterns:")
        top_repos = sorted(
            [r for r in stats['repositories'] if r['patterns'] > 0],
            key=lambda x: x['patterns'],
            reverse=True
        )[:10]
        
        for repo in top_repos:
            print(f"  - {repo['name']}: {repo['patterns']} patterns ({repo['language']})")


if __name__ == "__main__":
    asyncio.run(main())

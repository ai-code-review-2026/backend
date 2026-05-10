from __future__ import annotations

from functools import lru_cache

from fastapi import Depends

from app.core.security.secret_store import EncryptedSecretStore, get_secret_store
from app.core.services.analysis_service import AnalysisService
from app.core.trust_center.policy_engine import PolicyEngine
from app.data.repos.analyses_repo import AnalysesRepo
from app.integrations.git_provider.github_client import GithubClient
from app.integrations.graph_database.neo4j_client import Neo4jClient, get_neo4j_client
from app.integrations.llm_providers.openai_client import OpenAIClient


@lru_cache(maxsize=1)
def get_analyses_repo() -> AnalysesRepo:
    return AnalysesRepo()


@lru_cache(maxsize=1)
def get_encrypted_secret_store() -> EncryptedSecretStore:
    return get_secret_store()


@lru_cache(maxsize=1)
def get_github_client() -> GithubClient:
    return GithubClient(secret_store=get_encrypted_secret_store())


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAIClient:
    return OpenAIClient()


@lru_cache(maxsize=1)
def get_neo4j_graph_client() -> Neo4jClient:
    return get_neo4j_client()


@lru_cache(maxsize=1)
def get_policy_engine() -> PolicyEngine:
    return PolicyEngine()


def get_analysis_service(
    repo: AnalysesRepo = Depends(get_analyses_repo),
    github_client: GithubClient = Depends(get_github_client),
    openai_client: OpenAIClient = Depends(get_openai_client),
    neo4j_client: Neo4jClient = Depends(get_neo4j_graph_client),
    policy_engine: PolicyEngine = Depends(get_policy_engine),
) -> AnalysisService:
    # AnalysisService stays transient while its dependencies are singleton.
    return AnalysisService(
        repo_store=repo,
        git_provider=github_client,
        llm_provider=openai_client,
        vector_provider=neo4j_client,
        policy_provider=policy_engine,
    )

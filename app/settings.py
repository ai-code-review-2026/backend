from pathlib import Path
import json

from pydantic_settings import BaseSettings, SettingsConfigDict


_SETTINGS_PATH = Path(__file__).resolve()
_ENV_FILES: list[str] = []
for parent_index in (3, 1):
    if len(_SETTINGS_PATH.parents) > parent_index:
        _ENV_FILES.append(str(_SETTINGS_PATH.parents[parent_index] / ".env"))
_ENV_FILES.append(".env")
_ENV_FILES = list(dict.fromkeys(_ENV_FILES))

class Settings(BaseSettings):
    env: str = "dev"
    GITHUB_WEBHOOK_SECRET: str = "c153311a45d393520b58f26f53963ce2e581e098cc8f909033f64e1e009a6434"
    GITHUB_APP_ID: str | None = None
    GITHUB_APP_INSTALLATION_ID: str | None = None
    GITHUB_APP_PRIVATE_KEY_PEM: str | None = None
    GITHUB_API_BASE_URL: str = "https://api.github.com"
    GITHUB_PUBLISH_ENABLED: bool = True
    GITHUB_PUBLISH_ON_ANALYSIS_COMPLETE: bool = True
    REDIS_URL: str | None = None
    CELERY_BROKER_URL: str | None = None
    CELERY_RESULT_BACKEND: str | None = None
    CELERY_TASK_ALWAYS_EAGER: bool = False
    CELERY_TASK_EAGER_PROPAGATES: bool = True
    CELERY_WORKER_POOL: str | None = None
    CELERY_ENQUEUE_REQUIRE_WORKER: bool = True
    CELERY_ENQUEUE_INSPECT_TIMEOUT_SECONDS: float = 1.5
    CELERY_TIMEZONE: str = "UTC"
    CELERY_ENABLE_UTC: bool = True
    ANALYSIS_STALE_RECOVERY_ENABLED: bool = True
    ANALYSIS_STALE_RECOVERY_INTERVAL_SECONDS: int = 60
    ANALYSIS_STALE_QUEUE_TIMEOUT_SECONDS: int = 900
    ANALYSIS_STALE_RUNNING_TIMEOUT_SECONDS: int = 7200
    ANALYSIS_STALE_RECOVERY_MAX_BATCH: int = 25
    ANALYSIS_STALE_RECOVERY_MAX_REQUEUE_ATTEMPTS: int = 2
    KB_DOCUMENT_MAINTENANCE_SCHEDULE_MINUTES: int = 60
    ANALYSIS_QUEUE_NAME: str = "analyses"
    DATABASE_URL: str | None = None
    MAX_DIFF_BYTES: int = 2_000_000  # 2 MB
    SECRET_SCAN_ENABLED: bool = True
    SECRET_SCAN_ENTROPY_THRESHOLD: float = 3.8
    SECRET_SCAN_MIN_TOKEN_LEN: int = 20
    SECRET_SCAN_MAX_FINDINGS: int = 200
    PURGE_RAW_DIFF_AFTER_REDACTION: bool = True
    ALLOW_UNSAFE_DIFF_API: bool = False
    STATIC_ANALYSIS_ENABLED: bool = True
    STATIC_ANALYSIS_RUFF_ENABLED: bool = True
    STATIC_ANALYSIS_SEMGREP_ENABLED: bool = True
    STATIC_ANALYSIS_ESLINT_ENABLED: bool = True
    STATIC_ANALYSIS_STYLELINT_ENABLED: bool = True
    STATIC_ANALYSIS_RUBOCOP_ENABLED: bool = False
    STATIC_ANALYSIS_STATICCHECK_ENABLED: bool = False
    STATIC_ANALYSIS_SQLFLUFF_ENABLED: bool = True
    STATIC_ANALYSIS_TIMEOUT_SECONDS: int = 60
    STATIC_ANALYSIS_MAX_FILES: int = 200
    STATIC_ANALYSIS_MAX_FINDINGS: int = 200
    STATIC_ANALYSIS_WORKSPACE_PATH: str = "."
    STATIC_ANALYSIS_AUTO_CHECKOUT_ENABLED: bool = True
    STATIC_ANALYSIS_REPO_HOST: str = "github.com"
    STATIC_ANALYSIS_GIT_TOKEN: str | None = None
    STATIC_ANALYSIS_CHECKOUT_TIMEOUT_SECONDS: int = 45
    STATIC_ANALYSIS_CHECKOUT_BASE_PATH: str | None = None
    STATIC_ANALYSIS_FILTER_CHANGED_LINES: bool = True
    CLEAN_CODE_RULE_ENGINE_ENABLED: bool = True
    CLEAN_CODE_FUNCTION_MAX_LINES: int = 30
    CLEAN_CODE_COMPLEXITY_WARN_THRESHOLD: int = 10
    CLEAN_CODE_DUPLICATION_MIN_LINES: int = 8
    CLEAN_CODE_FILE_MAX_LOGICAL_LINES: int = 400
    CLEAN_CODE_MAX_TOP_LEVEL_SYMBOLS: int = 12
    CLEAN_CODE_MAX_FINDINGS: int = 120
    CLEAN_CODE_EXCLUDED_REPOS: str | None = "AhmedAmineBejaoui/ai-code-review-platform,ai-code-review-platform"
    SECRETS_ENCRYPTION_KEY: str | None = None
    SECRETS_BOOTSTRAP_FROM_ENV: bool = True
    RBAC_ENFORCEMENT_ENABLED: bool = False
    CLERK_AUTH_ENABLED: bool = False
    CLERK_ISSUER_URL: str | None = None
    CLERK_JWKS_URL: str | None = None
    CLERK_AUDIENCE: str | None = None
    CLERK_JWT_LEEWAY_SECONDS: int = 10
    CLERK_ORGANIZATIONS_ENFORCED: bool = False
    VSCODE_EXTENSION_API_TOKEN: str | None = None
    ADMIN_EMAILS: str | None = None
    API_DEFAULT_PAGE_SIZE: int = 20
    API_MAX_PAGE_SIZE: int = 100
    CORS_ALLOWED_ORIGINS: str | None = None

    # ── LLM Integration (OpenAI) ──────────────────────────────────────────────
    LLM_ENABLED: bool = False
    OPENAI_API_KEY: str | None = None
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_MAX_TOKENS: int = 2048
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "deepseek-coder"
    OLLAMA_TIMEOUT_SECONDS: int = 120
    OLLAMA_TEMPERATURE: float = 0.1
    OLLAMA_NUM_PREDICT: int = 2048
    LLM_REVIEW_FINDINGS_ENABLED: bool = True
    LLM_REVIEW_MAX_FINDINGS: int = 4
    REVIEW_INTELLIGENCE_ENABLED: bool = True
    # REVIEW_INTELLIGENCE_REQUIRE_QDRANT removed — Neo4j is the store; use GRAPH_RAG_REQUIRED
    GRAPH_RAG_REQUIRED: bool = True

    # ── Vector Store (Qdrant) — DEPRECATED; kept only for env-var compat ─────
    # These settings are no longer consumed by any active code.
    # Neo4j is the sole vector/graph store. QDRANT_ENABLED must stay False.
    QDRANT_ENABLED: bool = False
    QDRANT_MODE: str = "local"
    QDRANT_URL: str = "http://localhost:6333"
    QDRANT_LOCAL_PATH: str = "./qdrant_storage"
    QDRANT_COLLECTION: str = "code_review_rules"
    QDRANT_REPO_CONTEXT_COLLECTION: str = "repo_context"
    QDRANT_API_KEY: str | None = None
    REPO_CONTEXT_VECTOR_SIZE: int = 256
    REPO_CONTEXT_CHUNK_SIZE: int = 1400
    REPO_CONTEXT_CHUNK_OVERLAP: int = 200
    REPO_CONTEXT_MAX_FILE_BYTES: int = 250_000
    REPO_CONTEXT_MAX_FILES_PER_RUN: int = 5000
    REPO_CONTEXT_ALLOWED_ROOTS: str | None = None
    REPO_CONTEXT_REPO_PATH_MAP: str | None = None
    KB_EXACT_TOP_K: int = 8
    KB_LEXICAL_TOP_K: int = 12
    KB_SEMANTIC_TOP_K: int = 12
    KB_RERANK_TOP_K: int = 8
    KB_CONTEXT_MAX_CHARS: int = 14_000
    KB_CONTEXT_MAX_CHUNKS: int = 8
    KB_CROSS_ENCODER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    KB_RERANK_ENABLED: bool = True

    # ── Object Storage (MinIO / S3) ───────────────────────────────────────────
    OBJECT_STORAGE_ENABLED: bool = False
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "ai-review-artifacts"
    MINIO_SECURE: bool = False

    # ── Chunking Configuration ────────────────────────────────────────────────
    # Code chunking (Hybride: AST pour Python/JS/TS, fixed pour autres)
    CHUNK_CODE_SIZE: int = 1000
    CHUNK_CODE_OVERLAP: int = 100
    CHUNK_CODE_AST_LANGUAGES: str = "python,javascript,typescript"
    CHUNK_CODE_USE_FIXED_FOR_OTHERS: bool = True

    # Documentation chunking
    CHUNK_DOC_SIZE: int = 1800
    CHUNK_DOC_OVERLAP: int = 220

    # PDF chunking
    CHUNK_PDF_SIZE: int = 1800
    CHUNK_PDF_OVERLAP: int = 220
    CHUNK_PDF_USE_SECTIONS: bool = True

    # API docs chunking
    CHUNK_API_SIZE: int = 700
    CHUNK_API_OVERLAP: int = 80

    # ── RAG Agent Configuration ───────────────────────────────────────────────
    RAG_AGENTS_ENABLED: bool = True
    RAG_AGENT_CODE_CONTEXT_ENABLED: bool = True
    RAG_AGENT_DOCUMENTATION_ENABLED: bool = True
    RAG_AGENT_POLICY_RULES_ENABLED: bool = True
    RAG_AGENT_SYNTHESIS_ENABLED: bool = True

    # Agent orchestration
    RAG_ORCHESTRATOR_PARALLEL_AGENTS: bool = True
    RAG_ORCHESTRATOR_MAX_AGENTS_PER_QUERY: int = 3
    RAG_ORCHESTRATOR_TIMEOUT_SECONDS: int = 60

    # ── Qdrant Collections — REMOVED (Neo4j is now the sole vector store) ────
    # These settings are preserved only for backwards env-var compatibility;
    # no code reads them. Remove them once no .env files reference them.

    # ── Anti-Hallucination Configuration ──────────────────────────────────────
    ANTI_HALLUCINATION_REQUIRE_GROUNDING: bool = True
    ANTI_HALLUCINATION_MIN_RELEVANCE_SCORE: float = 0.65
    ANTI_HALLUCINATION_REQUIRE_KB_CITATIONS: bool = True
    ANTI_HALLUCINATION_MAX_FINDINGS_WITHOUT_CITATION: int = 1
    ANTI_HALLUCINATION_MIN_CONFIDENCE: float = 0.70
    ANTI_HALLUCINATION_DISCARD_LOW_CONFIDENCE: bool = True
    ANTI_HALLUCINATION_MAX_CONTEXT_AGE_HOURS: int = 168  # 7 days
    ANTI_HALLUCINATION_CROSS_VALIDATE: bool = True
    ANTI_HALLUCINATION_MIN_CROSS_VALIDATION_SCORE: float = 0.80

    # ── Project Comprehension ─────────────────────────────────────────────────
    PROJECT_COMPREHENSION_ENABLED: bool = True
    PROJECT_COMPREHENSION_AUTO_ONBOARD: bool = True
    PROJECT_COMPREHENSION_MAX_FILES: int = 10000
    PROJECT_COMPREHENSION_MAX_FILE_SIZE: int = 500_000  # 500KB

    # ── HyDE (Hypothetical Document Embeddings) ─────────────────────────────
    HYDE_ENABLED: bool = True
    HYDE_ROUTES: str = "diff_review,code_query"  # comma-separated QueryRoute values
    LANGGRAPH_ANALYSIS_ENABLED: bool = True
    LANGGRAPH_USE_STATEGRAPH: bool = True
    LANGGRAPH_RETRIEVAL_LIMIT: int = 16
    LANGGRAPH_LLM_MAX_FINDINGS: int = 6
    LANGGRAPH_MIN_FINDING_CONFIDENCE: float = 0.55
    LANGGRAPH_REQUIRE_SOURCE_REFERENCES: bool = True
    LANGGRAPH_CACHE_TTL_SECONDS: int = 1800

    NEO4J_ENABLED: bool = True
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "neo4j"
    NEO4J_DATABASE: str = "neo4j"
    NEO4J_MAX_CONNECTION_POOL_SIZE: int = 50
    NEO4J_MAX_CONNECTION_LIFETIME_SECONDS: int = 3600
    NEO4J_CONNECTION_ACQUISITION_TIMEOUT_SECONDS: int = 60
    NEO4J_CONNECTION_TIMEOUT_SECONDS: int = 30
    NEO4J_KEEP_ALIVE: bool = True

    # ── GraphRAG Configuration ────────────────────────────────────────────────
    # LLM Provider Selection
    LLM_PROVIDER: str = "ollama"  # "ollama", "openai", "anthropic"
    ANTHROPIC_API_KEY: str | None = None
    ANTHROPIC_MODEL: str = "claude-sonnet-4-20250514"
    ANTHROPIC_MAX_TOKENS: int = 4096
    ANTHROPIC_TEMPERATURE: float = 0.0
    
    # ── LLM Gateway Configuration ─────────────────────────────────────────────
    # Provider Availability
    OLLAMA_ENABLED: bool = True
    AZURE_OPENAI_API_KEY: str | None = None
    AZURE_OPENAI_ENDPOINT: str | None = None
    AZURE_OPENAI_DEPLOYMENT_NAME: str | None = None
    AZURE_OPENAI_API_VERSION: str = "2024-02-01"
    
    # Rate Limiting (per provider)
    RATE_LIMIT_ANTHROPIC_PER_MINUTE: int = 50
    RATE_LIMIT_OPENAI_PER_MINUTE: int = 60
    RATE_LIMIT_OLLAMA_PER_MINUTE: int = 0  # Unlimited
    RATE_LIMIT_PER_USER_PER_HOUR: int = 100
    
    # Prompt Caching
    PROMPT_CACHE_ENABLED: bool = True
    PROMPT_CACHE_TTL_SECONDS: int = 3600  # 1 hour
    PROMPT_CACHE_MAX_SIZE: int = 10000
    
    # ── Observability Configuration ───────────────────────────────────────────
    # Langfuse LLMOps Platform (optional)
    LANGFUSE_ENABLED: bool = False
    LANGFUSE_PUBLIC_KEY: str | None = None
    LANGFUSE_SECRET_KEY: str | None = None
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"
    LANGFUSE_TIMEOUT_SECONDS: int = 10
    LANGFUSE_RETRY_COUNT: int = 2
    
    # OpenTelemetry Distributed Tracing (optional)
    OTEL_ENABLED: bool = False
    OTEL_SERVICE_NAME: str = "devora-backend"
    OTEL_EXPORTER_TYPE: str = "otlp"  # "otlp", "jaeger", "zipkin"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4317"
    OTEL_SAMPLE_RATE: float = 1.0
    OTEL_RESOURCE_ATTRIBUTES: str | None = None
    OTEL_JAEGER_AGENT_HOST: str = "localhost"
    OTEL_JAEGER_AGENT_PORT: int = 6831
    OTEL_ZIPKIN_ENDPOINT: str = "http://localhost:9411/api/v2/spans"
    
    # LLM Traces Retention
    LLM_TRACES_RETENTION_DAYS: int = 90
    LLM_METRICS_AGGREGATION_INTERVAL_MINUTES: int = 60
    
    # ── Multi-Agent Configuration ─────────────────────────────────────────────
    MULTI_AGENT_ENABLED: bool = True
    MULTI_AGENT_PARALLEL_EXECUTION: bool = True
    MULTI_AGENT_TIMEOUT_SECONDS: int = 120
    MULTI_AGENT_MAX_FINDINGS_PER_AGENT: int = 20
    MULTI_AGENT_DEDUPLICATION_ENABLED: bool = True
    MULTI_AGENT_SIMILARITY_THRESHOLD: float = 0.85
    
    # ── RAGAS Evaluation Configuration ────────────────────────────────────────
    RAGAS_EVALUATION_ENABLED: bool = True
    RAGAS_COMPUTE_ON_TRACE: bool = True  # Compute metrics automatically after each trace
    RAGAS_USE_OLLAMA: bool = True  # Use Ollama local for evaluation (free, CONFIDENTIAL)
    RAGAS_BATCH_SIZE: int = 10  # Process N traces at once for efficiency
    
    # Embedding Configuration
    EMBEDDING_PROVIDER: str = "sentence_transformers"  # "sentence_transformers", "openai", "codebert"
    EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"  # For sentence_transformers
    EMBEDDING_DIMENSION: int = 384  # Matches all-MiniLM-L6-v2
    EMBEDDING_BATCH_SIZE: int = 32
    EMBEDDING_CACHE_ENABLED: bool = True
    EMBEDDING_CACHE_SIZE: int = 10000
    
    # Advanced Chunking Configuration
    CHUNKING_STRATEGY: str = "ast"  # "ast" for Tree-sitter, "fixed" for simple
    CHUNKING_MAX_CHUNK_SIZE: int = 1000
    CHUNKING_MIN_CHUNK_SIZE: int = 100
    CHUNKING_OVERLAP_SIZE: int = 100
    CHUNKING_RESPECT_BOUNDARIES: bool = True  # Don't split functions/classes
    
    # Hybrid Retrieval Configuration
    RETRIEVAL_VECTOR_TOP_K: int = 20
    RETRIEVAL_GRAPH_MAX_DEPTH: int = 2
    RETRIEVAL_COMBINE_METHOD: str = "weighted"  # "weighted", "reciprocal_rank"
    RETRIEVAL_VECTOR_WEIGHT: float = 0.6
    RETRIEVAL_GRAPH_WEIGHT: float = 0.4
    RETRIEVAL_MIN_SIMILARITY_THRESHOLD: float = 0.5
    RETRIEVAL_ENABLE_RERANKING: bool = True
    RETRIEVAL_RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    RETRIEVAL_RERANKER_TOP_K: int = 10
    
    # Knowledge Base Priority Configuration
    KB_PRIORITY_ENABLED: bool = True
    KB_PRIORITY_MIN_SCORE: float = 0.7  # KB chunks below this score are deprioritized
    KB_PRIORITY_BOOST_FACTOR: float = 1.5  # Boost KB scores by this factor
    KB_MAX_CHUNKS_PER_QUERY: int = 10
    REPO_MAX_CHUNKS_PER_QUERY: int = 15
    
    # Auto-fix Configuration
    AUTO_FIX_ENABLED: bool = True
    AUTO_FIX_MAX_SUGGESTIONS: int = 5
    AUTO_FIX_CONFIDENCE_THRESHOLD: float = 0.8
    AUTO_FIX_INCLUDE_EXAMPLES: bool = True
    
    # Analysis History Configuration
    HISTORY_ENABLED: bool = True
    HISTORY_MAX_RUNS_PER_REPO: int = 100
    HISTORY_RETENTION_DAYS: int = 90
    HISTORY_TRACK_REGRESSIONS: bool = True
    
    # Incremental Indexing Configuration
    INCREMENTAL_INDEXING_ENABLED: bool = True
    INCREMENTAL_INDEXING_DIFF_DETECTION: bool = True
    INCREMENTAL_INDEXING_BATCH_SIZE: int = 50

    # ── Redis RAG Cache ───────────────────────────────────────────────────────
    RAG_CACHE_ENABLED: bool = True
    RAG_CACHE_EMBEDDING_TTL: int = 3600        # 1 hour
    RAG_CACHE_RETRIEVAL_TTL: int = 900         # 15 minutes
    RAG_CACHE_REVIEW_TTL: int = 1800           # 30 minutes

    # ── Token Budget ──────────────────────────────────────────────────────────
    RAG_TOKEN_BUDGET_TOTAL: int = 6000
    RAG_TOKEN_BUDGET_CODE_RATIO: float = 0.5
    RAG_TOKEN_BUDGET_KB_RATIO: float = 0.3
    RAG_TOKEN_BUDGET_PROFILE_RATIO: float = 0.1

    # ── LLM Re-ranking ────────────────────────────────────────────────────────
    RAG_LLM_RERANK_ENABLED: bool = False
    RAG_LLM_RERANK_TOP_N: int = 8

    # ── Incremental Indexing ──────────────────────────────────────────────────
    REPO_CONTEXT_INCREMENTAL: bool = True
    
    # ── Pattern Analysis ──────────────────────────────────────────────────────
    PATTERN_ANALYSIS_ENABLED: bool = True
    PATTERN_ANALYSIS_MIN_CONFIDENCE: float = 0.6
    PATTERN_ANALYSIS_MIN_OCCURRENCES: int = 3
    PATTERN_ANALYSIS_MAX_VIOLATIONS: int = 50
    PATTERN_ANALYSIS_TARGET_EXTENSIONS: str = ".js,.ts,.jsx,.tsx,.py"
    PATTERN_ANALYSIS_IGNORE_DIRS: str = "node_modules,dist,build,.git,__pycache__,venv"
    PATTERN_ANALYSIS_CACHE_ENABLED: bool = True
    PATTERN_ANALYSIS_CACHE_TTL_HOURS: int = 24

    # ── Feedback Loop ─────────────────────────────────────────────────────────
    RAG_FEEDBACK_ENABLED: bool = True
    RAG_FEEDBACK_PENALTY_THRESHOLD: int = 3
    RAG_FEEDBACK_PENALTY_SCORE: float = 0.15

    # ── Parent Document ───────────────────────────────────────────────────────
    PARENT_DOCUMENT_ENABLED: bool = True
    PARENT_DOCUMENT_MAX_TOKENS: int = 2000

    # ── Email Notifications ────────────────────────────────────────────────────
    EMAIL_ENABLED: bool = False
    EMAIL_PROVIDER: str = "sendgrid"  # "sendgrid" or "smtp"
    SENDGRID_API_KEY: str | None = None
    SENDGRID_FROM_EMAIL: str = "noreply@ai-code-review.com"
    SENDGRID_FROM_NAME: str = "AI Code Review"
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True
    SMTP_FROM_EMAIL: str | None = None

    # ── Slack Notifications ────────────────────────────────────────────────────
    SLACK_ENABLED: bool = False
    SLACK_WEBHOOK_URL: str | None = None
    SLACK_DEFAULT_CHANNEL: str = "#code-reviews"
    SLACK_BOT_TOKEN: str | None = None

    # ── Microsoft Teams Notifications ─────────────────────────────────────────
    TEAMS_ENABLED: bool = False
    TEAMS_WEBHOOK_URL: str | None = None
    TEAMS_DEFAULT_CHANNEL: str = "Code Reviews"

    # ── Web Push Notifications ────────────────────────────────────────────────
    PUSH_NOTIFICATIONS_ENABLED: bool = False
    VAPID_PUBLIC_KEY: str | None = None
    VAPID_PRIVATE_KEY: str | None = None
    VAPID_SUBJECT: str | None = None

    # ── Observability (Langfuse) ──────────────────────────────────────────
    LANGFUSE_ENABLED: bool = False
    LANGFUSE_PUBLIC_KEY: str | None = None
    LANGFUSE_SECRET_KEY: str | None = None
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"
    LANGFUSE_TIMEOUT_SECONDS: int = 10
    LANGFUSE_RETRY_COUNT: int = 2

    # ── Observability (OpenTelemetry) ─────────────────────────────────────
    OTEL_ENABLED: bool = False
    OTEL_SERVICE_NAME: str = "devora-backend"
    OTEL_EXPORTER_OTLP_ENDPOINT: str = "http://localhost:4317"
    OTEL_EXPORTER_TYPE: str = "otlp"  # "otlp", "jaeger", "zipkin"
    OTEL_SAMPLE_RATE: float = 1.0  # 0.0 - 1.0 (1.0 = trace all requests)
    OTEL_RESOURCE_ATTRIBUTES: str | None = None  # comma-separated key=value pairs
    OTEL_JAEGER_AGENT_HOST: str = "localhost"
    OTEL_JAEGER_AGENT_PORT: int = 6831
    OTEL_ZIPKIN_ENDPOINT: str = "http://localhost:9411/api/v2/spans"

    model_config = SettingsConfigDict(env_file=tuple(_ENV_FILES), extra="ignore")

    @property
    def resolved_celery_broker_url(self) -> str | None:
        if self.CELERY_TASK_ALWAYS_EAGER:
            return "memory://"
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def resolved_celery_result_backend(self) -> str | None:
        if self.CELERY_TASK_ALWAYS_EAGER:
            return "cache+memory://"
        return self.CELERY_RESULT_BACKEND or self.REDIS_URL

    @property
    def repo_context_allowed_roots(self) -> list[Path]:
        raw = self.REPO_CONTEXT_ALLOWED_ROOTS
        if raw is None or not raw.strip():
            return []

        roots: list[Path] = []
        for item in raw.split(","):
            cleaned = item.strip()
            if not cleaned:
                continue
            roots.append(Path(cleaned).expanduser().resolve())
        return roots

    @property
    def repo_context_repo_path_map(self) -> dict[str, str]:
        raw = self.REPO_CONTEXT_REPO_PATH_MAP
        if raw is None or not raw.strip():
            return {}
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        if not isinstance(parsed, dict):
            return {}

        normalized: dict[str, str] = {}
        for key, value in parsed.items():
            if not isinstance(key, str) or not isinstance(value, str):
                continue
            repo_key = key.strip().lower()
            repo_path = value.strip()
            if not repo_key or not repo_path:
                continue
            normalized[repo_key] = repo_path
        return normalized

    @property
    def admin_emails(self) -> set[str]:
        raw = self.ADMIN_EMAILS
        if raw is None or not raw.strip():
            return set()
        return {item.strip().lower() for item in raw.split(",") if item.strip()}

    @property
    def cors_allowed_origins(self) -> list[str]:
        defaults = [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost",
            "https://localhost",
            "capacitor://localhost",
            "ionic://localhost",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
        ]
        raw = self.CORS_ALLOWED_ORIGINS
        if raw is None or not raw.strip():
            return defaults

        configured = [item.strip() for item in raw.split(",") if item.strip()]
        return list(dict.fromkeys([*defaults, *configured]))

    @property
    def clean_code_excluded_repos(self) -> set[str]:
        raw = self.CLEAN_CODE_EXCLUDED_REPOS
        if raw is None or not raw.strip():
            return set()
        return {item.strip().lower() for item in raw.split(",") if item.strip()}

    @property
    def hyde_routes(self) -> list[str]:
        """Routes where HyDE expansion is applied."""
        raw = self.HYDE_ROUTES
        if not raw or not raw.strip():
            return ["diff_review", "code_query"]
        return [route.strip().lower() for route in raw.split(",") if route.strip()]

    @property
    def chunk_code_ast_languages(self) -> list[str]:
        """Languages that should use AST-aware chunking."""
        raw = self.CHUNK_CODE_AST_LANGUAGES
        if not raw or not raw.strip():
            return ["python", "javascript", "typescript"]
        return [lang.strip().lower() for lang in raw.split(",") if lang.strip()]

    @property
    def pattern_analysis_target_extensions(self) -> list[str]:
        """File extensions to analyze for design patterns."""
        raw = self.PATTERN_ANALYSIS_TARGET_EXTENSIONS
        if not raw or not raw.strip():
            return [".js", ".ts", ".jsx", ".tsx", ".py"]
        return [ext.strip() for ext in raw.split(",") if ext.strip()]
    
    @property
    def pattern_analysis_ignore_dirs(self) -> list[str]:
        """Directories to ignore during pattern analysis."""
        raw = self.PATTERN_ANALYSIS_IGNORE_DIRS
        if not raw or not raw.strip():
            return ["node_modules", "dist", "build", ".git", "__pycache__", "venv"]
        return [d.strip() for d in raw.split(",") if d.strip()]


settings = Settings()

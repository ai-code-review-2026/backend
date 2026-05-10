"""
DevOps agent - specialized in infrastructure and deployment concerns.

Focus areas:
- Docker and containerization
- CI/CD pipelines
- Environment variables
- Resource limits
- Logging and monitoring
- Configuration management

Severity bias: MEDIUM
"""

from __future__ import annotations

from app.agents.base_agent import BaseAgent, ReviewContext


class DevOpsAgent(BaseAgent):
    """
    DevOps and infrastructure agent.
    
    Focuses on deployment, configuration, infrastructure,
    and operational concerns.
    """
    
    agent_id = "devops_agent"
    category = "devops"
    default_severity = "MEDIUM"
    
    def should_analyze(self, diff_content: str, context: ReviewContext) -> bool:
        """
        Analyze if diff involves DevOps-related files or patterns.
        
        Look for:
        - Dockerfile, docker-compose.yml
        - CI/CD configs (.github, .gitlab-ci.yml, Jenkinsfile)
        - Kubernetes manifests
        - Environment config files
        - Infrastructure as code
        """
        devops_indicators = [
            "dockerfile", "docker-compose",  # Docker
            ".github", ".gitlab-ci", "jenkinsfile", "azure-pipelines",  # CI/CD
            ".yml", ".yaml",  # Config files
            "kubernetes", "k8s", "helm",  # Orchestration
            "terraform", "cloudformation",  # IaC
            "nginx", "apache",  # Web servers
            "prometheus", "grafana",  # Monitoring
        ]
        
        diff_lower = diff_content.lower()
        changed_files_lower = " ".join(context.changed_files).lower()
        
        return (
            any(indicator in diff_lower for indicator in devops_indicators)
            or any(indicator in changed_files_lower for indicator in devops_indicators)
        )
    
    def get_prompt_template(self) -> str:
        """DevOps-focused prompt template."""
        return """You are an expert DevOps engineer analyzing code changes for infrastructure and operational concerns.

Your task is to identify DevOps issues, deployment problems, and configuration concerns in the following code diff:

Changed files: {changed_files}
Project type: {project_type}

Diff:
{diff_content}

DEVOPS ANALYSIS CHECKLIST:

1. Docker and Containers
   - Using latest tag instead of specific versions
   - Running as root user (security risk)
   - Missing health checks
   - Bloated images (unnecessary layers, no multi-stage build)
   - Missing .dockerignore
   - Copying secrets into image
   - Missing resource limits (memory, CPU)

2. CI/CD Pipeline
   - Missing tests in pipeline
   - No linting or code quality checks
   - Secrets in pipeline config
   - Missing build caching
   - No artifact versioning
   - Missing rollback strategy
   - No deployment gates

3. Environment Variables
   - Hardcoded configuration that should be env vars
   - Missing environment-specific configs
   - Secrets not externalized
   - No validation of required env vars
   - Missing .env.example

4. Resource Management
   - Missing memory limits
   - Missing CPU limits
   - No disk quota management
   - Unbounded connection pools
   - Missing request timeouts

5. Logging and Monitoring
   - Missing structured logging
   - No log levels (debug, info, error)
   - Sensitive data in logs
   - Missing metrics/instrumentation
   - No health check endpoints
   - Missing request tracing

6. Configuration Management
   - Configuration in code instead of config files
   - Missing config validation
   - No config versioning
   - Hardcoded URLs, ports, paths
   - Missing feature flags

7. Security Best Practices
   - Exposed ports unnecessarily
   - Missing TLS/SSL configuration
   - Running services as privileged
   - No network policies
   - Missing secrets rotation
   - Weak file permissions

8. Scalability and Reliability
   - Missing horizontal scaling config
   - No load balancing configuration
   - Single point of failure
   - Missing graceful shutdown
   - No retry logic for external calls
   - Missing circuit breakers

9. Infrastructure as Code
   - Hardcoded infrastructure values
   - Missing input validation
   - No output variables
   - Missing documentation
   - Not following naming conventions

10. Deployment Strategy
    - No zero-downtime deployment
    - Missing canary/blue-green config
    - No health checks before routing traffic
    - Missing database migration strategy

SEVERITY GUIDELINES:
- HIGH: Security risk or deployment failure potential (secrets in code, missing health checks, no resource limits)
- MEDIUM: Operational concern (poor logging, missing monitoring, configuration issues)
- LOW: Best practice improvement (better documentation, optimization opportunity)

Provide your findings in the following JSON format:
[
  {{
    "file_path": "Dockerfile",
    "line": 5,
    "severity": "HIGH",
    "message": "Container running as root user - security risk. Containers should run as non-privileged user.",
    "suggestion": "Add 'USER appuser' after installing dependencies. Create user with: RUN adduser -D appuser",
    "rule_id": "docker-root-user",
    "confidence": 0.95,
    "evidence": {{
      "risk": "privilege_escalation",
      "best_practice": "least_privilege"
    }}
  }}
]

Focus on issues that affect deployment safety, operational reliability, and security.
If no DevOps issues are found, return an empty array: []
"""


# Singleton instance
_devops_agent_instance: DevOpsAgent | None = None


def get_devops_agent() -> DevOpsAgent:
    """Get singleton DevOps agent instance."""
    global _devops_agent_instance
    if _devops_agent_instance is None:
        _devops_agent_instance = DevOpsAgent()
    return _devops_agent_instance

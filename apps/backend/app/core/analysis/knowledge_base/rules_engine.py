"""
Rules Engine for Knowledge Base

Extracts, validates, and applies rules from KB documents.

Rule types:
- Static analysis rules (code quality, complexity)
- Security rules (vulnerabilities, secrets)
- Style rules (formatting, naming conventions)
- Architecture rules (dependency constraints, layer violations)
- Best practice rules (patterns, anti-patterns)

Rules can be:
- Declarative (YAML/JSON definitions)
- Extracted from markdown documentation
- Learned from code examples
- Imported from external tools (ESLint, Semgrep, etc.)

Graph representation:
- (Rule)-[:APPLIES_TO]->(Language|Framework|FileType)
- (Rule)-[:DEFINED_IN]->(KBDocument)
- (Rule)-[:SUPERSEDES]->(Rule) # Version history
- (Finding)-[:VIOLATES]->(Rule)
- (Finding)-[:SUGGESTS]->(AutoFix)
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class RuleType(str, Enum):
    """Types of rules."""
    STATIC_ANALYSIS = "static_analysis"
    SECURITY = "security"
    STYLE = "style"
    ARCHITECTURE = "architecture"
    BEST_PRACTICE = "best_practice"
    PERFORMANCE = "performance"
    TESTING = "testing"
    DOCUMENTATION = "documentation"


class RuleSeverity(str, Enum):
    """Severity levels for rule violations."""
    CRITICAL = "critical"  # Must fix
    HIGH = "high"  # Should fix soon
    MEDIUM = "medium"  # Should fix eventually
    LOW = "low"  # Nice to fix
    INFO = "info"  # Informational only


class RuleScope(str, Enum):
    """Scope where rule applies."""
    FILE = "file"
    FUNCTION = "function"
    CLASS = "class"
    MODULE = "module"
    PROJECT = "project"


class Rule(BaseModel):
    """Rule definition."""
    id: UUID = Field(default_factory=uuid4)
    organization_id: UUID
    project_id: Optional[UUID] = None  # None = org-wide
    document_id: Optional[UUID] = None  # Source KB document
    
    name: str
    description: str
    rule_type: RuleType
    severity: RuleSeverity
    scope: RuleScope
    
    # Applicability
    languages: list[str] = Field(default_factory=list)  # e.g., ["python", "typescript"]
    frameworks: list[str] = Field(default_factory=list)  # e.g., ["fastapi", "react"]
    file_patterns: list[str] = Field(default_factory=list)  # e.g., ["*.py", "src/**/*.ts"]
    
    # Detection
    pattern: Optional[str] = None  # Regex or AST pattern
    example_violation: Optional[str] = None  # Code example
    example_correct: Optional[str] = None  # Fixed code example
    
    # Metadata
    tags: list[str] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)  # URLs to docs
    enabled: bool = True
    
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Auto-fix
    auto_fixable: bool = False
    fix_template: Optional[str] = None  # Template for auto-fix


class RuleExtractor:
    """Extract rules from KB documents."""
    
    def extract_from_markdown(self, content: str) -> list[dict[str, Any]]:
        """
        Extract rules from markdown documentation.
        
        Looks for patterns like:
        - "MUST", "MUST NOT", "SHOULD", "SHOULD NOT" (RFC 2119)
        - Code examples with ✅ / ❌ markers
        - Explicit rule definitions
        
        Returns:
            List of rule definitions (dicts)
        """
        rules = []
        lines = content.split("\n")
        
        # Pattern 1: RFC 2119 keywords
        rfc_keywords = {
            "MUST": RuleSeverity.CRITICAL,
            "MUST NOT": RuleSeverity.CRITICAL,
            "REQUIRED": RuleSeverity.CRITICAL,
            "SHALL": RuleSeverity.HIGH,
            "SHALL NOT": RuleSeverity.HIGH,
            "SHOULD": RuleSeverity.MEDIUM,
            "SHOULD NOT": RuleSeverity.MEDIUM,
            "RECOMMENDED": RuleSeverity.MEDIUM,
            "MAY": RuleSeverity.LOW,
            "OPTIONAL": RuleSeverity.LOW,
        }
        
        for i, line in enumerate(lines):
            for keyword, severity in rfc_keywords.items():
                if keyword in line:
                    # Extract rule description
                    description = line.strip()
                    
                    # Try to get code example from next lines
                    example = self._extract_code_block(lines, i + 1)
                    
                    rules.append({
                        "description": description,
                        "severity": severity,
                        "rule_type": RuleType.BEST_PRACTICE,
                        "example_violation": example,
                    })
                    break
        
        # Pattern 2: Explicit rule sections
        # Look for headings like "## Rules", "## Coding Standards"
        in_rules_section = False
        current_rule = None
        
        for i, line in enumerate(lines):
            if re.match(r"^##\s+(Rules|Coding Standards|Best Practices)", line, re.IGNORECASE):
                in_rules_section = True
                continue
            
            if in_rules_section:
                # New rule (bullet point or numbered list)
                if re.match(r"^[\*\-\d]+\.\s+", line):
                    if current_rule:
                        rules.append(current_rule)
                    
                    current_rule = {
                        "description": line.strip(),
                        "severity": RuleSeverity.MEDIUM,
                        "rule_type": RuleType.BEST_PRACTICE,
                    }
                
                # End of rules section
                elif re.match(r"^##\s+", line):
                    if current_rule:
                        rules.append(current_rule)
                        current_rule = None
                    in_rules_section = False
        
        if current_rule:
            rules.append(current_rule)
        
        # Pattern 3: Code examples with markers
        # Look for ✅ Good / ❌ Bad patterns
        good_examples = []
        bad_examples = []
        
        for i, line in enumerate(lines):
            if "✅" in line or "Good:" in line or "Correct:" in line:
                example = self._extract_code_block(lines, i + 1)
                if example:
                    good_examples.append(example)
            
            elif "❌" in line or "Bad:" in line or "Incorrect:" in line:
                example = self._extract_code_block(lines, i + 1)
                if example:
                    bad_examples.append(example)
        
        # Pair good/bad examples into rules
        for bad, good in zip(bad_examples, good_examples):
            rules.append({
                "description": "Code style violation (from example)",
                "severity": RuleSeverity.MEDIUM,
                "rule_type": RuleType.STYLE,
                "example_violation": bad,
                "example_correct": good,
            })
        
        return rules
    
    def _extract_code_block(self, lines: list[str], start_idx: int) -> Optional[str]:
        """Extract code block starting from start_idx."""
        if start_idx >= len(lines):
            return None
        
        # Look for ``` code fence
        for i in range(start_idx, min(start_idx + 10, len(lines))):
            if lines[i].strip().startswith("```"):
                # Found code block
                code_lines = []
                for j in range(i + 1, len(lines)):
                    if lines[j].strip().startswith("```"):
                        return "\n".join(code_lines)
                    code_lines.append(lines[j])
        
        return None
    
    def extract_from_yaml(self, content: str) -> list[dict[str, Any]]:
        """
        Extract rules from YAML rule definitions.
        
        Expected format:
        ```yaml
        rules:
          - name: "No bare except"
            description: "Avoid bare except clauses"
            type: static_analysis
            severity: high
            languages: [python]
            pattern: "except:\\s*$"
            example_violation: |
              try:
                  risky()
              except:
                  pass
            example_correct: |
              try:
                  risky()
              except Exception as e:
                  logger.error(f"Error: {e}")
        ```
        """
        import yaml
        
        try:
            data = yaml.safe_load(content)
            
            if not data or "rules" not in data:
                return []
            
            rules = []
            for rule_def in data["rules"]:
                # Convert YAML format to Rule model format
                rules.append({
                    "name": rule_def.get("name", "Unnamed Rule"),
                    "description": rule_def.get("description", ""),
                    "rule_type": rule_def.get("type", "best_practice"),
                    "severity": rule_def.get("severity", "medium"),
                    "scope": rule_def.get("scope", "file"),
                    "languages": rule_def.get("languages", []),
                    "frameworks": rule_def.get("frameworks", []),
                    "file_patterns": rule_def.get("file_patterns", []),
                    "pattern": rule_def.get("pattern"),
                    "example_violation": rule_def.get("example_violation"),
                    "example_correct": rule_def.get("example_correct"),
                    "tags": rule_def.get("tags", []),
                    "references": rule_def.get("references", []),
                    "auto_fixable": rule_def.get("auto_fixable", False),
                    "fix_template": rule_def.get("fix_template"),
                })
            
            return rules
        
        except Exception as e:
            logger.error(f"YAML parse error: {e}")
            return []


class RulesEngine:
    """
    Rules engine for knowledge base.
    
    Features:
    - Extract rules from KB documents (markdown, YAML, JSON)
    - Store rules in graph with rich relationships
    - Match rules to code findings
    - Generate auto-fix suggestions based on rules
    - Track rule evolution and versioning
    
    Usage:
        engine = RulesEngine(graph_manager)
        
        # Extract rules from a KB document
        rules = await engine.extract_rules_from_document(doc_id)
        
        # Apply rules to findings
        await engine.apply_rules_to_finding(finding_id)
        
        # Get rules applicable to a file
        rules = await engine.get_applicable_rules(
            language="python",
            file_path="src/main.py"
        )
    """
    
    def __init__(self, graph_manager: Any):
        self.graph_manager = graph_manager
        self.extractor = RuleExtractor()
    
    async def extract_rules_from_document(
        self,
        document_id: UUID,
        organization_id: UUID,
        project_id: Optional[UUID] = None,
    ) -> list[Rule]:
        """
        Extract rules from a KB document.
        
        Args:
            document_id: KB document UUID
            organization_id: Organization UUID
            project_id: Optional project UUID
            
        Returns:
            List of extracted rules
        """
        logger.info(f"Extracting rules from document {document_id}")
        
        # Fetch document from graph
        doc_data = await self.graph_manager.get_node("KBDocument", str(document_id))
        
        if not doc_data:
            logger.error(f"Document {document_id} not found")
            return []
        
        # Get document content from chunks
        chunks = await self.graph_manager.query(
            """
            MATCH (d:KBDocument {id: $doc_id})-[:CONTAINS]->(c:KBChunk)
            RETURN c.content as content
            ORDER BY c.chunk_index
            """,
            {"doc_id": str(document_id)}
        )
        
        content = "\n\n".join([chunk["content"] for chunk in chunks])
        
        # Determine extraction method based on document type
        source_path = doc_data.get("source_path", "")
        
        if source_path.endswith((".yaml", ".yml")):
            rule_defs = self.extractor.extract_from_yaml(content)
        elif source_path.endswith(".md"):
            rule_defs = self.extractor.extract_from_markdown(content)
        else:
            # Try markdown extraction as fallback
            rule_defs = self.extractor.extract_from_markdown(content)
        
        logger.info(f"Extracted {len(rule_defs)} rules from document")
        
        # Create Rule objects
        rules = []
        for rule_def in rule_defs:
            rule = Rule(
                organization_id=organization_id,
                project_id=project_id,
                document_id=document_id,
                name=rule_def.get("name", rule_def["description"][:100]),
                description=rule_def["description"],
                rule_type=RuleType(rule_def.get("rule_type", "best_practice")),
                severity=RuleSeverity(rule_def.get("severity", "medium")),
                scope=RuleScope(rule_def.get("scope", "file")),
                languages=rule_def.get("languages", []),
                frameworks=rule_def.get("frameworks", []),
                file_patterns=rule_def.get("file_patterns", []),
                pattern=rule_def.get("pattern"),
                example_violation=rule_def.get("example_violation"),
                example_correct=rule_def.get("example_correct"),
                tags=rule_def.get("tags", []),
                references=rule_def.get("references", []),
                auto_fixable=rule_def.get("auto_fixable", False),
                fix_template=rule_def.get("fix_template"),
            )
            rules.append(rule)
        
        # Store rules in graph
        await self._store_rules_in_graph(rules)
        
        return rules
    
    async def _store_rules_in_graph(self, rules: list[Rule]) -> None:
        """Store rules in Neo4j graph."""
        for rule in rules:
            # Create rule node
            rule_node = {
                "id": str(rule.id),
                "organization_id": str(rule.organization_id),
                "project_id": str(rule.project_id) if rule.project_id else None,
                "document_id": str(rule.document_id) if rule.document_id else None,
                "name": rule.name,
                "description": rule.description,
                "rule_type": rule.rule_type,
                "severity": rule.severity,
                "scope": rule.scope,
                "languages": rule.languages,
                "frameworks": rule.frameworks,
                "file_patterns": rule.file_patterns,
                "pattern": rule.pattern,
                "example_violation": rule.example_violation,
                "example_correct": rule.example_correct,
                "tags": rule.tags,
                "references": rule.references,
                "enabled": rule.enabled,
                "auto_fixable": rule.auto_fixable,
                "fix_template": rule.fix_template,
                "created_at": rule.created_at.isoformat(),
                "updated_at": rule.updated_at.isoformat(),
            }
            
            await self.graph_manager.upsert_node("Rule", rule_node)
            
            # Link to organization
            await self.graph_manager.upsert_relationship(
                from_label="Organization",
                from_id=str(rule.organization_id),
                to_label="Rule",
                to_id=str(rule.id),
                rel_type="HAS_RULE",
                properties={"created_at": datetime.now(timezone.utc).isoformat()},
            )
            
            # Link to document
            if rule.document_id:
                await self.graph_manager.upsert_relationship(
                    from_label="KBDocument",
                    from_id=str(rule.document_id),
                    to_label="Rule",
                    to_id=str(rule.id),
                    rel_type="DEFINES",
                    properties={"created_at": datetime.now(timezone.utc).isoformat()},
                )
            
            # Link to languages
            for lang in rule.languages:
                # Create language node if not exists
                await self.graph_manager.upsert_node(
                    "Language",
                    {"name": lang, "id": lang}
                )
                
                await self.graph_manager.upsert_relationship(
                    from_label="Rule",
                    from_id=str(rule.id),
                    to_label="Language",
                    to_id=lang,
                    rel_type="APPLIES_TO",
                    properties={},
                )
        
        logger.info(f"Stored {len(rules)} rules in graph")
    
    async def get_applicable_rules(
        self,
        organization_id: UUID,
        language: Optional[str] = None,
        framework: Optional[str] = None,
        file_path: Optional[str] = None,
        project_id: Optional[UUID] = None,
    ) -> list[Rule]:
        """
        Get rules applicable to given context.
        
        Args:
            organization_id: Organization UUID
            language: Programming language (e.g., "python")
            framework: Framework (e.g., "fastapi")
            file_path: File path to match against patterns
            project_id: Optional project UUID
            
        Returns:
            List of applicable rules
        """
        # Build Cypher query
        conditions = [
            "r.organization_id = $org_id",
            "r.enabled = true",
        ]
        params = {"org_id": str(organization_id)}
        
        if project_id:
            conditions.append("(r.project_id = $proj_id OR r.project_id IS NULL)")
            params["proj_id"] = str(project_id)
        
        if language:
            conditions.append("$lang IN r.languages OR size(r.languages) = 0")
            params["lang"] = language
        
        if framework:
            conditions.append("$framework IN r.frameworks OR size(r.frameworks) = 0")
            params["framework"] = framework
        
        query = f"""
        MATCH (r:Rule)
        WHERE {" AND ".join(conditions)}
        RETURN r
        ORDER BY r.severity DESC
        """
        
        results = await self.graph_manager.query(query, params)
        
        # Convert to Rule objects
        rules = []
        for row in results:
            rule_data = row["r"]
            rule = Rule(
                id=UUID(rule_data["id"]),
                organization_id=UUID(rule_data["organization_id"]),
                project_id=UUID(rule_data["project_id"]) if rule_data.get("project_id") else None,
                document_id=UUID(rule_data["document_id"]) if rule_data.get("document_id") else None,
                name=rule_data["name"],
                description=rule_data["description"],
                rule_type=RuleType(rule_data["rule_type"]),
                severity=RuleSeverity(rule_data["severity"]),
                scope=RuleScope(rule_data["scope"]),
                languages=rule_data.get("languages", []),
                frameworks=rule_data.get("frameworks", []),
                file_patterns=rule_data.get("file_patterns", []),
                pattern=rule_data.get("pattern"),
                example_violation=rule_data.get("example_violation"),
                example_correct=rule_data.get("example_correct"),
                tags=rule_data.get("tags", []),
                references=rule_data.get("references", []),
                enabled=rule_data["enabled"],
                auto_fixable=rule_data.get("auto_fixable", False),
                fix_template=rule_data.get("fix_template"),
                created_at=datetime.fromisoformat(rule_data["created_at"]),
                updated_at=datetime.fromisoformat(rule_data["updated_at"]),
            )
            rules.append(rule)
        
        # Filter by file_path patterns if provided
        if file_path:
            import fnmatch
            filtered_rules = []
            for rule in rules:
                if not rule.file_patterns:
                    # No pattern = applies to all files
                    filtered_rules.append(rule)
                else:
                    # Check if file matches any pattern
                    if any(fnmatch.fnmatch(file_path, pattern) for pattern in rule.file_patterns):
                        filtered_rules.append(rule)
            rules = filtered_rules
        
        logger.info(f"Found {len(rules)} applicable rules")
        return rules
    
    async def apply_rules_to_finding(
        self,
        finding_id: UUID,
        organization_id: UUID,
    ) -> list[Rule]:
        """
        Apply rules to a finding and create VIOLATES relationships.
        
        Args:
            finding_id: Finding UUID
            organization_id: Organization UUID
            
        Returns:
            List of violated rules
        """
        logger.info(f"Applying rules to finding {finding_id}")
        
        # Get finding details
        finding_data = await self.graph_manager.get_node("Finding", str(finding_id))
        
        if not finding_data:
            logger.error(f"Finding {finding_id} not found")
            return []
        
        # Get applicable rules
        rules = await self.get_applicable_rules(
            organization_id=organization_id,
            language=finding_data.get("language"),
            file_path=finding_data.get("file_path"),
        )
        
        # Match rules to finding
        violated_rules = []
        for rule in rules:
            # Simple matching: check if rule pattern matches finding code
            if rule.pattern and finding_data.get("code_snippet"):
                if re.search(rule.pattern, finding_data["code_snippet"]):
                    violated_rules.append(rule)
                    
                    # Create VIOLATES relationship
                    await self.graph_manager.upsert_relationship(
                        from_label="Finding",
                        from_id=str(finding_id),
                        to_label="Rule",
                        to_id=str(rule.id),
                        rel_type="VIOLATES",
                        properties={
                            "detected_at": datetime.now(timezone.utc).isoformat(),
                        },
                    )
        
        logger.info(f"Found {len(violated_rules)} rule violations")
        return violated_rules

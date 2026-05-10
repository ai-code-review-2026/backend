"""
Pattern Comparator - Compares Pull Request code against extracted legacy patterns.

This module takes a PR diff and compares it against the detected patterns
from the legacy codebase to identify violations and inconsistencies.
"""

import logging
import re
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, field

from app.core.design_patterns.pattern_extractor import (
    CodeElement,
    DesignPattern,
    PatternExtractor,
)

logger = logging.getLogger(__name__)


@dataclass
class PatternViolation:
    """Represents a violation of an established pattern."""
    violation_id: str
    pattern: DesignPattern
    severity: str  # "critical", "high", "medium", "low"
    title: str
    description: str
    file_path: str
    line_number: int
    diff_snippet: str
    expected_behavior: str
    actual_behavior: str
    recommendation: str
    evidence: List[str] = field(default_factory=list)
    score_impact: float = 0.0  # How much this violates the pattern (0-1)


class PatternComparator:
    """Compares PR code against legacy patterns."""
    
    def __init__(self):
        self.pattern_extractor = PatternExtractor()
    
    def compare_pr_with_patterns(
        self,
        pr_diff: str,
        pr_files: Dict[str, str],  # file_path -> file_content
        legacy_patterns: List[DesignPattern],
        repository_path: str,
    ) -> List[PatternViolation]:
        """
        Compare PR changes against legacy patterns.
        
        Args:
            pr_diff: Git diff text
            pr_files: Dictionary of modified files and their content
            legacy_patterns: List of patterns extracted from legacy code
            repository_path: Path to repository
        
        Returns:
            List of pattern violations
        """
        logger.info(f"Comparing PR against {len(legacy_patterns)} legacy patterns")
        
        violations = []
        
        # Analyze each modified file
        for file_path, content in pr_files.items():
            file_violations = self._analyze_file_against_patterns(
                file_path=file_path,
                content=content,
                pr_diff=pr_diff,
                legacy_patterns=legacy_patterns,
            )
            violations.extend(file_violations)
        
        # Analyze architectural violations
        architectural_violations = self._check_architectural_patterns(
            pr_files=pr_files,
            legacy_patterns=legacy_patterns,
        )
        violations.extend(architectural_violations)
        
        logger.info(f"Found {len(violations)} pattern violations")
        
        return violations
    
    def _analyze_file_against_patterns(
        self,
        file_path: str,
        content: str,
        pr_diff: str,
        legacy_patterns: List[DesignPattern],
    ) -> List[PatternViolation]:
        """Analyze a single file against patterns."""
        violations = []
        
        # Check Route-Controller-Service-Model pattern
        if self._is_route_file(file_path):
            violations.extend(self._check_route_pattern_violations(
                file_path, content, pr_diff, legacy_patterns
            ))
        
        # Check middleware chain pattern
        if self._is_route_file(file_path):
            violations.extend(self._check_middleware_violations(
                file_path, content, pr_diff, legacy_patterns
            ))
        
        # Check React component pattern
        if self._is_react_file(file_path):
            violations.extend(self._check_react_pattern_violations(
                file_path, content, pr_diff, legacy_patterns
            ))
        
        # Check API client pattern
        if self._is_react_file(file_path):
            violations.extend(self._check_api_client_violations(
                file_path, content, pr_diff, legacy_patterns
            ))
        
        # Check Mongoose model pattern
        if self._is_model_file(file_path):
            violations.extend(self._check_model_pattern_violations(
                file_path, content, pr_diff, legacy_patterns
            ))
        
        return violations
    
    def _check_route_pattern_violations(
        self,
        file_path: str,
        content: str,
        pr_diff: str,
        legacy_patterns: List[DesignPattern],
    ) -> List[PatternViolation]:
        """Check violations of Route-Controller-Service-Model pattern."""
        violations = []
        
        # Find the pattern
        route_pattern = next(
            (p for p in legacy_patterns if p.pattern_id == "PAT-ARCH-001"),
            None
        )
        
        if not route_pattern or route_pattern.confidence < 0.5:
            return violations  # Pattern not established
        
        # Extract route definitions
        route_regex = r"router\.(get|post|put|delete|patch)\s*\(\s*['\"](.+?)['\"]\s*,\s*(.+?)\)"
        
        for match in re.finditer(route_regex, content):
            method = match.group(1)
            path = match.group(2)
            handlers = match.group(3)
            line_num = content[:match.start()].count('\n') + 1
            
            # Check if route contains direct logic instead of calling controller
            if self._route_contains_direct_logic(handlers, content, match.start()):
                violations.append(PatternViolation(
                    violation_id=f"PAT-VIOL-001-{line_num}",
                    pattern=route_pattern,
                    severity="high",
                    title="Route contains direct business logic",
                    description=f"The route {method.upper()} {path} contains business logic directly instead of delegating to a controller.",
                    file_path=file_path,
                    line_number=line_num,
                    diff_snippet=self._extract_diff_snippet(pr_diff, file_path, line_num),
                    expected_behavior="Route should call a controller function: router.post('/path', controller.method)",
                    actual_behavior="Route contains inline async function with business logic",
                    recommendation=f"Extract logic to a controller:\n"
                                  f"1. Create {path.split('/')[1]}.controller.js\n"
                                  f"2. Move logic to controller function\n"
                                  f"3. Update route: router.{method}('{path}', {path.split('/')[1]}Controller.{method})",
                    evidence=route_pattern.evidence[:3],
                    score_impact=0.7,
                ))
        
        # Check if controller is called but doesn't exist
        violations.extend(self._check_missing_controller(
            file_path, content, pr_diff, route_pattern
        ))
        
        return violations
    
    def _route_contains_direct_logic(
        self,
        handlers: str,
        content: str,
        route_start_pos: int,
    ) -> bool:
        """Check if route has inline business logic."""
        # Look for inline async function
        if "async" in handlers and "(" in handlers:
            return True
        
        # Look for inline arrow function
        if "=>" in handlers:
            # Check if it's just a simple middleware or actual logic
            next_200_chars = content[route_start_pos:route_start_pos + 200]
            
            # Signs of business logic
            business_logic_indicators = [
                "await", "Model.find", "Model.create", "Model.update",
                "jwt.sign", "bcrypt", "req.body", "res.json", "res.send"
            ]
            
            return any(indicator in next_200_chars for indicator in business_logic_indicators)
        
        return False
    
    def _check_missing_controller(
        self,
        file_path: str,
        content: str,
        pr_diff: str,
        route_pattern: DesignPattern,
    ) -> List[PatternViolation]:
        """Check if controller is referenced but doesn't exist."""
        violations = []
        
        # Extract controller imports
        import_regex = r"import\s+.*?from\s+['\"](.+?controller.+?)['\"']"
        imports = re.findall(import_regex, content, re.IGNORECASE)
        
        # Extract controller calls in routes
        controller_calls = re.findall(r"(\w+Controller)\.(\w+)", content)
        
        # If controllers are referenced but not imported
        referenced_controllers = set(call[0] for call in controller_calls)
        imported_controllers = set()
        
        for imp in imports:
            # Extract controller name from import path
            parts = imp.split('/')
            for part in parts:
                if 'controller' in part.lower():
                    controller_name = part.replace('.js', '').replace('.ts', '')
                    imported_controllers.add(controller_name)
        
        missing_controllers = referenced_controllers - imported_controllers
        
        if missing_controllers:
            violations.append(PatternViolation(
                violation_id=f"PAT-VIOL-002",
                pattern=route_pattern,
                severity="critical",
                title="Controller referenced but not imported",
                description=f"Controllers {missing_controllers} are used but not imported.",
                file_path=file_path,
                line_number=1,
                diff_snippet="",
                expected_behavior="Controller should be imported before use",
                actual_behavior=f"Controllers {missing_controllers} are not imported",
                recommendation=f"Add import: import {{ {', '.join(missing_controllers)} }} from './controllers/...'",
                evidence=route_pattern.evidence[:3],
                score_impact=1.0,
            ))
        
        return violations
    
    def _check_middleware_violations(
        self,
        file_path: str,
        content: str,
        pr_diff: str,
        legacy_patterns: List[DesignPattern],
    ) -> List[PatternViolation]:
        """Check violations of middleware chain pattern."""
        violations = []
        
        # Find middleware pattern
        middleware_pattern = next(
            (p for p in legacy_patterns if p.pattern_id == "PAT-SEC-001"),
            None
        )
        
        if not middleware_pattern or middleware_pattern.confidence < 0.5:
            return violations
        
        # Find sensitive routes (POST, PUT, DELETE, admin routes)
        sensitive_route_regex = r"router\.(post|put|delete|patch)\s*\(\s*['\"](.+?)['\"]\s*,\s*([^)]+)\)"
        
        for match in re.finditer(sensitive_route_regex, content):
            method = match.group(1)
            path = match.group(2)
            handlers = match.group(3)
            line_num = content[:match.start()].count('\n') + 1
            
            # Check if route is sensitive (admin, delete, update, etc.)
            is_sensitive = any(keyword in path.lower() for keyword in [
                "admin", "delete", "update", "create", "modify", "remove"
            ]) or method in ["delete", "put", "patch"]
            
            if is_sensitive:
                # Check for auth middleware
                has_auth = any(keyword in handlers.lower() for keyword in [
                    "auth", "authenticate", "isauth", "verify"
                ])
                
                # Check for role/permission middleware
                has_authz = any(keyword in handlers.lower() for keyword in [
                    "role", "permission", "admin", "authorize", "isadmin"
                ])
                
                if not has_auth:
                    violations.append(PatternViolation(
                        violation_id=f"PAT-VIOL-003-{line_num}",
                        pattern=middleware_pattern,
                        severity="critical",
                        title="Sensitive route missing authentication middleware",
                        description=f"The route {method.upper()} {path} is sensitive but has no authentication middleware.",
                        file_path=file_path,
                        line_number=line_num,
                        diff_snippet=self._extract_diff_snippet(pr_diff, file_path, line_num),
                        expected_behavior="Sensitive routes should have authMiddleware",
                        actual_behavior="No authentication middleware detected",
                        recommendation=f"Add middleware: router.{method}('{path}', authMiddleware, {handlers})",
                        evidence=middleware_pattern.evidence[:3],
                        score_impact=1.0,
                    ))
                
                if not has_authz and any(kw in path.lower() for kw in ["admin", "delete"]):
                    violations.append(PatternViolation(
                        violation_id=f"PAT-VIOL-004-{line_num}",
                        pattern=middleware_pattern,
                        severity="critical",
                        title="Admin route missing authorization middleware",
                        description=f"The route {method.upper()} {path} appears to be admin-only but has no role middleware.",
                        file_path=file_path,
                        line_number=line_num,
                        diff_snippet=self._extract_diff_snippet(pr_diff, file_path, line_num),
                        expected_behavior="Admin routes should have roleMiddleware",
                        actual_behavior="No authorization middleware detected",
                        recommendation=f"Add middleware: router.{method}('{path}', authMiddleware, roleMiddleware('admin'), {handlers})",
                        evidence=middleware_pattern.evidence[:3],
                        score_impact=1.0,
                    ))
        
        return violations
    
    def _check_react_pattern_violations(
        self,
        file_path: str,
        content: str,
        pr_diff: str,
        legacy_patterns: List[DesignPattern],
    ) -> List[PatternViolation]:
        """Check React component pattern violations."""
        violations = []
        
        react_pattern = next(
            (p for p in legacy_patterns if p.pattern_id == "PAT-REACT-001"),
            None
        )
        
        if not react_pattern:
            return violations
        
        # Check component size (lines of code)
        component_lines = len(content.splitlines())
        
        if component_lines > 300:
            violations.append(PatternViolation(
                violation_id="PAT-VIOL-005",
                pattern=react_pattern,
                severity="medium",
                title="Component is too large",
                description=f"Component has {component_lines} lines. Large components are hard to maintain.",
                file_path=file_path,
                line_number=1,
                diff_snippet="",
                expected_behavior="Components should be under 200 lines",
                actual_behavior=f"Component has {component_lines} lines",
                recommendation="Split into smaller components. Extract logic into custom hooks.",
                evidence=react_pattern.evidence[:3],
                score_impact=0.4,
            ))
        
        return violations
    
    def _check_api_client_violations(
        self,
        file_path: str,
        content: str,
        pr_diff: str,
        legacy_patterns: List[DesignPattern],
    ) -> List[PatternViolation]:
        """Check API client layer violations."""
        violations = []
        
        api_client_pattern = next(
            (p for p in legacy_patterns if p.pattern_id == "PAT-REACT-002"),
            None
        )
        
        if not api_client_pattern or api_client_pattern.confidence < 0.5:
            return violations
        
        # Check for direct fetch/axios calls in components
        direct_api_calls = []
        
        # Look for fetch calls
        for match in re.finditer(r"fetch\s*\(\s*['\"](.+?)['\"]", content):
            line_num = content[:match.start()].count('\n') + 1
            direct_api_calls.append(("fetch", match.group(1), line_num))
        
        # Look for axios calls
        for match in re.finditer(r"axios\.(get|post|put|delete|patch)\s*\(\s*['\"](.+?)['\"]", content):
            line_num = content[:match.start()].count('\n') + 1
            direct_api_calls.append(("axios", match.group(2), line_num))
        
        # If component file has direct API calls, it's a violation
        if "component" in file_path.lower() or "/components/" in file_path:
            for api_type, url, line_num in direct_api_calls:
                violations.append(PatternViolation(
                    violation_id=f"PAT-VIOL-006-{line_num}",
                    pattern=api_client_pattern,
                    severity="medium",
                    title="Component makes direct API call",
                    description=f"Component calls {api_type}('{url}') directly instead of using API client.",
                    file_path=file_path,
                    line_number=line_num,
                    diff_snippet=self._extract_diff_snippet(pr_diff, file_path, line_num),
                    expected_behavior="Components should use API client or custom hooks",
                    actual_behavior=f"Direct {api_type} call in component",
                    recommendation="Move API call to services/apiClient.js or create a custom hook like useProducts()",
                    evidence=api_client_pattern.evidence[:3],
                    score_impact=0.5,
                ))
        
        return violations
    
    def _check_model_pattern_violations(
        self,
        file_path: str,
        content: str,
        pr_diff: str,
        legacy_patterns: List[DesignPattern],
    ) -> List[PatternViolation]:
        """Check Mongoose model pattern violations."""
        violations = []
        
        model_pattern = next(
            (p for p in legacy_patterns if p.pattern_id == "PAT-DB-001"),
            None
        )
        
        if not model_pattern:
            return violations
        
        # Check if model has schema validation
        has_schema = "new Schema" in content or "Schema(" in content
        has_model = "model(" in content or "mongoose.model" in content
        
        if has_model and not has_schema:
            violations.append(PatternViolation(
                violation_id="PAT-VIOL-007",
                pattern=model_pattern,
                severity="high",
                title="Model missing schema validation",
                description="Mongoose model is created without a schema definition.",
                file_path=file_path,
                line_number=1,
                diff_snippet="",
                expected_behavior="Models should define a schema with validation",
                actual_behavior="No schema definition found",
                recommendation="Define a schema:\nconst userSchema = new Schema({ name: { type: String, required: true } });",
                evidence=model_pattern.evidence[:3],
                score_impact=0.8,
            ))
        
        return violations
    
    def _check_architectural_patterns(
        self,
        pr_files: Dict[str, str],
        legacy_patterns: List[DesignPattern],
    ) -> List[PatternViolation]:
        """Check architectural pattern violations across files."""
        violations = []
        
        # Check if new route file is added without corresponding controller/service
        route_files = [f for f in pr_files.keys() if self._is_route_file(f)]
        controller_files = [f for f in pr_files.keys() if "controller" in f.lower()]
        service_files = [f for f in pr_files.keys() if "service" in f.lower()]
        
        route_pattern = next(
            (p for p in legacy_patterns if p.pattern_id == "PAT-ARCH-001"),
            None
        )
        
        if route_pattern and route_pattern.confidence > 0.5:
            # If routes are added but no controllers/services
            if len(route_files) > 0 and len(controller_files) == 0:
                violations.append(PatternViolation(
                    violation_id="PAT-VIOL-008",
                    pattern=route_pattern,
                    severity="high",
                    title="New routes without controllers",
                    description=f"{len(route_files)} route file(s) added without corresponding controllers.",
                    file_path=route_files[0],
                    line_number=1,
                    diff_snippet="",
                    expected_behavior="Route files should have matching controller files",
                    actual_behavior="Routes added without controllers",
                    recommendation="Create controller files following the existing pattern",
                    evidence=route_pattern.evidence[:3],
                    score_impact=0.8,
                ))
        
        return violations
    
    def _is_route_file(self, file_path: str) -> bool:
        """Check if file is a route file."""
        return "route" in file_path.lower() or "/routes/" in file_path
    
    def _is_react_file(self, file_path: str) -> bool:
        """Check if file is a React file."""
        return file_path.endswith((".jsx", ".tsx"))
    
    def _is_model_file(self, file_path: str) -> bool:
        """Check if file is a model file."""
        return "model" in file_path.lower() or "/models/" in file_path
    
    def _extract_diff_snippet(
        self,
        pr_diff: str,
        file_path: str,
        line_number: int,
        context_lines: int = 5,
    ) -> str:
        """Extract relevant snippet from PR diff."""
        # Parse diff to find the file
        file_marker = f"diff --git a/{file_path}"
        
        if file_marker not in pr_diff:
            return ""
        
        # Extract section for this file
        file_diff_start = pr_diff.find(file_marker)
        next_file = pr_diff.find("diff --git", file_diff_start + 1)
        
        if next_file == -1:
            file_diff = pr_diff[file_diff_start:]
        else:
            file_diff = pr_diff[file_diff_start:next_file]
        
        # Extract lines around line_number
        lines = file_diff.split('\n')
        snippet_lines = []
        
        for i, line in enumerate(lines):
            if line.startswith('@@'):
                # Parse hunk header to get line numbers
                match = re.search(r'\+(\d+)', line)
                if match:
                    hunk_start = int(match.group(1))
                    
                    # Check if our line is in this hunk
                    if hunk_start <= line_number <= hunk_start + 50:
                        # Extract context
                        snippet_lines = lines[max(0, i - context_lines):i + context_lines + 1]
                        break
        
        return '\n'.join(snippet_lines) if snippet_lines else file_diff[:200]

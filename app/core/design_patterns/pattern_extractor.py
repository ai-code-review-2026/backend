"""
Design Pattern Extractor - Extracts architectural patterns from legacy code.

This module analyzes existing repositories to understand the team's coding patterns
and architectural decisions, which are then used to evaluate new Pull Requests.
"""

import ast
import logging
import re
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple
from dataclasses import dataclass, field
from collections import defaultdict

logger = logging.getLogger(__name__)


@dataclass
class CodeElement:
    """Represents a code element (function, class, route, etc.)"""
    name: str
    type: str  # "function", "class", "route", "component", "model", etc.
    file_path: str
    line_number: int
    imports: List[str] = field(default_factory=list)
    calls: List[str] = field(default_factory=list)
    decorators: List[str] = field(default_factory=list)
    exports: List[str] = field(default_factory=list)
    props: List[str] = field(default_factory=list)  # For React components


@dataclass
class DesignPattern:
    """Represents a detected design pattern"""
    pattern_id: str
    name: str
    type: str  # "architectural", "security", "frontend", "backend"
    confidence: float  # 0.0 to 1.0
    evidence: List[str] = field(default_factory=list)
    occurrences: int = 0
    description: str = ""
    recommendation: str = ""
    elements: List[CodeElement] = field(default_factory=list)


class PatternExtractor:
    """Extracts design patterns from existing code."""
    
    def __init__(self):
        self.patterns: List[DesignPattern] = []
        self.code_elements: Dict[str, List[CodeElement]] = defaultdict(list)
        self.file_relationships: Dict[str, Set[str]] = defaultdict(set)
    
    def extract_patterns_from_repository(
        self,
        repo_path: str,
        repo_name: str,
    ) -> List[DesignPattern]:
        """
        Extract all design patterns from a repository.
        
        Args:
            repo_path: Path to repository
            repo_name: Repository name
        
        Returns:
            List of detected patterns
        """
        logger.info(f"Extracting patterns from repository: {repo_name}")
        
        repo_path_obj = Path(repo_path)
        
        if not repo_path_obj.exists():
            logger.warning(f"Repository path does not exist: {repo_path}")
            return []
        
        # 1. Scan all files
        self._scan_repository(repo_path_obj)
        
        # 2. Detect patterns
        patterns = []
        
        # Backend patterns (Express/Node.js)
        patterns.extend(self._detect_route_controller_service_model_pattern())
        patterns.extend(self._detect_middleware_chain_pattern())
        patterns.extend(self._detect_mongoose_model_pattern())
        patterns.extend(self._detect_auth_flow_pattern())
        
        # Frontend patterns (React)
        patterns.extend(self._detect_react_component_pattern())
        patterns.extend(self._detect_api_client_layer_pattern())
        patterns.extend(self._detect_custom_hooks_pattern())
        
        # Security patterns
        patterns.extend(self._detect_input_validation_pattern())
        patterns.extend(self._detect_authorization_pattern())
        
        # CI/CD patterns
        patterns.extend(self._detect_cicd_pattern(repo_path_obj))
        
        logger.info(f"Extracted {len(patterns)} patterns from {repo_name}")
        
        return patterns
    
    def _scan_repository(self, repo_path: Path) -> None:
        """Scan repository and extract code elements."""
        # JavaScript/TypeScript files
        for ext in ["*.js", "*.jsx", "*.ts", "*.tsx"]:
            for file_path in repo_path.rglob(ext):
                if self._should_skip_file(file_path):
                    continue
                
                try:
                    self._analyze_js_file(file_path)
                except Exception as e:
                    logger.warning(f"Failed to analyze {file_path}: {e}")
        
        # Python files (for FastAPI backend)
        for file_path in repo_path.rglob("*.py"):
            if self._should_skip_file(file_path):
                continue
            
            try:
                self._analyze_python_file(file_path)
            except Exception as e:
                logger.warning(f"Failed to analyze {file_path}: {e}")
    
    def _should_skip_file(self, file_path: Path) -> bool:
        """Check if file should be skipped."""
        skip_dirs = {
            "node_modules", "dist", "build", ".next", "__pycache__",
            "venv", ".venv", "coverage", ".git"
        }
        
        for part in file_path.parts:
            if part in skip_dirs:
                return True
        
        return False
    
    def _analyze_js_file(self, file_path: Path) -> None:
        """Analyze JavaScript/TypeScript file."""
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        
        # Extract imports
        imports = self._extract_imports_js(content)
        
        # Extract exports
        exports = self._extract_exports_js(content)
        
        # Extract functions
        functions = self._extract_functions_js(content, file_path)
        
        # Extract Express routes
        routes = self._extract_express_routes(content, file_path)
        
        # Extract React components
        components = self._extract_react_components(content, file_path)
        
        # Extract Mongoose models
        models = self._extract_mongoose_models(content, file_path)
        
        # Store elements
        file_key = str(file_path)
        self.code_elements[file_key].extend(functions)
        self.code_elements[file_key].extend(routes)
        self.code_elements[file_key].extend(components)
        self.code_elements[file_key].extend(models)
        
        # Store relationships
        for imp in imports:
            self.file_relationships[file_key].add(imp)
    
    def _analyze_python_file(self, file_path: Path) -> None:
        """Analyze Python file."""
        try:
            content = file_path.read_text(encoding="utf-8")
            tree = ast.parse(content)
            
            for node in ast.walk(tree):
                if isinstance(node, ast.FunctionDef):
                    element = CodeElement(
                        name=node.name,
                        type="function",
                        file_path=str(file_path),
                        line_number=node.lineno,
                        decorators=[d.id if isinstance(d, ast.Name) else "" for d in node.decorator_list],
                    )
                    self.code_elements[str(file_path)].append(element)
                
                elif isinstance(node, ast.ClassDef):
                    element = CodeElement(
                        name=node.name,
                        type="class",
                        file_path=str(file_path),
                        line_number=node.lineno,
                    )
                    self.code_elements[str(file_path)].append(element)
        
        except Exception as e:
            logger.warning(f"Failed to parse Python file {file_path}: {e}")
    
    def _extract_imports_js(self, content: str) -> List[str]:
        """Extract import statements from JS/TS."""
        imports = []
        
        # import X from 'Y'
        pattern1 = r"import\s+.*?\s+from\s+['\"](.+?)['\"]"
        imports.extend(re.findall(pattern1, content))
        
        # require('Y')
        pattern2 = r"require\(['\"](.+?)['\"]\)"
        imports.extend(re.findall(pattern2, content))
        
        return imports
    
    def _extract_exports_js(self, content: str) -> List[str]:
        """Extract export statements from JS/TS."""
        exports = []
        
        # export function X
        pattern1 = r"export\s+(?:async\s+)?function\s+(\w+)"
        exports.extend(re.findall(pattern1, content))
        
        # export const X
        pattern2 = r"export\s+const\s+(\w+)"
        exports.extend(re.findall(pattern2, content))
        
        # export default X
        pattern3 = r"export\s+default\s+(\w+)"
        exports.extend(re.findall(pattern3, content))
        
        return exports
    
    def _extract_functions_js(self, content: str, file_path: Path) -> List[CodeElement]:
        """Extract function definitions."""
        functions = []
        
        # function name() {}
        pattern1 = r"(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\("
        for match in re.finditer(pattern1, content):
            line_num = content[:match.start()].count('\n') + 1
            functions.append(CodeElement(
                name=match.group(1),
                type="function",
                file_path=str(file_path),
                line_number=line_num,
            ))
        
        # const name = () => {}
        pattern2 = r"(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>"
        for match in re.finditer(pattern2, content):
            line_num = content[:match.start()].count('\n') + 1
            functions.append(CodeElement(
                name=match.group(1),
                type="arrow_function",
                file_path=str(file_path),
                line_number=line_num,
            ))
        
        return functions
    
    def _extract_express_routes(self, content: str, file_path: Path) -> List[CodeElement]:
        """Extract Express route definitions."""
        routes = []
        
        # router.get('/path', handler)
        pattern = r"router\.(get|post|put|delete|patch)\s*\(\s*['\"](.+?)['\"]\s*,\s*(.+?)\)"
        
        for match in re.finditer(pattern, content):
            method = match.group(1)
            path = match.group(2)
            handlers = match.group(3)
            line_num = content[:match.start()].count('\n') + 1
            
            # Extract middleware/handlers
            handler_list = [h.strip() for h in handlers.split(',')]
            
            routes.append(CodeElement(
                name=f"{method.upper()} {path}",
                type="express_route",
                file_path=str(file_path),
                line_number=line_num,
                calls=handler_list,
            ))
        
        return routes
    
    def _extract_react_components(self, content: str, file_path: Path) -> List[CodeElement]:
        """Extract React component definitions."""
        components = []
        
        # function Component() { return ...}
        pattern1 = r"(?:export\s+)?(?:default\s+)?function\s+([A-Z]\w+)\s*\([^)]*\)\s*\{"
        for match in re.finditer(pattern1, content):
            if "return" in content[match.end():match.end() + 200]:  # Check if it returns JSX
                line_num = content[:match.start()].count('\n') + 1
                components.append(CodeElement(
                    name=match.group(1),
                    type="react_component",
                    file_path=str(file_path),
                    line_number=line_num,
                ))
        
        # const Component = () => { return ...}
        pattern2 = r"(?:export\s+)?const\s+([A-Z]\w+)\s*=\s*\([^)]*\)\s*=>\s*\{"
        for match in re.finditer(pattern2, content):
            line_num = content[:match.start()].count('\n') + 1
            components.append(CodeElement(
                name=match.group(1),
                type="react_component",
                file_path=str(file_path),
                line_number=line_num,
            ))
        
        return components
    
    def _extract_mongoose_models(self, content: str, file_path: Path) -> List[CodeElement]:
        """Extract Mongoose model definitions."""
        models = []
        
        # mongoose.model('ModelName', schema)
        pattern = r"mongoose\.model\s*\(\s*['\"](\w+)['\"]\s*,"
        
        for match in re.finditer(pattern, content):
            line_num = content[:match.start()].count('\n') + 1
            models.append(CodeElement(
                name=match.group(1),
                type="mongoose_model",
                file_path=str(file_path),
                line_number=line_num,
            ))
        
        return models
    
    # ========== Pattern Detection Methods ==========
    
    def _detect_route_controller_service_model_pattern(self) -> List[DesignPattern]:
        """Detect Route → Controller → Service → Model pattern."""
        patterns = []
        
        # Find files by naming convention
        routes_files = [f for f in self.code_elements.keys() if "route" in f.lower()]
        controllers_files = [f for f in self.code_elements.keys() if "controller" in f.lower()]
        services_files = [f for f in self.code_elements.keys() if "service" in f.lower()]
        models_files = [f for f in self.code_elements.keys() if "model" in f.lower()]
        
        # Count occurrences
        occurrences = 0
        evidence = []
        
        for route_file in routes_files:
            # Check if route imports controller
            for controller_file in controllers_files:
                if any(controller_file in imp or Path(controller_file).stem in imp 
                       for imp in self.file_relationships.get(route_file, [])):
                    
                    # Check if controller imports service
                    for service_file in services_files:
                        if any(service_file in imp or Path(service_file).stem in imp
                               for imp in self.file_relationships.get(controller_file, [])):
                            
                            # Check if service imports model
                            for model_file in models_files:
                                if any(model_file in imp or Path(model_file).stem in imp
                                       for imp in self.file_relationships.get(service_file, [])):
                                    
                                    occurrences += 1
                                    evidence.append(
                                        f"{Path(route_file).name} → "
                                        f"{Path(controller_file).name} → "
                                        f"{Path(service_file).name} → "
                                        f"{Path(model_file).name}"
                                    )
        
        if occurrences > 0:
            confidence = min(1.0, occurrences / 3)  # 3+ occurrences = high confidence
            
            patterns.append(DesignPattern(
                pattern_id="PAT-ARCH-001",
                name="Route-Controller-Service-Model",
                type="architectural",
                confidence=confidence,
                evidence=evidence[:5],  # Top 5 examples
                occurrences=occurrences,
                description="Backend follows a layered architecture: Route → Controller → Service → Model",
                recommendation="Maintain this pattern for consistency. New routes should follow the same structure.",
            ))
        
        return patterns
    
    def _detect_middleware_chain_pattern(self) -> List[DesignPattern]:
        """Detect middleware chain pattern in Express routes."""
        patterns = []
        evidence = []
        occurrences = 0
        
        middleware_keywords = ["auth", "validate", "role", "permission", "check"]
        
        for file_path, elements in self.code_elements.items():
            for element in elements:
                if element.type == "express_route":
                    # Check if route has middleware
                    middlewares = [call for call in element.calls 
                                   if any(kw in call.lower() for kw in middleware_keywords)]
                    
                    if len(middlewares) >= 1:
                        occurrences += 1
                        evidence.append(
                            f"{element.name} uses middleware: {', '.join(middlewares)}"
                        )
        
        if occurrences > 0:
            confidence = min(1.0, occurrences / 5)
            
            patterns.append(DesignPattern(
                pattern_id="PAT-SEC-001",
                name="Middleware-Chain-Pattern",
                type="security",
                confidence=confidence,
                evidence=evidence[:5],
                occurrences=occurrences,
                description="Routes use middleware for authentication, authorization, and validation",
                recommendation="Protected routes should always include auth and role middleware.",
            ))
        
        return patterns
    
    def _detect_mongoose_model_pattern(self) -> List[DesignPattern]:
        """Detect Mongoose model pattern."""
        patterns = []
        occurrences = 0
        evidence = []
        
        for file_path, elements in self.code_elements.items():
            for element in elements:
                if element.type == "mongoose_model":
                    occurrences += 1
                    evidence.append(f"Model {element.name} in {Path(file_path).name}")
        
        if occurrences > 0:
            patterns.append(DesignPattern(
                pattern_id="PAT-DB-001",
                name="Mongoose-Model-Pattern",
                type="architectural",
                confidence=1.0 if occurrences >= 3 else 0.7,
                evidence=evidence[:5],
                occurrences=occurrences,
                description="Database models are defined using Mongoose schemas",
                recommendation="All MongoDB collections should be defined as Mongoose models with validation.",
            ))
        
        return patterns
    
    def _detect_auth_flow_pattern(self) -> List[DesignPattern]:
        """Detect authentication flow pattern."""
        patterns = []
        
        # Look for auth-related files
        auth_files = [f for f in self.code_elements.keys() 
                      if "auth" in f.lower() or "login" in f.lower()]
        
        if len(auth_files) >= 2:
            patterns.append(DesignPattern(
                pattern_id="PAT-AUTH-001",
                name="Auth-Flow-Pattern",
                type="security",
                confidence=0.8,
                evidence=[f"Auth module: {Path(f).name}" for f in auth_files[:3]],
                occurrences=len(auth_files),
                description="Authentication flow is centralized in dedicated modules",
                recommendation="All authentication logic should go through the auth module.",
            ))
        
        return patterns
    
    def _detect_react_component_pattern(self) -> List[DesignPattern]:
        """Detect React component pattern."""
        patterns = []
        occurrences = 0
        evidence = []
        
        for file_path, elements in self.code_elements.items():
            for element in elements:
                if element.type == "react_component":
                    occurrences += 1
                    evidence.append(f"Component {element.name} in {Path(file_path).name}")
        
        if occurrences > 0:
            patterns.append(DesignPattern(
                pattern_id="PAT-REACT-001",
                name="React-Component-Pattern",
                type="frontend",
                confidence=1.0,
                evidence=evidence[:5],
                occurrences=occurrences,
                description="UI is built with reusable React components",
                recommendation="Components should be small, focused, and reusable.",
            ))
        
        return patterns
    
    def _detect_api_client_layer_pattern(self) -> List[DesignPattern]:
        """Detect centralized API client layer."""
        patterns = []
        
        # Look for API client files
        api_files = [f for f in self.code_elements.keys() 
                     if "api" in f.lower() or "client" in f.lower() or "service" in f.lower()]
        
        frontend_api_files = [f for f in api_files if any(x in f for x in ["frontend", "client", "components"])]
        
        if len(frontend_api_files) >= 1:
            patterns.append(DesignPattern(
                pattern_id="PAT-REACT-002",
                name="API-Client-Layer",
                type="frontend",
                confidence=0.9,
                evidence=[f"API client: {Path(f).name}" for f in frontend_api_files[:3]],
                occurrences=len(frontend_api_files),
                description="API calls are centralized in a dedicated client layer",
                recommendation="Components should not call fetch/axios directly. Use the API client.",
            ))
        
        return patterns
    
    def _detect_custom_hooks_pattern(self) -> List[DesignPattern]:
        """Detect custom React hooks pattern."""
        patterns = []
        
        # Look for hook files
        hook_files = [f for f in self.code_elements.keys() if "hook" in f.lower() or "/use" in f.lower()]
        
        if len(hook_files) >= 2:
            patterns.append(DesignPattern(
                pattern_id="PAT-REACT-003",
                name="Custom-Hooks-Pattern",
                type="frontend",
                confidence=0.8,
                evidence=[f"Hook: {Path(f).name}" for f in hook_files[:3]],
                occurrences=len(hook_files),
                description="Logic is extracted into custom React hooks",
                recommendation="Reusable logic should be in custom hooks, not in components.",
            ))
        
        return patterns
    
    def _detect_input_validation_pattern(self) -> List[DesignPattern]:
        """Detect input validation pattern."""
        patterns = []
        evidence = []
        occurrences = 0
        
        validation_keywords = ["validate", "validator", "validation", "schema", "zod", "joi"]
        
        for file_path, elements in self.code_elements.items():
            if any(kw in file_path.lower() for kw in validation_keywords):
                occurrences += 1
                evidence.append(f"Validation in {Path(file_path).name}")
        
        if occurrences > 0:
            patterns.append(DesignPattern(
                pattern_id="PAT-SEC-002",
                name="Input-Validation-Pattern",
                type="security",
                confidence=min(1.0, occurrences / 3),
                evidence=evidence[:5],
                occurrences=occurrences,
                description="Input validation is used to sanitize user data",
                recommendation="All user inputs should be validated before processing.",
            ))
        
        return patterns
    
    def _detect_authorization_pattern(self) -> List[DesignPattern]:
        """Detect authorization pattern."""
        patterns = []
        
        # Look for role/permission files
        authz_keywords = ["role", "permission", "rbac", "acl", "authorize"]
        authz_files = [f for f in self.code_elements.keys() 
                       if any(kw in f.lower() for kw in authz_keywords)]
        
        if len(authz_files) >= 1:
            patterns.append(DesignPattern(
                pattern_id="PAT-SEC-003",
                name="Authorization-Pattern",
                type="security",
                confidence=0.9,
                evidence=[f"Authorization: {Path(f).name}" for f in authz_files[:3]],
                occurrences=len(authz_files),
                description="Role-based access control is implemented",
                recommendation="Protected resources should check user roles/permissions.",
            ))
        
        return patterns
    
    def _detect_cicd_pattern(self, repo_path: Path) -> List[DesignPattern]:
        """Detect CI/CD pattern."""
        patterns = []
        
        # Look for CI/CD files
        cicd_files = list(repo_path.glob(".github/workflows/*.yml"))
        cicd_files.extend(repo_path.glob(".github/workflows/*.yaml"))
        cicd_files.extend(repo_path.glob(".gitlab-ci.yml"))
        cicd_files.extend(repo_path.glob("Jenkinsfile"))
        
        if len(cicd_files) > 0:
            patterns.append(DesignPattern(
                pattern_id="PAT-CI-001",
                name="CI-CD-Pipeline",
                type="devops",
                confidence=1.0,
                evidence=[f"CI/CD: {f.name}" for f in cicd_files[:3]],
                occurrences=len(cicd_files),
                description="Automated CI/CD pipeline is configured",
                recommendation="All PRs should pass CI/CD checks before merging.",
            ))
        
        return patterns

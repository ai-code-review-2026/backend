from __future__ import annotations

import ast
from dataclasses import dataclass


@dataclass(frozen=True)
class PythonVariableCandidate:
    name: str
    line_no: int
    is_constant: bool


@dataclass(frozen=True)
class PythonSymbol:
    kind: str
    name: str
    start_line: int
    end_line: int
    logical_lines: int
    complexity: int
    dependencies: tuple[str, ...]
    snippet: str
    uses_global_state: bool


@dataclass(frozen=True)
class PythonMagicNumber:
    value: int | float
    line_no: int


@dataclass(frozen=True)
class PythonIgnoredError:
    line_no: int
    reason: str


@dataclass(frozen=True)
class PythonModuleAnalysis:
    symbols: tuple[PythonSymbol, ...]
    top_level_symbol_count: int
    variables: tuple[PythonVariableCandidate, ...]
    magic_numbers: tuple[PythonMagicNumber, ...]
    ignored_errors: tuple[PythonIgnoredError, ...]


def _complexity_for_node(node: ast.AST) -> int:
    complexity = 1
    for item in ast.walk(node):
        if isinstance(item, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.IfExp, ast.Try, ast.ExceptHandler, ast.With, ast.AsyncWith)):
            complexity += 1
        elif isinstance(item, ast.BoolOp):
            complexity += max(1, len(item.values) - 1)
        elif isinstance(item, (ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)):
            complexity += 1
    return complexity


def _full_name(node: ast.AST) -> str:
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        prefix = _full_name(node.value)
        return f"{prefix}.{node.attr}" if prefix else node.attr
    return ""


def _dependencies_for_node(node: ast.AST) -> tuple[str, ...]:
    dependencies: set[str] = set()
    for item in ast.walk(node):
        if isinstance(item, ast.Call):
            target = _full_name(item.func)
            if target == "open":
                dependencies.add("io")
            if target.startswith(("requests.", "urllib.", "http.", "socket.")):
                dependencies.add("network")
            if target.startswith("subprocess."):
                dependencies.add("subprocess")
        elif isinstance(item, ast.Attribute):
            if _full_name(item).startswith("os.environ"):
                dependencies.add("env")
        elif isinstance(item, ast.Global):
            dependencies.add("global")
    return tuple(sorted(dependencies))


def _logical_lines(source_lines: list[str]) -> int:
    count = 0
    for raw in source_lines:
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        count += 1
    return count


def _collect_variables(tree: ast.AST) -> list[PythonVariableCandidate]:
    variables: list[PythonVariableCandidate] = []
    for item in ast.walk(tree):
        if isinstance(item, (ast.Assign, ast.AnnAssign)):
            targets = item.targets if isinstance(item, ast.Assign) else [item.target]
            for target in targets:
                if isinstance(target, ast.Name):
                    variables.append(
                        PythonVariableCandidate(
                            name=target.id,
                            line_no=int(getattr(target, "lineno", getattr(item, "lineno", 1))),
                            is_constant=target.id.isupper(),
                        )
                    )
    return variables


def _is_magic_number(value: int | float) -> bool:
    return value not in {-1, 0, 1, 2}


def _is_constant_assignment(parent: ast.AST | None) -> bool:
    if isinstance(parent, ast.Assign):
        return all(isinstance(target, ast.Name) and target.id.isupper() for target in parent.targets)
    if isinstance(parent, ast.AnnAssign):
        return isinstance(parent.target, ast.Name) and parent.target.id.isupper()
    return False


def _is_ignored_error_body(body: list[ast.stmt]) -> str | None:
    if not body:
        return "empty_handler"
    if len(body) == 1 and isinstance(body[0], ast.Pass):
        return "pass_only"
    if len(body) == 1 and isinstance(body[0], ast.Return) and body[0].value is None:
        return "return_none"
    if all(isinstance(item, ast.Expr) and isinstance(item.value, ast.Call) for item in body):
        call_names = {_full_name(item.value.func) for item in body if isinstance(item, ast.Expr) and isinstance(item.value, ast.Call)}
        if call_names and all(name.startswith("logger.") or name.startswith("logging.") or name == "print" for name in call_names):
            return "log_only"
    return None


def analyze_python_module(text: str) -> PythonModuleAnalysis:
    tree = ast.parse(text)
    parents: dict[int, ast.AST] = {}
    for parent in ast.walk(tree):
        for child in ast.iter_child_nodes(parent):
            parents[id(child)] = parent

    lines = text.splitlines()
    symbols: list[PythonSymbol] = []
    top_level_symbol_count = 0

    for item in ast.walk(tree):
        if not isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            continue
        start_line = int(getattr(item, "lineno", 1))
        end_line = int(getattr(item, "end_lineno", start_line))
        snippet_lines = lines[start_line - 1 : end_line]
        parent = parents.get(id(item))
        if isinstance(parent, ast.ClassDef) and isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
            kind = "method"
        elif isinstance(item, ast.ClassDef):
            kind = "class"
        else:
            kind = "function"
        if parent is tree:
            top_level_symbol_count += 1
        symbols.append(
            PythonSymbol(
                kind=kind,
                name=item.name,
                start_line=start_line,
                end_line=end_line,
                logical_lines=_logical_lines(snippet_lines),
                complexity=_complexity_for_node(item),
                dependencies=_dependencies_for_node(item),
                snippet="\n".join(snippet_lines).strip(),
                uses_global_state=any(isinstance(node, ast.Global) for node in ast.walk(item)),
            )
        )

    magic_numbers: list[PythonMagicNumber] = []
    for item in ast.walk(tree):
        value: int | float | None = None
        line_no = int(getattr(item, "lineno", 1))
        parent = parents.get(id(item))
        if isinstance(item, ast.Constant) and isinstance(item.value, (int, float)) and not isinstance(item.value, bool):
            value = item.value
        elif (
            isinstance(item, ast.UnaryOp)
            and isinstance(item.op, ast.USub)
            and isinstance(item.operand, ast.Constant)
            and isinstance(item.operand.value, (int, float))
            and not isinstance(item.operand.value, bool)
        ):
            value = -item.operand.value
        if value is None or not _is_magic_number(value):
            continue
        if _is_constant_assignment(parent):
            continue
        magic_numbers.append(PythonMagicNumber(value=value, line_no=line_no))

    ignored_errors: list[PythonIgnoredError] = []
    for item in ast.walk(tree):
        if not isinstance(item, ast.Try):
            continue
        for handler in item.handlers:
            reason = _is_ignored_error_body(handler.body)
            if reason:
                ignored_errors.append(PythonIgnoredError(line_no=int(getattr(handler, "lineno", 1)), reason=reason))

    return PythonModuleAnalysis(
        symbols=tuple(sorted(symbols, key=lambda item: (item.start_line, item.name))),
        top_level_symbol_count=top_level_symbol_count,
        variables=tuple(sorted(_collect_variables(tree), key=lambda item: (item.line_no, item.name))),
        magic_numbers=tuple(sorted(magic_numbers, key=lambda item: (item.line_no, item.value))),
        ignored_errors=tuple(sorted(ignored_errors, key=lambda item: item.line_no)),
    )

import ast


class PythonParser:
    def parse(self, code: str) -> ast.AST:
        return ast.parse(code)

    def get_functions(self, tree: ast.AST):
        return [
            n
            for n in ast.walk(tree)
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]

    def get_calls(self, tree: ast.AST):
        return [n for n in ast.walk(tree) if isinstance(n, ast.Call)]

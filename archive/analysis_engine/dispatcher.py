from pathlib import Path

from analysis_engine.parsers.python_parser import PythonParser

EXTENSION_MAP = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".java": "java",
    ".c": "c",
    ".cpp": "cpp",
    ".go": "go",
    ".rb": "ruby",
    ".php": "php",
    ".rs": "rust",
    ".cs": "c_sharp",
    ".kt": "kotlin",
    ".swift": "swift",
}


def detect_language(filename: str) -> str:
    ext = Path(filename).suffix.lower()
    return EXTENSION_MAP.get(ext, "unknown")


def get_parser(language: str):
    if language == "python":
        return PythonParser()
    from analysis_engine.parsers.treesitter_parser import TreeSitterParser

    return TreeSitterParser(language)

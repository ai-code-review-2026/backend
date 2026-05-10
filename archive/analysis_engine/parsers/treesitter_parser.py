from tree_sitter_languages import get_language, get_parser


class TreeSitterParser:
    def __init__(self, language: str):
        self.lang = get_language(language)
        self.parser = get_parser(language)

    def parse(self, code: str):
        return self.parser.parse(bytes(code, "utf-8"))

    def query(self, tree, query_str: str):
        q = self.lang.query(query_str)
        return q.captures(tree.root_node)

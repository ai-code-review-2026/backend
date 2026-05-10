from abc import ABC, abstractmethod
from typing import List

from analysis_engine.models import Issue


class BaseRule(ABC):
    rule_id: str
    type: str
    severity: str

    @abstractmethod
    def check(self, tree, code: str, language: str) -> List[Issue]:
        ...

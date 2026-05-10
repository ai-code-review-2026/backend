from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class Severity(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class IssueType(str, Enum):
    BUG = "bug"
    SMELL = "smell"
    SECURITY = "security"
    COMPLEXITY = "complexity"


class Issue(BaseModel):
    rule_id: str
    type: IssueType
    severity: Severity
    message: str
    line: Optional[int] = None
    column: Optional[int] = None
    file: Optional[str] = None


class AnalysisRequest(BaseModel):
    filename: str
    code: str


class AnalysisResult(BaseModel):
    filename: str
    language: str
    issues: List[Issue]
    score: float
    summary: dict

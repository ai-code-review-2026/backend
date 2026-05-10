from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, constr


RiskLevel = Literal["low", "medium", "high", "critical"]
TestType = Literal["unit", "integration", "contract", "regression"]
Priority = Literal["high", "medium", "low"]
MergeStatus = Literal["ready", "needs_attention", "blocked"]


class ReviewContextReference(BaseModel):
    path: str = Field(min_length=1, max_length=500)
    source: str = Field(min_length=1, max_length=64)
    source_type: str | None = Field(default=None, max_length=64)
    chunk_type: str | None = Field(default=None, max_length=64)
    title: str | None = Field(default=None, max_length=255)
    source_uri: str | None = Field(default=None, max_length=4096)
    page: int | None = Field(default=None, ge=1)
    section_title: str | None = Field(default=None, max_length=500)
    heading_path: list[constr(min_length=1, max_length=255)] = Field(default_factory=list, max_length=16)
    entity_type: str | None = Field(default=None, max_length=64)
    entity_name: str | None = Field(default=None, max_length=255)
    line_start: int | None = Field(default=None, ge=1)
    line_end: int | None = Field(default=None, ge=1)
    domain: str | None = Field(default=None, max_length=255)
    document_version: str | None = Field(default=None, max_length=255)
    crawl_timestamp: str | None = Field(default=None, max_length=128)
    score: float = Field(default=0.0, ge=0.0)
    tags: list[constr(min_length=1, max_length=64)] = Field(default_factory=list, max_length=8)


class PRSummaryOutput(BaseModel):
    short_summary: constr(min_length=10, max_length=400) = Field(...)
    detailed_summary: constr(min_length=20, max_length=2000) = Field(...)
    business_goal: constr(min_length=6, max_length=400) = Field(...)
    files_impacted: list[constr(min_length=1, max_length=500)] = Field(default_factory=list, max_length=20)
    impacted_components: list[constr(min_length=1, max_length=255)] = Field(default_factory=list, max_length=12)
    change_type: constr(min_length=3, max_length=64) = Field(...)
    risk_level: RiskLevel = Field(default="medium")
    breaking_changes: list[constr(min_length=2, max_length=400)] = Field(default_factory=list, max_length=6)


class FileExplanation(BaseModel):
    file_path: constr(min_length=1, max_length=500) = Field(...)
    change_type: constr(min_length=3, max_length=64) = Field(...)
    explanation: constr(min_length=12, max_length=700) = Field(...)
    technical_impact: constr(min_length=8, max_length=500) = Field(...)
    watch_areas: list[constr(min_length=2, max_length=300)] = Field(default_factory=list, max_length=5)


class ChangeExplanationOutput(BaseModel):
    what_changed: constr(min_length=20, max_length=2000) = Field(...)
    why_changed: constr(min_length=12, max_length=1200) = Field(...)
    technical_impact: constr(min_length=12, max_length=1200) = Field(...)
    functional_impact: constr(min_length=12, max_length=1200) = Field(...)
    watch_areas: list[constr(min_length=2, max_length=300)] = Field(default_factory=list, max_length=8)
    file_explanations: list[FileExplanation] = Field(default_factory=list, max_length=8)


class RiskFindingOutput(BaseModel):
    title: constr(min_length=8, max_length=200) = Field(...)
    severity: RiskLevel = Field(default="medium")
    file_path: str | None = Field(default=None, max_length=500)
    line_start: int | None = Field(default=None, ge=1)
    line_end: int | None = Field(default=None, ge=1)
    explanation: constr(min_length=12, max_length=900) = Field(...)
    risk: constr(min_length=12, max_length=700) = Field(...)
    suggestion: constr(min_length=8, max_length=700) = Field(...)
    confidence: float = Field(default=0.5, ge=0.0, le=1.0)


class GeneratedTestOutput(BaseModel):
    test_type: TestType = Field(default="unit")
    priority: Priority = Field(default="medium")
    target_file: str | None = Field(default=None, max_length=500)
    test_name: constr(min_length=4, max_length=160) = Field(...)
    rationale: constr(min_length=12, max_length=700) = Field(...)
    scenarios: list[constr(min_length=6, max_length=300)] = Field(default_factory=list, max_length=6)
    code_snippet: constr(min_length=8, max_length=4000) | None = Field(default=None)


class MergeReadinessOutput(BaseModel):
    status: MergeStatus = Field(default="needs_attention")
    reason: constr(min_length=8, max_length=500) = Field(...)
    blocking_items: list[constr(min_length=2, max_length=300)] = Field(default_factory=list, max_length=8)


class StructuredReviewOutput(BaseModel):
    summary: PRSummaryOutput
    key_changes: list[constr(min_length=4, max_length=300)] = Field(default_factory=list, max_length=10)
    impacted_components: list[constr(min_length=1, max_length=255)] = Field(default_factory=list, max_length=12)
    change_explanation: ChangeExplanationOutput
    risk_findings: list[RiskFindingOutput] = Field(default_factory=list, max_length=12)
    generated_tests: list[GeneratedTestOutput] = Field(default_factory=list, max_length=8)
    merge_readiness: MergeReadinessOutput
    context_references: list[ReviewContextReference] = Field(default_factory=list, max_length=12)

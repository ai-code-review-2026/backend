from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal


MaskStrategy = Literal["keep_prefix", "full", "private_key"]


@dataclass(frozen=True)
class SecretRule:
    rule_id: str
    pattern: re.Pattern[str]
    severity: Literal["WARN", "BLOCKER"]
    description: str
    mask_strategy: MaskStrategy
    confidence: float
    group_name: str | None = None
    prefix_len: int = 4


def mask_with_strategy(value: str, strategy: MaskStrategy, prefix_len: int = 4) -> str:
    if strategy == "private_key":
        return "[REDACTED_PRIVATE_KEY]"
    if strategy == "full":
        return "[REDACTED]"

    if not value:
        return value
    visible = min(prefix_len, len(value))
    return value[:visible] + "*" * max(4, len(value) - visible)


SECRET_RULES: tuple[SecretRule, ...] = (
    SecretRule(
        rule_id="SECRET_GITHUB_TOKEN",
        pattern=re.compile(r"\bghp_[A-Za-z0-9]{36}\b"),
        severity="BLOCKER",
        description="Possible GitHub token detected.",
        mask_strategy="keep_prefix",
        confidence=0.98,
    ),
    SecretRule(
        rule_id="SECRET_GITHUB_PAT",
        pattern=re.compile(r"\bgithub_pat_[A-Za-z0-9_]{20,}\b"),
        severity="BLOCKER",
        description="Possible GitHub personal access token detected.",
        mask_strategy="keep_prefix",
        confidence=0.98,
    ),
    SecretRule(
        rule_id="SECRET_AWS_ACCESS_KEY",
        pattern=re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
        severity="BLOCKER",
        description="Possible AWS access key detected.",
        mask_strategy="keep_prefix",
        confidence=0.98,
    ),
    SecretRule(
        rule_id="SECRET_SLACK_TOKEN",
        pattern=re.compile(r"\bxox(?:b|p)-[A-Za-z0-9-]{10,}\b"),
        severity="BLOCKER",
        description="Possible Slack token detected.",
        mask_strategy="keep_prefix",
        confidence=0.97,
    ),
    SecretRule(
        rule_id="SECRET_JWT",
        pattern=re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9._-]{5,}\.[A-Za-z0-9._-]{5,}\b"),
        severity="BLOCKER",
        description="Possible JWT token detected.",
        mask_strategy="keep_prefix",
        confidence=0.9,
    ),
    SecretRule(
        rule_id="SECRET_PRIVATE_KEY_HEADER",
        pattern=re.compile(r"-----BEGIN (?:RSA )?PRIVATE KEY-----"),
        severity="BLOCKER",
        description="Private key material detected.",
        mask_strategy="private_key",
        confidence=0.99,
    ),
    SecretRule(
        rule_id="SECRET_GENERIC_ASSIGNMENT",
        pattern=re.compile(
            r"(?i)\b(?:api[_-]?key|secret|password|token)\b\s*[:=]\s*(?P<secret>\"[^\"\n]+\"|'[^'\n]+'|[^\s#]+)"
        ),
        severity="WARN",
        description="Possible credential assignment detected.",
        mask_strategy="keep_prefix",
        confidence=0.78,
        group_name="secret",
    ),
)

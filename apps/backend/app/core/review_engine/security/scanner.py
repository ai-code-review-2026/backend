from __future__ import annotations

import re
from collections import Counter

from app.core.review_engine.diff_engine import ParsedDiff
from app.core.review_engine.security.dtos import (
    SecretDetection,
    SecretLineScanResult,
    SecretMatch,
    SecretScanResult,
)
from app.core.review_engine.security.entropy import is_entropy_candidate, shannon_entropy
from app.core.review_engine.security.rules import SECRET_RULES, SecretRule, mask_with_strategy

_KEYWORD_RE = re.compile(r"(?i)\b(?:password|passwd|secret|token|api[_-]?key)\b")
_ENTROPY_TOKEN_RE = re.compile(r"[A-Za-z0-9_\-+/=]{20,}")


def _overlaps(span_a: tuple[int, int], span_b: tuple[int, int]) -> bool:
    return span_a[0] < span_b[1] and span_b[0] < span_a[1]


def _extract_rule_match(line: str, rule: SecretRule) -> list[SecretMatch]:
    matches: list[SecretMatch] = []
    for match in rule.pattern.finditer(line):
        if rule.group_name:
            if match.group(rule.group_name) is None:
                continue
            secret_value = match.group(rule.group_name)
            start, end = match.span(rule.group_name)
        else:
            secret_value = match.group(0)
            start, end = match.span(0)

        if not secret_value:
            continue

        masked_value = mask_with_strategy(secret_value, rule.mask_strategy, prefix_len=rule.prefix_len)
        matches.append(
            SecretMatch(
                rule_id=rule.rule_id,
                severity=rule.severity,
                description=rule.description,
                confidence=rule.confidence,
                secret_value=secret_value,
                masked_value=masked_value,
                start=start,
                end=end,
            )
        )

    return matches


def _extract_entropy_matches(
    line: str,
    *,
    min_token_len: int,
    threshold: float,
    existing_spans: list[tuple[int, int]],
) -> list[SecretMatch]:
    matches: list[SecretMatch] = []
    keyword_present = bool(_KEYWORD_RE.search(line))

    for match in _ENTROPY_TOKEN_RE.finditer(line):
        token = match.group(0)
        start, end = match.span(0)
        if any(_overlaps((start, end), span) for span in existing_spans):
            continue
        if not is_entropy_candidate(token, min_token_len):
            continue

        entropy_score = shannon_entropy(token)
        if entropy_score < threshold:
            continue

        severity = "BLOCKER" if keyword_present else "WARN"
        matches.append(
            SecretMatch(
                rule_id="SECRET_ENTROPY",
                severity=severity,
                description="Suspicious high-entropy token detected.",
                confidence=0.62 if severity == "WARN" else 0.72,
                secret_value=token,
                masked_value=mask_with_strategy(token, "keep_prefix", prefix_len=4),
                start=start,
                end=end,
                entropy_score=entropy_score,
            )
        )

    return matches


def _dedupe_matches(matches: list[SecretMatch]) -> list[SecretMatch]:
    severity_rank = {"BLOCKER": 2, "WARN": 1}
    ordered = sorted(
        matches,
        key=lambda item: (
            -severity_rank.get(item.severity, 0),
            -item.confidence,
            -(item.end - item.start),
            item.start,
        ),
    )
    chosen: list[SecretMatch] = []
    for candidate in ordered:
        if any(_overlaps((candidate.start, candidate.end), (item.start, item.end)) for item in chosen):
            continue
        chosen.append(candidate)
    return sorted(chosen, key=lambda item: item.start)


def scan_added_line_for_secrets(
    line_content: str,
    *,
    min_token_len: int,
    entropy_threshold: float,
) -> SecretLineScanResult:
    rule_matches: list[SecretMatch] = []
    for rule in SECRET_RULES:
        rule_matches.extend(_extract_rule_match(line_content, rule))

    spans = [(item.start, item.end) for item in rule_matches]
    entropy_matches = _extract_entropy_matches(
        line_content,
        min_token_len=min_token_len,
        threshold=entropy_threshold,
        existing_spans=spans,
    )

    all_matches = _dedupe_matches(rule_matches + entropy_matches)
    redacted = line_content
    for match in sorted(all_matches, key=lambda item: item.start, reverse=True):
        redacted = redacted[: match.start] + match.masked_value + redacted[match.end :]

    rules_hit_counter = Counter(item.rule_id for item in all_matches)
    entropy_hits = int(rules_hit_counter.get("SECRET_ENTROPY", 0))
    return SecretLineScanResult(
        matches=all_matches,
        redacted_content=redacted,
        masked_count=len(all_matches),
        rules_hit=dict(rules_hit_counter),
        entropy_hits=entropy_hits,
    )


def scan_parsed_diff_for_secrets(
    parsed: ParsedDiff,
    *,
    min_token_len: int,
    entropy_threshold: float,
    max_findings: int,
) -> SecretScanResult:
    detections: list[SecretDetection] = []
    rules_hit_counter: Counter[str] = Counter()
    masked_count = 0
    entropy_hits = 0

    for file_item in parsed.files:
        for hunk in file_item.hunks:
            for line in hunk.lines:
                if line.line_type != "add":
                    continue
                line_result = scan_added_line_for_secrets(
                    line.content,
                    min_token_len=min_token_len,
                    entropy_threshold=entropy_threshold,
                )

                if line_result.masked_count == 0:
                    continue

                masked_count += line_result.masked_count
                entropy_hits += line_result.entropy_hits
                rules_hit_counter.update(line_result.rules_hit)

                for match in line_result.matches:
                    if len(detections) >= max_findings:
                        continue
                    detections.append(
                        SecretDetection(
                            file_path=file_item.path_new,
                            line_no=line.new_line_no,
                            match=match,
                        )
                    )

    return SecretScanResult(
        detections=detections,
        masked_count=masked_count,
        rules_hit=dict(rules_hit_counter),
        entropy_hits=entropy_hits,
    )

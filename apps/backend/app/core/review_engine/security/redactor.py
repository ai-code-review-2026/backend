from __future__ import annotations

from collections import Counter

from app.core.review_engine.security.dtos import RedactionResult
from app.core.review_engine.security.scanner import scan_added_line_for_secrets


def _split_line_ending(value: str) -> tuple[str, str]:
    if value.endswith("\r\n"):
        return value[:-2], "\r\n"
    if value.endswith("\n"):
        return value[:-1], "\n"
    if value.endswith("\r"):
        return value[:-1], "\r"
    return value, ""


def redact_unified_diff_added_lines(
    diff_text: str,
    *,
    min_token_len: int,
    entropy_threshold: float,
) -> RedactionResult:
    redacted_lines: list[str] = []
    masked_count = 0
    entropy_hits = 0
    rules_hit: Counter[str] = Counter()
    inside_private_key_block = False

    for raw_line in diff_text.splitlines(keepends=True):
        if raw_line.startswith("+") and not raw_line.startswith("+++ "):
            line_content_with_ending = raw_line[1:]
            line_content, line_ending = _split_line_ending(line_content_with_ending)

            if inside_private_key_block:
                masked_count += 1
                rules_hit.update({"SECRET_PRIVATE_KEY_BLOCK": 1})
                redacted_lines.append("+[REDACTED_PRIVATE_KEY]" + line_ending)
                if "END PRIVATE KEY-----" in line_content:
                    inside_private_key_block = False
                continue

            line_result = scan_added_line_for_secrets(
                line_content,
                min_token_len=min_token_len,
                entropy_threshold=entropy_threshold,
            )

            if "BEGIN PRIVATE KEY-----" in line_content:
                inside_private_key_block = "END PRIVATE KEY-----" not in line_content
                masked_count += 1
                rules_hit.update({"SECRET_PRIVATE_KEY_BLOCK": 1})
                redacted_lines.append("+[REDACTED_PRIVATE_KEY]" + line_ending)
                continue

            masked_count += line_result.masked_count
            entropy_hits += line_result.entropy_hits
            rules_hit.update(line_result.rules_hit)
            redacted_lines.append("+" + line_result.redacted_content + line_ending)
            continue

        redacted_lines.append(raw_line)

    return RedactionResult(
        diff_redacted="".join(redacted_lines),
        masked_count=masked_count,
        rules_hit=dict(rules_hit),
        entropy_hits=entropy_hits,
    )

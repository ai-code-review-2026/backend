from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from typing import Any

from app.core.change_classification.dtos import ChangeClassificationResult, ChangeType
from app.core.review_engine.diff_engine import ParsedDiff

_TOKEN_SPLIT_RE = re.compile(r"[^a-z0-9]+")
_CONVENTIONAL_PREFIX_RE = re.compile(r"^(fix|feat|feature|refactor)(?:\([^)]+\))?:")

_BUGFIX_KEYWORDS = {
    "bug",
    "bugfix",
    "crash",
    "error",
    "fix",
    "hotfix",
    "issue",
    "patch",
    "regression",
    "resolve",
}
_FEATURE_KEYWORDS = {
    "add",
    "create",
    "enable",
    "enhancement",
    "feature",
    "feat",
    "implement",
    "introduce",
    "new",
    "support",
}
_REFACTOR_KEYWORDS = {
    "cleanup",
    "extract",
    "move",
    "optimize",
    "refactor",
    "rename",
    "reorganize",
    "restructure",
    "simplify",
}


class ChangeClassifier:
    def classify(self, *, metadata: Mapping[str, Any] | None, parsed_diff: ParsedDiff) -> ChangeClassificationResult:
        safe_metadata = metadata or {}
        scores: dict[ChangeType, float] = {"bugfix": 0.0, "feature": 0.0, "refactor": 0.0}

        metadata_signals = self._score_metadata(scores=scores, metadata=safe_metadata)
        diff_signals = self._score_diff(scores=scores, parsed_diff=parsed_diff)

        selected_change_type = self._pick_change_type(scores=scores, metadata_signals=metadata_signals, diff_signals=diff_signals)
        confidence = self._compute_confidence(scores=scores, selected_change_type=selected_change_type)
        signals = {
            "metadata": metadata_signals,
            "diff": diff_signals,
            "scores": {k: round(v, 3) for k, v in scores.items()},
        }
        return ChangeClassificationResult(
            change_type=selected_change_type,
            confidence=confidence,
            source="heuristic",
            signals=signals,
        )

    def _score_metadata(self, *, scores: dict[ChangeType, float], metadata: Mapping[str, Any]) -> dict[str, Any]:
        labels = self._extract_labels(metadata)
        title = self._pick_first_string(metadata, ("title", "pr_title", "pull_request_title"))
        commit_message = self._pick_first_string(
            metadata,
            ("commit_message", "head_commit_message", "message"),
        )
        branch = self._pick_first_string(metadata, ("branch", "head_ref", "ref_name"))

        label_tokens = self._tokenize_many(labels)
        title_tokens = self._tokenize(title)
        commit_tokens = self._tokenize(commit_message)
        branch_tokens = self._tokenize(branch)

        bugfix_hits: list[str] = []
        feature_hits: list[str] = []
        refactor_hits: list[str] = []

        bugfix_hits.extend(self._score_tokens(scores=scores, target="bugfix", tokens=label_tokens, keywords=_BUGFIX_KEYWORDS, weight=3.0))
        feature_hits.extend(self._score_tokens(scores=scores, target="feature", tokens=label_tokens, keywords=_FEATURE_KEYWORDS, weight=3.0))
        refactor_hits.extend(
            self._score_tokens(scores=scores, target="refactor", tokens=label_tokens, keywords=_REFACTOR_KEYWORDS, weight=3.0)
        )

        bugfix_hits.extend(self._score_tokens(scores=scores, target="bugfix", tokens=title_tokens, keywords=_BUGFIX_KEYWORDS, weight=1.5))
        feature_hits.extend(self._score_tokens(scores=scores, target="feature", tokens=title_tokens, keywords=_FEATURE_KEYWORDS, weight=1.5))
        refactor_hits.extend(
            self._score_tokens(scores=scores, target="refactor", tokens=title_tokens, keywords=_REFACTOR_KEYWORDS, weight=1.5)
        )

        bugfix_hits.extend(self._score_tokens(scores=scores, target="bugfix", tokens=commit_tokens, keywords=_BUGFIX_KEYWORDS, weight=1.2))
        feature_hits.extend(
            self._score_tokens(scores=scores, target="feature", tokens=commit_tokens, keywords=_FEATURE_KEYWORDS, weight=1.2)
        )
        refactor_hits.extend(
            self._score_tokens(scores=scores, target="refactor", tokens=commit_tokens, keywords=_REFACTOR_KEYWORDS, weight=1.2)
        )

        bugfix_hits.extend(self._score_tokens(scores=scores, target="bugfix", tokens=branch_tokens, keywords=_BUGFIX_KEYWORDS, weight=1.0))
        feature_hits.extend(self._score_tokens(scores=scores, target="feature", tokens=branch_tokens, keywords=_FEATURE_KEYWORDS, weight=1.0))
        refactor_hits.extend(
            self._score_tokens(scores=scores, target="refactor", tokens=branch_tokens, keywords=_REFACTOR_KEYWORDS, weight=1.0)
        )

        conventional_prefix = None
        prefixed_text = title or commit_message
        if prefixed_text:
            matched = _CONVENTIONAL_PREFIX_RE.match(prefixed_text.lower().strip())
            if matched:
                conventional_prefix = matched.group(1)
                if conventional_prefix == "fix":
                    scores["bugfix"] += 4.0
                    bugfix_hits.append("conventional:fix")
                elif conventional_prefix in {"feat", "feature"}:
                    scores["feature"] += 4.0
                    feature_hits.append(f"conventional:{conventional_prefix}")
                elif conventional_prefix == "refactor":
                    scores["refactor"] += 4.0
                    refactor_hits.append("conventional:refactor")

        return {
            "labels": labels,
            "title": title,
            "commit_message": commit_message,
            "branch": branch,
            "conventional_prefix": conventional_prefix,
            "hits": {
                "bugfix": sorted(set(bugfix_hits)),
                "feature": sorted(set(feature_hits)),
                "refactor": sorted(set(refactor_hits)),
            },
        }

    def _score_diff(self, *, scores: dict[ChangeType, float], parsed_diff: ParsedDiff) -> dict[str, Any]:
        files_count = len(parsed_diff.files)
        additions = sum(file_item.additions_count for file_item in parsed_diff.files)
        deletions = sum(file_item.deletions_count for file_item in parsed_diff.files)
        total_changes = additions + deletions
        addition_ratio = (additions / total_changes) if total_changes > 0 else 0.0

        renamed_files = [f.path_new for f in parsed_diff.files if f.change_type == "renamed"]
        new_files = [f.path_new for f in parsed_diff.files if f.change_type == "added"]
        deleted_files = [f.path_new for f in parsed_diff.files if f.change_type == "deleted"]
        test_files = [f.path_new for f in parsed_diff.files if self._is_test_path(f.path_new)]
        config_files = [f.path_new for f in parsed_diff.files if self._is_config_path(f.path_new)]

        if new_files:
            scores["feature"] += 2.0
        if renamed_files:
            scores["refactor"] += 2.0
        if renamed_files and total_changes == 0:
            scores["refactor"] += 1.5
        if files_count <= 3 and total_changes <= 30:
            scores["bugfix"] += 1.0
        if total_changes >= 120:
            scores["feature"] += 1.0
        if additions >= 30 and addition_ratio >= 0.75:
            scores["feature"] += 2.0
        if total_changes >= 20 and 0.4 <= addition_ratio <= 0.6:
            scores["refactor"] += 1.5
        if deletions > additions and total_changes >= 20:
            scores["refactor"] += 1.0
        if test_files and len(test_files) == files_count:
            scores["bugfix"] += 1.0
        if config_files:
            scores["refactor"] += 0.5

        return {
            "files_count": files_count,
            "additions": additions,
            "deletions": deletions,
            "total_changes": total_changes,
            "addition_ratio": round(addition_ratio, 4),
            "renamed_files_count": len(renamed_files),
            "new_files_count": len(new_files),
            "deleted_files_count": len(deleted_files),
            "test_files_count": len(test_files),
            "config_files_count": len(config_files),
            "sample_paths": [f.path_new for f in parsed_diff.files[:10]],
        }

    def _pick_change_type(
        self,
        *,
        scores: dict[ChangeType, float],
        metadata_signals: Mapping[str, Any],
        diff_signals: Mapping[str, Any],
    ) -> ChangeType:
        max_score = max(scores.values())
        winners = [key for key, value in scores.items() if value == max_score]
        if len(winners) == 1:
            return winners[0]

        metadata_hits = metadata_signals.get("hits", {})
        bugfix_hits = metadata_hits.get("bugfix", [])
        feature_hits = metadata_hits.get("feature", [])

        if bugfix_hits:
            return "bugfix"
        if feature_hits:
            return "feature"

        additions = int(diff_signals.get("additions", 0))
        deletions = int(diff_signals.get("deletions", 0))
        if additions > deletions:
            return "feature"
        return "refactor"

    def _compute_confidence(self, *, scores: dict[ChangeType, float], selected_change_type: ChangeType) -> float:
        total = sum(value for value in scores.values() if value > 0)
        if total <= 0:
            return 0.34
        confidence = scores[selected_change_type] / total
        confidence = max(0.34, min(1.0, confidence))
        return round(confidence, 3)

    @staticmethod
    def _pick_first_string(metadata: Mapping[str, Any], keys: Iterable[str]) -> str | None:
        for key in keys:
            value = metadata.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        return None

    @staticmethod
    def _extract_labels(metadata: Mapping[str, Any]) -> list[str]:
        raw_labels = metadata.get("labels")
        if raw_labels is None:
            return []
        labels: list[str] = []
        if isinstance(raw_labels, str):
            cleaned = raw_labels.strip()
            if cleaned:
                labels.append(cleaned)
            return labels

        if not isinstance(raw_labels, list):
            return labels
        for item in raw_labels:
            if isinstance(item, str) and item.strip():
                labels.append(item.strip())
                continue
            if isinstance(item, Mapping):
                for field_name in ("name", "label", "value"):
                    field_value = item.get(field_name)
                    if isinstance(field_value, str) and field_value.strip():
                        labels.append(field_value.strip())
                        break
        return labels

    @staticmethod
    def _tokenize(text: str | None) -> list[str]:
        if not text:
            return []
        lowered = text.lower()
        return [token for token in _TOKEN_SPLIT_RE.split(lowered) if token]

    def _tokenize_many(self, values: Iterable[str]) -> list[str]:
        output: list[str] = []
        for value in values:
            output.extend(self._tokenize(value))
        return output

    @staticmethod
    def _score_tokens(
        *,
        scores: dict[ChangeType, float],
        target: ChangeType,
        tokens: Iterable[str],
        keywords: set[str],
        weight: float,
    ) -> list[str]:
        hits: list[str] = []
        for token in tokens:
            if token not in keywords:
                continue
            scores[target] += weight
            hits.append(token)
        return hits

    @staticmethod
    def _is_test_path(path: str) -> bool:
        lowered = path.lower()
        return (
            "/test" in lowered
            or "/tests" in lowered
            or lowered.startswith("test/")
            or lowered.startswith("tests/")
            or lowered.endswith("_test.py")
            or lowered.endswith("_spec.py")
        )

    @staticmethod
    def _is_config_path(path: str) -> bool:
        lowered = path.lower()
        return lowered.endswith((".toml", ".yaml", ".yml", ".ini", ".cfg")) or lowered.startswith(".github/")

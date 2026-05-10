from __future__ import annotations

from app.core.change_classification import ChangeClassifier
from app.core.review_engine.diff_engine import FileDiff, ParsedDiff


def _parsed(*files: FileDiff) -> ParsedDiff:
    return ParsedDiff(files=list(files))


def test_classify_bugfix_from_metadata_and_small_diff() -> None:
    classifier = ChangeClassifier()
    result = classifier.classify(
        metadata={
            "title": "fix: handle crash on login",
            "commit_message": "resolve null pointer issue",
            "labels": ["bug", "backend"],
        },
        parsed_diff=_parsed(
            FileDiff(path_new="app/auth.py", change_type="modified", additions_count=3, deletions_count=2, hunks=[]),
        ),
    )

    assert result.change_type == "bugfix"
    assert 0 <= result.confidence <= 1
    assert result.source == "heuristic"


def test_classify_feature_from_new_files_and_additions() -> None:
    classifier = ChangeClassifier()
    result = classifier.classify(
        metadata={
            "title": "feat: add sms scheduling",
            "labels": ["enhancement"],
            "branch": "feature/sms-scheduling",
        },
        parsed_diff=_parsed(
            FileDiff(path_new="app/api/sms.py", change_type="added", additions_count=90, deletions_count=0, hunks=[]),
            FileDiff(path_new="app/services/scheduler.py", change_type="added", additions_count=40, deletions_count=6, hunks=[]),
        ),
    )

    assert result.change_type == "feature"
    assert result.confidence >= 0.5


def test_classify_refactor_from_rename_only_change() -> None:
    classifier = ChangeClassifier()
    result = classifier.classify(
        metadata={
            "title": "refactor: rename auth module",
            "labels": ["refactor"],
        },
        parsed_diff=_parsed(
            FileDiff(
                path_old="app/auth.py",
                path_new="app/security/auth.py",
                change_type="renamed",
                additions_count=0,
                deletions_count=0,
                hunks=[],
            ),
        ),
    )

    assert result.change_type == "refactor"
    assert result.confidence >= 0.5


def test_tie_breaker_prefers_feature_when_additions_are_higher() -> None:
    classifier = ChangeClassifier()
    result = classifier.classify(
        metadata={},
        parsed_diff=_parsed(
            FileDiff(path_new="app/a.py", change_type="modified", additions_count=20, deletions_count=10, hunks=[]),
            FileDiff(path_new="app/b.py", change_type="modified", additions_count=20, deletions_count=10, hunks=[]),
        ),
    )

    assert result.change_type == "feature"


def test_result_contains_serializable_signals() -> None:
    classifier = ChangeClassifier()
    result = classifier.classify(
        metadata={"title": "update implementation"},
        parsed_diff=_parsed(
            FileDiff(path_new="app/main.py", change_type="modified", additions_count=8, deletions_count=8, hunks=[]),
        ),
    )

    assert "metadata" in result.signals
    assert "diff" in result.signals
    assert "scores" in result.signals

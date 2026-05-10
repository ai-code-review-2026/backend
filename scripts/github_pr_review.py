#!/usr/bin/env python3
"""
Backward compatibility wrapper for github_pr_review.py
This script has been moved to tools/github/github_pr_review.py

This wrapper will be removed after 1-2 sprint cycles once all team members
have migrated to the new structure.
"""
import sys
from pathlib import Path

# Add tools/github to path
sys.path.insert(0, str(Path(__file__).parent.parent / "tools" / "github"))

# Import and run the actual script
from github_pr_review import main, format_review_markdown

if __name__ == "__main__":
    print("⚠️  WARNING: scripts/github_pr_review.py is deprecated!")
    print("   Please use: tools/github/github_pr_review.py")
    print("   This wrapper will be removed in future releases.\n")
    main()

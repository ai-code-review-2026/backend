#!/usr/bin/env python3
"""
Backward compatibility wrapper for langchain_qdrant_aliases.py
This script has been moved to tools/kb/langchain_qdrant_aliases.py

This wrapper will be removed after 1-2 sprint cycles once all team members
have migrated to the new structure.
"""
import sys
from pathlib import Path

# Add tools/kb to path
sys.path.insert(0, str(Path(__file__).parent.parent / "tools" / "kb"))

# Import and run the actual script
from langchain_qdrant_aliases import main

if __name__ == "__main__":
    print("⚠️  WARNING: scripts/langchain_qdrant_aliases.py is deprecated!")
    print("   Please use: tools/kb/langchain_qdrant_aliases.py")
    print("   Or run via Makefile: make langchain-qdrant-aliases")
    print("   This wrapper will be removed in future releases.\n")
    main()

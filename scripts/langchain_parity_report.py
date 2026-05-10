#!/usr/bin/env python3
"""
Backward compatibility wrapper for langchain_parity_report.py
This script has been moved to tools/kb/langchain_parity_report.py

This wrapper will be removed after 1-2 sprint cycles once all team members
have migrated to the new structure.
"""
import sys
from pathlib import Path

# Add tools/kb to path
sys.path.insert(0, str(Path(__file__).parent.parent / "tools" / "kb"))

# Import and run the actual script
from langchain_parity_report import main

if __name__ == "__main__":
    print("⚠️  WARNING: scripts/langchain_parity_report.py is deprecated!")
    print("   Please use: tools/kb/langchain_parity_report.py")
    print("   Or run via Makefile: make langchain-parity")
    print("   This wrapper will be removed in future releases.\n")
    main()

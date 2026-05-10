#!/usr/bin/env python3
"""
Backward compatibility wrapper for stop_queued_analyses.py
This script has been moved to tools/dev/stop_queued_analyses.py

This wrapper will be removed after 1-2 sprint cycles once all team members
have migrated to the new structure.
"""
import sys
from pathlib import Path

# Add tools/dev to path
sys.path.insert(0, str(Path(__file__).parent / "tools" / "dev"))

# Import and run the actual script
from stop_queued_analyses import main

if __name__ == "__main__":
    print("⚠️  WARNING: stop_queued_analyses.py is deprecated!")
    print("   Please use: tools/dev/stop_queued_analyses.py")
    print("   This wrapper will be removed in future releases.\n")
    main()

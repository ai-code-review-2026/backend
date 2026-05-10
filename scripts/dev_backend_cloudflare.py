#!/usr/bin/env python3
"""
Backward compatibility wrapper for dev_backend_cloudflare.py
This script has been moved to tools/dev/dev_backend_cloudflare.py

This wrapper will be removed after 1-2 sprint cycles once all team members
have migrated to the new structure.
"""
import sys
from pathlib import Path

# Add tools/dev to path
sys.path.insert(0, str(Path(__file__).parent.parent / "tools" / "dev"))

# Import and run the actual script
from dev_backend_cloudflare import main

if __name__ == "__main__":
    print("⚠️  WARNING: scripts/dev_backend_cloudflare.py is deprecated!")
    print("   Please use: tools/dev/dev_backend_cloudflare.py")
    print("   Or run via Makefile: make dev-backend-cloudflare")
    print("   This wrapper will be removed in future releases.\n")
    main()

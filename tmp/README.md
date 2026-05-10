# Runtime Artifacts Directory

This directory contains temporary files, generated artifacts, and runtime outputs that should not be committed to version control.

## Structure

```
tmp/
├── reports/   # Analysis reports and generated documentation
├── scans/     # Semgrep, Ruff, and other static analysis outputs
├── logs/      # Local log files
└── cache/     # Temporary caches
```

## Usage

All tools and scripts should write temporary outputs to subdirectories within `tmp/`:
- Static analysis tools → `tmp/scans/`
- Report generators → `tmp/reports/`
- Log collectors → `tmp/logs/`
- Cache systems → `tmp/cache/`

## Cleanup

To clean up temporary files:
```bash
rm -rf tmp/*
```

Note: The `.gitignore` in this directory ensures that all contents except `.gitignore` and `README.md` are ignored by Git.

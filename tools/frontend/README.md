# Frontend Development Tools

Scripts for Next.js dashboard development and build processes.

## Scripts

### sync-clerk-assets.cjs
Syncs Clerk authentication assets for local serving.

**Usage:**
```bash
node tools/frontend/sync-clerk-assets.cjs
```

**Auto-run:** Automatically runs via `predev`, `prebuild`, and `prestart` hooks in `apps/dashboard/package.json`.

### reset-next-cache.cjs
Clears Next.js build cache (`.next` directory).

**Usage:**
```bash
node tools/frontend/reset-next-cache.cjs
```

**Auto-run:** Automatically runs via npm scripts.

### extract-pdf-text.cjs
Utility for extracting text from PDF files.

**Usage:**
```bash
node tools/frontend/extract-pdf-text.cjs <pdf-file>
```

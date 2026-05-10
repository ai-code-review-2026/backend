# Devora VS Code Extension

Client extension for the Devora AI Code Review platform.

## Features

- `Devora: Push & Analyze`
  - Runs `git push`
  - Collects repository, branch, commit SHA, changed files, and diff
  - Calls `POST /api/v1/reviews/from-vscode`
- `Devora: Analyze Current Branch`
  - Uses current branch state without pushing
  - Calls the same Devora API endpoint
- `Devora: Set Personal Token`
  - Stores a per-user token in VS Code secret storage.
- `Devora: Clear Personal Token`
  - Removes the stored personal token.
- Devora side panel in VS Code activity bar with latest queued analysis info

## Configuration

Set in VS Code settings:

- `devora.apiUrl`
  - Example: `http://135.125.100.150:8000` (current IP mode)
  - Later: `https://api.dev-ora.tn`
- `devora.apiToken`
  - Sent as `X-Devora-Token`.
  - Must match backend `VSCODE_EXTENSION_API_TOKEN` when configured.
  - Legacy fallback only. Prefer personal token commands above.
- `devora.projectId` (optional)
  - Devora project UUID.
  - If empty, backend resolves project by `owner/repo`.

## Backend Requirements

This extension expects backend endpoint:

- `POST /api/v1/reviews/from-vscode`
- `GET /api/v1/reviews/vscode-tokens`
- `POST /api/v1/reviews/vscode-tokens`
- `DELETE /api/v1/reviews/vscode-tokens/{token_id}`

Auth behavior:

- Preferred: set a personal token (`X-Devora-User-Token`) generated from the Devora account linked to your user.
- Legacy fallback: if `devora.apiToken` is set, extension sends `X-Devora-Token`.
- If no token is set and backend auth enforcement is on, ingestion is blocked by design.

## Build

```bash
npm install
npm run compile
```

Optional package:

```bash
npm run package
```

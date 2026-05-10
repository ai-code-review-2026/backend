# Changelog

## 0.0.2

- Added per-user personal token support (`X-Devora-User-Token`) stored in VS Code secret storage.
- Added `Devora: Set Personal Token` and `Devora: Clear Personal Token` commands.
- Kept `devora.apiToken` as legacy fallback for shared-token deployments.
- Added backend endpoints for personal token lifecycle:
  - `GET /api/v1/reviews/vscode-tokens`
  - `POST /api/v1/reviews/vscode-tokens`
  - `DELETE /api/v1/reviews/vscode-tokens/{token_id}`
- Linked VS Code-triggered analyses to the authenticated platform user metadata.

## 0.0.1

- Initial public release.
- Added `Devora: Push & Analyze` command.
- Added `Devora: Analyze Current Branch` command.
- Added Devora side panel with latest analysis queue status.
- Added backend integration for `POST /api/v1/reviews/from-vscode`.

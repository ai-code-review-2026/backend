import * as vscode from "vscode";

export type VSCodeReviewSource = "vscode-extension" | "vscode-extension-manual-analysis";

export interface TriggerReviewPayload {
  repositoryUrl: string;
  repository: string;
  branch: string;
  commitSha: string;
  projectId?: string;
  changedFiles: string[];
  diff: string;
  source: VSCodeReviewSource;
  metadata?: Record<string, unknown>;
}

export interface TriggerReviewResponse {
  analysis_id: string;
  status: "QUEUED";
  task_id?: string;
  project_id: string;
  repo: string;
  branch: string;
  commit_sha: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
export const DEVORA_USER_TOKEN_SECRET_KEY = "devora.userToken";

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export class DevoraApiClient {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async triggerReview(payload: TriggerReviewPayload): Promise<TriggerReviewResponse> {
    const config = vscode.workspace.getConfiguration("devora");
    const apiUrlRaw = String(config.get<string>("apiUrl") ?? "").trim();
    if (!apiUrlRaw) {
      throw new Error("Configuration missing: devora.apiUrl");
    }

    const apiUrl = normalizeBaseUrl(apiUrlRaw);
    const personalToken = String((await this.context.secrets.get(DEVORA_USER_TOKEN_SECRET_KEY)) ?? "").trim();
    const apiToken = String(config.get<string>("apiToken") ?? "").trim();
    const timeoutMs = Number(config.get<number>("requestTimeoutMs") ?? DEFAULT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (personalToken) {
      headers["X-Devora-User-Token"] = personalToken;
    } else if (apiToken) {
      headers["X-Devora-Token"] = apiToken;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${apiUrl}/api/v1/reviews/from-vscode`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const rawBody = await response.text();
      if (!response.ok) {
        const compact = rawBody.trim().slice(0, 500);
        throw new Error(`Devora API ${response.status}: ${compact || response.statusText}`);
      }

      if (!rawBody.trim()) {
        throw new Error("Devora API returned empty response body.");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        throw new Error("Devora API did not return valid JSON.");
      }

      const data = parsed as Partial<TriggerReviewResponse>;
      if (!data.analysis_id || !data.status || !data.project_id || !data.repo) {
        throw new Error("Devora API response is missing required fields.");
      }
      return data as TriggerReviewResponse;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

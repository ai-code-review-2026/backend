import * as vscode from "vscode";
import {
  DEVORA_USER_TOKEN_SECRET_KEY,
  DevoraApiClient,
  type TriggerReviewPayload,
} from "./apiClient";
import {
  getBranchDiffAgainstUpstream,
  getChangedFilesFromLastCommit,
  getRepositorySnapshot,
  getWorkspaceRoot,
  pushCurrentBranch,
} from "./gitService";
import { DevoraReviewViewProvider } from "./reviewPanel";

async function showJsonDocument(payload: unknown): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    content: JSON.stringify(payload, null, 2),
    language: "json",
  });
  await vscode.window.showTextDocument(document, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });
}

function buildPayload(
  source: "vscode-extension" | "vscode-extension-manual-analysis",
  params: {
    repositoryUrl: string;
    repository: string;
    branch: string;
    commitSha: string;
    changedFiles: string[];
    diff: string;
  },
): TriggerReviewPayload {
  const projectId = String(vscode.workspace.getConfiguration("devora").get<string>("projectId") ?? "").trim();
  return {
    source,
    repositoryUrl: params.repositoryUrl,
    repository: params.repository,
    branch: params.branch,
    commitSha: params.commitSha,
    changedFiles: params.changedFiles,
    diff: params.diff,
    projectId: projectId || undefined,
    metadata: {
      triggered_from: "vscode-extension",
      editor: "vscode",
      timestamp: new Date().toISOString(),
    },
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const apiClient = new DevoraApiClient(context);
  const reviewViewProvider = new DevoraReviewViewProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("devoraReviewView", reviewViewProvider),
  );

  const setPersonalToken = vscode.commands.registerCommand("devora.setPersonalToken", async () => {
    const token = await vscode.window.showInputBox({
      title: "Devora Personal Token",
      prompt: "Paste your personal Devora VS Code token",
      placeHolder: "dvt_...",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        if (!value.trim()) {
          return "Token is required.";
        }
        if (value.trim().length < 16) {
          return "Token looks too short.";
        }
        return undefined;
      },
    });
    if (token === undefined) {
      return;
    }
    await context.secrets.store(DEVORA_USER_TOKEN_SECRET_KEY, token.trim());
    vscode.window.showInformationMessage("Devora personal token saved.");
  });

  const clearPersonalToken = vscode.commands.registerCommand("devora.clearPersonalToken", async () => {
    await context.secrets.delete(DEVORA_USER_TOKEN_SECRET_KEY);
    vscode.window.showInformationMessage("Devora personal token cleared.");
  });

  const pushAndAnalyze = vscode.commands.registerCommand("devora.pushAndAnalyze", async () => {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Devora: Push & Analyze",
          cancellable: false,
        },
        async (progress) => {
          const workspaceRoot = getWorkspaceRoot();
          progress.report({ message: "Pushing current branch..." });
          await pushCurrentBranch(workspaceRoot);

          progress.report({ message: "Preparing Git payload..." });
          const snapshot = await getRepositorySnapshot(workspaceRoot);
          const changedFiles = await getChangedFilesFromLastCommit(workspaceRoot, snapshot.commitSha);
          const diff = await getBranchDiffAgainstUpstream(workspaceRoot, snapshot.commitSha);

          const payload = buildPayload("vscode-extension", {
            repositoryUrl: snapshot.repositoryUrl,
            repository: snapshot.repository,
            branch: snapshot.branch,
            commitSha: snapshot.commitSha,
            changedFiles,
            diff,
          });

          progress.report({ message: "Triggering Devora API..." });
          const result = await apiClient.triggerReview(payload);
          reviewViewProvider.setLatest(result);

          vscode.window.showInformationMessage(
            `Devora analysis queued (${result.analysis_id.slice(0, 8)}...) on ${result.repo}`,
          );
          await showJsonDocument(result);
        },
      );
    } catch (error: unknown) {
      vscode.window.showErrorMessage(`Devora Push & Analyze failed: ${String((error as Error).message || error)}`);
    }
  });

  const analyzeCurrentBranch = vscode.commands.registerCommand("devora.analyzeCurrentBranch", async () => {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Devora: Analyze Current Branch",
          cancellable: false,
        },
        async (progress) => {
          const workspaceRoot = getWorkspaceRoot();
          progress.report({ message: "Reading repository state..." });
          const snapshot = await getRepositorySnapshot(workspaceRoot);
          const changedFiles = await getChangedFilesFromLastCommit(workspaceRoot, snapshot.commitSha);
          const diff = await getBranchDiffAgainstUpstream(workspaceRoot, snapshot.commitSha);

          const payload = buildPayload("vscode-extension-manual-analysis", {
            repositoryUrl: snapshot.repositoryUrl,
            repository: snapshot.repository,
            branch: snapshot.branch,
            commitSha: snapshot.commitSha,
            changedFiles,
            diff,
          });

          progress.report({ message: "Triggering Devora API..." });
          const result = await apiClient.triggerReview(payload);
          reviewViewProvider.setLatest(result);

          vscode.window.showInformationMessage(
            `Devora analysis queued (${result.analysis_id.slice(0, 8)}...) on ${result.repo}`,
          );
          await showJsonDocument(result);
        },
      );
    } catch (error: unknown) {
      vscode.window.showErrorMessage(`Devora Analyze Current Branch failed: ${String((error as Error).message || error)}`);
    }
  });

  context.subscriptions.push(pushAndAnalyze, analyzeCurrentBranch, setPersonalToken, clearPersonalToken);
}

export function deactivate(): void {}

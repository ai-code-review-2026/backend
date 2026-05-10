import * as vscode from "vscode";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export interface RepositorySnapshot {
  workspaceRoot: string;
  repositoryUrl: string;
  repository: string;
  branch: string;
  commitSha: string;
}

function normalizeRepoFromRemote(remote: string): string {
  const normalized = remote.trim();
  const sshMatch = normalized.match(/^(?:ssh:\/\/)?git@[^:/]+[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`.toLowerCase();
  }
  const httpMatch = normalized.match(/^https?:\/\/[^/]+\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (httpMatch) {
    return `${httpMatch[1]}/${httpMatch[2]}`.toLowerCase();
  }
  if (/^[^/\s]+\/[^/\s]+$/i.test(normalized)) {
    return normalized.toLowerCase();
  }
  throw new Error(`Unsupported Git remote format: ${remote}`);
}

async function runGit(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });
    return stdout.trim();
  } catch (error: unknown) {
    const details = String((error as { stderr?: string; message?: string }).stderr || (error as { message?: string }).message || "");
    throw new Error(`git ${args.join(" ")} failed: ${details.trim()}`);
  }
}

export function getWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    throw new Error("No workspace folder is open in VS Code.");
  }
  return folders[0].uri.fsPath;
}

export async function getRepositorySnapshot(workspaceRoot?: string): Promise<RepositorySnapshot> {
  const root = workspaceRoot ?? getWorkspaceRoot();
  const repositoryUrl = await runGit(["config", "--get", "remote.origin.url"], root);
  const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], root);
  const commitSha = await runGit(["rev-parse", "HEAD"], root);
  const repository = normalizeRepoFromRemote(repositoryUrl);
  return {
    workspaceRoot: root,
    repositoryUrl,
    repository,
    branch,
    commitSha,
  };
}

export async function pushCurrentBranch(workspaceRoot: string): Promise<void> {
  await runGit(["push"], workspaceRoot);
}

export async function getChangedFilesFromLastCommit(workspaceRoot: string, commitSha: string): Promise<string[]> {
  const output = await runGit(["diff-tree", "--no-commit-id", "--name-only", "-r", commitSha], workspaceRoot);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function getLastCommitDiff(workspaceRoot: string, commitSha: string): Promise<string> {
  const diff = await runGit(["show", "--format=", "--patch", "--no-color", commitSha], workspaceRoot);
  if (!diff.trim()) {
    throw new Error("Last commit diff is empty. Make sure you committed changes.");
  }
  return diff;
}

export async function getBranchDiffAgainstUpstream(workspaceRoot: string, commitShaFallback: string): Promise<string> {
  try {
    const upstream = await runGit(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], workspaceRoot);
    const diff = await runGit(["diff", "--no-color", `${upstream}...HEAD`], workspaceRoot);
    if (diff.trim()) {
      return diff;
    }
  } catch {
    // Fallback below.
  }
  return getLastCommitDiff(workspaceRoot, commitShaFallback);
}

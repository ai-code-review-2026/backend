import * as vscode from "vscode";
import type { TriggerReviewResponse } from "./apiClient";

class ReviewItem extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
  }
}

export class DevoraReviewViewProvider implements vscode.TreeDataProvider<ReviewItem> {
  private latest: TriggerReviewResponse | null = null;
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<ReviewItem | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  setLatest(result: TriggerReviewResponse): void {
    this.latest = result;
    this.refresh();
  }

  getTreeItem(element: ReviewItem): vscode.TreeItem {
    return element;
  }

  getChildren(): Thenable<ReviewItem[]> {
    if (!this.latest) {
      return Promise.resolve([new ReviewItem("No analysis queued yet")]);
    }
    return Promise.resolve([
      new ReviewItem("Status", this.latest.status),
      new ReviewItem("Analysis ID", this.latest.analysis_id),
      new ReviewItem("Project ID", this.latest.project_id),
      new ReviewItem("Repository", this.latest.repo),
      new ReviewItem("Branch", this.latest.branch),
      new ReviewItem("Commit", this.latest.commit_sha.slice(0, 12)),
      new ReviewItem("Task ID", this.latest.task_id || "n/a"),
    ]);
  }
}

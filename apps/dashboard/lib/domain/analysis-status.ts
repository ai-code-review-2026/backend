export type CanonicalAnalysisStatus =
  | "RECEIVED"
  | "QUEUED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"

export type DashboardRunStatus = "completed" | "failed" | "running"

const RUNNING_STATUSES = new Set(["RUNNING", "QUEUED", "RECEIVED"])

export function normalizeAnalysisStatus(
  status: string | null | undefined,
): CanonicalAnalysisStatus {
  const raw = (status ?? "").trim().toUpperCase()
  if (raw === "DONE" || raw === "COMPLETED") {
    return "COMPLETED"
  }
  if (raw === "FAILED") {
    return "FAILED"
  }
  if (RUNNING_STATUSES.has(raw)) {
    return raw as CanonicalAnalysisStatus
  }
  return "QUEUED"
}

export function normalizeDashboardRunStatus(
  status: string | null | undefined,
): DashboardRunStatus {
  const normalized = normalizeAnalysisStatus(status)
  if (normalized === "COMPLETED") {
    return "completed"
  }
  if (normalized === "FAILED") {
    return "failed"
  }
  return "running"
}

export function isTerminalAnalysisStatus(status: string | null | undefined): boolean {
  const normalized = normalizeAnalysisStatus(status)
  return normalized === "COMPLETED" || normalized === "FAILED"
}

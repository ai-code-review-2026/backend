/**
 * Diff Editor Utilities
 * 
 * Helper functions for the diff editor interface.
 */

export type RepoCoordinates = { owner: string; repo: string }

export function getFileInfo(path: string) {
  const filename = path.split("/").pop() ?? path
  const ext = filename.split(".").pop()?.toUpperCase() ?? ""
  const extColors: Record<string, string> = {
    TS: "#3178c5",
    TSX: "#3178c5",
    JS: "#f7df1e",
    JSX: "#f7df1e",
    PY: "#3572a5",
    JSON: "#fbc02d",
    MD: "#42a5f5",
    CSS: "#42a5f5",
    HTML: "#e67e22",
    RS: "#ce412b",
    GO: "#00acd7",
    SH: "#4caf50",
    CP: "#9c27b0",
  }
  return {
    filename,
    ext: ext.slice(0, 2) || "??",
    extColor: extColors[ext] ?? "#6e7681",
  }
}

export function calculateQualityScore(findings: { severity: string }[]): number {
  const blockers = findings.filter((f) => f.severity === "BLOCKER").length
  const warnings = findings.filter((f) => f.severity === "WARN").length
  return Math.max(0, 100 - blockers * 15 - warnings * 5)
}

export function normalizePathForComparison(value: string | null | undefined): string {
  return (value ?? "").trim().replaceAll("\\", "/").replace(/^\/+/, "")
}

export function severityRank(severity: string): number {
  if (severity === "BLOCKER") return 0
  if (severity === "WARN") return 1
  return 2
}

const SOURCE_LABEL: Record<string, string> = {
  STATIC_RUFF: "Ruff",
  STATIC_SEMGREP: "Semgrep",
  STATIC_CLEAN_CODE: "CleanCode",
  STATIC_ESLINT: "ESLint",
  STATIC_STYLELINT: "Stylelint",
  STATIC_RUBOCOP: "RuboCop",
  STATIC_STATICCHECK: "Staticcheck",
  STATIC_SQLFLUFF: "SQLFluff",
  RAG: "AI Review",
}

export function toolLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source.replace("STATIC_", "").toLowerCase()
}

export function getScoreColor(score: number): string {
  if (score >= 80) return "#22c55e"
  if (score >= 60) return "#f59e0b"
  return "#ef4444"
}

export function getScoreGlow(score: number): string {
  if (score >= 80) return "0 0 12px rgba(34,197,94,0.35)"
  if (score >= 60) return "0 0 12px rgba(245,158,11,0.35)"
  return "0 0 12px rgba(239,68,68,0.35)"
}

export function parseRepoCoordinates(value: string | null | undefined): RepoCoordinates | null {
  const raw = (value ?? "").trim()
  if (!raw) return null
  const normalized = raw
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
  const parts = normalized.split("/").filter((part) => part.length > 0)
  if (parts.length < 2) return null
  return { owner: parts[0], repo: parts[1] }
}

export function formatTimestamp(isoDate: string | null | undefined): string {
  if (!isoDate) return "Unknown"
  try {
    const date = new Date(isoDate)
    return date.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return isoDate
  }
}

export function getSeverityIcon(severity: string): string {
  if (severity === "BLOCKER") return "🔴"
  if (severity === "WARN") return "⚠️"
  return "ℹ️"
}

export function getSeverityColor(severity: string): string {
  if (severity === "BLOCKER") return "#ef4444"
  if (severity === "WARN") return "#f59e0b"
  return "#60a5fa"
}

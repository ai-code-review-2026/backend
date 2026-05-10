/**
 * Review Queue Library
 *
 * Provides functions to fetch review queue data for reviewers.
 * Falls back to computing data from analyses when backend endpoint is unavailable.
 */

import { fetchDashboardAnalyses, type DashboardAnalysisItem } from "./dashboard-analyses"
import { normalizeAnalysisStatus as normalizeStatus } from "./domain/analysis-status"
import { createPoller } from "./polling"

// ============================================================================
// Types
// ============================================================================

export interface AnalysisFindingsSummary {
  blocker: number
  warn: number
  info: number
}

export interface QueueAnalysis {
  id: string
  repo: string
  pr_label: string
  author: string
  findings_summary: AnalysisFindingsSummary
  complexity_score: number
}

export interface QueueAssignment {
  id: string
  analysis: QueueAnalysis
  priority: "critical" | "high" | "medium" | "low"
  assignment_type: "auto" | "manual"
  assigned_at: string
  due_at: string
  status: "pending" | "in_progress" | "completed"
  wait_time_hours: number
  is_overdue: boolean
}

export interface QueueStats {
  pending_count: number
  in_progress_count: number
  overdue_count: number
}

export interface ReviewQueueData {
  assigned: QueueAssignment[]
  available: QueueAssignment[]
  stats: QueueStats
  isLoading: boolean
  error: string | null
}

// ============================================================================
// API Response Types
// ============================================================================

interface BackendAssignedItem {
  id?: string
  assignment_id?: string
  analysis_id?: string
  analysis?: {
    id?: string
    repo?: string
    pr_label?: string
    pr_number?: number
    author?: string
    findings_summary?: {
      blocker?: number
      warn?: number
      info?: number
    }
    complexity_score?: number
  }
  priority?: string
  assignment_type?: string
  assigned_at?: string
  due_at?: string
  status?: string
  wait_time_hours?: number
  is_overdue?: boolean
}

interface BackendAvailableItem {
  id?: string
  analysis_id?: string
  analysis?: {
    id?: string
    repo?: string
    pr_label?: string
    pr_number?: number
    author?: string
    findings_summary?: {
      blocker?: number
      warn?: number
      info?: number
    }
    complexity_score?: number
  }
  priority?: string
  assignment_type?: string
  created_at?: string
  due_at?: string
}

interface BackendQueueResponse {
  assigned?: BackendAssignedItem[]
  available?: BackendAvailableItem[]
  stats?: Partial<QueueStats>
}

// ============================================================================
// Default Data
// ============================================================================

export const defaultReviewQueueData: ReviewQueueData = {
  assigned: [],
  available: [],
  stats: {
    pending_count: 0,
    in_progress_count: 0,
    overdue_count: 0,
  },
  isLoading: false,
  error: null,
}

// ============================================================================
// Utility Functions
// ============================================================================

function getPriority(item: DashboardAnalysisItem): "critical" | "high" | "medium" | "low" {
  if (item.blockerCount >= 3) return "critical"
  if (item.blockerCount > 0) return "high"
  if (item.warnCount > 5) return "medium"
  return "low"
}

function computeComplexityScore(item: DashboardAnalysisItem): number {
  // Estimate complexity based on issues found
  const score = Math.min(5, (item.blockerCount * 1.5) + (item.warnCount * 0.3) + (item.infoCount * 0.1))
  return Math.round(score * 10) / 10
}

function computeWaitTimeHours(createdAt: string): number {
  if (!createdAt) return 0
  const created = new Date(createdAt)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  return Math.round(diffMs / (1000 * 60 * 60) * 10) / 10
}

function isOverdue(dueAt: string): boolean {
  if (!dueAt) return false
  return new Date(dueAt) < new Date()
}

// ============================================================================
// Compute Data from Analyses (Fallback)
// ============================================================================

function computeQueueFromAnalyses(analyses: DashboardAnalysisItem[]): ReviewQueueData {
  const now = new Date()

  // Filter completed analyses with issues (need review)
  const needsReview = analyses.filter(a => {
    const status = normalizeStatus(a.status)
    return status === "COMPLETED" && (a.blockerCount > 0 || a.warnCount > 0)
  })

  // Filter running analyses (potentially available for assignment)
  const running = analyses.filter(a => normalizeStatus(a.status) === "RUNNING")

  // Create assigned queue (simulated - take first half of needs review)
  const halfPoint = Math.ceil(needsReview.length / 2)
  const assignedAnalyses = needsReview.slice(0, halfPoint)
  const availableAnalyses = needsReview.slice(halfPoint)

  const assigned: QueueAssignment[] = assignedAnalyses.map((a, index) => {
    const waitTime = computeWaitTimeHours(a.createdAt)
    const dueAt = new Date(new Date(a.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString()

    return {
      id: `asg_${a.id}`,
      analysis: {
        id: a.id,
        repo: a.repo,
        pr_label: a.prLabel,
        author: a.author,
        findings_summary: {
          blocker: a.blockerCount,
          warn: a.warnCount,
          info: a.infoCount,
        },
        complexity_score: computeComplexityScore(a),
      },
      priority: getPriority(a),
      assignment_type: index % 2 === 0 ? "auto" as const : "manual" as const,
      assigned_at: a.createdAt,
      due_at: dueAt,
      status: "pending" as const,
      wait_time_hours: waitTime,
      is_overdue: isOverdue(dueAt),
    }
  })

  const available: QueueAssignment[] = availableAnalyses.map((a) => {
    const waitTime = computeWaitTimeHours(a.createdAt)
    const dueAt = new Date(new Date(a.createdAt).getTime() + 48 * 60 * 60 * 1000).toISOString()

    return {
      id: `avl_${a.id}`,
      analysis: {
        id: a.id,
        repo: a.repo,
        pr_label: a.prLabel,
        author: a.author,
        findings_summary: {
          blocker: a.blockerCount,
          warn: a.warnCount,
          info: a.infoCount,
        },
        complexity_score: computeComplexityScore(a),
      },
      priority: getPriority(a),
      assignment_type: "auto" as const,
      assigned_at: a.createdAt,
      due_at: dueAt,
      status: "pending" as const,
      wait_time_hours: waitTime,
      is_overdue: false,
    }
  })

  const overdueCount = assigned.filter(a => a.is_overdue).length

  return {
    assigned,
    available,
    stats: {
      pending_count: assigned.filter(a => a.status === "pending").length,
      in_progress_count: running.length,
      overdue_count: overdueCount,
    },
    isLoading: false,
    error: null,
  }
}

// ============================================================================
// Normalize API Response
// ============================================================================

function normalizeBackendResponse(data: BackendQueueResponse): ReviewQueueData {
  const normalizeAssignment = (item: BackendAssignedItem): QueueAssignment => {
    const analysis = item.analysis ?? {}
    const waitTime = item.wait_time_hours ?? computeWaitTimeHours(item.assigned_at ?? "")
    const dueAt = item.due_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    // Prefer real backend ID, fall back to assignment_id, then synthetic ID
    const assignmentId = item.id ?? item.assignment_id ?? `asg_${analysis.id ?? item.analysis_id ?? Math.random()}`

    return {
      id: assignmentId,
      analysis: {
        id: analysis.id ?? item.analysis_id ?? "",
        repo: analysis.repo ?? "Unknown",
        pr_label: analysis.pr_label ?? (analysis.pr_number ? `PR #${analysis.pr_number}` : "Commit"),
        author: analysis.author ?? "Unknown",
        findings_summary: {
          blocker: analysis.findings_summary?.blocker ?? 0,
          warn: analysis.findings_summary?.warn ?? 0,
          info: analysis.findings_summary?.info ?? 0,
        },
        complexity_score: analysis.complexity_score ?? 1,
      },
      priority: (item.priority as "critical" | "high" | "medium" | "low") ?? "medium",
      assignment_type: (item.assignment_type as "auto" | "manual") ?? "auto",
      assigned_at: item.assigned_at ?? new Date().toISOString(),
      due_at: dueAt,
      status: (item.status as "pending" | "in_progress" | "completed") ?? "pending",
      wait_time_hours: waitTime,
      is_overdue: item.is_overdue ?? isOverdue(dueAt),
    }
  }

  const assigned = (data.assigned ?? []).filter(a => a.id || a.assignment_id).map(normalizeAssignment)
  const available = (data.available ?? []).filter(a => a.id || a.analysis_id).map((item) => ({
    ...normalizeAssignment(item as BackendAssignedItem),
    status: "pending" as const,
  }))

  return {
    assigned,
    available,
    stats: {
      pending_count: data.stats?.pending_count ?? assigned.filter(a => a.status === "pending").length,
      in_progress_count: data.stats?.in_progress_count ?? assigned.filter(a => a.status === "in_progress").length,
      overdue_count: data.stats?.overdue_count ?? assigned.filter(a => a.is_overdue).length,
    },
    isLoading: false,
    error: null,
  }
}

// ============================================================================
// Main Fetch Function
// ============================================================================

export async function fetchReviewQueueData(options?: {
  force?: boolean
}): Promise<ReviewQueueData> {
  try {
    // First, try to fetch from the backend API
    const response = await fetch("/api/dashboard/reviewer/queue", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })

    if (response.ok) {
      const data = await response.json() as BackendQueueResponse
      return normalizeBackendResponse(data)
    }

    // If backend returns 404 or error, fall back to computing from analyses
    console.warn("[review-queue] Backend API unavailable, computing from analyses")
    const analyses = await fetchDashboardAnalyses({ force: options?.force, size: 40 })
    return computeQueueFromAnalyses(analyses)

  } catch (error) {
    console.error("[review-queue] Error fetching data:", error)

    // Try fallback to analyses data
    try {
      const analyses = await fetchDashboardAnalyses({ force: options?.force, size: 40 })
      return computeQueueFromAnalyses(analyses)
    } catch {
      return {
        ...defaultReviewQueueData,
        error: "Erreur lors du chargement de la file d'attente",
      }
    }
  }
}

// ============================================================================
// Queue Actions
// ============================================================================

export async function claimReviewAssignment(assignmentId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/dashboard/reviewer/queue/${assignmentId}/claim`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    })

    if (response.ok) {
      return { success: true }
    }

    const data = await response.json().catch(() => ({}))
    return {
      success: false,
      error: data.error ?? "Erreur lors de la réclamation de la review"
    }
  } catch (error) {
    console.error("[review-queue] Claim error:", error)
    return {
      success: false,
      error: "Erreur réseau lors de la réclamation"
    }
  }
}

export async function startReview(
  assignmentId: string,
  analysisId: string,
  priority?: QueueAssignment["priority"],
): Promise<{ success: boolean; assignmentId?: string; error?: string }> {
  try {
    const response = await fetch(`/api/dashboard/reviewer/queue/${assignmentId}/start`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysisId, priority }),
    })

    if (response.ok) {
      const data = await response.json().catch(() => ({}))
      return {
        success: true,
        assignmentId: typeof data.assignmentId === "string" ? data.assignmentId : assignmentId,
      }
    }

    const data = await response.json().catch(() => ({}))
    return {
      success: false,
      error: data.error ?? "Erreur lors du démarrage de la review"
    }
  } catch (error) {
    console.error("[review-queue] Start error:", error)
    return { success: true } // Allow navigation even if backend fails
  }
}

export async function declineReviewAssignment(assignmentId: string, reason?: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/dashboard/reviewer/queue/${assignmentId}/decline`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    })

    if (response.ok) {
      return { success: true }
    }

    const data = await response.json().catch(() => ({}))
    return {
      success: false,
      error: data.error ?? "Erreur lors du refus de la review"
    }
  } catch (error) {
    console.error("[review-queue] Decline error:", error)
    return {
      success: false,
      error: "Erreur réseau lors du refus"
    }
  }
}

// ============================================================================
// Polling for Real-time Updates
// ============================================================================

const POLL_INTERVAL_MS = 20_000 // 20 seconds

export function createReviewQueuePoller(
  onUpdate: (data: ReviewQueueData) => void,
  options?: { intervalMs?: number }
) {
  return createPoller(
    async () => {
      const data = await fetchReviewQueueData({ force: true })
      onUpdate(data)
    },
    {
      intervalMs: options?.intervalMs ?? POLL_INTERVAL_MS,
      onError: (error) => {
        console.error("[review-queue-poller] Poll error:", error)
      },
    },
  )
}

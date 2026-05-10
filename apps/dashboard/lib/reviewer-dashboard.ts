/**
 * Reviewer Dashboard Library
 *
 * Provides functions to fetch reviewer dashboard data.
 * Falls back to computing data from analyses when backend endpoint is unavailable.
 */

import { fetchDashboardAnalyses, type DashboardAnalysisItem } from "./dashboard-analyses"
import { normalizeAnalysisStatus as normalizeStatus } from "./domain/analysis-status"
import { createPoller } from "./polling"

// ============================================================================
// Types
// ============================================================================

export interface ReviewerKPIs {
  pending_reviews: number
  in_progress_reviews: number
  completed_this_week: number
  overdue_reviews: number
  avg_review_time_minutes: number
  sla_compliance_rate: number
}

export interface ActiveReview {
  id: string
  analysis: {
    id: string
    repo: string
    pr_label: string
    author: string
  }
  priority: "high" | "medium" | "low"
  started_at: string
  due_at: string
}

export interface RecentActivity {
  type: "completed" | "comment" | "assigned"
  repo: string
  time: string
}

export interface TeamMember {
  id: string
  name: string
  role: string
  pendingReviews: number
  completedThisWeek: number
}

export interface TeamStats {
  totalReviewers: number
  activeReviewers: number
  pendingAssignments: number
  avgTeamResponseTime: number
  teamCompletionRate: number
}

export interface UnassignedReview {
  id: string
  repo: string
  pr_label: string
  priority: "high" | "medium" | "low"
  waiting_since: string
}

export interface ReviewerDashboardData {
  kpis: ReviewerKPIs
  activeReviews: ActiveReview[]
  recentActivity: RecentActivity[]
  teamStats: TeamStats
  teamMembers: TeamMember[]
  unassignedReviews: UnassignedReview[]
  isLoading: boolean
  error: string | null
}

// ============================================================================
// API Response Types
// ============================================================================

interface BackendReviewerDashboardResponse {
  kpis?: Partial<ReviewerKPIs>
  active_reviews?: Array<{
    id?: string
    analysis_id?: string
    analysis?: {
      id?: string
      repo?: string
      pr_label?: string
      author?: string
    }
    priority?: string
    started_at?: string
    due_at?: string
  }>
  recent_activity?: Array<{
    type?: string
    repo?: string
    time?: string
    created_at?: string
  }>
  team_stats?: Partial<TeamStats>
  team_members?: Array<{
    id?: string
    name?: string
    role?: string
    pending_reviews?: number
    completed_this_week?: number
  }>
  unassigned_reviews?: Array<{
    id?: string
    repo?: string
    pr_label?: string
    priority?: string
    waiting_since?: string
    created_at?: string
  }>
}

// ============================================================================
// Default Data
// ============================================================================

export const defaultReviewerDashboardData: ReviewerDashboardData = {
  kpis: {
    pending_reviews: 0,
    in_progress_reviews: 0,
    completed_this_week: 0,
    overdue_reviews: 0,
    avg_review_time_minutes: 0,
    sla_compliance_rate: 1,
  },
  activeReviews: [],
  recentActivity: [],
  teamStats: {
    totalReviewers: 0,
    activeReviewers: 0,
    pendingAssignments: 0,
    avgTeamResponseTime: 0,
    teamCompletionRate: 0,
  },
  teamMembers: [],
  unassignedReviews: [],
  isLoading: false,
  error: null,
}

// ============================================================================
// Utility Functions
// ============================================================================

function getPriority(item: DashboardAnalysisItem): "high" | "medium" | "low" {
  if (item.blockerCount > 0) return "high"
  if (item.warnCount > 5) return "medium"
  return "low"
}

function formatTimeAgo(dateString: string): string {
  if (!dateString) return "récemment"

  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 60) return `${diffMins}m`
  if (diffHours < 24) return `${diffHours}h`
  return `${diffDays}j`
}

function isThisWeek(dateString: string): boolean {
  if (!dateString) return false

  const date = new Date(dateString)
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  return date >= weekAgo && date <= now
}

// ============================================================================
// Compute Data from Analyses (Fallback)
// ============================================================================

function computeReviewerDataFromAnalyses(analyses: DashboardAnalysisItem[]): ReviewerDashboardData {
  const now = new Date()

  // Categorize analyses
  const pendingAnalyses = analyses.filter(a =>
    normalizeStatus(a.status) === "COMPLETED" &&
    (a.blockerCount > 0 || a.warnCount > 0)
  )

  const runningAnalyses = analyses.filter(a =>
    normalizeStatus(a.status) === "RUNNING"
  )

  const completedThisWeek = analyses.filter(a =>
    normalizeStatus(a.status) === "COMPLETED" && isThisWeek(a.updatedAt)
  )

  // Create active reviews from running analyses
  const activeReviews: ActiveReview[] = runningAnalyses.slice(0, 5).map((a) => ({
    id: `rev_${a.id}`,
    analysis: {
      id: a.id,
      repo: a.repo,
      pr_label: a.prLabel,
      author: a.author,
    },
    priority: getPriority(a),
    started_at: a.createdAt,
    due_at: new Date(new Date(a.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString(),
  }))

  // Create unassigned reviews from completed analyses with issues
  const unassignedReviews: UnassignedReview[] = pendingAnalyses.slice(0, 5).map((a) => ({
    id: `unrev_${a.id}`,
    repo: a.repo,
    pr_label: a.prLabel,
    priority: getPriority(a),
    waiting_since: formatTimeAgo(a.updatedAt),
  }))

  // Create recent activity from recent analyses
  const recentActivity: RecentActivity[] = analyses
    .filter(a => a.updatedAt)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)
    .map((a) => {
      const status = normalizeStatus(a.status)
      return {
        type: status === "COMPLETED" ? "completed" as const : "assigned" as const,
        repo: a.repo,
        time: formatTimeAgo(a.updatedAt),
      }
    })

  // Calculate KPIs
  const avgDuration = completedThisWeek.length > 0
    ? completedThisWeek.reduce((sum, a) => {
        const duration = a.durationLabel.match(/(\d+)m?\s*(\d+)?s?/)
        if (duration) {
          const mins = parseInt(duration[1]) || 0
          const secs = parseInt(duration[2]) || 0
          return sum + mins + secs / 60
        }
        return sum
      }, 0) / completedThisWeek.length
    : 30

  return {
    kpis: {
      pending_reviews: pendingAnalyses.length,
      in_progress_reviews: runningAnalyses.length,
      completed_this_week: completedThisWeek.length,
      overdue_reviews: 0, // Would need SLA data
      avg_review_time_minutes: Math.round(avgDuration),
      sla_compliance_rate: 0.95, // Default value
    },
    activeReviews,
    recentActivity,
    teamStats: {
      totalReviewers: 1,
      activeReviewers: 1,
      pendingAssignments: pendingAnalyses.length,
      avgTeamResponseTime: Math.round(avgDuration),
      teamCompletionRate: completedThisWeek.length > 0 ? 0.9 : 0,
    },
    teamMembers: [],
    unassignedReviews,
    isLoading: false,
    error: null,
  }
}

// ============================================================================
// Normalize API Response
// ============================================================================

function normalizeBackendResponse(data: BackendReviewerDashboardResponse): ReviewerDashboardData {
  const kpis: ReviewerKPIs = {
    pending_reviews: data.kpis?.pending_reviews ?? 0,
    in_progress_reviews: data.kpis?.in_progress_reviews ?? 0,
    completed_this_week: data.kpis?.completed_this_week ?? 0,
    overdue_reviews: data.kpis?.overdue_reviews ?? 0,
    avg_review_time_minutes: data.kpis?.avg_review_time_minutes ?? 0,
    sla_compliance_rate: data.kpis?.sla_compliance_rate ?? 1,
  }

  const activeReviews: ActiveReview[] = (data.active_reviews ?? [])
    .filter(r => r.id || r.analysis_id)
    .map(r => ({
      id: r.id ?? `rev_${r.analysis_id}`,
      analysis: {
        id: r.analysis?.id ?? r.analysis_id ?? "",
        repo: r.analysis?.repo ?? "Unknown",
        pr_label: r.analysis?.pr_label ?? "PR",
        author: r.analysis?.author ?? "Unknown",
      },
      priority: (r.priority as "high" | "medium" | "low") ?? "medium",
      started_at: r.started_at ?? new Date().toISOString(),
      due_at: r.due_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }))

  const recentActivity: RecentActivity[] = (data.recent_activity ?? [])
    .map(a => ({
      type: (a.type as "completed" | "comment" | "assigned") ?? "assigned",
      repo: a.repo ?? "Unknown",
      time: a.time ?? formatTimeAgo(a.created_at ?? ""),
    }))

  const teamStats: TeamStats = {
    totalReviewers: data.team_stats?.totalReviewers ?? 0,
    activeReviewers: data.team_stats?.activeReviewers ?? 0,
    pendingAssignments: data.team_stats?.pendingAssignments ?? 0,
    avgTeamResponseTime: data.team_stats?.avgTeamResponseTime ?? 0,
    teamCompletionRate: data.team_stats?.teamCompletionRate ?? 0,
  }

  const teamMembers: TeamMember[] = (data.team_members ?? [])
    .filter(m => m.id)
    .map(m => ({
      id: m.id!,
      name: m.name ?? "Unknown",
      role: m.role ?? "tech_lead",
      pendingReviews: m.pending_reviews ?? 0,
      completedThisWeek: m.completed_this_week ?? 0,
    }))

  const unassignedReviews: UnassignedReview[] = (data.unassigned_reviews ?? [])
    .filter(r => r.id)
    .map(r => ({
      id: r.id!,
      repo: r.repo ?? "Unknown",
      pr_label: r.pr_label ?? "PR",
      priority: (r.priority as "high" | "medium" | "low") ?? "medium",
      waiting_since: r.waiting_since ?? formatTimeAgo(r.created_at ?? ""),
    }))

  return {
    kpis,
    activeReviews,
    recentActivity,
    teamStats,
    teamMembers,
    unassignedReviews,
    isLoading: false,
    error: null,
  }
}

// ============================================================================
// Main Fetch Function
// ============================================================================

export async function fetchReviewerDashboardData(options?: {
  force?: boolean
}): Promise<ReviewerDashboardData> {
  try {
    // First, try to fetch from the backend API
    const response = await fetch("/api/dashboard/reviewer", {
      method: "GET",
      cache: "no-store",
      headers: { Accept: "application/json" },
    })

    if (response.ok) {
      const data = await response.json() as BackendReviewerDashboardResponse
      return normalizeBackendResponse(data)
    }

    // If backend returns 404 or error, fall back to computing from analyses
    console.warn("[reviewer-dashboard] Backend API unavailable, computing from analyses")
    const analyses = await fetchDashboardAnalyses({ force: options?.force, size: 40 })
    return computeReviewerDataFromAnalyses(analyses)

  } catch (error) {
    console.error("[reviewer-dashboard] Error fetching data:", error)

    // Try fallback to analyses data
    try {
      const analyses = await fetchDashboardAnalyses({ force: options?.force, size: 40 })
      return computeReviewerDataFromAnalyses(analyses)
    } catch {
      return {
        ...defaultReviewerDashboardData,
        error: "Erreur lors du chargement des données reviewer",
      }
    }
  }
}

// ============================================================================
// Polling for Real-time Updates
// ============================================================================

const POLL_INTERVAL_MS = 15_000 // 15 seconds

export function createReviewerDashboardPoller(
  onUpdate: (data: ReviewerDashboardData) => void,
  options?: { intervalMs?: number }
) {
  return createPoller(
    async () => {
      const data = await fetchReviewerDashboardData({ force: true })
      onUpdate(data)
    },
    {
      intervalMs: options?.intervalMs ?? POLL_INTERVAL_MS,
      onError: (error) => {
        console.error("[reviewer-dashboard-poller] Poll error:", error)
      },
    },
  )
}
